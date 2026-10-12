import type {
  CalendarContext,
  FeedbackItem,
  Poem,
  Recommendation,
  RecommendationHistoryItem,
  ScoreBreakdown,
  WeatherContext,
} from "../types";
import { feedbackLocalDate } from "./daily-behavior";

export const RULE_VERSION = "1.1.0";
export const CONTENT_VERSION = "2026.07.1";

interface RecommendationInput {
  poems: Poem[];
  calendar: CalendarContext;
  weather: WeatherContext;
  history: RecommendationHistoryItem[];
  feedback: FeedbackItem[];
  excludedWorkId?: string;
}

function stableFraction(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function elapsedLocalDays(today: string, past: string): number {
  const current = Date.parse(`${today}T00:00:00Z`);
  const previous = Date.parse(`${past}T00:00:00Z`);
  return Number.isFinite(current) && Number.isFinite(previous)
    ? Math.round((current - previous) / 86_400_000)
    : Number.POSITIVE_INFINITY;
}

function daysSinceLastDisplay(
  workId: string,
  history: RecommendationHistoryItem[],
  today: string,
): number {
  return Math.min(
    ...history
      .filter((item) => item.workId === workId)
      .map((item) => elapsedLocalDays(today, item.localDate)),
  );
}

function isSeasonallyEligible(
  poem: Poem,
  calendar: CalendarContext,
): boolean {
  if (
    poem.tags.seasons.length === 0 ||
    poem.tags.seasons.includes(calendar.season)
  ) {
    return true;
  }
  // A directly related festival/solar term may intentionally cross a broad
  // seasonal tag. Ordinary weather similarity is never such an exception.
  return Boolean(
    (calendar.festival &&
      poem.tags.festivals.includes(calendar.festival)) ||
    (calendar.solarTerm &&
      poem.tags.solarTerms.includes(calendar.solarTerm)),
  );
}

function scorePoem(
  poem: Poem,
  input: RecommendationInput,
): ScoreBreakdown {
  const { calendar, weather, history, feedback } = input;
  const daysSinceWork = daysSinceLastDisplay(
    poem.id,
    history,
    calendar.localDate,
  );
  const recentAuthor = history.some(
    (item) =>
      item.author === poem.author &&
      elapsedLocalDays(calendar.localDate, item.localDate) <= 5,
  );
  const recentDislikes = feedback.filter((item) => {
    const localDate = feedbackLocalDate(item);
    const age = localDate
      ? elapsedLocalDays(calendar.localDate, localDate)
      : Number.POSITIVE_INFINITY;
    return item.type === "disliked" && age >= 0 && age <= 14;
  });

  const festival = calendar.festival
    ? poem.tags.festivals.includes(calendar.festival)
      ? 50
      : -24
    : poem.tags.festivals.length > 0
      ? -18
      : 0;
  const weatherScore =
    weather.freshness !== "unavailable" &&
    weather.kind !== "unknown" &&
    poem.tags.weather.includes(weather.kind)
      ? 20
      : 0;
  const solarTerm =
    calendar.solarTerm &&
    poem.tags.solarTerms.includes(calendar.solarTerm)
      ? 10
      : 0;
  const season = poem.tags.seasons.includes(calendar.season) ? 10 : 0;
  const timePeriod = poem.tags.timePeriods.includes(calendar.timePeriod)
    ? 5
    : 0;
  const quality = Math.min(10, Math.max(0, poem.quality));
  const variety =
    (daysSinceWork <= 21
      ? -180 + Math.max(0, daysSinceWork) * 4
      : daysSinceWork <= 45
        ? -45
        : daysSinceWork <= 90
          ? -12
          : 0) +
    (recentAuthor ? -12 : 0);
  const sameWorkDisliked = recentDislikes.some(
    (item) => item.workId === poem.id,
  );
  const sharedTags = new Set([
    ...poem.tags.emotions,
    ...poem.tags.lifeScenes,
  ]);
  const tagFeedbackCount = recentDislikes.filter((item) =>
    item.contextTags.some((tag) => sharedTags.has(tag)),
  ).length;
  const feedbackPenalty =
    (sameWorkDisliked ? -35 : 0) -
    Math.min(8, Math.max(0, tagFeedbackCount - 1) * 4);

  return {
    festival,
    weather: weatherScore,
    solarTerm,
    season,
    timePeriod,
    quality,
    variety,
    feedback: feedbackPenalty,
    tieBreaker: stableFraction(`${calendar.localDate}:${poem.id}`),
  };
}

function totalScore(breakdown: ScoreBreakdown): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
}

