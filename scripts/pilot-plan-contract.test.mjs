import assert from "node:assert/strict";
import test from "node:test";
import {
  PILOT_EVENTS,
  validatePilotPlan,
} from "./pilot-plan-support.mjs";

function fixture() {
  return {
    schemaVersion: "1.1",
    planVersion: "2026.07-pilot-local-v2",
    status: "draft-awaiting-human-approval",
    audience: {
      description: "30—50 名年满 18 周岁的在校大学生",
      minimumAge: 18,
      minimumParticipants: 30,
      maximumParticipants: 50,
      traditionalCultureInterestRequired: false,
    },
    consent: {
      separateOptInRequired: true,
      priorConsentReusable: false,
      requiredConfirmations: [
        "adult",
        "voluntary",
        "local-aggregate-and-session-counts",
      ],
      contactConfigured: false,
      approvedBy: [],
    },
    collection: {
      mode: "local-aggregate-manual-export",
      automaticUpload: false,
      endpoint: null,
      rawEventLog: false,
      identifiers: [],
      exportsCity: false,
      exportsWorkId: false,
      exportsDeviceData: false,
      sessionOpenMarker: true,
      sessionTimestamps: false,
      crashDumps: false,
      eventTypes: [...PILOT_EVENTS],
    },
    retention: {
      recordingDays: 28,
      intendedMaximumLocalDays: 35,
      automaticPurgeOnNextLaunch: true,
      backgroundDeletionWhileAppNotRunning: false,
      withdrawalDeletion: "immediate",
      fullDataClearIncludesPilot: true,
    },
    instruments: {
      weeklyPulse: "docs/PILOT_PLAN.md#每周简短回访",
      finalSurvey: "docs/PILOT_PLAN.md#结束问卷",
      interviewGuide: "docs/PILOT_PLAN.md#半结构访谈",
      localSummary: "docs/PILOT_PLAN.md#本地匿名摘要",
    },
    limitations: {
      namedPilotOwner: false,
      contactConfigured: false,
      humanPrivacyApproval: false,
      ethicsOrInstitutionalReview: false,
      recruitmentStarted: false,
    },
    result: "implementation-ready-awaiting-approval",
  };
}

test("隐私优先试点计划保留真实批准边界", () => {
  assert.doesNotThrow(() => validatePilotPlan(fixture()));
});

test("自动上传、标识符、原始日志或过长保留都会被拒绝", () => {
  const upload = fixture();
  upload.collection.automaticUpload = true;
  assert.throws(() => validatePilotPlan(upload), /不得自动上传/);

  const identifier = fixture();
  identifier.collection.identifiers = ["device-id"];
  assert.throws(() => validatePilotPlan(identifier), /不得收集参与者标识/);

  const raw = fixture();
  raw.collection.rawEventLog = true;
  assert.throws(() => validatePilotPlan(raw), /原始事件日志/);

  const crashDump = fixture();
  crashDump.collection.crashDumps = true;
  assert.throws(() => validatePilotPlan(crashDump), /无时间戳/);

  const sessionTimestamp = fixture();
  sessionTimestamp.collection.sessionTimestamps = true;
  assert.throws(
    () => validatePilotPlan(sessionTimestamp),
    /无时间戳/,
  );

  const retention = fixture();
  retention.retention.intendedMaximumLocalDays = 90;
  assert.throws(() => validatePilotPlan(retention), /35 天/);
});

test("旧授权复用、虚构联系人或删减测量最小集都会被拒绝", () => {
  const reused = fixture();
  reused.consent.priorConsentReusable = true;
  assert.throws(() => validatePilotPlan(reused), /不得复用旧授权/);

  const fakeApproval = fixture();
  fakeApproval.consent.contactConfigured = true;
  assert.throws(() => validatePilotPlan(fakeApproval), /不得虚构试点联系人/);

  const missingEvent = fixture();
  missingEvent.collection.eventTypes.pop();
  assert.throws(() => validatePilotPlan(missingEvent), /事件最小集/);

  const missingSessionMarker = fixture();
  missingSessionMarker.collection.sessionOpenMarker = false;
  assert.throws(
    () => validatePilotPlan(missingSessionMarker),
    /无时间戳/,
  );

  const fakeBackgroundDelete = fixture();
  fakeBackgroundDelete.retention.backgroundDeletionWhileAppNotRunning =
    true;
  assert.throws(
    () => validatePilotPlan(fakeBackgroundDelete),
    /后台删除能力/,
  );
});
