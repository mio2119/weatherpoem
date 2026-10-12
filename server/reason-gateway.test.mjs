import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMemoryRateLimiter,
  createReasonGateway,
} from "./reason-gateway.mjs";

const catalog = JSON.parse(
  await readFile(new URL("./reason-catalog.json", import.meta.url), "utf8"),
);
const work = catalog.works[0];
const origin = "http://tauri.localhost";
const now = Date.parse("2026-07-24T12:00:00+08:00");

function payload() {
  return {
    schemaVersion: "1.1",
    contentVersion: catalog.contentVersion,
    ruleVersion: catalog.ruleVersion,
    work: { ...work },
    context: {
      localDate: "2026-07-24",
      season: "summer",
      timePeriod: "day",
      weather: { kind: "clear", label: "晴" },
    },
    fallbackReason: "晴日光线清朗，正适合读这一首诗。",
    constraints: {
      language: "zh-CN",
      maxCharacters: 40,
      noNewlines: true,
      noDisasterRomanticization: true,
    },
  };
}

function post(body = payload(), requestOrigin = origin) {
  return new Request("http://127.0.0.1:8787/v1/reason", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      "X-WeatherPoem-Remote-Address": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

function gateway(overrides = {}) {
  return createReasonGateway({
    catalog,
    allowedOrigins: [origin],
    now: () => now,
    logger: { info() {} },
    reasonClient: {
      async generate(request) {
        return {
          workId: request.work.id,
          reason: "晴日光线清朗，让诗中的开阔景象更贴近此刻。",
        };
      },
    },
    ...overrides,
  });
}

test("健康检查只暴露版本和目录数量", async () => {
  const response = await gateway()(
    new Request("http://127.0.0.1:8787/health"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ready",
    contentVersion: catalog.contentVersion,
    ruleVersion: catalog.ruleVersion,
    workCount: 120,
  });
});

test("合法请求返回理由并设置精确 CORS，不接受其他来源", async () => {
  const handle = gateway();
  const accepted = await handle(post());
  assert.equal(accepted.status, 200);
  assert.equal(
    accepted.headers.get("access-control-allow-origin"),
    origin,
  );
  assert.equal((await accepted.json()).workId, work.id);

  const rejected = await handle(post(payload(), "https://evil.example"));
  assert.equal(rejected.status, 403);
  assert.equal(
    rejected.headers.get("access-control-allow-origin"),
    null,
  );
});

test("同一标准化请求命中缓存，不重复调用模型", async () => {
  let calls = 0;
  const handle = gateway({
    reasonClient: {
      async generate(request) {
        calls += 1;
        return {
          workId: request.work.id,
          reason: "晴日光线清朗，让诗中的开阔景象更贴近此刻。",
        };
      },
    },
  });
  assert.equal((await handle(post())).status, 200);
  assert.equal((await handle(post())).status, 200);
  assert.equal(calls, 1);
});

test("伪造内容、超大请求和超过频率上限都会被拒绝", async () => {
  const forged = payload();
  forged.work.title = "伪造篇名";
  assert.equal((await gateway()(post(forged))).status, 422);

  const oversized = new Request(
    "http://127.0.0.1:8787/v1/reason",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ padding: "字".repeat(13_000) }),
    },
  );
  assert.equal((await gateway()(oversized)).status, 413);

  const limiter = createMemoryRateLimiter({
    maximum: 1,
    windowMs: 60_000,
    now: () => now,
  });
  const limitedGateway = gateway({ rateLimiter: limiter });
  assert.equal((await limitedGateway(post())).status, 200);
  const limited = await limitedGateway(post());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
});

test("模型拒绝或上游失败返回 502，由桌面端保留规则理由", async () => {
  const handle = gateway({
    reasonClient: {
      async generate() {
        throw new Error("upstream failed");
      },
    },
  });
  const response = await handle(post());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "reason_unavailable",
  });
});
