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

  it("uses weather art only for fresh, known conditions", () => {
    const poem = POEMS.find((item) => !item.tags.festivals.includes("春节"))!;
    const scene = (weather: WeatherContext, timePeriod: CalendarContext["timePeriod"] = "day") =>
      selectPoemScene({ poem, calendar: { ...baseCalendar, timePeriod }, weather });
    expect(scene(baseWeather).kind).toBe("rain");
    expect(scene({ ...baseWeather, kind: "snow", label: "雪" }).kind).toBe("snow");
    expect(scene({ ...baseWeather, kind: "clear", label: "晴" }).kind).toBe("sun");
    expect(scene({ ...baseWeather, kind: "clear", label: "晴" }, "night").kind).toBe("night");
    expect(scene({ ...baseWeather, freshness: "stale", source: "cache" }).kind)
      .toBe("season");
    expect(scene({ ...baseWeather, kind: "unknown", freshness: "unavailable", source: "offline" }).kind)
      .toBe("season");
    expect(scene({ ...baseWeather, shouldSuppressPoem: true }).kind).toBe("season");
  });
});
