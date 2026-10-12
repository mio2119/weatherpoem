import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { recommendPoem } from "../core/recommendation";
import { POEMS } from "../data/poems";
import type { CalendarContext, WeatherContext } from "../types";
import PoemCard from "./PoemCard.vue";

const calendar: CalendarContext = {
  localDate: "2026-02-17",
  displayDate: "2月17日",
  weekday: "星期二",
  festival: "春节",
  lunarLabel: "正月初一",
  season: "winter",
  timePeriod: "morning",
};

const weather: WeatherContext = {
  kind: "clear",
  label: "晴",
  freshness: "fresh",
  source: "open-meteo",
  warnings: [],
  shouldSuppressPoem: false,
};

const recommendation = recommendPoem({
  poems: POEMS,
  calendar,
  weather,
  history: [],
  feedback: [],
});

function render(overrides: Record<string, unknown> = {}) {
  return mount(PoemCard, {
    props: {
      recommendation,
      calendar,
      weather,
      favorite: false,
      favoriteCount: 2,
      canReplace: true,
      poemLayout: "horizontal",
      poemFontSize: "medium",
      ...overrides,
    },
  });
}

describe("glance poem card", () => {
  it("shows the complete excerpt, context, reason and stable main actions", async () => {
    const wrapper = render();
    await nextTick();
    expect(wrapper.get("h1").text()).toBe(recommendation.poem.title);
    for (const line of recommendation.poem.excerpt) {
      expect(wrapper.text()).toContain(line);
    }
    expect(wrapper.text()).toContain(recommendation.reason);
    expect(wrapper.text()).toContain("春节 · 晴");
    expect(wrapper.text()).toContain("收藏 2");
    expect(wrapper.get(".read-button").text()).toContain("继续读");
    expect(wrapper.text()).toContain("收起");
    expect(wrapper.emitted("heightNeeded")?.length).toBeGreaterThan(0);
  });

  it("keeps replacement and mismatch actions discoverable behind More", async () => {
    const wrapper = render();
    expect(wrapper.find(".secondary-actions").exists()).toBe(false);
    await wrapper.get(".more-action").trigger("click");
    expect(wrapper.get(".more-action").attributes("aria-expanded")).toBe("true");
    const buttons = wrapper.findAll(".secondary-actions button");
    expect(buttons.map((button) => button.text())).toEqual(["换一首", "不太贴合"]);
    await buttons[0]!.trigger("click");
    await buttons[1]!.trigger("click");
    expect(wrapper.emitted("replace")).toHaveLength(1);
    expect(wrapper.emitted("dislike")).toHaveLength(1);
  });

  it("labels stale and unavailable weather without claiming live conditions", () => {
    const stale = render({ weather: { ...weather, freshness: "stale", source: "cache" } });
    expect(stale.text()).toContain("缓存天气：晴");
    const offline = render({
      calendar: { ...calendar, festival: undefined },
      weather: { ...weather, kind: "unknown", label: "天气暂不可用", freshness: "unavailable", source: "offline" },
    });
    expect(offline.text()).toContain("天气未更新");
    expect(offline.text()).not.toContain("当地正有晴");
    expect(offline.get(".poem-paper").attributes("data-scene")).toBe("season");
    expect(offline.get(".scene-mark").attributes("aria-label"))
      .toContain("不代表当地实时天气");
  });

  it("switches to vertical columns without changing the poem text", async () => {
    const wrapper = render();
    await wrapper.get(".layout-toggle").trigger("click");
    expect(wrapper.emitted("layoutChange")?.[0]).toEqual(["vertical"]);
    await wrapper.setProps({ poemLayout: "vertical" });
    expect(wrapper.get(".poem-lines").classes()).toContain("is-vertical");
    expect(wrapper.findAll(".poem-lines p").map((line) => line.text()).join(""))
      .toBe(recommendation.poem.excerpt.join(""));
  });
});
