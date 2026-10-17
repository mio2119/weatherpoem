import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { City } from "../types";
import {
  clearWeatherCache,
  createSafetyWarnings,
  DEFAULT_WEATHER_TIMEOUT_MS,
  fetchWeather,
  mapWeatherCode,
  resolveWeatherTimeoutMs,
  shouldSuppressForWarnings,
} from "./weather";

const testCity: City = {
  id: "beijing",
  name: "北京",
  province: "北京",
  latitude: 39.9042,
  longitude: 116.4074,
  note: "受控测试城市",
};

const WEATHER_CACHE_KEY = "weatherpoem.weather-cache.v1";

function cachedSnow(cachedAt = Date.now() - 1_000) {
  return {
    cityId: testCity.id,
    cachedAt,
    weather: {
      kind: "snow",
      label: "雪",
      observedAt: new Date(cachedAt - 15 * 60 * 1000).toISOString(),
      freshness: "fresh",
      source: "open-meteo",
      warnings: [],
      shouldSuppressPoem: false,
    },
  };
}

async function fetchWithOfflineCache(record: unknown) {
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(record));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  return fetchWeather(testCity);
}

function onlineCurrent(overrides: Record<string, unknown> = {}) {
  return {
    time: Math.floor(Date.now() / 1000),
    weather_code: 61,
    temperature_2m: 15,
    apparent_temperature: 14,
    precipitation: 0.3,
    wind_speed_10m: 8,
    ...overrides,
  };
}

async function fetchWithOnlineCurrent(current: Record<string, unknown>) {
  const request = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ current }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));
  vi.stubGlobal("fetch", request);
  return { weather: await fetchWeather(testCity), request };
}

