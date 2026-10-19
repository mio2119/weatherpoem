import type {
  CalendarContext,
  FeedbackItem,
  Poem,
  Recommendation,
  RecommendationHistoryItem,
  ScoreBreakdown,
  WeatherContext,
  WeatherKind,
} from "../types";
import { feedbackLocalDate } from "./daily-behavior";
import { buildCalendarContext } from "./date-context";

export const RULE_VERSION = "1.2.4";
export const CONTENT_VERSION = "2026.07.1";
export const RETAINED_CONTEXT = "今日已选";

interface RecommendationInput {
  poems: Poem[];
  calendar: CalendarContext;
  weather: WeatherContext;
  history: RecommendationHistoryItem[];
  feedback: FeedbackItem[];
  excludedWorkId?: string;
  retainedWorkId?: string;
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

function scarceUpcomingFestivals(
  poems: Poem[],
  calendar: CalendarContext,
): Set<string> {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendar.localDate);
  if (!dateParts || calendar.festival) return new Set();
  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]);
  const day = Number(dateParts[3]);
  const festivals = new Set<string>();
  for (let offset = 1; offset <= 14; offset += 1) {
    // Local noon avoids a midnight offset on DST transition days.
    const future = new Date(year, month - 1, day + offset, 12);
    const festival = buildCalendarContext(future).festival;
    if (!festival) continue;
    const directlyRelated = poems.filter((poem) =>
      poem.tags.festivals.includes(festival),
    ).length;
    if (directlyRelated > 0 && directlyRelated <= 2) {
      festivals.add(festival);
    }
  }
  return festivals;
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

function reasonWithContext(
  context: string,
  summary: string,
  compactContext?: string,
): string {
  const completeSummary = completeSentence(summary);
  const contextual = completeSentence(
    `${context}，${completeSummary.slice(0, -1)}`,
  );
  if (Array.from(contextual).length <= 40) return contextual;
  if (compactContext) {
    const compact = completeSentence(
      `${compactContext}，${completeSummary.slice(0, -1)}`,
    );
    if (Array.from(compact).length <= 40) return compact;
  }
  // Prefer a full summary over cutting a Chinese sentence mid-clause.
  return completeSummary;
}

const SEASON_LABELS = {
  spring: "春日",
  summer: "夏日",
  autumn: "秋日",
  winter: "冬日",
} as const;

const FRESH_WEATHER_CONTEXT: Record<
  WeatherKind,
  { full: string; compact: string }
> = {
  clear: { full: "当地天气晴朗", compact: "当地晴朗" },
  cloudy: { full: "当地天气多云", compact: "当地多云" },
  overcast: { full: "当地是阴天", compact: "当地阴天" },
  "light-rain": { full: "当地有小雨", compact: "当地小雨" },
  rain: { full: "当地有雨", compact: "当地有雨" },
  "heavy-rain": { full: "当地有大雨", compact: "当地大雨" },
  snow: { full: "当地正在下雪", compact: "当地有雪" },
  fog: { full: "当地起雾", compact: "当地有雾" },
  wind: { full: "当地有风", compact: "当地有风" },
  thunderstorm: { full: "当地有雷暴", compact: "当地雷暴" },
  hot: { full: "当地天气炎热", compact: "当地炎热" },
  cold: { full: "当地天气严寒", compact: "当地严寒" },
  unknown: { full: "当地天气待确认", compact: "天气待确认" },
};

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
    const rehearsalLabel = weather.label.replace(/（隔离演练）$/u, "");
    return {
      primaryContext: weather.label,
      reason: reasonWithContext(
        weather.source === "synthetic"
          ? `隔离场景模拟${weather.label}`
          : weather.freshness === "fresh"
            ? FRESH_WEATHER_CONTEXT[weather.kind].full
            : `最近的天气记录显示${weather.label}`,
        poem.oneLineSummary,
        weather.source === "synthetic"
          ? `演练天气：${rehearsalLabel}`
          : weather.freshness === "fresh"
            ? FRESH_WEATHER_CONTEXT[weather.kind].compact
            : `天气记录为${weather.label}`,
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
  // The caller must supply this ID only for a work already shown today.
  // It is a reading-continuity exception, never a new-selection candidate.
  const retained =
    input.retainedWorkId && input.retainedWorkId !== input.excludedWorkId
      ? input.poems.find((poem) => poem.id === input.retainedWorkId)
      : undefined;
  if (retained && !isSeasonallyEligible(retained, input.calendar)) {
    const breakdown = scorePoem(retained, input);
    return {
      poem: retained,
      breakdown,
      score: totalScore(breakdown),
      reason: "今天已选过这首诗，继续读它。",
      primaryContext: RETAINED_CONTEXT,
      source: "fallback",
    };
  }
  const daysSince = (poem: Poem) => daysSinceLastDisplay(
    poem.id,
    input.history,
    input.calendar.localDate,
  );
  const seasonEligible = input.poems
    .filter(
      (poem) =>
        poem.id !== input.excludedWorkId &&
        isSeasonallyEligible(poem, input.calendar),
    );
  const upcoming = scarceUpcomingFestivals(seasonEligible, input.calendar);
  const unreserved = seasonEligible.filter((poem) =>
    !poem.tags.festivals.some((festival) => upcoming.has(festival)),
  );
  const eligible = unreserved.some((poem) => daysSince(poem) > 14)
    ? unreserved
    : seasonEligible;
  const festivalMatches = input.calendar.festival
    ? eligible.filter((poem) =>
        poem.tags.festivals.includes(input.calendar.festival!),
      )
    : [];
  const hasRecentAuthor = (poem: Poem) => input.history.some((item) =>
    item.author === poem.author &&
    elapsedLocalDays(input.calendar.localDate, item.localDate) <= 5,
  );
  const weatherMatches =
    input.weather.freshness !== "unavailable" &&
    input.weather.kind !== "unknown"
      ? eligible.filter((poem) =>
          poem.tags.weather.includes(input.weather.kind),
        )
      : [];
  const solarTermMatches = input.calendar.solarTerm
    ? eligible.filter((poem) =>
        poem.tags.solarTerms.includes(input.calendar.solarTerm!),
      )
    : [];
  // A directly related festival is exceptional and stays ahead of ordinary
  // variety. If multiple festival works remain, prefer an author not shown in
  // the last five days; this tie-break never replaces the festival match with
  // an ordinary weather/solar-term poem. Otherwise, prefer weather then
  // solar-term relevance within the same novelty band.
  const tiers = [weatherMatches, solarTermMatches, eligible];
  const noveltyBands = [
    (days: number) => !Number.isFinite(days),
    (days: number) => days > 45,
    (days: number) => days > 14,
    () => true,
  ];
  const restedFestivalMatches = festivalMatches.filter((poem) =>
    daysSince(poem) > 14,
  );
  const festivalCandidates = restedFestivalMatches.length > 0
    ? restedFestivalMatches
    : festivalMatches;
  const restedFestivalAuthors = festivalCandidates.filter(
    (poem) => !hasRecentAuthor(poem),
  );
  const candidatePool = festivalMatches.length > 0
    ? restedFestivalAuthors.length > 0
      ? restedFestivalAuthors
      : festivalCandidates
    : noveltyBands
        .flatMap((isRested) =>
          tiers.map((tier) => tier.filter((poem) => isRested(daysSince(poem)))),
        )
        .find((pool) => pool.length > 0) ?? [];
  const authorRested = festivalMatches.length > 0
    ? []
    : candidatePool.filter((poem) => !hasRecentAuthor(poem));
  const candidates = (authorRested.length > 0 ? authorRested : candidatePool)
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
