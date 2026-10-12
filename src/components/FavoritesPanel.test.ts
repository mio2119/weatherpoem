import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FavoritesPanel from "./FavoritesPanel.vue";

describe("favorites return navigation", () => {
  it("uses the originating screen in the back action", async () => {
    const wrapper = mount(FavoritesPanel, {
      props: { poems: [], backLabel: "今日诗笺" },
    });
    const back = wrapper.get(".back-button");
    expect(back.text()).toContain("今日诗笺");
    await back.trigger("click");
    expect(wrapper.emitted("back")).toHaveLength(1);
  });
});
