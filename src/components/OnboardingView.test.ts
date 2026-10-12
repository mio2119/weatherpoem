import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../services/persistence";
import OnboardingView from "./OnboardingView.vue";

describe("first-use city selection", () => {
  it("does not silently use Beijing when an unsupported city is searched", async () => {
    const wrapper = mount(OnboardingView, {
      props: { initialSettings: DEFAULT_SETTINGS },
    });
    expect(wrapper.find<HTMLButtonElement>('button[type="submit"]').element.disabled)
      .toBe(true);

    await wrapper.find<HTMLInputElement>("#city-search").setValue("深圳");
    await wrapper.find<HTMLInputElement>('.consent-row input').setValue(true);
    expect(wrapper.text()).toContain("暂未找到支持的城市");
    expect(wrapper.findAll('.city-option')).toHaveLength(0);
    expect(wrapper.find<HTMLButtonElement>('button[type="submit"]').element.disabled)
      .toBe(true);
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("complete")).toBeUndefined();
  });

  it("shows the actual city before allowing the user to start", async () => {
    const wrapper = mount(OnboardingView, {
      props: { initialSettings: DEFAULT_SETTINGS },
    });
    await wrapper.find<HTMLInputElement>("#city-search").setValue("杭州");
    await wrapper.find<HTMLInputElement>('input[value="hangzhou"]').setValue(true);
    await wrapper.find<HTMLInputElement>('.consent-row input').setValue(true);

    expect(wrapper.text()).toContain("本次将使用浙江 · 杭州的天气");
    expect(wrapper.find<HTMLButtonElement>('button[type="submit"]').element.disabled)
      .toBe(false);
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("complete")?.[0]?.[0]).toMatchObject({
      configured: true,
      cityId: "hangzhou",
    });
  });

  it("clears a previous selection when a new search begins", async () => {
    const wrapper = mount(OnboardingView, {
      props: { initialSettings: DEFAULT_SETTINGS },
    });
    await wrapper.find<HTMLInputElement>('input[value="beijing"]').setValue(true);
    await wrapper.find<HTMLInputElement>("#city-search").setValue("深圳");
    expect(wrapper.text()).toContain("请选择一座城市");
  });
});
