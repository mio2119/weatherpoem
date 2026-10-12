import { beforeEach, describe, expect, it } from "vitest";
import {
  createRepository,
  DEFAULT_SETTINGS,
} from "./persistence";
import { CONTENT_WITHDRAWAL_CACHE_KEY } from "./content-control";
import { createPilotState } from "../core/pilot";

describe("browser persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.__TAURI_INTERNALS__;
  });

  it("清除设置、每日状态、历史、收藏和反馈，但不删除无关本地键", async () => {
    const repository = await createRepository();
    const settings = {
      ...DEFAULT_SETTINGS,
      configured: true,
      cityId: "hangzhou",
    };
    await repository.saveSettings(settings);
    await repository.saveDailyState({
      localDate: "2026-07-24",
      state: "shown",
      workId: "zhao-shi-xiu-yue-ke",
      shownAt: "2026-07-24T08:00:00+08:00",
      contentVersion: "2026.07.1",
      ruleVersion: "1.0.0",
    });
    await repository.recordDisplay({
      localDate: "2026-07-24",
      workId: "zhao-shi-xiu-yue-ke",
      author: "赵师秀",
      primaryContext: "weather",
    });
    await repository.toggleFavorite("zhao-shi-xiu-yue-ke", true);
    await repository.recordFeedback({
      workId: "zhao-shi-xiu-yue-ke",
      type: "disliked",
      contextTags: ["rain"],
      createdAt: "2026-07-24T08:01:00+08:00",
    });
    const today = new Date();
    const pilotStart = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    await repository.savePilotState(createPilotState(pilotStart));
    localStorage.setItem("unrelated-key", "keep");
    localStorage.setItem(
      CONTENT_WITHDRAWAL_CACHE_KEY,
      JSON.stringify({
        schemaVersion: "1.0",
        contentVersion: "2026.07.1",
        revision: 1,
        issuedAt: "2026-07-24T00:00:00+08:00",
        suspendRecommendations: false,
        withdrawnWorkIds: ["zhao-shi-xiu-yue-ke"],
      }),
    );

    const before = await repository.load();
    expect(before.settings.configured).toBe(true);
    expect(before.dailyState?.workId).toBe("zhao-shi-xiu-yue-ke");
    expect(before.history).toHaveLength(1);
    expect(before.favorites).toEqual(["zhao-shi-xiu-yue-ke"]);
    expect(before.feedback).toHaveLength(1);
    expect(before.pilotState?.status).toBe("active");

    await repository.clearUserData();

    expect(await repository.load()).toEqual({
      settings: DEFAULT_SETTINGS,
      history: [],
      favorites: [],
      feedback: [],
    });
    expect(localStorage.getItem("unrelated-key")).toBe("keep");
    expect(
      localStorage.getItem(CONTENT_WITHDRAWAL_CACHE_KEY),
    ).not.toBeNull();
  });
});
