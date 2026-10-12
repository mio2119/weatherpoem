import type {
  CalendarContext,
  FeedbackItem,
  Poem,
  Recommendation,
  RecommendationHistoryItem,
  ScoreBreakdown,
  WeatherContext,
} from "../types";

export const RULE_VERSION = "1.0.0";
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

function recentIds(
  history: RecommendationHistoryItem[],
  days: number,
): Set<string> {
  return new Set(history.slice(0, days).map((item) => item.workId));
}

function scorePoem(
  poem: Poem,
  input: RecommendationInput,
): ScoreBreakdown {
  const { calendar, weather, history, feedback } = input;
  const recentWorks = recentIds(history, 7);
  const recentAuthors = new Set(history.slice(0, 3).map((item) => item.author));
  const dislikedTags = new Set(
    feedback
      .filter((item) => item.type === "disliked")
      .flatMap((item) => item.contextTags),
  );

  const festival = calendar.festival
    ? poem.tags.festivals.includes(calendar.festival)
      ? 50
      : -24
    : poem.tags.festivals.length > 0
      ? -18
      : 0;
  const weatherScore =
    weather.kind !== "unknown" && poem.tags.weather.includes(weather.kind)
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
    (recentWorks.has(poem.id) ? -120 : 0) +
    (recentAuthors.has(poem.author) ? -8 : 0);
  const feedbackPenalty = [
    ...poem.tags.emotions,
    ...poem.tags.lifeScenes,
  ].some((tag) => dislikedTags.has(tag))
    ? -30
    : 0;

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

function compactReason(parts: string[]): string {
  const reason = parts.filter(Boolean).join("，");
  return Array.from(reason).slice(0, 40).join("");
}

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
      reason: compactReason([
        `今天是${calendar.festival}`,
        weather.kind !== "unknown" ? `当地${weather.label}` : "",
        poem.oneLineSummary,
      ]),
    };
  }
  if (
    weather.kind !== "unknown" &&
    poem.tags.weather.includes(weather.kind)
  ) {
    return {
      primaryContext: weather.label,
      reason: compactReason([
        `此刻${weather.label}`,
        calendar.solarTerm ? `正逢${calendar.solarTerm}` : "",
        poem.oneLineSummary,
      ]),
    };
  }
  if (
    calendar.solarTerm &&
    poem.tags.solarTerms.includes(calendar.solarTerm)
  ) {
    return {
      primaryContext: calendar.solarTerm,
      reason: compactReason([
        `今日${calendar.solarTerm}`,
        poem.oneLineSummary,
      ]),
    };
  }
  return {
    primaryContext: calendar.season,
    reason: compactReason([poem.oneLineSummary, "适合作为今天的短暂停留"]),
  };
}

export function recommendPoem(input: RecommendationInput): Recommendation {
  const candidates = input.poems
    .filter((poem) => poem.id !== input.excludedWorkId)
    .map((poem) => {
      const breakdown = scorePoem(poem, input);
      return { poem, breakdown, score: totalScore(breakdown) };
    })
    .sort((left, right) => right.score - left.score);

  const selected = candidates[0];
  if (!selected) {
    throw new Error("内容库中没有可推荐作品");
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
