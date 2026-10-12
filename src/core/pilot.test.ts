import { describe, expect, it } from "vitest";
import {
  buildPilotSummary,
  closePilotSession,
  createPilotState,
  normalizePilotState,
  openPilotSession,
  PILOT_PLAN_VERSION,
  recordPilotEvent,
} from "./pilot";

describe("pilot local aggregate", () => {
  it("创建 28 天记录期和最迟第 35 天清除边界", () => {
    const state = createPilotState("2026-07-24");
    expect(state).toMatchObject({
      schemaVersion: "1.1",
      consentVersion: PILOT_PLAN_VERSION,
      status: "active",
      startedOn: "2026-07-24",
      endsOn: "2026-08-20",
      purgeOn: "2026-08-27",
      sessions: {
        completedSessions: 0,
        uncleanExitSessions: 0,
        sessionOpen: false,
      },
    });
  });

  it("同类事件按自然日去重且不保存作品、城市或设备标识", () => {
    let state = createPilotState("2026-07-24");
    state = recordPilotEvent(state, "poem-presented", "2026-07-24")!;
    state = recordPilotEvent(state, "poem-presented", "2026-07-24")!;
    state = recordPilotEvent(state, "detail-opened", "2026-07-24")!;

    expect(state.aggregate.activeDates).toEqual(["2026-07-24"]);
    expect(state.aggregate.poemPresentedDates).toEqual(["2026-07-24"]);
    expect(state.aggregate.detailOpenedDates).toEqual(["2026-07-24"]);
    expect(JSON.stringify(state)).not.toMatch(
      /city|device|workId|author|title/i,
    );
  });

  it("结束后停止新增，第 35 天之后自动失效", () => {
    const state = createPilotState("2026-07-24");
    const completed = recordPilotEvent(
      state,
      "app-opened",
      "2026-08-21",
    );
    expect(completed?.status).toBe("completed");
    expect(completed?.aggregate.activeDates).toEqual([]);
    expect(normalizePilotState(state, "2026-08-28")).toBeUndefined();
  });

  it("损坏、重复或越界的本地状态会被拒绝", () => {
    const state = createPilotState("2026-07-24");
    state.aggregate.activeDates = ["2026-07-24", "2026-07-24"];
    expect(normalizePilotState(state, "2026-07-24")).toBeUndefined();

    const future = createPilotState("2026-07-24");
    future.aggregate.activeDates = ["2026-09-01"];
    expect(normalizePilotState(future, "2026-07-24")).toBeUndefined();

    const invalidSessions = createPilotState("2026-07-24");
    invalidSessions.sessions.uncleanExitSessions = 1;
    expect(
      normalizePilotState(invalidSessions, "2026-07-24"),
    ).toBeUndefined();
  });

  it("只以无时间戳计数识别正常结束与上次异常中断", () => {
    let state = createPilotState("2026-07-24");
    state = openPilotSession(state, "2026-07-24")!;
    state = closePilotSession(state, "2026-07-24")!;
    state = openPilotSession(state, "2026-07-25")!;
    state = openPilotSession(state, "2026-07-26")!;

    expect(state.sessions).toEqual({
      completedSessions: 2,
      uncleanExitSessions: 1,
      sessionOpen: true,
    });
    expect(JSON.stringify(state)).not.toMatch(
      /sessionId|startedAt|endedAt|processId|stack|dump/i,
    );
  });

  it("旧版同意不会在新增会话测量后被静默沿用", () => {
    const legacy = {
      ...createPilotState("2026-07-24"),
      schemaVersion: "1.0",
      consentVersion: "2026.07-pilot-local-v1",
    };
    expect(normalizePilotState(legacy, "2026-07-24")).toBeUndefined();
  });

  it("摘要只导出计数、比例、版本和当前自启状态", () => {
    let state = createPilotState("2026-07-24");
    state = openPilotSession(state, "2026-07-24")!;
    state = recordPilotEvent(state, "poem-presented", "2026-07-24")!;
    state = recordPilotEvent(state, "detail-opened", "2026-07-24")!;
    state = recordPilotEvent(state, "not-relevant", "2026-07-24")!;
    state = recordPilotEvent(
      state,
      "warning-suppressed",
      "2026-07-25",
    )!;
    state = closePilotSession(state, "2026-07-25")!;
    const summary = buildPilotSummary({
      state,
      appVersion: "0.2.0",
      contentVersion: "2026.07.1",
      ruleVersion: "2026.07.1",
      generatedOn: "2026-07-25",
      autostartEnabled: true,
    });

    expect(summary.counts).toMatchObject({
      activeDays: 2,
      eligibleDeliveryDays: 1,
      successfulDeliveryDays: 1,
      warningSuppressedDays: 1,
      detailOpenDays: 1,
      notRelevantDays: 1,
      completedSessions: 1,
      sessionsWithoutUncleanExit: 1,
      uncleanExitSessions: 0,
    });
    expect(summary.rates).toEqual({
      deliveryPercent: 100,
      detailOpenPercent: 100,
      notRelevantPercent: 100,
      crashFreeSessionPercent: 100,
    });
    expect(summary.privacy).toEqual({
      automaticUpload: false,
      containsIdentifier: false,
      containsCity: false,
      containsWorkId: false,
      containsRawEvents: false,
      containsSessionTimestamps: false,
      containsCrashDump: false,
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /activeDates|poemPresentedDates|detailOpenedDates/,
    );
  });
});
