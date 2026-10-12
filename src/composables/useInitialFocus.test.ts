import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { useInitialFocus } from "./useInitialFocus";

describe("useInitialFocus", () => {
  it("新页面挂载后把焦点移到页面主区域", async () => {
    const Fixture = defineComponent({
      setup() {
        useInitialFocus();
        return {};
      },
      template:
        '<main ref="initialFocusTarget" tabindex="-1">新页面</main>',
    });
    const wrapper = mount(Fixture, { attachTo: document.body });

    await nextTick();
    await nextTick();

    expect(document.activeElement).toBe(wrapper.get("main").element);
    wrapper.unmount();
  });
});
