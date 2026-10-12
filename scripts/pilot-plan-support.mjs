export const PILOT_PLAN_VERSION = "2026.07-pilot-local-v2";
export const PILOT_EVENTS = [
  "app-opened",
  "poem-presented",
  "warning-suppressed",
  "detail-opened",
  "not-relevant",
  "poem-replaced",
  "favorite-added",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} 必须是对象`,
  );
  assert(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort()),
    `${label} 字段不符合契约`,
  );
}

export function validatePilotPlan(plan) {
  exactKeys(
    plan,
    [
      "schemaVersion",
      "planVersion",
      "status",
      "audience",
      "consent",
      "collection",
      "retention",
      "instruments",
      "limitations",
      "result",
    ],
    "试点计划",
  );
  assert(plan.schemaVersion === "1.1", "试点计划 Schema 不匹配");
  assert(plan.planVersion === PILOT_PLAN_VERSION, "试点计划版本不匹配");
  assert(
    plan.status === "draft-awaiting-human-approval",
    "当前未获批准的计划必须保持 draft",
  );

  exactKeys(
    plan.audience,
    [
      "description",
      "minimumAge",
      "minimumParticipants",
      "maximumParticipants",
      "traditionalCultureInterestRequired",
    ],
    "audience",
  );
  assert(plan.audience.minimumAge >= 18, "试点当前只允许成年参与者");
  assert(
    plan.audience.minimumParticipants === 30 &&
      plan.audience.maximumParticipants === 50,
    "样本范围必须保持 30—50 人",
  );
  assert(
    plan.audience.traditionalCultureInterestRequired === false,
    "不能只招募传统文化爱好者",
  );

  exactKeys(
    plan.consent,
    [
      "separateOptInRequired",
      "priorConsentReusable",
      "requiredConfirmations",
      "contactConfigured",
      "approvedBy",
    ],
    "consent",
  );
  assert(plan.consent.separateOptInRequired === true, "试点必须单独同意");
  assert(plan.consent.priorConsentReusable === false, "不得复用旧授权");
  assert(
    JSON.stringify(plan.consent.requiredConfirmations) ===
      JSON.stringify([
        "adult",
        "voluntary",
        "local-aggregate-and-session-counts",
      ]),
    "同意确认项不完整",
  );
  assert(plan.consent.contactConfigured === false, "不得虚构试点联系人");
  assert(
    Array.isArray(plan.consent.approvedBy) &&
      plan.consent.approvedBy.length === 0,
    "未批准计划不得填入虚构批准人",
  );

  exactKeys(
    plan.collection,
    [
      "mode",
      "automaticUpload",
      "endpoint",
      "rawEventLog",
      "identifiers",
      "exportsCity",
      "exportsWorkId",
      "exportsDeviceData",
      "sessionOpenMarker",
      "sessionTimestamps",
      "crashDumps",
      "eventTypes",
    ],
    "collection",
  );
  assert(
    plan.collection.mode === "local-aggregate-manual-export",
    "试点只能使用本地聚合与人工导出",
  );
  assert(plan.collection.automaticUpload === false, "不得自动上传");
  assert(plan.collection.endpoint === null, "本地试点不得配置统计端点");
  assert(plan.collection.rawEventLog === false, "不得保存原始事件日志");
  assert(
    Array.isArray(plan.collection.identifiers) &&
      plan.collection.identifiers.length === 0,
    "不得收集参与者标识",
  );
  assert(
    plan.collection.exportsCity === false &&
      plan.collection.exportsWorkId === false &&
      plan.collection.exportsDeviceData === false,
    "摘要不得导出城市、作品或设备数据",
  );
  assert(
    plan.collection.sessionOpenMarker === true &&
      plan.collection.sessionTimestamps === false &&
      plan.collection.crashDumps === false,
    "会话测量只能保留无时间戳的打开标记和聚合计数",
  );
  assert(
    JSON.stringify(plan.collection.eventTypes) ===
      JSON.stringify(PILOT_EVENTS),
    "事件最小集与实现契约不一致",
  );

  exactKeys(
    plan.retention,
    [
      "recordingDays",
      "intendedMaximumLocalDays",
      "automaticPurgeOnNextLaunch",
      "backgroundDeletionWhileAppNotRunning",
      "withdrawalDeletion",
      "fullDataClearIncludesPilot",
    ],
    "retention",
  );
  assert(plan.retention.recordingDays === 28, "记录期必须是 28 天");
  assert(
    plan.retention.intendedMaximumLocalDays === 35,
    "计划保留上限必须是 35 天",
  );
  assert(
    plan.retention.automaticPurgeOnNextLaunch === true,
    "第 35 天后再次启动时必须自动清除",
  );
  assert(
    plan.retention.backgroundDeletionWhileAppNotRunning === false,
    "不得虚构应用未运行时的后台删除能力",
  );
  assert(
    plan.retention.withdrawalDeletion === "immediate",
    "退出后必须立即删除",
  );
  assert(
    plan.retention.fullDataClearIncludesPilot === true,
    "全量数据清除必须包含试点记录",
  );

  const limitationKeys = [
    "namedPilotOwner",
    "contactConfigured",
    "humanPrivacyApproval",
    "ethicsOrInstitutionalReview",
    "recruitmentStarted",
  ];
  exactKeys(plan.limitations, limitationKeys, "limitations");
  for (const key of limitationKeys) {
    assert(plan.limitations[key] === false, `不得冒充已完成 ${key}`);
  }
  assert(
    plan.result === "implementation-ready-awaiting-approval",
    "试点计划结果与当前批准状态不一致",
  );
  return plan;
}
