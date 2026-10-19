import { describe, expect, it } from "vitest";
import { POEMS } from "../data/poems";
import { buildCalendarContext } from "./date-context";
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

  it("节日匹配作品同样适用近期作者避让，不牺牲节日关联", () => {
    const base = POEMS[0]!;
    const festivalTags = {
      ...base.tags,
      festivals: ["重阳节"],
      seasons: ["autumn" as const],
      solarTerms: [],
      timePeriods: ["day" as const],
      emotions: [],
      lifeScenes: [],
    };
    const recentAuthorPoem = {
      ...base,
      id: "wang-wei-festival-weather-match",
      author: "王维",
      quality: 10,
      tags: { ...festivalTags, weather: ["clear" as const] },
    };
    const otherAuthorFestivalPoem = {
      ...base,
      id: "meng-hao-ran-festival-match",
      author: "孟浩然",
      quality: 0,
      tags: { ...festivalTags, weather: [] },
    };
    const eventDay = buildCalendarContext(new Date(2026, 9, 18, 12));
    expect(eventDay.festival).toBe("重阳节");
    const result = recommendPoem({
      poems: [recentAuthorPoem, otherAuthorFestivalPoem],
      calendar: eventDay,
      weather: { ...rainyWeather, kind: "clear", label: "晴" },
      history: [
        {
          localDate: "2026-10-17",
          workId: "wang-wei-shan-ju-qiu-ming",
          author: "王维",
          primaryContext: "秋日",
        },
        {
          localDate: "2026-08-18",
          workId: recentAuthorPoem.id,
          author: recentAuthorPoem.author,
          primaryContext: "重阳节",
        },
      ],
      feedback: [],
    });

    expect(result.poem.id).toBe(otherAuthorFestivalPoem.id);
    expect(result.poem.tags.festivals).toContain("重阳节");
    expect(result.primaryContext).toBe("重阳节");
  });

  it("真实中秋内容池可避开近期作者，同时仍选择直接节日作品", () => {
    const eventDay = buildCalendarContext(new Date(2026, 8, 25, 9));
    expect(eventDay.festival).toBe("中秋节");
    const result = recommendPoem({
      poems: POEMS,
      calendar: eventDay,
      weather: { ...rainyWeather, kind: "clear", label: "晴" },
      history: [
        {
          localDate: "2026-09-24",
          workId: "su-shi-ding-feng-bo",
          author: "苏轼",
          primaryContext: "秋日",
        },
      ],
      feedback: [],
    });

    expect(result.poem.author).not.toBe("苏轼");
    expect(result.poem.tags.festivals).toContain("中秋节");
    expect(result.primaryContext).toBe("中秋节");
  });

  it("重阳的真实竞争作品在托盘次日恢复场景下避开前一日王维", () => {
    const eventDay = buildCalendarContext(new Date(2026, 9, 18, 9));
    expect(eventDay.festival).toBe("重阳节");
    const result = recommendPoem({
      poems: POEMS,
      calendar: eventDay,
      weather: { ...rainyWeather, kind: "unknown", freshness: "unavailable" },
      history: [
        {
          localDate: "2026-10-17",
          workId: "wang-wei-shan-ju-qiu-ming",
          author: "王维",
          primaryContext: "秋日",
        },
      ],
      feedback: [],
    });

    expect(result.poem.id).toBe("meng-hao-ran-guo-gu-ren-zhuang");
    expect(result.poem.author).toBe("孟浩然");
    expect(result.poem.tags.festivals).toContain("重阳节");
    expect(result.primaryContext).toBe("重阳节");
  });

  it("没有节日时优先匹配天气", () => {
    const result = recommend({
      calendar: { ...calendar, festival: undefined, localDate: "2026-07-23" },
    });
    expect(result.poem.tags.weather).toContain("rain");
    expect(result.poem.tags.festivals).toHaveLength(0);
    expect(result.breakdown.weather).toBe(20);
  });

  it("隔离天气匹配的理由不冒充当地实况", () => {
    const result = recommend({
      calendar: { ...calendar, festival: undefined, localDate: "2026-07-23" },
      weather: {
        ...rainyWeather,
        source: "synthetic",
        label: "小雨（隔离演练）",
      },
    });
    expect(result.breakdown.weather).toBe(20);
    expect(result.reason).toContain("隔离场景模拟");
    expect(result.reason).not.toContain("当地正有");
  });

  it.each([
    ["du-fu-chun-ye-xi-yu", "light-rain", "小雨", "spring", "night", "当地有小雨"],
    ["liu-zong-yuan-jiang-xue", "snow", "雪", "winter", "day", "当地正在下雪"],
    ["liu-yu-xi-qiu-ci", "clear", "晴", "autumn", "day", "当地天气晴朗"],
    ["zhang-ji-feng-qiao-ye-bo", "clear", "晴", "autumn", "night", "当地天气晴朗"],
  ] as const)("新鲜天气理由用自然中文表达：%s", (
    workId,
    kind,
    label,
    season,
    timePeriod,
    expectedContext,
  ) => {
    const poem = POEMS.find((item) => item.id === workId)!;
    const result = recommendPoem({
      poems: [poem],
      calendar: {
        ...calendar,
        festival: undefined,
        solarTerm: undefined,
        season,
        timePeriod,
      },
      weather: { ...rainyWeather, kind, label },
      history: [],
      feedback: [],
    });
    expect(result.reason).toMatch(new RegExp(`^${expectedContext}，`));
    expect(result.reason).not.toContain("当地正有");
  });

  it.each([
    ["clear", "晴", "当地天气晴朗"],
    ["cloudy", "多云", "当地天气多云"],
    ["overcast", "阴", "当地是阴天"],
    ["light-rain", "小雨", "当地有小雨"],
    ["rain", "雨", "当地有雨"],
    ["heavy-rain", "大雨", "当地有大雨"],
    ["snow", "雪", "当地正在下雪"],
    ["fog", "雾", "当地起雾"],
    ["wind", "风", "当地有风"],
    ["thunderstorm", "雷暴", "当地有雷暴"],
    ["hot", "炎热", "当地天气炎热"],
    ["cold", "严寒", "当地天气严寒"],
  ] as const)("所有新鲜天气类型都有可读理由：%s", (
    kind,
    label,
    expectedContext,
  ) => {
    const base = POEMS[0]!;
    const poem = {
      ...base,
      oneLineSummary: "今天适合读这首诗。",
      tags: {
        ...base.tags,
        festivals: [],
        solarTerms: [],
        weather: [kind],
      },
    };
    const result = recommendPoem({
      poems: [poem],
      calendar: {
        ...calendar,
        festival: undefined,
        solarTerm: undefined,
        season: base.tags.seasons[0] ?? calendar.season,
      },
      weather: { ...rainyWeather, kind, label },
      history: [],
      feedback: [],
    });
    expect(result.reason).toBe(`${expectedContext}，今天适合读这首诗。`);
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

  it("节气作品其他分数更高时，仍优先使用新鲜天气匹配", () => {
    const base = POEMS[0]!;
    const sharedTags = {
      ...base.tags,
      festivals: [],
      seasons: ["spring" as const],
      emotions: [],
      lifeScenes: [],
    };
    const weatherPoem = {
      ...base,
      id: "weather-priority-case",
      quality: 0,
      tags: {
        ...sharedTags,
        weather: ["rain" as const],
        solarTerms: [],
        timePeriods: [],
      },
    };
    const solarPoem = {
      ...base,
      id: "solar-priority-case",
      quality: 10,
      tags: {
        ...sharedTags,
        weather: [],
        solarTerms: ["清明"],
        timePeriods: ["morning" as const],
      },
    };
    const result = recommendPoem({
      poems: [weatherPoem, solarPoem],
      calendar: {
        ...calendar,
        festival: undefined,
        solarTerm: "清明",
        localDate: "2026-04-05",
        season: "spring",
      },
      weather: rainyWeather,
      history: [],
      feedback: [],
    });
    expect(result.poem.id).toBe(weatherPoem.id);
    expect(result.primaryContext).toBe("雨");
  });

  it("天气匹配作品刚展示过时，先用未展示的节气作品避免早期重复", () => {
    const base = POEMS[0]!;
    const sharedTags = {
      ...base.tags,
      festivals: [],
      seasons: ["spring" as const],
      emotions: [],
      lifeScenes: [],
      timePeriods: [],
    };
    const weatherPoem = {
      ...base,
      id: "recent-weather-poem",
      tags: { ...sharedTags, weather: ["rain" as const], solarTerms: [] },
    };
    const solarPoem = {
      ...base,
      id: "fresh-solar-poem",
      tags: { ...sharedTags, weather: [], solarTerms: ["清明"] },
    };
    const result = recommendPoem({
      poems: [weatherPoem, solarPoem],
      calendar: {
        ...calendar,
        festival: undefined,
        solarTerm: "清明",
        localDate: "2026-04-05",
        season: "spring",
      },
      weather: rainyWeather,
      history: [{
        localDate: "2026-04-04",
        workId: weatherPoem.id,
        author: weatherPoem.author,
        primaryContext: "雨",
      }],
      feedback: [],
    });
    expect(result.poem.id).toBe(solarPoem.id);
    expect(result.primaryContext).toBe("清明");
  });

  it("同一情境与新鲜度下有其他作者时，避免连续推荐同一作者", () => {
    const base = POEMS[0]!;
    const tags = {
      ...base.tags,
      festivals: [],
      seasons: ["spring" as const],
      weather: ["rain" as const],
      solarTerms: [],
      emotions: [],
      lifeScenes: [],
    };
    const recentAuthorPoem = {
      ...base,
      id: "recent-author-poem",
      author: "甲",
      quality: 10,
      tags: { ...tags, timePeriods: ["morning" as const] },
    };
    const otherAuthorPoem = {
      ...base,
      id: "other-author-poem",
      author: "乙",
      quality: 0,
      tags: { ...tags, timePeriods: [] },
    };
    const result = recommendPoem({
      poems: [recentAuthorPoem, otherAuthorPoem],
      calendar: {
        ...calendar,
        festival: undefined,
        solarTerm: undefined,
        localDate: "2026-04-05",
        season: "spring",
      },
      weather: rainyWeather,
      history: [{
        localDate: "2026-04-04",
        workId: "previous-work-by-recent-author",
        author: "甲",
        primaryContext: "雨",
      }],
      feedback: [],
    });
    expect(result.poem.id).toBe(otherAuthorPoem.id);
    expect(result.primaryContext).toBe("雨");
  });

  it("秋季小雨可匹配广义雨诗并避开前一天作者", () => {
    const recentAuthorPoem = POEMS.find((item) => item.id === "wang-wei-shan-ju-qiu-ming")!;
    const otherAuthorRainPoem = POEMS.find((item) => item.id === "wang-chang-ling-fu-rong-lou")!;
    const result = recommendPoem({
      poems: [recentAuthorPoem, otherAuthorRainPoem],
      calendar: buildCalendarContext(new Date(2026, 8, 1, 9)),
      weather: { ...rainyWeather, kind: "light-rain", label: "小雨" },
      history: [{
        localDate: "2026-08-31",
        workId: "wang-wei-zhong-nan-bie-ye",
        author: "王维",
        primaryContext: "晴",
      }],
      feedback: [],
    });

    expect(result.poem.id).toBe(otherAuthorRainPoem.id);
    expect(result.primaryContext).toBe("小雨");
    expect(result.breakdown.weather).toBe(20);
    expect(result.reason).toContain("当地有小雨");
  });

  it("临近稀缺节日前先保留唯一的直关联作品", () => {
    const base = POEMS[0]!;
    const festivalPoem = {
      ...base,
      id: "unique-new-years-eve-poem",
      quality: 10,
      tags: {
        ...base.tags,
        festivals: ["除夕"],
        seasons: ["winter" as const],
        weather: ["rain" as const],
        solarTerms: [],
      },
    };
    const ordinaryPoem = {
      ...base,
      id: "ordinary-winter-poem",
      quality: 0,
      tags: {
        ...base.tags,
        festivals: [],
        seasons: ["winter" as const],
        weather: [],
        solarTerms: [],
      },
    };
    const ordinaryDay = buildCalendarContext(new Date(2026, 1, 9, 9));
    const festivalDay = buildCalendarContext(new Date(2026, 1, 16, 9));
    expect(ordinaryDay.festival).toBeUndefined();
    expect(festivalDay.festival).toBe("除夕");
    const input = {
      poems: [festivalPoem, ordinaryPoem],
      weather: rainyWeather,
      history: [],
      feedback: [],
    };
    expect(recommendPoem({ ...input, calendar: ordinaryDay }).poem.id)
      .toBe(ordinaryPoem.id);
    expect(recommendPoem({ ...input, calendar: festivalDay }).poem.id)
      .toBe(festivalPoem.id);
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

  it.each([
    ["light-rain", "小雨"],
    ["cloudy", "多云"],
  ] as const)("冬季 %s 不推荐只属于春季的作品", (kind, label) => {
    const result = recommend({
      calendar: {
        ...calendar,
        festival: undefined,
        solarTerm: undefined,
        localDate: "2026-01-14",
        season: "winter",
      },
      weather: { ...rainyWeather, kind, label },
    });
    expect(
      result.poem.tags.seasons.length === 0 ||
        result.poem.tags.seasons.includes("winter"),
    ).toBe(true);
    expect(result.reason).not.toMatch(/。，|spring|summer|autumn|winter/);
  });

  it("节日直接关联允许明确的跨季例外", () => {
    const festivalPoem = {
      ...POEMS[0]!,
      tags: {
        ...POEMS[0]!.tags,
        seasons: ["spring" as const],
        festivals: ["春节"],
      },
    };
    const result = recommendPoem({
      poems: [festivalPoem],
      calendar,
      weather: rainyWeather,
      history: [],
      feedback: [],
    });
    expect(result.poem.id).toBe(festivalPoem.id);
    expect(result.primaryContext).toBe("春节");
  });

  it("没有合适候选时明确失败，不硬推错季作品", () => {
    const springOnly = POEMS.find(
      (poem) => poem.tags.seasons.length === 1 && poem.tags.seasons[0] === "spring",
    )!;
    expect(() =>
      recommendPoem({
        poems: [springOnly],
        calendar: {
          ...calendar,
          festival: undefined,
          localDate: "2026-01-14",
        },
        weather: rainyWeather,
        history: [],
        feedback: [],
      }),
    ).toThrow("当前情境下没有适合推荐的作品");
  });

  it("只为当天已经展示的旧作品保留跨季入口，不把它当作新候选", () => {
    const summerOnly = POEMS.find(
      (poem) => poem.id === "fan-cheng-da-si-shi-tian-yuan-mei-zi",
    )!;
    const autumn = buildCalendarContext(new Date(2026, 9, 14, 9));
    const input = {
      poems: [summerOnly],
      calendar: autumn,
      weather: { ...rainyWeather, kind: "unknown" as const, freshness: "unavailable" as const },
      history: [],
      feedback: [],
    };
    expect(() => recommendPoem(input)).toThrow("当前情境下没有适合推荐的作品");
    const retained = recommendPoem({ ...input, retainedWorkId: summerOnly.id });
    expect(retained.poem.id).toBe(summerOnly.id);
    expect(retained.primaryContext).toBe("今日已选");
    expect(retained.reason).toContain("今天已选");
    expect(retained.reason).not.toContain("秋日");
    expect(retained.source).toBe("fallback");
    expect(() => recommendPoem({ ...input, retainedWorkId: "missing" }))
      .toThrow("当前情境下没有适合推荐的作品");
    expect(() => recommendPoem({
      ...input,
      retainedWorkId: summerOnly.id,
      excludedWorkId: summerOnly.id,
    })).toThrow("当前情境下没有适合推荐的作品");
    const normalAutumn = POEMS.find((poem) =>
      poem.tags.seasons.includes("autumn") && poem.id !== summerOnly.id,
    )!;
    expect(recommendPoem({ ...input, poems: [summerOnly, normalAutumn] }).poem.id)
      .not.toBe(summerOnly.id);
    expect(recommendPoem({
      ...input,
      poems: [summerOnly, normalAutumn],
      retainedWorkId: summerOnly.id,
    }).poem.id).toBe(summerOnly.id);
  });

  it("缓存天气不被写成实时天气，不可用天气不作为推荐依据", () => {
    const winterCalendar = {
      ...calendar,
      festival: undefined,
      localDate: "2026-01-14",
    };
    const cached = recommend({
      calendar: winterCalendar,
      weather: { ...rainyWeather, freshness: "stale", source: "cache" },
    });
    expect(cached.reason).not.toContain("当地正有");

    const unavailable = recommend({
      calendar: winterCalendar,
      weather: {
        ...rainyWeather,
        freshness: "unavailable",
        source: "offline",
      },
    });
    expect(unavailable.breakdown.weather).toBe(0);
    expect(unavailable.primaryContext).not.toBe("雨");
  });

  it("长摘要的缓存天气理由仍明确交代天气依据", () => {
    const poem = POEMS.find((item) => item.id === "xin-qi-ji-xi-jiang-yue")!;
    const result = recommendPoem({
      poems: [poem],
      calendar: {
        ...calendar,
        festival: undefined,
        solarTerm: undefined,
        season: "summer",
        timePeriod: "night",
        localDate: "2026-06-18",
      },
      weather: {
        ...rainyWeather,
        kind: "clear",
        label: "晴",
        freshness: "stale",
        source: "cache",
      },
      history: [],
      feedback: [],
    });
    expect(result.primaryContext).toBe("晴");
    expect(result.reason).toContain("天气记录");
    expect(result.reason).not.toContain("当地正有");
    expect(Array.from(result.reason).length).toBeLessThanOrEqual(40);
  });

  it("全目录天气作品的缓存与隔离理由都保留来源语义", () => {
    const weatherLabels: Record<Exclude<WeatherContext["kind"], "unknown">, string> = {
      clear: "晴",
      cloudy: "多云",
      overcast: "阴",
      "light-rain": "小雨",
      rain: "雨",
      "heavy-rain": "大雨",
      snow: "雪",
      fog: "雾",
      wind: "风",
      thunderstorm: "雷暴",
      hot: "炎热",
      cold: "严寒",
    };
    for (const poem of POEMS) {
      const kind = poem.tags.weather[0];
      if (!kind || kind === "unknown") continue;
      for (const source of ["cache", "synthetic"] as const) {
        const label = source === "synthetic"
          ? `${weatherLabels[kind]}（隔离演练）`
          : weatherLabels[kind];
        const result = recommendPoem({
          poems: [poem],
          calendar: {
            ...calendar,
            festival: undefined,
            solarTerm: undefined,
            season: poem.tags.seasons[0] ?? calendar.season,
          },
          weather: {
            ...rainyWeather,
            kind,
            label,
            freshness: source === "cache" ? "stale" : "fresh",
            source,
          },
          history: [],
          feedback: [],
        });
        expect(result.primaryContext).toBe(label);
        expect(result.reason).toContain(
          source === "cache" ? "天气记录" : "演练",
        );
        expect(result.reason).not.toContain("当地正有");
        expect(Array.from(result.reason).length).toBeLessThanOrEqual(40);
      }
    }
  });

  it("120 首单作品在节日、天气、节气和离线情境中理由完整", () => {
    for (const poem of POEMS) {
      const context = {
        ...calendar,
        festival: poem.tags.festivals[0],
        solarTerm: poem.tags.solarTerms[0],
        season: poem.tags.seasons[0] ?? calendar.season,
      };
      for (const weather of [
        rainyWeather,
        { ...rainyWeather, kind: "unknown" as const, freshness: "unavailable" as const },
      ]) {
        const result = recommendPoem({
          poems: [poem],
          calendar: context,
          weather,
          history: [],
          feedback: [],
        });
        expect(result.reason).not.toMatch(/。，|，，|spring|summer|autumn|winter/);
        expect(result.reason.endsWith("。 ")).toBe(false);
        expect(result.reason.endsWith("。")).toBe(true);
        expect(Array.from(result.reason).length).toBeLessThanOrEqual(40);
      }
    }
  });

  it("一次不贴合主要影响这首作品，不永久压低共享主题", () => {
    const target = POEMS.find((poem) => poem.tags.emotions.length > 0)!;
    const sharedTag = target.tags.emotions[0]!;
    const neighbor = POEMS.find(
      (poem) => poem.id !== target.id && poem.tags.emotions.includes(sharedTag),
    )!;
    const context = {
      ...calendar,
      festival: undefined,
      solarTerm: undefined,
      season: target.tags.seasons[0] ?? calendar.season,
      localDate: "2026-07-24",
    };
    const feedback = [{
      workId: target.id,
      type: "disliked" as const,
      contextTags: [sharedTag],
      createdAt: "2026-07-24T00:00:00Z",
      localDate: "2026-07-24",
    }];
    const evaluate = (poem: typeof target, localDate: string, useFeedback: boolean) =>
      recommendPoem({
        poems: [poem],
        calendar: { ...context, localDate, season: poem.tags.seasons[0] ?? context.season },
        weather: { ...rainyWeather, kind: "unknown", freshness: "unavailable" },
        history: [],
        feedback: useFeedback ? feedback : [],
      }).breakdown.feedback;

    expect(evaluate(target, "2026-07-24", true)).toBe(-35);
    expect(evaluate(neighbor, "2026-07-24", true)).toBe(0);
    expect(evaluate(target, "2026-08-08", true)).toBe(0);
    expect(evaluate(target, "2026-07-24", false)).toBe(0);
  });
});
