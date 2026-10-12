import { describe, expect, it } from "vitest";
import { buildCalendarContext } from "./date-context";
import { recommendPoem } from "./recommendation";
import { POEMS } from "../data/poems";
import type { RecommendationHistoryItem, WeatherContext } from "../types";

const WEATHER: Record<"clear" | "light-rain" | "cloudy" | "unknown", WeatherContext> = {
  clear: {
    kind: "clear", label: "晴", freshness: "fresh", source: "open-meteo",
    warnings: [], shouldSuppressPoem: false,
  },
  "light-rain": {
    kind: "light-rain", label: "小雨", freshness: "fresh", source: "open-meteo",
    warnings: [], shouldSuppressPoem: false,
  },
  cloudy: {
    kind: "cloudy", label: "多云", freshness: "fresh", source: "open-meteo",
    warnings: [], shouldSuppressPoem: false,
  },
  unknown: {
    kind: "unknown", label: "天气暂不可用", freshness: "unavailable", source: "offline",
    warnings: [], shouldSuppressPoem: false,
  },
};

interface SimulationResult {
  distinctWorks: number;
  shortestWorkRepeat: number | null;
  shortestAuthorRepeat: number | null;
  unmatchedDays: number;
}

function simulate(
  start: Date,
  days: number,
  kind: keyof typeof WEATHER,
): SimulationResult {
  const history: RecommendationHistoryItem[] = [];
  const lastWork = new Map<string, number>();
  const lastAuthor = new Map<string, number>();
  const distinctWorks = new Set<string>();
  let shortestWorkRepeat = Number.POSITIVE_INFINITY;
  let shortestAuthorRepeat = Number.POSITIVE_INFINITY;
  let unmatchedDays = 0;

  for (let day = 0; day < days; day += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day, 9);
    const calendar = buildCalendarContext(date);
    try {
      const chosen = recommendPoem({
        poems: POEMS,
        calendar,
        weather: WEATHER[kind],
        history,
        feedback: [],
      });
      const previousWork = lastWork.get(chosen.poem.id);
      const previousAuthor = lastAuthor.get(chosen.poem.author);
      if (previousWork !== undefined) {
        shortestWorkRepeat = Math.min(shortestWorkRepeat, day - previousWork);
      }
      if (previousAuthor !== undefined) {
        shortestAuthorRepeat = Math.min(shortestAuthorRepeat, day - previousAuthor);
      }
      lastWork.set(chosen.poem.id, day);
      lastAuthor.set(chosen.poem.author, day);
      distinctWorks.add(chosen.poem.id);
      history.unshift({
        localDate: calendar.localDate,
        workId: chosen.poem.id,
        author: chosen.poem.author,
        primaryContext: chosen.primaryContext,
      });
      history.length = Math.min(history.length, 60);
    } catch {
      unmatchedDays += 1;
    }
  }
  return {
    distinctWorks: distinctWorks.size,
    shortestWorkRepeat: Number.isFinite(shortestWorkRepeat) ? shortestWorkRepeat : null,
    shortestAuthorRepeat: Number.isFinite(shortestAuthorRepeat) ? shortestAuthorRepeat : null,
    unmatchedDays,
  };
}

describe("long-term recommendation diversity", () => {
  it.each([30, 60, 90])("reports %i days across varied seasons and weather", (days) => {
    const results = {
      autumnClear: simulate(new Date(2026, 9, 1, 9), days, "clear"),
      winterRain: simulate(new Date(2026, 0, 1, 9), days, "light-rain"),
      springCloud: simulate(new Date(2026, 2, 1, 9), days, "cloudy"),
      summerOffline: simulate(new Date(2026, 5, 1, 9), days, "unknown"),
    };
    for (const result of Object.values(results)) {
      expect(result.unmatchedDays).toBe(0);
      expect(result.distinctWorks).toBeGreaterThan(0);
    }
    if (days === 60) {
      expect(results.autumnClear.distinctWorks).toBeGreaterThan(23);
      expect(results.autumnClear.shortestWorkRepeat).toBeGreaterThan(8);
    }
    if (days === 30) {
      expect(results.winterRain.shortestWorkRepeat).toBeGreaterThanOrEqual(14);
    }
  });
});
