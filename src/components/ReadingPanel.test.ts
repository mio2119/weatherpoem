import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { POEMS } from "../data/poems";
import ReadingPanel from "./ReadingPanel.vue";

const poem = POEMS.find((item) => item.title === "黄鹤楼") ?? POEMS[0]!;

describe("reading orientation", () => {
  it("keeps the full text and its order when orientation changes", async () => {
    const wrapper = mount(ReadingPanel, {
      props: {
        poem,
        favorite: false,
        backLabel: "今日诗笺",
        poemLayout: "horizontal",
        poemFontSize: "medium",
      },
    });
    expect(wrapper.findAll(".full-poem p").map((line) => line.text()))
      .toEqual(poem.fullText);
    await wrapper.get(".reading-layout-action button").trigger("click");
    expect(wrapper.emitted("layoutChange")?.[0]).toEqual(["vertical"]);
    await wrapper.setProps({ poemLayout: "vertical", poemFontSize: "large" });
    expect(wrapper.get(".reading-poem-frame").attributes("tabindex")).toBe("0");
    expect(wrapper.get(".full-poem").classes()).toContain("is-vertical");
    expect(wrapper.findAll(".full-poem p").map((line) => line.text()).join(""))
      .toBe(poem.fullText.join(""));
    expect(wrapper.get(".reading-panel").attributes("data-poem-font-size"))
      .toBe("large");
  });
});
