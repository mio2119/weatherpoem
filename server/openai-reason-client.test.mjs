import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenAIRequest,
  createOpenAIReasonClient,
  parseOpenAIReason,
} from "./openai-reason-client.mjs";

const request = {
  schemaVersion: "1.1",
  contentVersion: "2026.07.1",
  ruleVersion: "1.0.0",
  work: {
    id: "zhao-shi-xiu-yue-ke",
    title: "约客",
    author: "赵师秀",
    dynasty: "宋",
    summary: "梅雨夜的等待，被蛙声与灯花写得格外清晰。",
  },
  context: {
    localDate: "2026-07-24",
    solarTerm: "大暑",
    season: "summer",
    timePeriod: "night",
    weather: { kind: "overcast", label: "阴" },
  },
};

function completedPayload(value) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(value),
          },
        ],
      },
    ],
  };
}

test("OpenAI 请求关闭存储并使用严格 JSON Schema 锁定作品", () => {
  const body = buildOpenAIRequest("gpt-test", request);
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema.properties.workId.enum, [
    request.work.id,
  ]);
  assert.equal(body.text.format.schema.additionalProperties, false);
});

test("拒绝、不完整、错作品和不安全理由都不会通过解析", () => {
  assert.equal(
    parseOpenAIReason(
      { status: "incomplete", output: [] },
      request.work.id,
    ),
    undefined,
  );
  assert.equal(
    parseOpenAIReason(
      {
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "No" }],
          },
        ],
      },
      request.work.id,
    ),
    undefined,
  );
  assert.equal(
    parseOpenAIReason(
      completedPayload({
        workId: "other",
        reason: "这段理由本身长度满足要求。",
      }),
      request.work.id,
    ),
    undefined,
  );
});

test("服务端密钥只进入上游 Authorization，响应需再次校验", async () => {
  let captured;
  let capturedUsage;
  const client = createOpenAIReasonClient({
    apiKey: "server-secret",
    model: "gpt-test",
    endpoint: "http://127.0.0.1:9999/v1/responses",
    onUsage: (usage) => {
      capturedUsage = usage;
    },
    fetcher: async (url, options) => {
      captured = { url, options };
      return new Response(
        JSON.stringify(
          {
            ...completedPayload({
              workId: request.work.id,
              reason: "阴云与夏夜相接，让等待也有了清晰的声音。",
            }),
            usage: {
              input_tokens: 120,
              output_tokens: 24,
              total_tokens: 144,
              input_tokens_details: { cached_tokens: 80 },
            },
          },
        ),
        { status: 200 },
      );
    },
  });
  const result = await client.generate(request);
  assert.equal(captured.options.headers.Authorization, "Bearer server-secret");
  assert.doesNotMatch(captured.options.body, /server-secret/);
  assert.deepEqual(result, {
    workId: request.work.id,
    reason: "阴云与夏夜相接，让等待也有了清晰的声音。",
  });
  assert.deepEqual(capturedUsage, {
    model: "gpt-test",
    inputTokens: 120,
    outputTokens: 24,
    totalTokens: 144,
    cachedInputTokens: 80,
  });
});
