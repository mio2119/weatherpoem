import type { City, WeatherWarning } from "../types";

interface WarningGatewayItem {
  id?: unknown;
  title?: unknown;
  level?: unknown;
  description?: unknown;
  source?: unknown;
  area?: unknown;
  publishedAt?: unknown;
  expiresAt?: unknown;
}

interface WarningGatewayPayload {
  cityId?: unknown;
  warnings?: unknown;
}

export interface WarningGatewayOptions {
  endpoint?: string;
  fetcher?: typeof fetch;
  now?: number;
  timeoutMs?: number;
}

const LEVELS = new Set(["advisory", "warning", "severe"]);
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_WARNING_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function text(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact || compact.length > maximum) return undefined;
  return compact;
}

function timestamp(value: unknown): {
  raw: string;
  milliseconds: number;
} | undefined {
  if (typeof value !== "string") return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  return { raw: value, milliseconds };
}

export function isAllowedWarningGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return (
      import.meta.env.DEV &&
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export function normalizeOfficialWarnings(
  payload: unknown,
  city: City,
  now = Date.now(),
): WeatherWarning[] {
  if (!payload || typeof payload !== "object") return [];
  const candidate = payload as WarningGatewayPayload;
  if (candidate.cityId !== city.id || !Array.isArray(candidate.warnings)) {
    return [];
  }

  return candidate.warnings
    .slice(0, 20)
    .map((value): WeatherWarning | undefined => {
      if (!value || typeof value !== "object") return undefined;
      const warning = value as WarningGatewayItem;
      const id = text(warning.id, 100);
      const title = text(warning.title, 80);
      const description = text(warning.description, 240);
      const source = text(warning.source, 80);
      const area = text(warning.area, 120);
      const publishedAt = timestamp(warning.publishedAt);
      const expiresAt = timestamp(warning.expiresAt);
      if (
        !id ||
        !title ||
        !description ||
        !source ||
        !area ||
        typeof warning.level !== "string" ||
        !LEVELS.has(warning.level) ||
        !publishedAt ||
        !expiresAt
      ) {
        return undefined;
      }
      if (
        publishedAt.milliseconds > now + MAX_CLOCK_SKEW_MS ||
        expiresAt.milliseconds <= now ||
        expiresAt.milliseconds <= publishedAt.milliseconds ||
        expiresAt.milliseconds - publishedAt.milliseconds >
          MAX_WARNING_LIFETIME_MS
      ) {
        return undefined;
      }
      if (!area.includes(city.name) && !area.includes(city.province)) {
        return undefined;
      }
      return {
        id: `official-${id}`,
        title,
        level: warning.level as WeatherWarning["level"],
        description,
        source,
        origin: "official",
        area,
        publishedAt: publishedAt.raw,
        expiresAt: expiresAt.raw,
      };
    })
    .filter((warning): warning is WeatherWarning => Boolean(warning));
}

export async function fetchOfficialWarnings(
  city: City,
  options: WarningGatewayOptions = {},
): Promise<WeatherWarning[]> {
  const endpoint = options.endpoint ?? import.meta.env.VITE_WARNING_API_URL;
  if (!endpoint || !isAllowedWarningGatewayUrl(endpoint)) return [];

  const controller = new AbortController();
  const timeoutMs =
    options.timeoutMs ??
    Number(import.meta.env.VITE_WARNING_TIMEOUT_MS ?? 2500);
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(endpoint);
  url.searchParams.set("cityId", city.id);
  url.searchParams.set("city", city.name);
  url.searchParams.set("province", city.province);

  try {
    const response = await (options.fetcher ?? fetch)(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    return normalizeOfficialWarnings(
      await response.json(),
      city,
      options.now,
    );
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}
