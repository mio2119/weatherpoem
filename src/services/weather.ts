import type {
  City,
  PerformanceWeatherScenario,
  WeatherContext,
  WeatherKind,
  WeatherWarning,
} from "../types";
import { fetchOfficialWarnings } from "./warning-gateway";

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
}

const WEATHER_CACHE_KEY = "weatherpoem.weather-cache.v1";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_WEATHER_TIMEOUT_MS = 1100;
const MIN_WEATHER_TIMEOUT_MS = 250;
const MAX_WEATHER_TIMEOUT_MS = 5000;

export interface FetchWeatherOptions {
  performanceScenario?: PerformanceWeatherScenario;
}

export function resolveWeatherTimeoutMs(value?: string): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_WEATHER_TIMEOUT_MS;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    parsed >= MIN_WEATHER_TIMEOUT_MS &&
    parsed <= MAX_WEATHER_TIMEOUT_MS
    ? parsed
    : DEFAULT_WEATHER_TIMEOUT_MS;
}

function controlledOfflineWeather(): WeatherContext {
  return {
    kind: "unknown",
    label: "天气暂不可用",
    freshness: "unavailable",
    source: "offline",
    warnings: [],
    shouldSuppressPoem: false,
  };
}

async function controlledPerformanceWeather(
  city: City,
  scenario: PerformanceWeatherScenario,
): Promise<WeatherContext> {
  if (scenario === "weather-offline") {
    return controlledOfflineWeather();
  }
  if (scenario === "weather-timeout") {
    await new Promise<void>((resolve) => {
      window.setTimeout(
        resolve,
        resolveWeatherTimeoutMs(
          import.meta.env.VITE_WEATHER_TIMEOUT_MS,
        ),
      );
    });
    return controlledOfflineWeather();
  }
  if (scenario !== "official-warning") {
    throw new Error("未知的隔离性能天气场景");
  }

  const publishedAt = new Date();
  const expiresAt = new Date(
    publishedAt.getTime() + 6 * 60 * 60 * 1000,
  );
  const warnings: WeatherWarning[] = [
    {
      id: "official-performance-warning",
      title: "受控暴雨预警演练",
      level: "warning",
      description:
        "这是隔离性能账户中的安全优先路径演练，不是真实气象预警。",
      source: "WeatherPoem 隔离性能演练",
      origin: "official",
      area: `${city.province}${city.name}`,
      publishedAt: publishedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  ];
  return {
    kind: "heavy-rain",
    label: "暴雨预警演练",
    freshness: "fresh",
    source: "offline",
    warnings,
    shouldSuppressPoem: true,
  };
}

export function clearWeatherCache(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(WEATHER_CACHE_KEY);
    }
  } catch {
    // 清除主数据不应因浏览器缓存不可用而失败。
  }
}

export function mapWeatherCode(code: number): {
  kind: WeatherKind;
  label: string;
} {
  if (code === 0) return { kind: "clear", label: "晴" };
  if (code === 1 || code === 2) return { kind: "cloudy", label: "多云" };
  if (code === 3) return { kind: "overcast", label: "阴" };
  if (code === 45 || code === 48) return { kind: "fog", label: "雾" };
  if ([51, 53, 55, 56, 57, 61].includes(code)) {
    return { kind: "light-rain", label: "小雨" };
  }
  if ([63, 66, 80, 81].includes(code)) {
    return { kind: "rain", label: "雨" };
  }
  if ([65, 67, 82].includes(code)) {
    return { kind: "heavy-rain", label: "大雨" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { kind: "snow", label: "雪" };
  }
  if ([95, 96, 99].includes(code)) {
    return { kind: "thunderstorm", label: "雷暴" };
  }
  return { kind: "unknown", label: "天气未知" };
}

export function createSafetyWarnings(
  code: number,
  windSpeed: number,
  precipitation: number,
): WeatherWarning[] {
  const warnings: WeatherWarning[] = [];
  if ([95, 96, 99].includes(code)) {
    warnings.push({
      id: `storm-${code}`,
      title: "雷暴天气提示",
      level: code === 99 ? "severe" : "warning",
      description: "当前天气代码显示雷暴风险，请优先查看当地官方预警。",
      source: "Open-Meteo 基础天气",
      origin: "weather-proxy",
    });
  }
  if (windSpeed >= 50) {
    warnings.push({
      id: `wind-${Math.round(windSpeed)}`,
      title: "强风天气提示",
      level: windSpeed >= 75 ? "severe" : "warning",
      description: "当前近地风速较高，外出前请核对当地官方预警。",
      source: "Open-Meteo 基础天气",
      origin: "weather-proxy",
    });
  }
  if (precipitation >= 20) {
    warnings.push({
      id: `rain-${Math.round(precipitation)}`,
      title: "强降水天气提示",
      level: precipitation >= 35 ? "severe" : "warning",
      description: "当前小时降水明显，请关注积水与出行安全。",
      source: "Open-Meteo 基础天气",
      origin: "weather-proxy",
    });
  }
  return warnings;
}

export function shouldSuppressForWarnings(
  warnings: WeatherWarning[],
): boolean {
  return warnings.some(
    (warning) =>
      warning.origin === "official" ||
      warning.level === "warning" ||
      warning.level === "severe",
  );
}

function activeCachedWarnings(warnings: WeatherWarning[]): WeatherWarning[] {
  const now = Date.now();
  return warnings.filter(
    (warning) =>
      warning.origin !== "official" ||
      !warning.expiresAt ||
      Date.parse(warning.expiresAt) > now,
  );
}

function cacheWeather(cityId: string, weather: WeatherContext): void {
  try {
    localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({ cityId, cachedAt: Date.now(), weather }),
    );
  } catch {
    // 缓存失败不影响今日诗笺。
  }
}

