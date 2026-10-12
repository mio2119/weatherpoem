import type {
  CalendarContext,
  Recommendation,
  WeatherContext,
} from "../types";
import {
  CONTENT_VERSION,
  RULE_VERSION,
} from "../core/recommendation";

interface ReasonApiResponse {
  workId: string;
  reason: string;
}

interface ReasonRequest {
  schemaVersion: "1.1";
  contentVersion: string;
  ruleVersion: string;
  work: {
    id: string;
    title: string;
    author: string;
    dynasty: string;
    summary: string;
  };
  context: {
    localDate: string;
    festival?: string;
    solarTerm?: string;
    season: CalendarContext["season"];
    timePeriod: CalendarContext["timePeriod"];
    weather: {
      kind: WeatherContext["kind"];
      label: string;
    };
  };
  fallbackReason: string;
  constraints: {
    language: "zh-CN";
    maxCharacters: 40;
    noNewlines: true;
    noDisasterRomanticization: true;
  };
}

export interface ReasonServiceOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export function isAllowedReasonServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    const isLoopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    return import.meta.env.DEV && url.protocol === "http:" && isLoopback;
  } catch {
    return false;
  }
}

const UNSAFE_REASON_PATTERNS = [
  /https?:\/\//i,
  /\r|\n/,
  /作为一个AI|作为人工智能|语言模型/i,
  /。，|，，|；。/,
  /\b(?:spring|summer|autumn|winter)\b/i,
];

export function validateReasonResponse(
  value: unknown,
  expectedWorkId: string,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const response = value as Partial<ReasonApiResponse>;
  if (
    response.workId !== expectedWorkId ||
    typeof response.reason !== "string"
  ) {
    return undefined;
  }
  const reason = response.reason.trim();
  const length = Array.from(reason).length;
  if (length < 6 || length > 40) return undefined;
  if (UNSAFE_REASON_PATTERNS.some((pattern) => pattern.test(reason))) {
    return undefined;
  }
  return reason;
}

export function buildReasonRequest(
  recommendation: Recommendation,
  calendar: CalendarContext,
  weather: WeatherContext,
): ReasonRequest {
  return {
    schemaVersion: "1.1",
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
    work: {
      id: recommendation.poem.id,
      title: recommendation.poem.title,
      author: recommendation.poem.author,
      dynasty: recommendation.poem.dynasty,
      summary: recommendation.poem.oneLineSummary,
    },
    context: {
      localDate: calendar.localDate,
      festival: calendar.festival,
      solarTerm: calendar.solarTerm,
      season: calendar.season,
      timePeriod: calendar.timePeriod,
      weather: {
        kind: weather.kind,
        label: weather.label,
      },
    },
    fallbackReason: recommendation.reason,
    constraints: {
      language: "zh-CN",
      maxCharacters: 40,
      noNewlines: true,
      noDisasterRomanticization: true,
    },
  };
}

export async function enrichRecommendationReason(
  recommendation: Recommendation,
  calendar: CalendarContext,
  weather: WeatherContext,
  options: ReasonServiceOptions = {},
): Promise<Recommendation> {
  const endpoint = (
    options.endpoint ?? import.meta.env.VITE_REASON_API_URL
  )?.trim();
  if (
    !endpoint ||
    !isAllowedReasonServiceUrl(endpoint) ||
    weather.shouldSuppressPoem ||
    weather.freshness === "unavailable"
  ) {
    return recommendation;
  }

  const timeoutMs =
    options.timeoutMs ??
    Number(import.meta.env.VITE_REASON_TIMEOUT_MS ?? 2500);
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildReasonRequest(recommendation, calendar, weather),
      ),
      signal: controller.signal,
    });
    if (!response.ok) return recommendation;
    const reason = validateReasonResponse(
      (await response.json()) as unknown,
      recommendation.poem.id,
    );
    return reason
      ? { ...recommendation, reason, source: "ai" }
      : recommendation;
  } catch {
    return recommendation;
  } finally {
    globalThis.clearTimeout(timer);
  }
}
