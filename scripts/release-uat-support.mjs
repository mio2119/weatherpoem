export const RELEASE_UAT_PLAN =
  "review/release-candidate-uat-plan.json";

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

export function validateReleaseUatPlan(plan, expected) {
  exactKeys(
    plan,
    [
      "schemaVersion",
      "planVersion",
      "status",
      "generatedAt",
      "candidate",
      "participants",
      "scenarios",
      "defectPolicy",
      "execution",
      "approval",
      "limitations",
      "gateSatisfied",
      "result",
    ],
    "候选版 UAT 计划",
  );
  assert(
    plan.schemaVersion === "1.0" &&
      plan.planVersion === "2026.07-non-developer-uat-v1" &&
      plan.status === "ready-for-human-execution" &&
      Number.isFinite(Date.parse(plan.generatedAt)),
    "UAT 计划身份无效",
  );

  exactKeys(
    plan.candidate,
    [
      "product",
      "appVersion",
      "contentVersion",
      "channel",
      "trustLevel",
      "artifacts",
    ],
    "UAT 候选",
  );
  assert(
    plan.candidate.product === "WeatherPoem" &&
      plan.candidate.appVersion === expected.appVersion &&
      plan.candidate.contentVersion === expected.contentVersion &&
      plan.candidate.channel === "trial" &&
      plan.candidate.trustLevel === "unsigned-trial",
    "UAT 计划未绑定当前未签名候选",
  );
  assert(
    Array.isArray(plan.candidate.artifacts) &&
      plan.candidate.artifacts.length === 3,
    "UAT 必须绑定 portable、NSIS 和 MSI 三项发布物",
  );
  const actualArtifacts = plan.candidate.artifacts
    .map(({ kind, name, sha256 }) => ({ kind, name, sha256 }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
  const expectedArtifacts = expected.artifacts
    .map(({ kind, name, sha256 }) => ({ kind, name, sha256 }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
  assert(
    JSON.stringify(actualArtifacts) ===
      JSON.stringify(expectedArtifacts) &&
      actualArtifacts.every(({ sha256 }) =>
        /^[A-F0-9]{64}$/.test(sha256),
      ),
    "UAT 计划的发布物哈希已过期",
  );

  exactKeys(
    plan.participants,
    [
      "requiredCount",
      "mustBeNonDevelopers",
      "mustUseDedicatedOrCleanAccount",
      "mustBeNamedInFinalEvidence",
    ],
    "UAT 参与者",
  );
  assert(
    plan.participants.requiredCount === 2 &&
      plan.participants.mustBeNonDevelopers === true &&
      plan.participants.mustUseDedicatedOrCleanAccount === true &&
      plan.participants.mustBeNamedInFinalEvidence === true,
    "UAT 必须由两名具名非开发人员在干净环境执行",
  );

  const expectedScenarioIds = [
    "read-trial-warning",
    "nsis-clean-install",
    "first-run-onboarding",
    "daily-poem-and-reading",
    "favorite-feedback-and-replace",
    "offline-fallback",
    "close-to-tray-and-reopen",
    "autostart-choice",
    "data-clear",
    "nsis-uninstall-data-preservation",
    "msi-admin-lifecycle-observation",
  ];
  assert(
    Array.isArray(plan.scenarios) &&
      JSON.stringify(plan.scenarios.map((value) => value.id)) ===
        JSON.stringify(expectedScenarioIds),
    "UAT 核心安装与使用场景不完整",
  );
  for (const scenario of plan.scenarios) {
    exactKeys(
      scenario,
      [
        "id",
        "required",
        "expected",
        "evidenceRequired",
      ],
      `UAT 场景 ${scenario.id}`,
    );
    assert(
      scenario.required === true &&
        typeof scenario.expected === "string" &&
        scenario.expected.length > 0 &&
        Array.isArray(scenario.evidenceRequired) &&
        scenario.evidenceRequired.length > 0,
      `UAT 场景 ${scenario.id} 缺少预期或证据要求`,
    );
  }

  exactKeys(
    plan.defectPolicy,
    [
      "levels",
      "goCondition",
      "acceptedExceptionRequires",
    ],
    "缺陷策略",
  );
  assert(
    JSON.stringify(plan.defectPolicy.levels) ===
      JSON.stringify(["P0", "P1", "P2", "P3"]) &&
      plan.defectPolicy.goCondition ===
        "zero-unaccepted-P0-and-P1" &&
      JSON.stringify(
        plan.defectPolicy.acceptedExceptionRequires,
      ) ===
        JSON.stringify([
          "defect-id",
          "impact",
          "workaround",
          "owner",
          "deadline",
          "approver",
        ]),
    "UAT 缺陷分级或放行条件不完整",
  );

  exactKeys(
    plan.execution,
    [
      "completedParticipantCount",
      "executors",
      "openP0",
      "openP1",
      "acceptedExceptions",
      "completedAt",
    ],
    "UAT 执行状态",
  );
  assert(
    plan.execution.completedParticipantCount === 0 &&
      Array.isArray(plan.execution.executors) &&
      plan.execution.executors.length === 0 &&
      plan.execution.openP0 === null &&
      plan.execution.openP1 === null &&
      Array.isArray(plan.execution.acceptedExceptions) &&
      plan.execution.acceptedExceptions.length === 0 &&
      plan.execution.completedAt === null,
    "计划文件不得冒充真实 UAT 执行结果",
  );

  exactKeys(
    plan.approval,
    [
      "qualityOwner",
      "pilotOwner",
      "decision",
      "approvedAt",
      "evidencePath",
    ],
    "UAT 批准",
  );
  assert(
    plan.approval.qualityOwner === null &&
      plan.approval.pilotOwner === null &&
      plan.approval.decision === null &&
      plan.approval.approvedAt === null &&
      plan.approval.evidencePath ===
        "review/evidence/RQT-17-defect-signoff-installer-uat.json",
    "UAT 计划不得伪造质量或试点批准",
  );
  exactKeys(
    plan.limitations,
    [
      "humanExecutionCompleted",
      "defectSignoffCompleted",
      "namedApprovalCompleted",
    ],
    "UAT 限制",
  );
  assert(
    Object.values(plan.limitations).every(
      (value) => value === false,
    ) &&
      plan.gateSatisfied === false &&
      plan.result === "execution-plan-ready",
    "UAT 计划掩盖了未执行或未签署状态",
  );
}
