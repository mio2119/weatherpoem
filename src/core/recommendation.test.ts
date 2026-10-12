import { describe, expect, it } from "vitest";
import { POEMS } from "../data/poems";
import type {
  CalendarContext,
  RecommendationHistoryItem,
  WeatherContext,
} from "../types";
import { recommendPoem } from "./recommendation";

const calendar: CalendarContext = {
  localDate: "2026-02-17",
  displayDate: "2月17日",
  weekday: "星期二",
  festival: "春节",
  lunarLabel: "正月初一",
  season: "winter",
  timePeriod: "morning",
};

const rainyWeather: WeatherContext = {
  kind: "rain",
  label: "雨",
  temperature: 8,
  freshness: "fresh",
  source: "open-meteo",
  warnings: [],
  shouldSuppressPoem: false,
};

function recommend(
  overrides: {
    calendar?: CalendarContext;
    weather?: WeatherContext;
    history?: RecommendationHistoryItem[];
    excludedWorkId?: string;
  } = {},
) {
  return recommendPoem({
    poems: POEMS,
    calendar: overrides.calendar ?? calendar,
    weather: overrides.weather ?? rainyWeather,
    history: overrides.history ?? [],
    feedback: [],
    excludedWorkId: overrides.excludedWorkId,
  });
}

describe("recommendPoem", () => {
  it("节日优先级高于天气匹配", () => {
    const result = recommend();
    expect(result.poem.id).toBe("wang-an-shi-yuan-ri");
    expect(result.breakdown.festival).toBe(50);
    expect(result.primaryContext).toBe("春节");
  });

  it("没有节日时优先匹配天气", () => {
    const result = recommend({
      calendar: { ...calendar, festival: undefined, localDate: "2026-07-23" },
    });
    expect(result.poem.tags.weather).toContain("rain");
    expect(result.poem.tags.festivals).toHaveLength(0);
    expect(result.breakdown.weather).toBe(20);
  });

  it("天气不可用时仍能依据节气推荐", () => {
    const result = recommend({
      calendar: {
        ...calendar,
        festival: undefined,
        solarTerm: "清明",
        season: "spring",
        localDate: "2026-04-05",
      },
      weather: {
        ...rainyWeather,
        kind: "unknown",
        label: "天气暂不可用",
        source: "offline",
        freshness: "unavailable",
      },
    });
    expect(result.poem.tags.solarTerms).toContain("清明");
    expect(result.breakdown.solarTerm).toBe(10);
  });

  it("七天内已展示作品不会立即重复", () => {
    const first = recommend({
      calendar: { ...calendar, festival: undefined, localDate: "2026-07-23" },
    });
    const second = recommend({
      calendar: { ...calendar, festival: undefined, localDate: "2026-07-24" },
      history: [
        {
          localDate: "2026-07-23",
          workId: first.poem.id,
          author: first.poem.author,
          primaryContext: first.primaryContext,
        },
      ],
    });
    expect(second.poem.id).not.toBe(first.poem.id);
  });

  it("支持排除当前作品且推荐理由不超过四十字", () => {
    const first = recommend();
    const second = recommend({ excludedWorkId: first.poem.id });
    expect(second.poem.id).not.toBe(first.poem.id);
    expect(Array.from(second.reason).length).toBeLessThanOrEqual(40);
  });
});
