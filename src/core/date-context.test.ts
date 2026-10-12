import { describe, expect, it } from "vitest";
import {
  buildCalendarContext,
  localDateKey,
  seasonForMonth,
  timePeriodForHour,
} from "./date-context";

describe("date context", () => {
  it("使用本地日期键而不是 UTC 日期", () => {
    const date = new Date(2026, 6, 23, 0, 5);
    expect(localDateKey(date)).toBe("2026-07-23");
  });

  it("映射四季和日内时段", () => {
    expect(seasonForMonth(4)).toBe("spring");
    expect(seasonForMonth(7)).toBe("summer");
    expect(seasonForMonth(10)).toBe("autumn");
    expect(seasonForMonth(1)).toBe("winter");
    expect(timePeriodForHour(7)).toBe("morning");
    expect(timePeriodForHour(13)).toBe("day");
    expect(timePeriodForHour(18)).toBe("evening");
    expect(timePeriodForHour(23)).toBe("night");
  });

  it("识别春节和农历日期", () => {
    const result = buildCalendarContext(new Date(2026, 1, 17, 8, 0));
    expect(result.festival).toBe("春节");
    expect(result.lunarLabel).toBe("正月初一");
  });

  it("识别清明节气并规范为传统节日", () => {
    const result = buildCalendarContext(new Date(2026, 3, 5, 11, 0));
    expect(result.solarTerm).toBe("清明");
    expect(result.festival).toBe("清明节");
  });
});