describe("weather mapping", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("清除天气缓存但不触碰其他站点内本地键", () => {
    localStorage.setItem("weatherpoem.weather-cache.v1", "cached-weather");
    localStorage.setItem("unrelated-key", "keep");

    clearWeatherCache();

    expect(localStorage.getItem("weatherpoem.weather-cache.v1")).toBeNull();
    expect(localStorage.getItem("unrelated-key")).toBe("keep");
  });

  it("将 Open-Meteo 代码映射为本地天气标签", () => {
    expect(mapWeatherCode(0)).toEqual({ kind: "clear", label: "晴" });
    expect(mapWeatherCode(61).kind).toBe("light-rain");
    expect(mapWeatherCode(65).kind).toBe("heavy-rain");
    expect(mapWeatherCode(75).kind).toBe("snow");
    expect(mapWeatherCode(95).kind).toBe("thunderstorm");
  });

  it("雷暴、强风和强降水触发安全提示", () => {
    const warnings = createSafetyWarnings(99, 80, 40);
    expect(warnings).toHaveLength(3);
    expect(warnings.every((warning) => warning.level === "severe")).toBe(true);
  });

  it("普通天气不制造预警", () => {
    expect(createSafetyWarnings(2, 8, 0)).toEqual([]);
  });

  it("天气请求默认在降级预算内结束，并拒绝异常配置", () => {
    expect(DEFAULT_WEATHER_TIMEOUT_MS).toBe(1100);
    expect(resolveWeatherTimeoutMs()).toBe(1100);
    expect(resolveWeatherTimeoutMs("1200")).toBe(1200);
    expect(resolveWeatherTimeoutMs("not-a-number")).toBe(1100);
    expect(resolveWeatherTimeoutMs("100")).toBe(1100);
    expect(resolveWeatherTimeoutMs("6000")).toBe(1100);
  });

  it("隔离性能账户可以确定性覆盖立即离线和超时降级", async () => {
    const immediate = await fetchWeather(testCity, {
      performanceScenario: "weather-offline",
    });
    expect(immediate.source).toBe("offline");
    expect(immediate.shouldSuppressPoem).toBe(false);

    vi.useFakeTimers();
    try {
      let settled = false;
      const pending = fetchWeather(testCity, {
        performanceScenario: "weather-timeout",
      }).then((value) => {
        settled = true;
        return value;
      });
      await vi.advanceTimersByTimeAsync(
        DEFAULT_WEATHER_TIMEOUT_MS - 1,
      );
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({
        source: "offline",
        shouldSuppressPoem: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("隔离官方预警演练只展示安全信息，不伪装成真实天气", async () => {
    const warning = await fetchWeather(testCity, {
      performanceScenario: "official-warning",
    });
    expect(warning.source).toBe("offline");
    expect(warning.shouldSuppressPoem).toBe(true);
    expect(warning.warnings).toHaveLength(1);
    expect(warning.warnings[0]).toMatchObject({
      origin: "official",
      source: "WeatherPoem 隔离性能演练",
      area: "北京",
    });
  });

  it("隔离动态诗境只给出明确标记的合成小雨", async () => {
    const weather = await fetchWeather(testCity, {
      performanceScenario: "scene-rain",
    });
    expect(weather).toMatchObject({
      kind: "light-rain",
      label: "小雨（隔离演练）",
      freshness: "fresh",
      source: "synthetic",
      warnings: [],
      shouldSuppressPoem: false,
    });
  });

  it("联网失败时只把完整且未过期的真实天气缓存标为历史记录", async () => {
    const result = await fetchWithOfflineCache(cachedSnow());
    expect(result).toMatchObject({
      kind: "snow",
      label: "雪",
      freshness: "stale",
      source: "cache",
    });
  });

  it("只把带有效观测时间和数值的在线响应标为新鲜天气", async () => {
    const { weather, request } = await fetchWithOnlineCurrent(onlineCurrent());
    const url = new URL(String(request.mock.calls.at(0)?.at(0)));
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(weather).toMatchObject({
      kind: "light-rain",
      label: "小雨",
      freshness: "fresh",
      source: "open-meteo",
      temperature: 15,
      precipitation: 0.3,
      windSpeed: 8,
    });
    expect(weather.observedAt).toBe(new Date(onlineCurrent().time * 1000).toISOString());
  });

  it.each([
    ["缺少观测时间", { time: undefined }],
    ["过期观测时间", { time: Math.floor((Date.now() - 3 * 60 * 60 * 1000) / 1000) }],
    ["未来观测时间", { time: Math.floor((Date.now() + 30 * 60 * 1000) / 1000) }],
    ["缺少降水", { precipitation: undefined }],
    ["负降水", { precipitation: -1 }],
    ["缺少风速", { wind_speed_10m: undefined }],
    ["负风速", { wind_speed_10m: -1 }],
    ["非法气温", { temperature_2m: "warm" }],
  ])("%s 的在线响应不能冒充当前真实天气", async (_label, overrides) => {
    const { weather } = await fetchWithOnlineCurrent(onlineCurrent(overrides));
    expect(weather).toMatchObject({
      kind: "unknown",
      freshness: "unavailable",
      source: "offline",
    });
    expect(localStorage.getItem(WEATHER_CACHE_KEY)).toBeNull();
  });

  it("在线观测过期时退回有效缓存，而不是把旧在线数据标为新鲜", async () => {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cachedSnow()));
    const { weather } = await fetchWithOnlineCurrent(onlineCurrent({
      time: Math.floor((Date.now() - 3 * 60 * 60 * 1000) / 1000),
    }));
    expect(weather).toMatchObject({
      kind: "snow",
      freshness: "stale",
      source: "cache",
    });
  });

  it("在线观测损坏时仍保留有效官方预警的安全优先级", async () => {
    vi.stubEnv("VITE_WARNING_API_URL", "https://warning.example.test/alerts");
    const now = Date.now();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const target = String(input);
      if (target.startsWith("https://warning.example.test/alerts")) {
        return new Response(JSON.stringify({
          cityId: testCity.id,
          warnings: [{
            id: "heavy-rain",
            title: "暴雨预警",
            level: "warning",
            description: "请留意当地气象部门的信息。",
            source: "测试气象台",
            area: "北京市",
            publishedAt: new Date(now - 60_000).toISOString(),
            expiresAt: new Date(now + 60_000).toISOString(),
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        current: onlineCurrent({ precipitation: -1 }),
      }), { status: 200 });
    }));

    const weather = await fetchWeather(testCity);
    expect(weather).toMatchObject({
      kind: "unknown",
      source: "offline",
      shouldSuppressPoem: true,
    });
    expect(weather.warnings[0]).toMatchObject({
      origin: "official",
      title: "暴雨预警",
    });
  });

  it("有效的缓存官方预警仍优先暂停诗笺，过期预警不再展示", async () => {
    const now = Date.now();
    const warning = {
      id: "official-test",
      title: "大雪预警",
      level: "warning",
      description: "请查看当地官方预警。",
      source: "测试气象台",
      origin: "official",
      area: "北京市",
      publishedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    const active = await fetchWithOfflineCache({
      ...cachedSnow(),
      weather: { ...cachedSnow().weather, warnings: [warning] },
    });
    expect(active.shouldSuppressPoem).toBe(true);
    expect(active.warnings).toHaveLength(1);

    const expired = await fetchWithOfflineCache({
      ...cachedSnow(),
      weather: {
        ...cachedSnow().weather,
        warnings: [{ ...warning, expiresAt: new Date(now - 1).toISOString() }],
      },
    });
    expect(expired).toMatchObject({ source: "cache", warnings: [], shouldSuppressPoem: false });
  });

  it.each([
    ["未来缓存时间", cachedSnow(Date.now() + 60_000)],
    ["过期缓存时间", cachedSnow(Date.now() - 6 * 60 * 60 * 1000 - 1)],
    ["种类与标签相矛盾", { ...cachedSnow(), weather: { ...cachedSnow().weather, label: "晴" } }],
    ["演练来源伪装为缓存", { ...cachedSnow(), weather: { ...cachedSnow().weather, source: "synthetic" } }],
    ["旧缓存缺少观测时间", { ...cachedSnow(), weather: { ...cachedSnow().weather, observedAt: undefined } }],
    ["旧缓存的无时区观测时间", { ...cachedSnow(), weather: { ...cachedSnow().weather, observedAt: "2026-10-15T12:00" } }],
    ["缓存观测时间已过期", { ...cachedSnow(), weather: { ...cachedSnow().weather, observedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() } }],
    ["损坏的预警列表", { ...cachedSnow(), weather: { ...cachedSnow().weather, warnings: [{ level: "severe" }] } }],
  ])("%s 不被当作当地缓存天气", async (_label, record) => {
    const result = await fetchWithOfflineCache(record);
    expect(result).toMatchObject({
      kind: "unknown",
      freshness: "unavailable",
      source: "offline",
      warnings: [],
    });
  });

  it("任何有效官方预警都优先暂停诗笺，基础代理仅在较高风险时暂停", () => {
    expect(
      shouldSuppressForWarnings([
        {
          id: "official-test",
          title: "大风蓝色预警",
          level: "advisory",
          description: "请注意防风。",
          source: "测试气象台",
          origin: "official",
          area: "北京市",
          publishedAt: "2026-07-24T00:00:00+08:00",
          expiresAt: "2026-07-24T08:00:00+08:00",
        },
      ]),
    ).toBe(true);
    expect(
      shouldSuppressForWarnings([
        {
          id: "proxy-test",
          title: "天气提示",
          level: "advisory",
          description: "请留意天气变化。",
          source: "基础天气",
          origin: "weather-proxy",
        },
      ]),
    ).toBe(false);
  });
});