function loadCachedWeather(cityId: string): WeatherContext | undefined {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as {
      cityId: string;
      cachedAt: number;
      weather: WeatherContext;
    };
    if (
      cached.cityId !== cityId ||
      Date.now() - cached.cachedAt > CACHE_MAX_AGE_MS
    ) {
      return undefined;
    }
    const warnings = activeCachedWarnings(cached.weather.warnings);
    return {
      ...cached.weather,
      freshness: "stale",
      source: "cache",
      warnings,
      shouldSuppressPoem: shouldSuppressForWarnings(warnings),
    };
  } catch {
    return undefined;
  }
}

export async function fetchWeather(
  city: City,
  options: FetchWeatherOptions = {},
): Promise<WeatherContext> {
  if (options.performanceScenario) {
    return controlledPerformanceWeather(
      city,
      options.performanceScenario,
    );
  }
  const timeoutMs = resolveWeatherTimeoutMs(
    import.meta.env.VITE_WEATHER_TIMEOUT_MS,
  );
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current:
      "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    timezone: "auto",
  });
  const officialWarningsPromise = fetchOfficialWarnings(city);

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(`天气服务响应 ${response.status}`);
    }
    const payload = (await response.json()) as OpenMeteoResponse;
    const current = payload.current;
    if (!current || typeof current.weather_code !== "number") {
      throw new Error("天气数据缺少必要字段");
    }
    const temperature = current.temperature_2m;
    const windSpeed = current.wind_speed_10m ?? 0;
    const precipitation = current.precipitation ?? 0;
    const mapped = mapWeatherCode(current.weather_code);
    let kind = mapped.kind;
    let label = mapped.label;
    if (typeof temperature === "number" && temperature >= 35) {
      kind = "hot";
      label = "炎热";
    } else if (typeof temperature === "number" && temperature <= -10) {
      kind = "cold";
      label = "严寒";
    } else if (windSpeed >= 35 && kind === "clear") {
      kind = "wind";
      label = "风";
    }
    const proxyWarnings = createSafetyWarnings(
      current.weather_code,
      windSpeed,
      precipitation,
    );
    const officialWarnings = await officialWarningsPromise;
    const warnings = [...officialWarnings, ...proxyWarnings];
    const weather: WeatherContext = {
      kind,
      label,
      temperature,
      apparentTemperature: current.apparent_temperature,
      windSpeed,
      precipitation,
      observedAt: current.time,
      freshness: "fresh",
      source: "open-meteo",
      warnings,
      shouldSuppressPoem: shouldSuppressForWarnings(warnings),
    };
    cacheWeather(city.id, weather);
    return weather;
  } catch {
    const officialWarnings = await officialWarningsPromise;
    const cached = loadCachedWeather(city.id);
    if (cached) {
      if (officialWarnings.length === 0) return cached;
      const warnings = [
        ...officialWarnings,
        ...cached.warnings.filter(
          (warning) => warning.origin !== "official",
        ),
      ];
      return {
        ...cached,
        warnings,
        shouldSuppressPoem: shouldSuppressForWarnings(warnings),
      };
    }
    return {
        kind: "unknown",
        label: "天气暂不可用",
        freshness: "unavailable",
        source: "offline",
        warnings: officialWarnings,
        shouldSuppressPoem: shouldSuppressForWarnings(officialWarnings),
      };
  } finally {
    window.clearTimeout(timer);
  }
}