function completeSentence(value: string): string {
  return `${value.trim().replace(/[，。！？；]+$/u, "")}。`;
}

function reasonWithContext(context: string, summary: string): string {
  const completeSummary = completeSentence(summary);
  const contextual = completeSentence(
    `${context}，${completeSummary.slice(0, -1)}`,
  );
  // Prefer a full summary over cutting a Chinese sentence mid-clause.
  return Array.from(contextual).length <= 40
    ? contextual
    : completeSummary;
}

const SEASON_LABELS = {
  spring: "春日",
  summer: "夏日",
  autumn: "秋日",
  winter: "冬日",
} as const;

function buildReason(
  poem: Poem,
  calendar: CalendarContext,
  weather: WeatherContext,
): { reason: string; primaryContext: string } {
  if (
    calendar.festival &&
    poem.tags.festivals.includes(calendar.festival)
  ) {
    return {
      primaryContext: calendar.festival,
      reason: reasonWithContext(
        `今天是${calendar.festival}`,
        poem.oneLineSummary,
      ),
    };
  }
  if (
    weather.freshness !== "unavailable" &&
    weather.kind !== "unknown" &&
    poem.tags.weather.includes(weather.kind)
  ) {
    return {
      primaryContext: weather.label,
      reason: reasonWithContext(
        weather.freshness === "fresh"
          ? `当地正有${weather.label}`
          : `最近的天气记录显示${weather.label}`,
        poem.oneLineSummary,
      ),
    };
  }
  if (
    calendar.solarTerm &&
    poem.tags.solarTerms.includes(calendar.solarTerm)
  ) {
    return {
      primaryContext: calendar.solarTerm,
      reason: reasonWithContext(
        `今日${calendar.solarTerm}`,
        poem.oneLineSummary,
      ),
    };
  }
  return {
    primaryContext: SEASON_LABELS[calendar.season],
    reason: reasonWithContext(
      SEASON_LABELS[calendar.season],
      poem.oneLineSummary,
    ),
  };
}

export function recommendPoem(input: RecommendationInput): Recommendation {
  const eligible = input.poems
    .filter(
      (poem) =>
        poem.id !== input.excludedWorkId &&
        isSeasonallyEligible(poem, input.calendar),
    );
  const festivalMatches = input.calendar.festival
    ? eligible.filter((poem) =>
        poem.tags.festivals.includes(input.calendar.festival!),
      )
    : [];
  const contextPool = festivalMatches.length > 0
    ? festivalMatches
    : eligible;
  const notRecentlyShown = contextPool.filter(
    (poem) =>
      daysSinceLastDisplay(
        poem.id,
        input.history,
        input.calendar.localDate,
      ) > 14,
  );
  const candidatePool = notRecentlyShown.length > 0
    ? notRecentlyShown
    : contextPool;
  const candidates = candidatePool
    .map((poem) => {
      const breakdown = scorePoem(poem, input);
      return { poem, breakdown, score: totalScore(breakdown) };
    })
    .sort((left, right) => right.score - left.score);

  const selected = candidates[0];
  if (!selected) {
    throw new Error("当前情境下没有适合推荐的作品");
  }
  const { reason, primaryContext } = buildReason(
    selected.poem,
    input.calendar,
    input.weather,
  );
  return {
    poem: selected.poem,
    breakdown: selected.breakdown,
    score: selected.score,
    reason,
    primaryContext,
    source: selected.score > 0 ? "rule" : "fallback",
  };
}
