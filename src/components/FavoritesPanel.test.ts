import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FavoritesPanel from "./FavoritesPanel.vue";

describe("favorites return navigation", () => {
  it("disables removal of withdrawn records while a favorite save is pending", () => {
    const wrapper = mount(FavoritesPanel, {
      props: {
        poems: [], withdrawnWorkIds: ["withdrawn-id"], favoriteSaving: true,
        backLabel: "今日诗笺",
      },
    });
    const button = wrapper.get(".withdrawn-favorites button");
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.attributes("aria-busy")).toBe("true");
  });

  it("uses the originating screen in the back action", async () => {
    const wrapper = mount(FavoritesPanel, {
      props: { poems: [], withdrawnWorkIds: [], favoriteSaving: false, backLabel: "今日诗笺" },
    });
    const back = wrapper.get(".back-button");
    expect(back.text()).toContain("今日诗笺");
    await back.trigger("click");
    expect(wrapper.emitted("back")).toHaveLength(1);
  });

  it("does not reopen withdrawn text and lets the user remove the saved record", async () => {
    const wrapper = mount(FavoritesPanel, {
      props: {
        poems: [],
        withdrawnWorkIds: ["withdrawn-id"],
        favoriteSaving: false,
        backLabel: "今日诗笺",
      },
    });
    expect(wrapper.text()).toContain("原文暂不展示");
    expect(wrapper.find(".favorite-open").exists()).toBe(false);
    await wrapper.get(".withdrawn-favorites button").trigger("click");
    expect(wrapper.emitted("remove")?.[0]).toEqual(["withdrawn-id"]);
  });
});
