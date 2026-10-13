import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import { createRepository } from "./services/persistence";

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
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("browser preview user flow", () => {
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
    const favoritesButton = wrapper.findAll(".settings-navigation").find((button) =>
      button.text().includes("我的收藏"),
    );
    expect(favoritesButton).toBeDefined();
    await favoritesButton!.trigger("click");
    expect(wrapper.find(".favorites-panel").exists()).toBe(true);
    await wrapper.get(".favorites-panel .back-button").trigger("click");
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
});
