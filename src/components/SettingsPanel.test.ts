import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import type { AppSettings } from "../types";
import SettingsPanel from "./SettingsPanel.vue";

const SETTINGS: AppSettings = {
  configured: true,
  cityId: "beijing",
  autostart: true,
  anonymousMetrics: true,
  theme: "system",
  reduceMotion: false,
};

describe("SettingsPanel privacy consent", () => {
  it("预留统计能力保持禁用并清除旧授权值", async () => {
    const wrapper = mount(SettingsPanel, {
      props: { settings: SETTINGS, favoriteCount: 0 },
    });
    const metrics = wrapper.get(
      'input[aria-describedby="metrics-disabled-note"]',
    );
    expect(metrics.attributes("disabled")).toBeDefined();
    expect((metrics.element as HTMLInputElement).checked).toBe(false);

    await wrapper.get("form").trigger("submit");
    const saved = wrapper.emitted("save")?.[0]?.[0] as AppSettings;
    expect(saved.anonymousMetrics).toBe(false);
  });

  it("明确显示当前版本和未签名试用状态", () => {
    const wrapper = mount(SettingsPanel, {
      props: { settings: SETTINGS, favoriteCount: 0 },
    });

    expect(wrapper.text()).toContain("WeatherPoem 0.2.0");
    expect(wrapper.text()).toContain("M1 未签名试用版");
    expect(wrapper.text()).toContain("不是正式公开发行版");
  });

  it("显示天气数据署名、许可和实际转换说明", () => {
    const wrapper = mount(SettingsPanel, {
      props: { settings: SETTINGS, favoriteCount: 0 },
    });

    expect(wrapper.text()).toContain("Open-Meteo");
    expect(wrapper.text()).toContain("CC BY 4.0");
    expect(wrapper.text()).toContain("把天气代码映射为中文情境");
    expect(wrapper.text()).toContain("不改写接口返回的温度、风速和降水数值");
    expect(wrapper.text()).toContain("第三方许可清单");
  });

  it("进入设置时提供有名称的主区域并接收焦点", async () => {
    const wrapper = mount(SettingsPanel, {
      attachTo: document.body,
      props: { settings: SETTINGS, favoriteCount: 0 },
    });

    await nextTick();
    await nextTick();

    expect(wrapper.get("main").attributes("aria-labelledby")).toBe(
      "settings-title",
    );
    expect(wrapper.get("#settings-title").element.tagName).toBe("H1");
    expect(document.activeElement).toBe(wrapper.get("main").element);
    wrapper.unmount();
  });
});
