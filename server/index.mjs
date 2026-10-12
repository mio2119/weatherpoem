import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenAIReasonClient } from "./openai-reason-client.mjs";
import { createReasonGateway } from "./reason-gateway.mjs";

const serverRoot = path.dirname(fileURLToPath(import.meta.url));

async function readBody(request, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      return Buffer.alloc(maximumBytes + 1);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function startReasonServer(environment = process.env) {
  const catalog = JSON.parse(
    await readFile(path.join(serverRoot, "reason-catalog.json"), "utf8"),
  );
  const allowedOrigins = (environment.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const cacheTtlMs = Number(
    environment.CACHE_TTL_MS ?? 24 * 60 * 60 * 1000,
  );
  const cacheMaximum = Number(environment.CACHE_MAXIMUM ?? 1000);
  const rateLimitMaximum = Number(
    environment.RATE_LIMIT_PER_MINUTE ?? 20,
  );
  if (!Number.isInteger(cacheTtlMs) || cacheTtlMs < 0) {
    throw new Error("CACHE_TTL_MS 必须是非负整数");
  }
  if (!Number.isInteger(cacheMaximum) || cacheMaximum < 0) {
    throw new Error("CACHE_MAXIMUM 必须是非负整数");
  }
  if (
    !Number.isInteger(rateLimitMaximum) ||
    rateLimitMaximum < 1
  ) {
    throw new Error("RATE_LIMIT_PER_MINUTE 必须是正整数");
  }
  const reasonClient = createOpenAIReasonClient({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
    endpoint: environment.OPENAI_API_URL,
    timeoutMs: Number(environment.OPENAI_TIMEOUT_MS ?? 8000),
    onUsage: (usage) => {
      console.info({
        event: "weatherpoem_reason_usage",
        ...usage,
      });
    },
  });
  const handle = createReasonGateway({
    catalog,
    reasonClient,
    allowedOrigins,
    rateLimit: {
      maximum: rateLimitMaximum,
      windowMs: 60_000,
    },
    cacheTtlMs,
    cacheMaximum,
  });
  const host = environment.HOST?.trim() || "127.0.0.1";
  const port = Number(environment.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT 必须是 0 至 65535 的整数");
  }

  const server = createServer(async (incoming, outgoing) => {
    try {
      const body =
        incoming.method === "GET" || incoming.method === "HEAD"
          ? undefined
          : await readBody(incoming, 12 * 1024);
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (
          key.toLowerCase() === "x-weatherpoem-remote-address" ||
          value === undefined
        ) {
          continue;
        }
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      headers.set(
        "x-weatherpoem-remote-address",
        incoming.socket.remoteAddress ?? "unknown",
      );
      const request = new Request(
        `http://${incoming.headers.host ?? `${host}:${port}`}${incoming.url ?? "/"}`,
        {
          method: incoming.method,
          headers,
          body,
        },
      );
      const response = await handle(request);
      outgoing.statusCode = response.status;
      for (const [key, value] of response.headers) {
        outgoing.setHeader(key, value);
      }
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.statusCode = 500;
      outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
      outgoing.end(JSON.stringify({ error: "internal_error" }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const activePort =
    typeof address === "object" && address ? address.port : port;
  console.log(
    `WeatherPoem AI 理由服务已监听 http://${host}:${activePort}`,
  );
  return server;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await startReasonServer();
  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
