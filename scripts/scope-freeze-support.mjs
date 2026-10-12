export const SCOPE_FREEZE_PROPOSAL =
  "review/scope-freeze-proposal.json";

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

export function validateScopeFreezeProposal(proposal, expected) {
  exactKeys(
    proposal,
    [
      "schemaVersion",
      "proposalVersion",
      "status",
      "generatedAt",
      "candidate",
      "distribution",
      "pilot",
      "onlineCapabilities",
      "budget",
      "rollback",
      "responsibilities",
      "approval",
      "limitations",
      "gateSatisfied",
      "result",
    ],
    "范围冻结提案",
  );
  assert(
    proposal.schemaVersion === "1.0" &&
      proposal.proposalVersion === "2026.07-safe-pilot-v1" &&
      proposal.status === "proposal-ready-not-approved" &&
      Number.isFinite(Date.parse(proposal.generatedAt)),
    "范围冻结提案身份无效",
  );

  exactKeys(
    proposal.candidate,
    [
      "product",
      "appVersion",
      "contentVersion",
      "ruleVersion",
      "releaseChannel",
      "trustLevel",
      "portableSha256",
    ],
    "冻结候选",
  );
  assert(
    proposal.candidate.product === "WeatherPoem" &&
      proposal.candidate.appVersion === expected.appVersion &&
      proposal.candidate.contentVersion ===
        expected.contentVersion &&
      proposal.candidate.ruleVersion === expected.contentVersion &&
      proposal.candidate.releaseChannel ===
        expected.releaseChannel &&
      proposal.candidate.trustLevel === expected.trustLevel &&
      proposal.candidate.portableSha256 ===
        expected.portableSha256 &&
      /^[A-F0-9]{64}$/.test(proposal.candidate.portableSha256),
    "范围提案未绑定当前候选、内容或发布清单",
  );

  exactKeys(
    proposal.distribution,
    [
      "currentAllowedScope",
      "campusPilotAllowedAfterRequiredGates",
      "publicDistributionAllowed",
      "downloadUrl",
      "platforms",
    ],
    "分发范围",
  );
  assert(
    JSON.stringify(proposal.distribution.currentAllowedScope) ===
      JSON.stringify([
        "internal-demonstration",
        "controlled-internal-testing",
      ]) &&
      proposal.distribution.campusPilotAllowedAfterRequiredGates ===
        true &&
      proposal.distribution.publicDistributionAllowed === false &&
      proposal.distribution.downloadUrl === null &&
      JSON.stringify(proposal.distribution.platforms) ===
        JSON.stringify(["windows-x64"]),
    "未签名候选的分发边界不安全",
  );

  exactKeys(
    proposal.pilot,
    [
      "minimumParticipants",
      "maximumParticipants",
      "minimumAge",
      "durationDays",
      "recruitmentStarted",
      "requiresSeparateConsent",
    ],
    "试点范围",
  );
  assert(
    proposal.pilot.minimumParticipants ===
        expected.pilot.minimumParticipants &&
      proposal.pilot.maximumParticipants ===
        expected.pilot.maximumParticipants &&
      proposal.pilot.minimumAge === expected.pilot.minimumAge &&
      proposal.pilot.durationDays === 28 &&
      proposal.pilot.recruitmentStarted === false &&
      proposal.pilot.requiresSeparateConsent === true,
    "试点人数、年龄、周期或同意边界漂移",
  );

  exactKeys(
    proposal.onlineCapabilities,
    [
      "weather",
      "aiReason",
      "officialWarning",
      "pilotTelemetry",
      "clientSecrets",
    ],
    "在线能力",
  );
  assert(
    proposal.onlineCapabilities.weather ===
        "open-meteo-best-effort-with-cache-and-offline-fallback" &&
      proposal.onlineCapabilities.aiReason ===
        "local-rules-only-until-production-gate" &&
      proposal.onlineCapabilities.officialWarning ===
        "disabled-until-authorized-gateway-and-csp-gate" &&
      proposal.onlineCapabilities.pilotTelemetry ===
        "local-daily-and-session-aggregate-manual-export-v2-separate-opt-in" &&
      proposal.onlineCapabilities.clientSecrets === "none",
    "在线能力没有使用安全的默认关闭策略",
  );

  exactKeys(
    proposal.budget,
    [
      "paidAiEnabled",
      "paidAiMonthlyCapCny",
      "otherPaidServiceMonthlyCapCny",
      "budgetOwner",
      "changeRequiresSignedApproval",
    ],
    "预算",
  );
  assert(
    proposal.budget.paidAiEnabled === false &&
      proposal.budget.paidAiMonthlyCapCny === 0 &&
      proposal.budget.otherPaidServiceMonthlyCapCny === 0 &&
      proposal.budget.budgetOwner === null &&
      proposal.budget.changeRequiresSignedApproval === true,
    "未批准试点不得默认启用付费服务或虚构预算负责人",
  );

  exactKeys(
    proposal.rollback,
    [
      "binary",
      "content",
      "onlineEnhancements",
      "rollbackOwnerRole",
      "secondApproverRole",
    ],
    "回滚策略",
  );
  assert(
    proposal.rollback.binary ===
        "manual-reinstall-last-approved-build" &&
      proposal.rollback.content ===
        "signed-off-withdrawal-manifest-or-global-suspension" &&
      proposal.rollback.onlineEnhancements ===
        "disable-endpoint-and-fall-back-to-local-rules" &&
      proposal.rollback.rollbackOwnerRole === "发布负责人" &&
      proposal.rollback.secondApproverRole === "安全或内容负责人",
    "范围提案缺少二进制、内容或在线能力回滚边界",
  );

  exactKeys(
    proposal.responsibilities,
    [
      "projectSponsor",
      "pilotOwner",
      "releaseOwner",
      "rollbackOwner",
      "contentReviewer",
      "securityPrivacyOwner",
      "qualityOwner",
    ],
    "责任人",
  );
  assert(
    Object.values(proposal.responsibilities).every(
      (entry) =>
        entry &&
        typeof entry.role === "string" &&
        entry.role.length > 0 &&
        entry.name === null,
    ),
    "提案只能列出责任角色，不能伪造真实姓名",
  );

  exactKeys(
    proposal.approval,
    [
      "projectSponsorName",
      "decision",
      "decidedAt",
      "evidencePath",
    ],
    "决策批准",
  );
  assert(
    proposal.approval.projectSponsorName === null &&
      proposal.approval.decision === null &&
      proposal.approval.decidedAt === null &&
      proposal.approval.evidencePath ===
        "review/evidence/RQT-18-scope-ai-version-freeze.json",
    "机器提案不得冒充项目发起人批准",
  );

  exactKeys(
    proposal.limitations,
    [
      "namedPeopleAssigned",
      "budgetApproved",
      "goNoGoHeld",
      "campusPilotAuthorized",
      "publicReleaseAuthorized",
    ],
    "范围提案限制",
  );
  assert(
    Object.values(proposal.limitations).every(
      (value) => value === false,
    ) &&
      proposal.gateSatisfied === false &&
      proposal.result === "safe-default-proposal-ready",
    "范围提案掩盖了人员、预算或 Go/No-Go 未批准状态",
  );
}
