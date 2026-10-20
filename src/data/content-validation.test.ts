import { describe, expect, it } from "vitest";
import type { ContentReview, Poem } from "../types";
import { CONTENT_REVIEWS } from "./content-reviews";
import { POEMS } from "./poems";
import { validateCatalog } from "./content-validation";

describe("content publication gate", () => {
  it("雨景《芙蓉楼送辛渐》的首页节选呈现推荐理由所说的寒雨", () => {
    const poem = POEMS.find((item) => item.id === "wang-chang-ling-fu-rong-lou");
    expect(poem?.excerpt).toEqual(["寒雨连江夜入吴", "平明送客楚山孤"]);
    expect(poem?.fullText[0]).toContain("寒雨连江夜入吴，平明送客楚山孤。");
  });

  it("当前发布目录全部通过内容门禁", () => {
    const result = validateCatalog(POEMS, CONTENT_REVIEWS);
    expect(result.issues).toEqual([]);
    expect(result.published).toHaveLength(120);
    expect(Object.keys(CONTENT_REVIEWS)).toHaveLength(120);
    expect(new Set(POEMS.map((poem) => poem.id)).size).toBe(120);
  });

  it("覆盖全部节日、节气、季节、时段与可推荐天气", () => {
    const expectedFestivals = [
      "春节",
      "元宵节",
      "清明节",
      "端午节",
      "七夕节",
      "中秋节",
      "重阳节",
      "除夕",
    ];
    const expectedSolarTerms = [
      "立春",
      "雨水",
      "惊蛰",
      "春分",
      "清明",
      "谷雨",
      "立夏",
      "小满",
      "芒种",
      "夏至",
      "小暑",
      "大暑",
      "立秋",
      "处暑",
      "白露",
      "秋分",
      "寒露",
      "霜降",
      "立冬",
      "小雪",
      "大雪",
      "冬至",
      "小寒",
      "大寒",
    ];
    const expectedWeather = [
      "clear",
      "cloudy",
      "overcast",
      "light-rain",
      "rain",
      "heavy-rain",
      "snow",
      "fog",
      "wind",
      "thunderstorm",
      "hot",
      "cold",
    ];
    const tagValues = <K extends keyof Poem["tags"]>(key: K) =>
      new Set(POEMS.flatMap((poem) => poem.tags[key]));

    for (const festival of expectedFestivals) {
      expect(tagValues("festivals").has(festival), festival).toBe(true);
    }
    for (const solarTerm of expectedSolarTerms) {
      expect(tagValues("solarTerms").has(solarTerm), solarTerm).toBe(true);
    }
    for (const weather of expectedWeather) {
      expect(tagValues("weather").has(weather as never), weather).toBe(true);
    }
    expect(tagValues("seasons")).toEqual(
      new Set(["spring", "summer", "autumn", "winter"]),
    );
    expect(tagValues("timePeriods")).toEqual(
      new Set(["morning", "day", "evening", "night"]),
    );
  });

  it("每首发布内容都具备出处、注释与扩展阅读", () => {
    for (const poem of POEMS) {
      expect(poem.sourceName.trim(), poem.id).not.toBe("");
      expect(poem.annotations.length, poem.id).toBeGreaterThan(0);
      expect(poem.oneLineSummary.length, poem.id).toBeGreaterThanOrEqual(12);
      expect(poem.culturalBackground.length, poem.id).toBeGreaterThanOrEqual(
        20,
      );
      expect(
        poem.contemporaryConnection.length,
        poem.id,
      ).toBeGreaterThanOrEqual(20);
    }
  });

  it("草稿和撤回作品不会进入推荐候选", () => {
    const sample = POEMS[0]!;
    const reviews: Record<string, ContentReview> = {
      [sample.id]: {
        ...CONTENT_REVIEWS[sample.id]!,
        status: "retracted",
      },
    };
    const result = validateCatalog([sample], reviews);
    expect(result.issues).toEqual([]);
    expect(result.published).toEqual([]);
  });

  it("缺少来源或审核状态的作品会使发布检查失败", () => {
    const sample: Poem = { ...POEMS[0]!, sourceName: "" };
    const missingSource = validateCatalog(
      [sample],
      CONTENT_REVIEWS,
    );
    expect(
      missingSource.issues.some((issue) => issue.field === "sourceName"),
    ).toBe(true);

    const missingReview = validateCatalog([POEMS[0]!], {});
    expect(
      missingReview.issues.some((issue) => issue.field === "review"),
    ).toBe(true);
  });
});
