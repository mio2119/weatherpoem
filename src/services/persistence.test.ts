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

  it("keeps a newly saved poem first in favorites after a reload", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: DEFAULT_SETTINGS,
      history: [],
      favorites: ["older-poem"],
      feedback: [],
    }));
    const repository = await createRepository();
    await repository.toggleFavorite("newer-poem", true);
    expect((await repository.load()).favorites).toEqual(["newer-poem", "older-poem"]);
    expect((await (await createRepository()).load()).favorites).toEqual([
      "newer-poem", "older-poem",
    ]);
    await repository.toggleFavorite("newer-poem", true);
    expect((await repository.load()).favorites).toEqual(["newer-poem", "older-poem"]);
    await repository.toggleFavorite("newer-poem", false);
    expect((await repository.load()).favorites).toEqual(["older-poem"]);
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

  it("保留同一天的原诗、替换诗和收藏，并能重新载入", async () => {
    const repository = await createRepository();
    const original = {
      localDate: "2026-07-24",
      workId: "original-poem",
      author: "甲",
      primaryContext: "weather",
      displayedAt: "2026-07-24T08:00:00+08:00",
    };
    const replacement = {
      ...original,
      workId: "replacement-poem",
      author: "乙",
      displayedAt: "2026-07-24T08:05:00+08:00",
    };
    await repository.recordDisplay(original);
    await repository.recordDisplay(replacement);
    await repository.toggleFavorite(original.workId, true);
    await repository.recordFeedback({
      workId: original.workId,
      type: "replaced",
      contextTags: ["rain"],
      createdAt: "2026-07-24T00:05:00Z",
      localDate: "2026-07-24",
    });

    const reloaded = await (await createRepository()).load();
    expect(reloaded.history.map((item) => item.workId)).toEqual([
      replacement.workId,
      original.workId,
    ]);
    expect(reloaded.favorites).toEqual([original.workId]);
    expect(reloaded.feedback[0]?.localDate).toBe("2026-07-24");
  });

  it("reads old browser data without deleting its settings or daily history", async () => {
    localStorage.setItem(
      "weatherpoem.local.v1",
      JSON.stringify({
        settings: { configured: true, cityId: "hangzhou" },
        history: [{
          localDate: "2026-07-23",
          workId: "legacy-poem",
          author: "甲",
          primaryContext: "weather",
        }],
        favorites: ["legacy-poem"],
        feedback: [{
          workId: "legacy-poem",
          type: "replaced",
          contextTags: [],
          createdAt: "2026-07-23T16:01:00Z",
        }],
      }),
    );
    const data = await (await createRepository()).load();
    expect(data.settings).toMatchObject({ configured: true, cityId: "hangzhou" });
    expect(data.settings.poemLayout).toBe("horizontal");
    expect(data.settings.poemFontSize).toBe("medium");
    expect(data.history[0]?.workId).toBe("legacy-poem");
    expect(data.favorites).toEqual(["legacy-poem"]);
    expect(data.feedback).toHaveLength(1);
  });

  it("persists reading preferences and repairs invalid old values", async () => {
    const repository = await createRepository();
    await repository.saveSettings({
      ...DEFAULT_SETTINGS,
      poemLayout: "vertical",
      poemFontSize: "large",
    });
    expect((await repository.load()).settings).toMatchObject({
      poemLayout: "vertical",
      poemFontSize: "large",
    });
    const raw = JSON.parse(localStorage.getItem("weatherpoem.local.v1")!);
    raw.settings.poemLayout = "diagonal";
    raw.settings.poemFontSize = "enormous";
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify(raw));
    expect((await repository.load()).settings).toMatchObject({
      poemLayout: "horizontal",
      poemFontSize: "medium",
    });
  });

  it("可撤销一条不太贴合反馈而保留其他本地数据", async () => {
    const repository = await createRepository();
    const first = {
      workId: "first-poem",
      type: "disliked" as const,
      contextTags: ["homesick"],
      createdAt: "2026-07-24T00:00:00Z",
      localDate: "2026-07-24",
    };
    const second = { ...first, workId: "second-poem", createdAt: "2026-07-24T01:00:00Z" };
    await repository.recordFeedback(first);
    await repository.recordFeedback(second);
    await repository.toggleFavorite(first.workId, true);
    await repository.removeFeedback(second);

    const reloaded = await (await createRepository()).load();
    expect(reloaded.feedback.map((item) => item.workId)).toEqual([first.workId]);
    expect(reloaded.favorites).toEqual([first.workId]);
  });
});
