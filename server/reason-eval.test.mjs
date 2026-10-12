import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildHumanReviewCsv,
  createHttpReasonRequester,
  runReasonEvalSuite,
  validateHumanReviewCsv,
  validateReasonEvalSuite,
} from "./reason-eval.mjs";
import {
  parseCsv,
  serializeCsv,
} from "../scripts/content-review-contract.mjs";

const [suite, catalog] = await Promise.all([
  readFile(new URL("./reason-evals.json", import.meta.url), "utf8").then(
    JSON.parse,
  ),
  readFile(new URL("./reason-catalog.json", import.meta.url), "utf8").then(
    JSON.parse,
  ),
]);
const fixedNow = Date.parse("2026-07-24T12:00:00+08:00");
const validReason = "今日语境与这首诗相接，正好适合安静读一遍。";

test("版本化评测集覆盖节日、节气、天气、季节与时段", () => {
  const result = validateReasonEvalSuite(suite, catalog, fixedNow);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.entries.length, 47);
});

test("缺少一个必需节日会使评测目录门禁失败", () => {
  const changed = {
    ...suite,
    cases: suite.cases.filter(
      (item) => item.id !== "festival-chuxi",
    ),
  };
  const result = validateReasonEvalSuite(
    changed,
    catalog,
    fixedNow,
  );
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((item) => item.includes("除夕")),
  );
});

test("运行器汇总契约通过率与 P50/P95 时延", async () => {
  let clockValue = 0;
  const report = await runReasonEvalSuite({
    suite,
    catalog,
    now: fixedNow,
    concurrency: 1,
    clock: () => {
      clockValue += 50;
      return clockValue;
    },
    requester: async (request) =>
      new Response(
        JSON.stringify({
          workId: request.work.id,
          reason: validReason,
        }),
        { status: 200 },
      ),
  });
  assert.equal(report.metrics.total, 47);
  assert.equal(report.metrics.passed, 47);
  assert.equal(report.metrics.automatedPassRate, 1);
  assert.equal(report.metrics.p50LatencyMs, 50);
  assert.equal(report.metrics.p95LatencyMs, 50);
  assert.equal(report.automatedAccepted, true);
});

test("错作品响应会使百分之百契约阈值失败", async () => {
  let calls = 0;
  const report = await runReasonEvalSuite({
    suite,
    catalog,
    now: fixedNow,
    concurrency: 1,
    requester: async (request) => {
      calls += 1;
      return new Response(
        JSON.stringify({
          workId: calls === 1 ? "other" : request.work.id,
          reason: validReason,
        }),
        { status: 200 },
      );
    },
  });
  assert.equal(report.metrics.failed, 1);
  assert.equal(report.automatedAccepted, false);
});

test("HTTP 运行器只允许 HTTPS 或本机回环服务，并发送精确 Origin", async () => {
  assert.throws(
    () =>
      createHttpReasonRequester({
        endpoint: "http://reason.example/v1/reason",
        origin: "tauri://localhost",
      }),
    /HTTPS/,
  );
  let captured;
  const requester = createHttpReasonRequester({
    endpoint: "http://127.0.0.1:8787/v1/reason",
    origin: "tauri://localhost",
    fetcher: async (url, options) => {
      captured = { url, options };
      return new Response("{}", { status: 200 });
    },
  });
  await requester({ work: { id: "sample" } });
  assert.equal(captured.url, "http://127.0.0.1:8787/v1/reason");
  assert.equal(captured.options.headers.Origin, "tauri://localhost");
});

test("人工评分必须具名、三项达标且没有事实或安全错误", async () => {
  const report = await runReasonEvalSuite({
    suite,
    catalog,
    now: fixedNow,
    concurrency: 1,
    requester: async (request) =>
      new Response(
        JSON.stringify({
          workId: request.work.id,
          reason: validReason,
        }),
        { status: 200 },
      ),
  });
  const rows = parseCsv(buildHumanReviewCsv(report));
  for (const row of rows.slice(1)) {
    row[10] = "5";
    row[11] = "5";
    row[12] = "4";
    row[13] = "否";
    row[14] = "否";
    row[15] = "李明";
  }
  const accepted = validateHumanReviewCsv(
    serializeCsv(rows),
    report,
    suite,
  );
  assert.equal(accepted.contractValid, true);
  assert.equal(accepted.accepted, true);

  rows[1][13] = "是";
  const rejected = validateHumanReviewCsv(
    serializeCsv(rows),
    report,
    suite,
  );
  assert.equal(rejected.contractValid, true);
  assert.equal(rejected.factualErrors, 1);
  assert.equal(rejected.accepted, false);
});
