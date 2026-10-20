import { afterEach, describe, expect, it, vi } from "vitest";
import {
  feedbackLocalDate,
  hasDislikedWorkOnDate,
  hasReplacedOnDate,
} from "./daily-behavior";
import { localDateKey } from "./date-context";
import type { FeedbackItem } from "../types";

const replacement = (createdAt: string, localDate?: string): FeedbackItem => ({
  workId: "original-poem",
  type: "replaced",
  contextTags: [],
  createdAt,
  localDate,
});

afterEach(() => vi.useRealTimers());

describe("local daily behavior", () => {
  it.each([
    [0, 0],
    [7, 59],
    [8, 0],
    [23, 59],
  ])("uses one local date at %i:%i", (hour, minute) => {
    const now = new Date(2026, 6, 24, hour, minute);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const today = localDateKey(new Date());
    const feedback = replacement(new Date().toISOString(), today);
    expect(hasReplacedOnDate([feedback], today)).toBe(true);
    expect(hasReplacedOnDate([feedback], "2026-07-25")).toBe(false);
  });

  it("restores the replacement allowance after local midnight", () => {
    const feedback = replacement(
      new Date(2026, 6, 24, 23, 59).toISOString(),
      "2026-07-24",
    );
    expect(hasReplacedOnDate([feedback], "2026-07-24")).toBe(true);
    expect(hasReplacedOnDate([feedback], "2026-07-25")).toBe(false);
  });

  it("interprets legacy UTC-only feedback as a local date", () => {
    const legacy = replacement(new Date(2026, 6, 24, 0, 1).toISOString());
    expect(feedbackLocalDate(legacy)).toBe("2026-07-24");
    expect(hasReplacedOnDate([legacy], "2026-07-24")).toBe(true);
  });

  it("keeps the explicit local date when a time zone changes", () => {
    const localDate = "2026-07-24";
    const feedback = replacement("2026-07-23T16:01:00.000Z", localDate);
    expect(feedbackLocalDate(feedback)).toBe(localDate);
  });

  it("ignores malformed old timestamps and unrelated feedback", () => {
    expect(feedbackLocalDate(replacement("invalid"))).toBeUndefined();
    expect(
      hasReplacedOnDate(
        [{ ...replacement("2026-07-24T00:00:00Z"), type: "disliked" }],
        "2026-07-24",
      ),
    ).toBe(false);
  });

  it("counts a mismatch once for the same work and local date", () => {
    const disliked: FeedbackItem = {
      ...replacement("2026-07-24T00:00:00Z", "2026-07-24"),
      type: "disliked",
    };
    expect(hasDislikedWorkOnDate([disliked], "original-poem", "2026-07-24"))
      .toBe(true);
    expect(hasDislikedWorkOnDate([disliked], "another-poem", "2026-07-24"))
      .toBe(false);
    expect(hasDislikedWorkOnDate([disliked], "original-poem", "2026-07-25"))
      .toBe(false);
    expect(hasDislikedWorkOnDate([replacement(disliked.createdAt, disliked.localDate)], "original-poem", "2026-07-24"))
      .toBe(false);
  });
});
