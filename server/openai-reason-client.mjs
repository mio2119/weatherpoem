import {
  buildReasonPrompt,
  validateReasonText,
} from "./reason-contract.mjs";

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/responses";

function isAllowedEndpoint(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      (url.hostname === "api.openai.com" ||
        url.hostname.endsWith(".openai.azure.com"))
    ) {
      return true;
    }
    return (
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

function outputText(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  if (payload.status !== "completed" || !Array.isArray(payload.output)) {
    return undefined;
  }
  for (const output of payload.output) {
    if (output?.type !== "message" || !Array.isArray(output.content)) {
      continue;
    }
    for (const content of output.content) {
      if (content?.type === "refusal") return undefined;
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

function usageSummary(payload, model) {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const number = (value) =>
    Number.isFinite(value) && value >= 0 ? value : 0;
  return {
    model,
    inputTokens: number(usage.input_tokens),
    outputTokens: number(usage.output_tokens),
    totalTokens: number(usage.total_tokens),
    cachedInputTokens: number(
      usage.input_tokens_details?.cached_tokens,
    ),
  };
}

export function buildOpenAIRequest(model, request) {
  return {
    model,
    store: false,
    input: [
      {
        role: "system",
        content: buildReasonPrompt(request),
      },
      {
        role: "user",
        content: "请为已选作品生成一句今日推荐理由。",
      },
    ],
    max_output_tokens: 160,
    text: {
      format: {
        type: "json_schema",
        name: "weatherpoem_reason",
        description:
          "WeatherPoem 已选作品的一句受限中文推荐理由。",
        schema: {
          type: "object",
          properties: {
            workId: {
              type: "string",
              enum: [request.work.id],
            },
            reason: {
              type: "string",
              minLength: 6,
              maxLength: 40,
            },
          },
          required: ["workId", "reason"],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  };
}

export function parseOpenAIReason(payload, expectedWorkId) {
  const text = outputText(payload);
  if (!text) return undefined;
  try {
    return validateReasonText(JSON.parse(text), expectedWorkId);
  } catch {
    return undefined;
  }
}

export function createOpenAIReasonClient(options) {
  const apiKey = options.apiKey?.trim();
  const model = options.model?.trim();
  const endpoint = options.endpoint?.trim() || DEFAULT_ENDPOINT;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const onUsage = options.onUsage;
  if (!apiKey) throw new Error("缺少 OPENAI_API_KEY");
  if (!model || !/^[a-zA-Z0-9._:-]{2,100}$/.test(model)) {
    throw new Error("缺少或无效的 OPENAI_MODEL");
  }
  if (!isAllowedEndpoint(endpoint)) {
    throw new Error("OPENAI_API_URL 必须使用允许的 HTTPS OpenAI 端点");
  }

  return {
    async generate(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildOpenAIRequest(model, request)),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`OpenAI Responses API 返回 ${response.status}`);
        }
        const payload = await response.json();
        const usage = usageSummary(payload, model);
        if (usage && typeof onUsage === "function") onUsage(usage);
        const result = parseOpenAIReason(payload, request.work.id);
        if (!result) {
          throw new Error("OpenAI 响应拒绝、不完整或未通过理由校验");
        }
        return result;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
