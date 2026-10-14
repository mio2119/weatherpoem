import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import { CONTENT_VERSION } from "./core/recommendation";
import { POEMS } from "./data/poems";
import { CONTENT_WITHDRAWAL_CACHE_KEY } from "./services/content-control";
import { createRepository } from "./services/persistence";
import * as reasonService from "./services/reason";

vi.mock("./services/weather", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/weather")>();
  return {
    ...original,
    fetchWeather: vi.fn(async () => ({
      kind: "unknown" as const,
      label: "天气暂不可用",
      freshness: "unavailable" as const,
      source: "offline" as const,
      warnings: [],
      shouldSuppressPoem: false,
    })),
  };
});

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  localStorage.clear();
  delete window.__TAURI_INTERNALS__;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("browser preview user flow", () => {
  it("continues a same-day legacy poem even when the new season filter excludes new selection", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 9));
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      dailyState: {
        localDate: "2026-10-14",
        state: "shown",
        workId: "fan-cheng-da-si-shi-tian-yuan-mei-zi",
        contentVersion: "legacy",
        ruleVersion: "legacy",
      },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    expect(wrapper.get("#daily-poem-title").text())
      .toBe("四时田园杂兴·梅子金黄杏子肥");
    expect(wrapper.get(".reason-block").text()).toContain("今天已选");
    expect(wrapper.get(".poem-paper").attributes("data-scene")).toBe("neutral");
    expect(wrapper.find(".error-view").exists()).toBe(false);
    const saved = await (await createRepository()).load();
    expect(saved.dailyState?.workId).toBe("fan-cheng-da-si-shi-tian-yuan-mei-zi");
  });

  it("does not carry an old cross-season poem into the next local day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 9));
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      dailyState: {
        localDate: "2026-10-13",
        state: "shown",
        workId: "fan-cheng-da-si-shi-tian-yuan-mei-zi",
        contentVersion: "legacy",
        ruleVersion: "legacy",
      },
      history: [], favorites: [], feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    expect(wrapper!.get("#daily-poem-title").text())
      .not.toBe("四时田园杂兴·梅子金黄杏子肥");
    const saved = await (await createRepository()).load();
    expect(saved.dailyState).toMatchObject({ localDate: "2026-10-14", state: "shown" });
  });

  it("does not retain withdrawn old content even when it was shown today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 9));
    const workId = "fan-cheng-da-si-shi-tian-yuan-mei-zi";
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      dailyState: {
        localDate: "2026-10-14", state: "shown", workId,
        contentVersion: "legacy", ruleVersion: "legacy",
      },
      history: [], favorites: [], feedback: [],
    }));
    localStorage.setItem(CONTENT_WITHDRAWAL_CACHE_KEY, JSON.stringify({
      schemaVersion: "1.0",
      contentVersion: CONTENT_VERSION,
      revision: 1,
      issuedAt: new Date().toISOString(),
      suspendRecommendations: false,
      withdrawnWorkIds: [workId],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".content-correction-view").exists()).toBe(true));
    expect(wrapper!.find(".poem-view").exists()).toBe(false);
    expect(wrapper!.get(".content-correction-view").text())
      .not.toContain("四时田园杂兴·梅子金黄杏子肥");
    expect((await (await createRepository()).load()).dailyState)
      .toMatchObject({ state: "content-withdrawn", workId });
  });

  it("keeps a settings draft through favorites and persists it across remounts", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));

    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".settings-panel").exists()).toBe(true));
    await wrapper.get<HTMLSelectElement>(".settings-form select").setValue("hangzhou");
    await wrapper.get<HTMLSelectElement>('select[name="poem-layout"]').setValue("vertical");
    await wrapper.get<HTMLSelectElement>('select[name="poem-font-size"]').setValue("large");
    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await flushPromises();
    expect(wrapper.get<HTMLSelectElement>(".settings-form select").element.value)
      .toBe("hangzhou");
    const favoritesButton = wrapper.findAll(".settings-navigation").find((button) =>
      button.text().includes("我的收藏"),
    );
    expect(favoritesButton).toBeDefined();
    await favoritesButton!.trigger("click");
    expect(wrapper.find(".favorites-panel").exists()).toBe(true);
    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".settings-panel").exists()).toBe(true));
    expect(wrapper.get<HTMLSelectElement>(".settings-form select").element.value)
      .toBe("hangzhou");
    expect(wrapper.get<HTMLSelectElement>('select[name="poem-layout"]').element.value)
      .toBe("vertical");
    expect(wrapper.get<HTMLSelectElement>('select[name="poem-font-size"]').element.value)
      .toBe("large");

    await wrapper.get(".settings-form").trigger("submit");
    await vi.waitFor(async () => {
      const saved = (await (await createRepository()).load()).settings;
      expect(saved.cityId).toBe("hangzhou");
      expect(saved.poemLayout).toBe("vertical");
      expect(saved.poemFontSize).toBe("large");
    });

    wrapper.unmount();
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await flushPromises();
    expect(wrapper.get<HTMLSelectElement>(".settings-form select").element.value)
      .toBe("hangzhou");
    expect(wrapper.get<HTMLSelectElement>('select[name="poem-layout"]').element.value)
      .toBe("vertical");
    expect(wrapper.get<HTMLSelectElement>('select[name="poem-font-size"]').element.value)
      .toBe("large");
  });

  it("discards a settings draft only after the user confirms leaving", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".settings-panel").exists()).toBe(true));
    await wrapper.get<HTMLSelectElement>(".settings-form select").setValue("hangzhou");
    await wrapper.get(".settings-panel .back-button").trigger("click");
    expect(wrapper.get(".settings-discard").text()).toContain("修改尚未保存");
    expect(wrapper.get<HTMLSelectElement>(".settings-form select").element.value)
      .toBe("hangzhou");

    await wrapper.findAll(".settings-discard button")[1]!.trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".settings-panel").exists()).toBe(true));
    expect(wrapper.get<HTMLSelectElement>(".settings-form select").element.value)
      .toBe("beijing");
  });

  it("keeps a failed settings save visible and retryable without changing saved preferences", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".settings-panel").exists()).toBe(true));
    await wrapper.get<HTMLSelectElement>('select[name="poem-layout"]').setValue("vertical");

    const originalSetItem = localStorage.setItem.bind(localStorage);
    const storageSpy = vi.spyOn(localStorage, "setItem")
      .mockImplementation((key, value) => {
        if (key === "weatherpoem.local.v1") throw new Error("storage full");
        return originalSetItem(key, value);
      });
    await wrapper.get(".settings-form").trigger("submit");
    await vi.waitFor(() => {
      expect(wrapper!.get(".toast-message").text()).toContain("设置未能保存");
    });
    expect(wrapper.find(".settings-panel").exists()).toBe(true);
    expect(wrapper.get<HTMLSelectElement>('select[name="poem-layout"]').element.value)
      .toBe("vertical");
    expect((await (await createRepository()).load()).settings.poemLayout)
      .toBe("horizontal");

    storageSpy.mockRestore();
    await wrapper.get(".settings-form").trigger("submit");
    await vi.waitFor(async () => {
      expect((await (await createRepository()).load()).settings.poemLayout)
        .toBe("vertical");
    });
  });

  it("clears browser preview data without claiming a system autostart change", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: ["a-favorite"],
      feedback: [],
    }));
    vi.stubGlobal("confirm", vi.fn(() => true));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".settings-panel").exists()).toBe(true));
    await wrapper.get(".settings-panel .danger-link").trigger("click");

    await vi.waitFor(async () => {
      expect(wrapper!.find(".onboarding-view").exists()).toBe(true);
      expect(wrapper!.get(".toast-message").text())
        .toContain("此处没有系统开机启动设置");
      const saved = await (await createRepository()).load();
      expect(saved.settings.configured).toBe(false);
      expect(saved.favorites).toEqual([]);
    });
  });

  it("explains a partial reset and retains data until a failed deletion can be retried", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: ["a-favorite"],
      feedback: [],
    }));
    vi.stubGlobal("confirm", vi.fn(() => true));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".settings-panel").exists()).toBe(true));

    const originalRemoveItem = localStorage.removeItem.bind(localStorage);
    const storageSpy = vi.spyOn(localStorage, "removeItem")
      .mockImplementation((key) => {
        if (key === "weatherpoem.local.v1") throw new Error("storage locked");
        return originalRemoveItem(key);
      });
    await wrapper.get(".settings-panel .danger-link").trigger("click");
    await vi.waitFor(() => {
      expect(wrapper!.get(".toast-message").text()).toContain("资料未完整清除");
    });
    expect(wrapper.find(".settings-panel").exists()).toBe(true);
    expect((await (await createRepository()).load()).favorites).toEqual(["a-favorite"]);

    storageSpy.mockRestore();
    await wrapper.get(".settings-panel .danger-link").trigger("click");
    await vi.waitFor(async () => {
      expect(wrapper!.find(".onboarding-view").exists()).toBe(true);
      expect((await (await createRepository()).load()).favorites).toEqual([]);
    });
  });

  it("refreshes the visible poem after local midnight without duplicating same-day history", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 30));
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    expect(wrapper.get(".context-strip strong").text()).toBe("10月13日");
    const first = await (await createRepository()).load();
    expect(first.dailyState?.localDate).toBe("2026-10-13");
    expect(first.history).toHaveLength(1);

    await wrapper.get(".more-action").trigger("click");
    const replace = wrapper.findAll(".secondary-actions button")[0]!;
    expect(replace.attributes("disabled")).toBeUndefined();
    await replace.trigger("click");
    await vi.waitFor(async () => {
      const replaced = await (await createRepository()).load();
      expect(replaced.feedback.map((item) => item.localDate)).toEqual(["2026-10-13"]);
      expect(replaced.history.map((item) => item.localDate)).toEqual([
        "2026-10-13",
        "2026-10-13",
      ]);
    });
    await wrapper.get(".more-action").trigger("click");
    expect(wrapper.findAll(".secondary-actions button")[0]!.attributes("disabled"))
      .toBeDefined();

    vi.setSystemTime(new Date(2026, 9, 14, 0, 1));
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(async () => {
      const next = await (await createRepository()).load();
      expect(next.dailyState?.localDate).toBe("2026-10-14");
      expect(next.history.map((item) => item.localDate)).toEqual([
        "2026-10-14",
        "2026-10-13",
        "2026-10-13",
      ]);
      expect(wrapper!.get(".context-strip strong").text()).toBe("10月14日");
    });

    await wrapper.get(".more-action").trigger("click");
    expect(wrapper.findAll(".secondary-actions button")[0]!.attributes("disabled"))
      .toBeUndefined();

    window.dispatchEvent(new Event("focus"));
    await flushPromises();
    const sameDay = await (await createRepository()).load();
    expect(sameDay.history).toHaveLength(3);
  });

  it("allows only one replacement while its recommendation reason is pending", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get(".more-action").trigger("click");

    let releaseReason!: () => void;
    const pendingReason = new Promise<void>((resolve) => { releaseReason = resolve; });
    const reasonSpy = vi.spyOn(reasonService, "enrichRecommendationReason")
      .mockImplementation(async (selected) => {
        await pendingReason;
        return selected;
      });
    const replaceButton = wrapper.findAll(".secondary-actions button")[0]!;
    try {
      await replaceButton.trigger("click");
      await vi.waitFor(() => expect(reasonSpy).toHaveBeenCalledTimes(1));
      expect(replaceButton.attributes("disabled")).toBeDefined();
      await replaceButton.trigger("click");
      await flushPromises();
      expect(reasonSpy).toHaveBeenCalledTimes(1);
    } finally {
      releaseReason();
    }
    await vi.waitFor(async () => {
      const state = await (await createRepository()).load();
      expect(state.feedback.filter((item) => item.type === "replaced")).toHaveLength(1);
      expect(state.history).toHaveLength(2);
    });
  });

  it("cancels a pending replacement when the local date rolls over", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 23, 59, 30));
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get(".more-action").trigger("click");

    let releaseReason!: () => void;
    const pendingReason = new Promise<void>((resolve) => { releaseReason = resolve; });
    const reasonSpy = vi.spyOn(reasonService, "enrichRecommendationReason")
      .mockImplementation(async (selected) => {
        await pendingReason;
        return selected;
      });
    await wrapper.findAll(".secondary-actions button")[0]!.trigger("click");
    await vi.waitFor(() => expect(reasonSpy).toHaveBeenCalledTimes(1));
    vi.setSystemTime(new Date(2026, 9, 14, 0, 1));
    releaseReason();

    await vi.waitFor(async () => {
      const state = await (await createRepository()).load();
      expect(state.dailyState?.localDate).toBe("2026-10-14");
      expect(state.feedback.filter((item) => item.type === "replaced")).toHaveLength(0);
      expect(state.history.map((item) => item.localDate)).toEqual([
        "2026-10-14",
        "2026-10-13",
      ]);
    });
  });

  it("records one mismatch per poem and allows undo before another try", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get(".more-action").trigger("click");
    const dislike = wrapper.findAll(".secondary-actions button")[1]!;
    await Promise.all([dislike.trigger("click"), dislike.trigger("click")]);
    await vi.waitFor(async () => {
      const state = await (await createRepository()).load();
      expect(state.feedback.filter((item) => item.type === "disliked")).toHaveLength(1);
    });
    expect(dislike.text()).toBe("已记录不太贴合");
    expect(dislike.attributes("disabled")).toBeDefined();
    await dislike.trigger("click");
    expect((await (await createRepository()).load()).feedback).toHaveLength(1);

    await wrapper.get('button[aria-label="设置"]').trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".settings-panel").exists()).toBe(true));
    const undo = wrapper.findAll(".settings-navigation").find((button) =>
      button.text().includes("撤销最近一次"),
    );
    expect(undo).toBeDefined();
    await undo!.trigger("click");
    await vi.waitFor(async () => {
      expect((await (await createRepository()).load()).feedback).toHaveLength(0);
    });
    await wrapper.get(".settings-panel .back-button").trigger("click");
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get(".more-action").trigger("click");
    const restored = wrapper.findAll(".secondary-actions button")[1]!;
    expect(restored.text()).toBe("不太贴合");
    expect(restored.attributes("disabled")).toBeUndefined();
  });

  it("keeps mismatch feedback retryable when local storage rejects the write", async () => {
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    await wrapper.get(".more-action").trigger("click");
    const dislike = wrapper.findAll(".secondary-actions button")[1]!;
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const storageSpy = vi.spyOn(localStorage, "setItem")
      .mockImplementation((key, value) => {
        if (key === "weatherpoem.local.v1") throw new Error("storage full");
        return originalSetItem(key, value);
      });
    await dislike.trigger("click");
    await vi.waitFor(() => {
      expect(wrapper!.get(".toast-message").text()).toContain("没能记下反馈");
      expect(dislike.attributes("disabled")).toBeUndefined();
    });
    expect((await (await createRepository()).load()).feedback).toHaveLength(0);

    storageSpy.mockRestore();
    await dislike.trigger("click");
    await vi.waitFor(async () => {
      expect((await (await createRepository()).load()).feedback).toHaveLength(1);
      expect(dislike.text()).toBe("已记录不太贴合");
    });
  });

  it("closes a withdrawn favorite during reading and lets its record be removed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 9));
    const favoritePoem = POEMS.find((poem) => poem.id === "wang-an-shi-yuan-ri")!;
    expect(favoritePoem).toBeDefined();
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [favoritePoem.id],
      feedback: [],
    }));
    const intervalSpy = vi.spyOn(window, "setInterval");
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    expect(wrapper.get(".poem-view h1").text()).not.toBe(favoritePoem.title);

    await wrapper.get(".context-favorites").trigger("click");
    await wrapper.get(".favorite-open").trigger("click");
    expect(wrapper.get(".reading-panel h1").text()).toBe(favoritePoem.title);
    expect(wrapper.get(".full-poem").text()).toContain(favoritePoem.fullText[0]);

    localStorage.setItem(CONTENT_WITHDRAWAL_CACHE_KEY, JSON.stringify({
      schemaVersion: "1.0",
      contentVersion: CONTENT_VERSION,
      revision: 1,
      issuedAt: new Date().toISOString(),
      suspendRecommendations: false,
      withdrawnWorkIds: [favoritePoem.id],
    }));
    const tick = intervalSpy.mock.calls.find(([, delay]) => delay === 30 * 60 * 1000)?.[0];
    expect(typeof tick).toBe("function");
    if (typeof tick === "function") tick();

    await vi.waitFor(() => {
      expect(wrapper!.find(".reading-panel").exists()).toBe(false);
      expect(wrapper!.find(".favorites-panel").exists()).toBe(true);
      expect(wrapper!.get(".withdrawn-favorites").text()).toContain("已撤回");
      expect(wrapper!.find(".favorite-open").exists()).toBe(false);
    });
    expect((await (await createRepository()).load()).favorites).toEqual([favoritePoem.id]);

    await wrapper.get(".withdrawn-favorites button").trigger("click");
    await vi.waitFor(async () => {
      expect((await (await createRepository()).load()).favorites).toEqual([]);
      expect(wrapper!.find(".withdrawn-favorites").exists()).toBe(false);
    });
  });

  it("replaces a withdrawn daily poem without exposing its original text", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 9));
    localStorage.setItem("weatherpoem.local.v1", JSON.stringify({
      settings: { configured: true, cityId: "beijing" },
      history: [],
      favorites: [],
      feedback: [],
    }));
    const intervalSpy = vi.spyOn(window, "setInterval");
    wrapper = mount(App, { attachTo: document.body });
    await vi.waitFor(() => expect(wrapper!.find(".poem-view").exists()).toBe(true));
    const originalId = (await (await createRepository()).load()).dailyState?.workId;
    expect(originalId).toBeDefined();
    const originalTitle = wrapper.get(".poem-view h1").text();

    localStorage.setItem(CONTENT_WITHDRAWAL_CACHE_KEY, JSON.stringify({
      schemaVersion: "1.0",
      contentVersion: CONTENT_VERSION,
      revision: 1,
      issuedAt: new Date().toISOString(),
      suspendRecommendations: false,
      withdrawnWorkIds: [originalId],
    }));
    const tick = intervalSpy.mock.calls.find(([, delay]) => delay === 30 * 60 * 1000)?.[0];
    expect(typeof tick).toBe("function");
    if (typeof tick === "function") tick();

    await vi.waitFor(async () => {
      expect(wrapper!.find(".poem-view").exists()).toBe(false);
      expect(wrapper!.get(".content-correction-view").text()).toContain("今日内容正在校正");
      expect(wrapper!.get(".content-correction-view").text()).not.toContain(originalTitle);
      const state = (await (await createRepository()).load()).dailyState;
      expect(state).toMatchObject({ state: "content-withdrawn", workId: originalId });
    });

    await wrapper.get(".content-correction-view button").trigger("click");
    await vi.waitFor(async () => {
      expect(wrapper!.get(".poem-view h1").text()).not.toBe(originalTitle);
      const state = (await (await createRepository()).load()).dailyState;
      expect(state?.workId).not.toBe(originalId);
      expect(state?.state).toBe("shown");
    });
  });
});
