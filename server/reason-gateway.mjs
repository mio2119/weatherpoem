import { createHash, randomUUID } from "node:crypto";
import {
  indexCatalog,
  validateReasonRequest,
} from "./reason-contract.mjs";

const MAX_BODY_BYTES = 12 * 1024;

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function requestFingerprint(request) {
  return createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
}

export function createMemoryRateLimiter({
  maximum = 20,
  windowMs = 60_000,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();
  return {
    take(key) {
      const current = now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= current) {
        buckets.set(key, { count: 1, resetAt: current + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (existing.count >= maximum) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((existing.resetAt - current) / 1000),
          ),
        };
      }
      existing.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

export function createReasonGateway(options) {
  const catalog = indexCatalog(options.catalog);
  const reasonClient = options.reasonClient;
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const rateLimiter =
    options.rateLimiter ?? createMemoryRateLimiter(options.rateLimit);
  const now = options.now ?? (() => Date.now());
  const logger = options.logger ?? console;
  const cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
  const cacheMaximum = options.cacheMaximum ?? 1000;
  const cache = new Map();
  if (!reasonClient || typeof reasonClient.generate !== "function") {
    throw new Error("AI 理由服务缺少 reasonClient.generate");
  }
  if (allowedOrigins.size === 0) {
    throw new Error("AI 理由服务必须配置至少一个 ALLOWED_ORIGINS");
  }

  function corsHeaders(origin) {
    return origin && allowedOrigins.has(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          Vary: "Origin",
        }
      : {};
  }

  function log(outcome, requestId) {
    logger.info?.({
      event: "weatherpoem_reason",
      outcome,
      requestId,
    });
  }

  return async function handle(request) {
    const requestId = randomUUID();
    const origin = request.headers.get("origin") ?? "";
    const cors = corsHeaders(origin);
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse(200, {
        status: "ready",
        contentVersion: catalog.contentVersion,
        ruleVersion: catalog.ruleVersion,
        workCount: catalog.works.size,
      });
    }

    if (url.pathname !== "/v1/reason") {
      return jsonResponse(404, { error: "not_found" }, cors);
    }
    if (!allowedOrigins.has(origin)) {
      log("origin_rejected", requestId);
      return jsonResponse(403, { error: "origin_not_allowed" });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Max-Age": "600",
        },
      });
    }
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" }, cors);
    }
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return jsonResponse(415, { error: "json_required" }, cors);
    }

    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      log("body_too_large", requestId);
      return jsonResponse(413, { error: "body_too_large" }, cors);
    }

    const remoteAddress =
      request.headers.get("x-weatherpoem-remote-address") ?? "unknown";
    const rate = rateLimiter.take(`${origin}|${remoteAddress}`);
    if (!rate.allowed) {
      log("rate_limited", requestId);
      return jsonResponse(
        429,
        { error: "rate_limited" },
        {
          ...cors,
          "Retry-After": String(rate.retryAfterSeconds),
        },
      );
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return jsonResponse(400, { error: "invalid_json" }, cors);
    }
    const validated = validateReasonRequest(payload, catalog, now());
    if (!validated.ok) {
      log(validated.code, requestId);
      return jsonResponse(
        422,
        { error: "invalid_request", code: validated.code },
        cors,
      );
    }

    const fingerprint = requestFingerprint(validated.value);
    const cached = cache.get(fingerprint);
    if (cached && cached.expiresAt > now()) {
      cache.delete(fingerprint);
      cache.set(fingerprint, cached);
      log("cache_hit", requestId);
      return jsonResponse(200, cached.value, cors);
    }

    try {
      const result = await reasonClient.generate(validated.value);
      cache.set(fingerprint, {
        value: result,
        expiresAt: now() + cacheTtlMs,
      });
      while (cache.size > cacheMaximum) {
        cache.delete(cache.keys().next().value);
      }
      log("generated", requestId);
      return jsonResponse(200, result, cors);
    } catch {
      log("upstream_failed", requestId);
      return jsonResponse(502, { error: "reason_unavailable" }, cors);
    }
  };
}
