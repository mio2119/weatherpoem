import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const FOUR_WEEK_PILOT_PLAN =
  "review/four-week-pilot-execution-plan.json";
export const FOUR_WEEK_PILOT_PLAN_SCHEMA = "1.0";

export const PILOT_SUCCESS_METRICS = [
  {
    id: "MET-01",
    name: "内容成功送达",
    operator: ">=",
    threshold: 95,
    unit: "percent",
    primarySource: "participant-local-aggregate",
    numerator: "successfulDeliveryDays",
    denominator: "eligibleDeliveryDays",
    measurementReady: true,
  },
  {
    id: "MET-02",
    name: "同日重复自动弹出",
    operator: "=",
    threshold: 0,
    unit: "incidents",
    primarySource: "weekly-pulse-and-defect-log",
    numerator: "confirmedDuplicatePopupIncidents",
    denominator: null,
    measurementReady: true,
  },
  {
    id: "MET-03",
    name: "原文、作者、篇名、出处错误",
    operator: "=",
    threshold: 0,
    unit: "confirmed-errors",
    primarySource: "content-correction-and-defect-log",
    numerator: "confirmedContentFactErrors",
    denominator: null,
    measurementReady: true,
  },
  {
    id: "MET-04",
    name: "与今天不相关",
    operator: "<",
    threshold: 10,
    unit: "percent",
    primarySource: "participant-local-aggregate",
    numerator: "notRelevantDays",
    denominator: "successfulDeliveryDays",
    measurementReady: true,
  },
  {
    id: "MET-05",
    name: "了解更多",
    operator: ">=",
    threshold: 15,
    unit: "percent",
    primarySource: "participant-local-aggregate",
    numerator: "detailOpenDays",
    denominator: "successfulDeliveryDays",
    measurementReady: true,
  },
  {
    id: "MET-06",
    name: "四周后仍保留应用和开机启动",
    operator: ">=",
    threshold: 40,
    unit: "percent",
    primarySource: "final-device-check-and-survey",
    numerator: "participantsRetainingAppAndAutostart",
    denominator: "participantsInOutcomeDenominator",
    measurementReady: true,
  },
  {
    id: "MET-07",
    name: "认为不明显打扰",
    operator: ">=",
    threshold: 85,
    unit: "percent",
    primarySource: "final-survey",
    numerator: "participantsReportingNotObviouslyDisruptive",
    denominator: "validFinalSurveyResponses",
    measurementReady: true,
  },
  {
    id: "MET-08",
    name: "严重预警不当推荐",
    operator: "=",
    threshold: 0,
    unit: "incidents",
    primarySource: "warning-and-incident-log",
    numerator: "confirmedSevereWarningRecommendationIncidents",
    denominator: null,
    measurementReady: true,
  },
  {
    id: "MET-09",
    name: "崩溃无感会话",
    operator: ">=",
    threshold: 99.5,
    unit: "percent",
    primarySource: "approved-local-session-aggregate-export",
    numerator: "sessionsWithoutUncleanExit",
    denominator: "completedSessions",
    measurementImplemented: true,
    measurementReady: false,
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function sha256File(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex")
    .toUpperCase();
}

export function buildFourWeekPilotPlan(inputs, generatedAt) {
  return {
    schemaVersion: FOUR_WEEK_PILOT_PLAN_SCHEMA,
    planVersion: "2026.07-four-week-v1",
    product: "WeatherPoem",
    appVersion: inputs.appVersion,
    contentVersion: inputs.contentVersion,
    generatedAt,
    status: "execution-kit-ready-entry-gates-not-satisfied",
    inputs: inputs.hashes,
    entryGate: {
      milestone: "campus-pilot",
      currentStatus: inputs.campusPilotStatus,
      passedGateCount: inputs.passedGateCount,
      requiredGateCount: inputs.requiredGateCount,
      blockingGateIds: inputs.blockingGateIds,
      goAllowed: false,
    },
    cohort: {
      minimumAge: 18,
      minimumParticipants: 30,
      maximumParticipants: 50,
      durationDays: 28,
      universityStudentRequired: true,
      voluntaryParticipationRequired: true,
      traditionalCultureInterestRequired: false,
      actualParticipantCount: null,
      recruitmentStarted: false,
    },
    versionPolicy: {
      appVersion: inputs.appVersion,
      contentVersion: inputs.contentVersion,
      ruleVersion: inputs.ruleVersion,
      frozenCandidateSha256: inputs.portableSha256,
      changesDuringPilot:
        "P0安全、内容事实或隐私修复外不变更；任何变更分版本报告，不直接合并。",
    },
    timeline: [
      {
        period: "pre-pilot",
        action:
          "全部校园试点门禁通过；冻结版本；完成招募、同意、安装、退出和应急演示。",
      },
      {
        period: "week-1",
        action:
          "检查安装、自启、送达、重复弹出、崩溃和明显打扰。",
      },
      {
        period: "week-2",
        action:
          "检查情境贴合、深入阅读、不贴合反馈和天气安全。",
      },
      {
        period: "week-3",
        action:
          "检查内容重复、视觉疲劳、自启保留和主动收藏。",
      },
      {
        period: "week-4",
        action:
          "复制本地摘要、结束问卷、最终设备状态检查并邀请 6—10 人访谈。",
      },
      {
        period: "post-pilot",
        action:
          "退出并删除本地记录；汇总指标、缺陷、内容错误、问卷、访谈和 Go/No-Go。",
      },
    ],
    successMetrics: PILOT_SUCCESS_METRICS,
    analysisRules: {
      publishNumeratorAndDenominator: true,
      nullDenominatorCannotBecomeZeroPercent: true,
      pooledAndParticipantLevelResultsBothRequired: true,
      missingAndWithdrawalCountsRequired: true,
      versionCohortsReportedSeparately: true,
      confidenceIntervalsRequiredForPercentages: true,
      noPostHocThresholdChanges: true,
      qualitativeContradictionsMustBeReported: true,
    },
    instruments: {
      weeklyPulse: "docs/PILOT_PLAN.md#8-每周简短回访",
      finalSurvey: "docs/PILOT_PLAN.md#9-结束问卷",
      interviewGuide: "docs/PILOT_PLAN.md#10-半结构访谈",
      localSummary: "docs/PILOT_PLAN.md#5-本地匿名摘要",
      resultTemplate:
        "review/evidence/RQT-22-four-week-pilot-results.template.json",
    },
    stopRules: [
      {
        severity: "P0",
        condition:
          "严重预警仍推荐普通诗词、隐私数据外泄、广泛无法启动或数据破坏。",
        action:
          "立即暂停试点、停止分发、通知参与者并启动事故 Runbook。",
      },
      {
        severity: "P1",
        condition:
          "事实错误扩散、重复抢焦点、崩溃集中或退出/清除失效。",
        action:
          "冻结招募和版本，24 小时内决定修复、撤回或终止。",
      },
    ],
    knownMeasurementGap: {
      metricId: "MET-09",
      issue:
        "客户端已实现无标识、无时间戳的已结束会话与异常中断会话聚合，但尚未经隐私负责人批准，也未在冻结试点候选上完成正常退出、强制终止和崩溃恢复的具名 Windows 验证，因此仍不能声明 99.5% 崩溃无感会话可测。",
      requiredDecision:
        "由隐私负责人批准 v2 本地会话计数口径，并由质量负责人在冻结候选上验证正常退出不误报、强制终止可在下次启动计入、摘要分母排除当前未结束会话；具名签署后再冻结试点版本。",
      resolved: false,
    },
    execution: {
      pilotOwner: null,
      privacyOwner: null,
      qualityOwner: null,
      contentOwner: null,
      contactChannel: null,
      recruitmentOpenedAt: null,
      pilotStartedAt: null,
      pilotEndedAt: null,
      resultEvidencePath:
        "review/evidence/RQT-22-four-week-pilot-results.json",
    },
    approval: {
      projectSponsor: null,
      pilotOwner: null,
      privacyReviewer: null,
      qualityReviewer: null,
      decision: null,
      approvedAt: null,
    },
    limitations: {
      campusPilotEntryGatePassed: false,
      participantsRecruited: false,
      fourWeeksCompleted: false,
      allMetricsMeasured: false,
      surveysCompleted: false,
      interviewsCompleted: false,
      goNoGoCompleted: false,
      namedApprovalCompleted: false,
    },
    gateSatisfied: false,
    result:
      "execution-kit-complete-real-four-week-pilot-not-started",
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[A-F0-9]{64}$/.test(value);
}

export function validateFourWeekPilotPlan(plan, inputs) {
  assert(
    plan.schemaVersion === FOUR_WEEK_PILOT_PLAN_SCHEMA &&
      plan.planVersion === "2026.07-four-week-v1" &&
      plan.product === "WeatherPoem" &&
      plan.appVersion === inputs.appVersion &&
      plan.contentVersion === inputs.contentVersion &&
      plan.status ===
        "execution-kit-ready-entry-gates-not-satisfied",
    "四周试点执行计划身份或状态无效",
  );
  const generatedAt = Date.parse(plan.generatedAt);
  assert(
    Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 10 * 60 * 1000 &&
      generatedAt >= Date.now() - 31 * 24 * 60 * 60 * 1000,
    "四周试点执行计划时间无效或已过期",
  );
  for (const [key, expected] of Object.entries(inputs.hashes)) {
    const actual = plan.inputs[key];
    assert(
      actual?.path === expected.path &&
        actual.sha256 === expected.sha256 &&
        isSha256(actual.sha256),
      `四周试点计划未绑定当前输入：${key}`,
    );
  }
  assert(
    plan.entryGate.currentStatus === inputs.campusPilotStatus &&
      plan.entryGate.passedGateCount === inputs.passedGateCount &&
      plan.entryGate.requiredGateCount ===
        inputs.requiredGateCount &&
      JSON.stringify(plan.entryGate.blockingGateIds) ===
        JSON.stringify(inputs.blockingGateIds) &&
      plan.entryGate.goAllowed === false,
    "四周试点计划掩盖了校园试点入口门禁未通过",
  );
  assert(
    plan.cohort.minimumAge === 18 &&
      plan.cohort.minimumParticipants === 30 &&
      plan.cohort.maximumParticipants === 50 &&
      plan.cohort.durationDays === 28 &&
      plan.cohort.actualParticipantCount === null &&
      plan.cohort.recruitmentStarted === false,
    "四周试点人群、周期或未招募状态不准确",
  );
  assert(
    plan.versionPolicy.appVersion === inputs.appVersion &&
      plan.versionPolicy.contentVersion === inputs.contentVersion &&
      plan.versionPolicy.ruleVersion === inputs.ruleVersion &&
      plan.versionPolicy.frozenCandidateSha256 ===
        inputs.portableSha256 &&
      isSha256(plan.versionPolicy.frozenCandidateSha256),
    "四周试点没有绑定当前候选版本",
  );
  assert(
    JSON.stringify(plan.successMetrics) ===
      JSON.stringify(PILOT_SUCCESS_METRICS) &&
      plan.successMetrics.length === 9,
    "四周试点成功指标、口径或阈值被修改",
  );
  const crashMetric = plan.successMetrics.find(
    (item) => item.id === "MET-09",
  );
  assert(
    crashMetric.measurementImplemented === true &&
      crashMetric.measurementReady === false &&
      plan.knownMeasurementGap.metricId === "MET-09" &&
      plan.knownMeasurementGap.resolved === false,
    "崩溃无感会话测量缺口被掩盖",
  );
  assert(
    plan.timeline.length === 6 &&
      plan.analysisRules.publishNumeratorAndDenominator === true &&
      plan.analysisRules.nullDenominatorCannotBecomeZeroPercent ===
        true &&
      plan.analysisRules.versionCohortsReportedSeparately === true &&
      plan.stopRules.length === 2,
    "四周试点时间线、分析规则或停止规则不完整",
  );
  assert(
    Object.entries(plan.execution).every(([key, value]) =>
      key === "resultEvidencePath"
        ? value ===
          "review/evidence/RQT-22-four-week-pilot-results.json"
        : value === null,
    ) &&
      Object.values(plan.approval).every(
        (value) => value === null,
      ),
    "自动计划不得虚构试点执行人、日期或批准",
  );
  assert(
    Object.values(plan.limitations).every(
      (value) => value === false,
    ) &&
      plan.gateSatisfied === false &&
      plan.result ===
        "execution-kit-complete-real-four-week-pilot-not-started",
    "计划不得冒充招募、四周执行、指标或 Go/No-Go 已完成",
  );
  return {
    metricCount: plan.successMetrics.length,
    blockingGateCount: plan.entryGate.blockingGateIds.length,
    timelineStageCount: plan.timeline.length,
  };
}
