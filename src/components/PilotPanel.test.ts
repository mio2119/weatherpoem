import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { PilotState, PilotSummary } from "../types";
import PilotPanel from "./PilotPanel.vue";

const STATE: PilotState = {
  schemaVersion: "1.1",
  consentVersion: "2026.07-pilot-local-v2",
  status: "active",
  startedOn: "2026-07-24",
  endsOn: "2026-08-20",
  purgeOn: "2026-08-27",
  aggregate: {
    activeDates: ["2026-07-24"],
    poemPresentedDates: ["2026-07-24"],
    warningSuppressedDates: [],
    detailOpenedDates: [],
    notRelevantDates: [],
    replacementDates: [],
    favoriteAddedDates: [],
  },
  sessions: {
    completedSessions: 4,
    uncleanExitSessions: 0,
    sessionOpen: true,
  },
};

const SUMMARY: PilotSummary = {
  schemaVersion: "1.1",
  planVersion: "2026.07-pilot-local-v2",
  appVersion: "0.2.0",
  contentVersion: "2026.07.1",
  ruleVersion: "2026.07.1",
  generatedOn: "2026-07-24",
  status: "active",
  period: {
    startedOn: "2026-07-24",
    endsOn: "2026-08-20",
  },
  counts: {
    activeDays: 1,
    eligibleDeliveryDays: 1,
    successfulDeliveryDays: 1,
    warningSuppressedDays: 0,
    detailOpenDays: 0,
    notRelevantDays: 0,
    replacementDays: 0,
    favoriteAddDays: 0,
    completedSessions: 4,
    sessionsWithoutUncleanExit: 4,
    uncleanExitSessions: 0,
  },
  rates: {
    deliveryPercent: 100,
    detailOpenPercent: 0,
    notRelevantPercent: 0,
    crashFreeSessionPercent: 100,
  },
  currentAutostartEnabled: true,
  privacy: {
    automaticUpload: false,
    containsIdentifier: false,
    containsCity: false,
    containsWorkId: false,
    containsRawEvents: false,
    containsSessionTimestamps: false,
    containsCrashDump: false,
  },
};

describe("PilotPanel", () => {
  it("三项明确确认前不能开始本地记录", async () => {
    const wrapper = mount(PilotPanel);
    const button = wrapper.get("button.primary-button");
    expect(button.attributes("disabled")).toBeDefined();

    for (const checkbox of wrapper.findAll('input[type="checkbox"]')) {
      await checkbox.setValue(true);
    }
    expect(button.attributes("disabled")).toBeUndefined();
    await button.trigger("click");
    expect(wrapper.emitted("start")).toHaveLength(1);
  });

  it("参与状态只展示本地聚合并允许用户检查摘要", async () => {
    const wrapper = mount(PilotPanel, {
      props: { state: STATE, summary: SUMMARY },
    });
    expect(wrapper.text()).toContain("没有后台上传");
    expect(wrapper.text()).toContain("观察天数");
    expect(wrapper.text()).toContain("无异常中断");

    await wrapper.get(".pilot-summary-button").trigger("click");
    const text = wrapper.get("textarea").element as HTMLTextAreaElement;
    expect(text.value).toContain('"automaticUpload": false');
    expect(text.value).not.toMatch(
      /"cityId"\s*:|"workId"\s*:|"deviceId"\s*:|"ipAddress"\s*:/i,
    );
  });

  it("退出动作明确发出删除请求", async () => {
    const wrapper = mount(PilotPanel, {
      props: { state: STATE, summary: SUMMARY },
    });
    await wrapper.get(".pilot-withdraw").trigger("click");
    expect(wrapper.emitted("withdraw")).toHaveLength(1);
  });
});
