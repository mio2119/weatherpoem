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
  festivalDays: number;
  festivalMatchedDays: number;
  festivalNames: string[];
  consecutiveAuthorRepeats: Array<{
    previousDate: string;
    localDate: string;
    author: string;
    previousTitle: string;
    title: string;
    festival?: string;
    primaryContext: string;
  }>;
}

function simulate(
  start: Date,
  days: number,
  weatherForDay: keyof typeof WEATHER | ((day: number) => WeatherContext),
): SimulationResult {
  const history: RecommendationHistoryItem[] = [];
  const lastWork = new Map<string, number>();
  const lastAuthor = new Map<string, { day: number; localDate: string; title: string }>();
  const distinctWorks = new Set<string>();
  let shortestWorkRepeat = Number.POSITIVE_INFINITY;
  let shortestAuthorRepeat = Number.POSITIVE_INFINITY;
  let unmatchedDays = 0;
  let festivalDays = 0;
  let festivalMatchedDays = 0;
  const festivalNames = new Set<string>();
  const consecutiveAuthorRepeats: SimulationResult["consecutiveAuthorRepeats"] = [];

  for (let day = 0; day < days; day += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day, 9);
    const calendar = buildCalendarContext(date);
    const weather = typeof weatherForDay === "function"
      ? weatherForDay(day)
      : WEATHER[weatherForDay];
    if (calendar.festival) {
      festivalDays += 1;
      festivalNames.add(calendar.festival);
    }
    try {
      const chosen = recommendPoem({
        poems: POEMS,
        calendar,
        weather,
        history,
        feedback: [],
      });
      if (
        calendar.festival &&
        chosen.poem.tags.festivals.includes(calendar.festival)
      ) {
        festivalMatchedDays += 1;
      }
      const previousWork = lastWork.get(chosen.poem.id);
      const previousAuthor = lastAuthor.get(chosen.poem.author);
      if (previousWork !== undefined) {
        shortestWorkRepeat = Math.min(shortestWorkRepeat, day - previousWork);
      }
      if (previousAuthor !== undefined) {
        const authorRepeatDays = day - previousAuthor.day;
        shortestAuthorRepeat = Math.min(shortestAuthorRepeat, authorRepeatDays);
        if (authorRepeatDays === 1) {
          consecutiveAuthorRepeats.push({
            previousDate: previousAuthor.localDate,
            localDate: calendar.localDate,
            author: chosen.poem.author,
            previousTitle: previousAuthor.title,
            title: chosen.poem.title,
            festival: calendar.festival,
            primaryContext: chosen.primaryContext,
          });
        }
      }
      lastWork.set(chosen.poem.id, day);
      lastAuthor.set(chosen.poem.author, {
        day,
        localDate: calendar.localDate,
        title: chosen.poem.title,
      });
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
    festivalDays,
    festivalMatchedDays,
    festivalNames: [...festivalNames],
    consecutiveAuthorRepeats,
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
      expect(result.shortestWorkRepeat ?? Number.POSITIVE_INFINITY)
        .toBeGreaterThanOrEqual(15);
    }
    if (days === 60) {
      expect(results.autumnClear.distinctWorks).toBeGreaterThanOrEqual(45);
      expect(results.springCloud.distinctWorks).toBeGreaterThanOrEqual(45);
      expect(results.winterRain.shortestWorkRepeat).toBeGreaterThanOrEqual(15);
    }
    if (days === 30) {
      expect(results.winterRain.shortestWorkRepeat).toBeGreaterThanOrEqual(14);
    }
    if (days === 90) {
      expect(results.autumnClear.distinctWorks).toBeGreaterThanOrEqual(60);
      expect(results.winterRain.distinctWorks).toBeGreaterThanOrEqual(50);
      expect(results.springCloud.distinctWorks).toBeGreaterThanOrEqual(50);
    }
  });

  it("keeps direct festival matches across a changing-weather autumn window", () => {
    const weatherCycle = ["clear", "light-rain", "cloudy", "unknown"] as const;
    const results = [30, 60, 90].map((days) => {
      const result = simulate(
        new Date(2026, 6, 22, 9),
        days,
        (day) => WEATHER[weatherCycle[day % weatherCycle.length]!],
      );
      expect(result.unmatchedDays).toBe(0);
      expect(result.festivalMatchedDays).toBe(result.festivalDays);
      expect(result.shortestWorkRepeat ?? Number.POSITIVE_INFINITY).toBeGreaterThanOrEqual(15);
      if (days === 30) expect(result.distinctWorks).toBeGreaterThanOrEqual(25);
      if (days === 60) expect(result.distinctWorks).toBeGreaterThanOrEqual(40);
      if (days === 90) {
        expect(result.distinctWorks).toBeGreaterThanOrEqual(50);
        expect(result.festivalNames).toEqual(["七夕节", "中秋节", "重阳节"]);
      }
      return { days, ...result };
    });

    expect(results).toMatchInlineSnapshot(`
      [
        {
          "consecutiveAuthorRepeats": [],
          "days": 30,
          "distinctWorks": 30,
          "festivalDays": 1,
          "festivalMatchedDays": 1,
          "festivalNames": [
            "七夕节",
          ],
          "shortestAuthorRepeat": 6,
          "shortestWorkRepeat": null,
          "unmatchedDays": 0,
        },
        {
          "consecutiveAuthorRepeats": [
            {
              "author": "王维",
              "festival": undefined,
              "localDate": "2026-09-01",
              "previousDate": "2026-08-31",
              "previousTitle": "终南别业",
              "primaryContext": "小雨",
              "title": "山居秋暝",
            },
          ],
          "days": 60,
          "distinctWorks": 51,
          "festivalDays": 1,
          "festivalMatchedDays": 1,
          "festivalNames": [
            "七夕节",
          ],
          "shortestAuthorRepeat": 1,
          "shortestWorkRepeat": 22,
          "unmatchedDays": 0,
        },
        {
          "consecutiveAuthorRepeats": [
            {
              "author": "王维",
              "festival": undefined,
              "localDate": "2026-09-01",
              "previousDate": "2026-08-31",
              "previousTitle": "终南别业",
              "primaryContext": "小雨",
              "title": "山居秋暝",
            },
          ],
          "days": 90,
          "distinctWorks": 71,
          "festivalDays": 3,
          "festivalMatchedDays": 3,
          "festivalNames": [
            "七夕节",
            "中秋节",
            "重阳节",
          ],
          "shortestAuthorRepeat": 1,
          "shortestWorkRepeat": 18,
          "unmatchedDays": 0,
        },
      ]
    `);
  });
});
