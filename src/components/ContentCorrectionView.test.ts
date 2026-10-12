import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ContentCorrectionView from "./ContentCorrectionView.vue";

describe("ContentCorrectionView", () => {
  it("只说明撤回状态，并允许换成仍有效的内容", async () => {
    const wrapper = mount(ContentCorrectionView, {
      props: {
        hasAlternative: true,
        globallySuspended: false,
      },
    });

    expect(wrapper.text()).toContain("今日内容正在校正");
    expect(wrapper.text()).not.toContain("原文");
    expect(wrapper.get("main").attributes("role")).toBe("status");
    expect(wrapper.get("main").attributes("aria-labelledby")).toBe(
      "content-correction-title",
    );
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("replace")).toHaveLength(1);
  });

  it("全部内容不可用时不提供无效操作", () => {
    const wrapper = mount(ContentCorrectionView, {
      props: {
        hasAlternative: false,
        globallySuspended: true,
      },
    });

    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.text()).toContain("暂时没有可展示的内容");
    expect(wrapper.text()).toContain("内容服务已暂缓展示");
  });
});
