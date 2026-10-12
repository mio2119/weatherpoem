import { Solar } from "lunar-typescript";
import type { CalendarContext, Season, TimePeriod } from "../types";

const FESTIVAL_PRIORITY = [
  "春节",
  "元宵节",
  "清明节",
  "端午节",
  "七夕节",
  "中秋节",
  "重阳节",
  "除夕",
];

const WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function seasonForMonth(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function timePeriodForHour(hour: number): TimePeriod {
  if (hour >= 5 && hour < 10) return "morning";
  if (hour >= 10 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

function selectTraditionalFestival(names: string[]): string | undefined {
  const normalized = names.map((name) =>
    name === "清明" ? "清明节" : name,
  );
  return FESTIVAL_PRIORITY.find((festival) => normalized.includes(festival));
}

export function buildCalendarContext(date = new Date()): CalendarContext {
  const solar = Solar.fromYmd(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
  const lunar = solar.getLunar();
  const solarTerm = lunar.getJieQi() || undefined;
  const festival = selectTraditionalFestival([
    ...solar.getFestivals(),
    ...lunar.getFestivals(),
    ...(solarTerm === "清明" ? ["清明"] : []),
  ]);

  return {
    localDate: localDateKey(date),
    displayDate: `${date.getMonth() + 1}月${date.getDate()}日`,
    weekday: WEEKDAYS[date.getDay()]!,
    festival,
    solarTerm,
    lunarLabel: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    season: seasonForMonth(date.getMonth() + 1),
    timePeriod: timePeriodForHour(date.getHours()),
  };
}
