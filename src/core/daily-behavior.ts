import { localDateKey } from "./date-context";
import type { FeedbackItem } from "../types";

// New feedback stores the local business date explicitly. Older records only
// have a UTC timestamp, so interpret those in the device's current time zone.
export function feedbackLocalDate(item: FeedbackItem): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(item.localDate ?? "")) {
    return item.localDate;
  }
  const createdAt = new Date(item.createdAt);
  return Number.isNaN(createdAt.getTime())
    ? undefined
    : localDateKey(createdAt);
}

export function hasReplacedOnDate(
  feedback: FeedbackItem[],
  localDate: string,
): boolean {
  return feedback.some(
    (item) =>
      item.type === "replaced" && feedbackLocalDate(item) === localDate,
  );
}
