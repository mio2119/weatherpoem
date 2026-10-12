import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { WeatherContext } from "../types";
import WarningView from "./WarningView.vue";

function warningWeather(
  origin: "official" | "weather-proxy",
): WeatherContext {
  return {
    kind: "heavy-rain",
    label: "大雨",
    freshness: "fresh",
    source: "open-meteo",
    warnings: [
      {
        id: "warning-test",
        title: origin === "official" ? "暴雨黄色预警" : "强降水天气提示",
        level: "warning",
        description: "预计未来六小时部分地区将出现强降水。",
        source: origin === "official" ? "北京市气象台" : "基础天气",
        origin,
        area: origin === "official" ? "北京市" : undefined,
        publishedAt:
          origin === "official"
            ? "2026-07-24T00:00:00+08:00"
            : undefined,
        expiresAt:
          origin === "official"
            ? "2026-07-24T08:00:00+08:00"
            : undefined,
      },
    ],
    shouldSuppressPoem: true,
  };
}

describe("WarningView", () => {
  it("官方预警显示地区、发布机构与有效期", () => {
    const wrapper = mount(WarningView, {
      props: { weather: warningWeather("official") },
    });
    expect(wrapper.text()).toContain("已收到仍在有效期内的气象预警");
    expect(wrapper.text()).toContain("北京市 · 北京市气象台");
    expect(wrapper.text()).toContain("有效至");
    expect(wrapper.text()).toContain("授权网关转发");
    expect(wrapper.get("main").attributes("role")).toBe("alert");
    expect(wrapper.get("main").attributes("aria-labelledby")).toBe(
      "warning-title",
    );
    expect(wrapper.get(".warning-mark").attributes("aria-hidden")).toBe(
      "true",
    );
    expect(wrapper.get(".warning-item").element.tagName).toBe("SECTION");
    expect(wrapper.get(".warning-item h2").text()).toBe("暴雨黄色预警");
  });

  it("基础代理明确声明不能替代正式预警", () => {
    const wrapper = mount(WarningView, {
      props: { weather: warningWeather("weather-proxy") },
    });
    expect(wrapper.text()).toContain("基础天气数据发现");
    expect(wrapper.text()).toContain("不替代官方预警或应急指引");
    expect(wrapper.text()).not.toContain("授权网关转发");
  });
});
