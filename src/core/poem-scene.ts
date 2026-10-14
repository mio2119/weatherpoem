import type { CalendarContext, Poem, WeatherContext } from "../types";

export type PoemSceneKind = "festival" | "rain" | "snow" | "sun" | "night" | "season" | "neutral";

export interface PoemScene {
  kind: PoemSceneKind;
  glyph: string;
  description: string;
}

/** Visual context is grounded in the same published poem and environment as the reason. */
export function selectPoemScene(input: {
  poem: Poem;
  calendar: CalendarContext;
  weather: WeatherContext;
  retainedSelection?: boolean;
}): PoemScene {
  const { poem, calendar, weather, retainedSelection } = input;
  if (weather.shouldSuppressPoem) {
    return {
      kind: "season",
      glyph: "安",
      description: "安全提醒优先；普通诗境不展示",
    };
  }
  if (retainedSelection) {
    return {
      kind: "neutral",
      glyph: "诗",
      description: "今日已选作品；背景不代表当前天气或季节",
    };
  }
  if (calendar.festival && poem.tags.festivals.includes(calendar.festival)) {
    return {
      kind: "festival",
      glyph: "节",
      description: `节日意象：${calendar.festival}`,
    };
  }
  // Weather remains visible in the context strip, but the decorative scene
  // should not imply that a poem chosen for another reason depicts it.
  if (
    weather.freshness === "fresh" &&
    poem.tags.weather.includes(weather.kind)
  ) {
    const weatherDescription = weather.source === "synthetic"
      ? `隔离场景：${weather.label}；不代表当地实时天气`
      : `当地天气：${weather.label}`;
    if (["light-rain", "rain", "heavy-rain"].includes(weather.kind)) {
      return { kind: "rain", glyph: "雨", description: weatherDescription };
    }
    if (weather.kind === "snow") {
      return { kind: "snow", glyph: "雪", description: weatherDescription };
    }
    if (weather.kind === "clear") {
      return calendar.timePeriod === "night"
        ? {
            kind: "night",
            glyph: "夜",
            description: weather.source === "synthetic" ? weatherDescription : "当地晴夜",
          }
        : { kind: "sun", glyph: "晴", description: weatherDescription };
    }
  }
  if (calendar.solarTerm && poem.tags.solarTerms.includes(calendar.solarTerm)) {
    return {
      kind: "season",
      glyph: "节气",
      description: `节气意象：${calendar.solarTerm}；不代表实时天气`,
    };
  }
  const seasonGlyph: Record<CalendarContext["season"], string> = {
    spring: "春",
    summer: "夏",
    autumn: "秋",
    winter: "冬",
  };
  return {
    kind: "season",
    glyph: seasonGlyph[calendar.season],
    description: "抽象季节纹样，不代表当地实时天气",
  };
}
