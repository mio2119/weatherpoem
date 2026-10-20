import { describe, expect, it } from "vitest";
import { POEMS } from "../data/poems";
import type { CalendarContext, WeatherContext } from "../types";
import { selectPoemScene } from "./poem-scene";

const baseCalendar: CalendarContext = {
  localDate: "2026-02-17",
  displayDate: "2月17日",
  weekday: "星期二",
  festival: "春节",
  lunarLabel: "正月初一",
  season: "winter",
  timePeriod: "day",
};
const baseWeather: WeatherContext = {
  kind: "rain",
  label: "小雨",
  freshness: "fresh",
  source: "open-meteo",
  warnings: [],
  shouldSuppressPoem: false,
};
const festivalPoem = POEMS.find((poem) => poem.tags.festivals.includes("春节"))!;

describe("poem scene grounding", () => {
  it("lets a matched festival outrank fresh rain", () => {
    expect(selectPoemScene({
      poem: festivalPoem, calendar: baseCalendar, weather: baseWeather,
    })).toMatchObject({ kind: "festival", glyph: "节" });
    expect(selectPoemScene({
      poem: festivalPoem,
      calendar: baseCalendar,
      weather: { ...baseWeather, shouldSuppressPoem: true },
    }).kind).toBe("season");
  });

  it("uses the published poem's Chu River image only for Wen Xiu on Dragon Boat Festival", () => {
    const poem = POEMS.find((item) => item.id === "wen-xiu-duan-wu")!;
    const festivalCalendar = { ...baseCalendar, festival: "端午节" };
    expect(selectPoemScene({
      poem, calendar: festivalCalendar, weather: baseWeather,
    })).toMatchObject({
      kind: "festival", motif: "chu-river", glyph: "江",
      description: expect.stringContaining("楚江"),
    });
    expect(selectPoemScene({
      poem, calendar: { ...festivalCalendar, festival: undefined }, weather: baseWeather,
    }).motif).toBeUndefined();
  });

  it("uses a shared moon only for Su Shi's Mid-Autumn poem", () => {
    const poem = POEMS.find((item) => item.id === "su-shi-shui-diao-ge-tou")!;
    const midAutumn = { ...baseCalendar, festival: "中秋节", season: "autumn" as const };
    expect(selectPoemScene({ poem, calendar: midAutumn, weather: baseWeather }))
      .toMatchObject({
        kind: "festival", motif: "shared-moon", glyph: "月",
        description: expect.stringContaining("共望明月"),
      });
    expect(selectPoemScene({
      poem, calendar: { ...midAutumn, festival: undefined }, weather: baseWeather,
    }).motif).toBeUndefined();
    const otherMoonPoem = POEMS.find((item) => item.id === "li-bai-jing-ye-si")!;
    expect(selectPoemScene({
      poem: otherMoonPoem, calendar: midAutumn, weather: baseWeather,
    }).motif).toBeUndefined();
  });

  it("uses weather art only for fresh, known conditions", () => {
    const scene = (
      weather: WeatherContext,
      timePeriod: CalendarContext["timePeriod"] = "day",
    ) => {
      const poem = POEMS.find((item) =>
        item.tags.weather.includes(weather.kind === "unknown" ? "rain" : weather.kind) &&
        !item.tags.festivals.includes("春节"),
      );
      expect(poem).toBeDefined();
      return selectPoemScene({
        poem: poem!,
        calendar: { ...baseCalendar, timePeriod },
        weather,
      });
    };
    expect(scene(baseWeather).kind).toBe("rain");
    expect(scene({ ...baseWeather, source: "synthetic", label: "小雨（隔离演练）" }))
      .toMatchObject({
        kind: "rain",
        description: "隔离场景：小雨（隔离演练）；不代表当地实时天气",
      });
    expect(scene({ ...baseWeather, kind: "snow", label: "雪" }).kind).toBe("snow");
    expect(scene({ ...baseWeather, kind: "clear", label: "晴" }).kind).toBe("sun");
    expect(scene({ ...baseWeather, kind: "clear", label: "晴" }, "night").kind).toBe("night");
    expect(scene({ ...baseWeather, kind: "clear", label: "晴（隔离演练）", source: "synthetic" }, "night").description)
      .toContain("不代表当地实时天气");
    expect(scene({ ...baseWeather, freshness: "stale", source: "cache" }).kind)
      .toBe("season");
    expect(scene({ ...baseWeather, kind: "unknown", freshness: "unavailable", source: "offline" }).kind)
      .toBe("season");
    expect(scene({ ...baseWeather, shouldSuppressPoem: true }).kind).toBe("season");
  });

  it("does not draw current weather over a poem chosen for another context", () => {
    const poem = POEMS.find((item) =>
      !item.tags.weather.includes("rain") &&
      !item.tags.festivals.includes("春节"),
    );
    expect(poem).toBeDefined();
    expect(selectPoemScene({
      poem: poem!,
      calendar: baseCalendar,
      weather: baseWeather,
    })).toMatchObject({
      kind: "season",
      description: "抽象季节纹样，不代表当地实时天气",
    });
  });

  it("shows a rain scene when light rain matches a broadly rain-tagged poem", () => {
    const poem = POEMS.find((item) => item.id === "wang-chang-ling-fu-rong-lou")!;
    expect(poem.tags.weather).toContain("rain");
    expect(poem.tags.weather).not.toContain("light-rain");
    expect(selectPoemScene({
      poem,
      calendar: { ...baseCalendar, festival: undefined, season: "autumn" },
      weather: { ...baseWeather, kind: "light-rain", label: "小雨" },
    })).toMatchObject({ kind: "rain", description: "当地天气：小雨" });

    const downpourPoem = POEMS.find((item) => item.title === "夜雨寄北")!;
    expect(downpourPoem.tags.weather).toContain("heavy-rain");
    expect(selectPoemScene({
      poem: downpourPoem,
      calendar: { ...baseCalendar, festival: undefined, season: "autumn" },
      weather: { ...baseWeather, kind: "light-rain", label: "小雨" },
    }).kind).toBe("season");
  });

  it("uses neutral art for an old same-day poem kept outside the current season", () => {
    expect(selectPoemScene({
      poem: festivalPoem,
      calendar: baseCalendar,
      weather: baseWeather,
      retainedSelection: true,
    })).toMatchObject({
      kind: "neutral",
      glyph: "诗",
      description: "今日已选作品；背景不代表当前天气或季节",
    });
  });
});
