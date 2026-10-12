import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FavoritesPanel from "./FavoritesPanel.vue";

describe("favorites return navigation", () => {
  it("uses the originating screen in the back action", async () => {
    const wrapper = mount(FavoritesPanel, {
      props: { poems: [], withdrawnWorkIds: [], backLabel: "今日诗笺" },
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
        backLabel: "今日诗笺",
      },
    });
    expect(wrapper.text()).toContain("原文暂不展示");
    expect(wrapper.find(".favorite-open").exists()).toBe(false);
    await wrapper.get(".withdrawn-favorites button").trigger("click");
    expect(wrapper.emitted("remove")?.[0]).toEqual(["withdrawn-id"]);
  });
});
