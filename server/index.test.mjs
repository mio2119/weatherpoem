import assert from "node:assert/strict";
import test from "node:test";
import { startReasonServer } from "./index.mjs";

test("独立服务可以启动并通过健康检查", async (context) => {
  const server = await startReasonServer({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "0",
    OPENAI_API_KEY: "test-only-key",
    OPENAI_MODEL: "gpt-test",
    ALLOWED_ORIGINS: "http://tauri.localhost",
  });
  context.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  assert.equal(typeof address, "object");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/health`,
  );
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.status, "ready");
  assert.equal(health.workCount, 120);
});
