import assert from "node:assert/strict";
import test from "node:test";
import {
  validateReleaseUatPlan,
} from "./release-uat-support.mjs";

const HASH = "A".repeat(64);
const artifacts = [
  { kind: "portable", name: "weatherpoem.exe", sha256: HASH },
  {
    kind: "nsis",
    name: "WeatherPoem_0.2.0_x64-setup.exe",
    sha256: HASH,
  },
  {
    kind: "msi",
    name: "WeatherPoem_0.2.0_x64_en-US.msi",
    sha256: HASH,
  },
];
const scenarioIds = [
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

function fixture() {
  return {
    schemaVersion: "1.0",
    planVersion: "2026.07-non-developer-uat-v1",
    status: "ready-for-human-execution",
    generatedAt: new Date().toISOString(),
    candidate: {
      product: "WeatherPoem",
      appVersion: "0.2.0",
      contentVersion: "2026.07.1",
      channel: "trial",
      trustLevel: "unsigned-trial",
      artifacts: structuredClone(artifacts),
    },
    participants: {
      requiredCount: 2,
      mustBeNonDevelopers: true,
      mustUseDedicatedOrCleanAccount: true,
      mustBeNamedInFinalEvidence: true,
    },
    scenarios: scenarioIds.map((id) => ({
      id,
      required: true,
      expected: "expected result",
      evidenceRequired: ["screenshot"],
    })),
    defectPolicy: {
      levels: ["P0", "P1", "P2", "P3"],
      goCondition: "zero-unaccepted-P0-and-P1",
      acceptedExceptionRequires: [
        "defect-id",
        "impact",
        "workaround",
        "owner",
        "deadline",
        "approver",
      ],
    },
    execution: {
      completedParticipantCount: 0,
      executors: [],
      openP0: null,
      openP1: null,
      acceptedExceptions: [],
      completedAt: null,
    },
    approval: {
      qualityOwner: null,
      pilotOwner: null,
      decision: null,
      approvedAt: null,
      evidencePath:
        "review/evidence/RQT-17-defect-signoff-installer-uat.json",
    },
    limitations: {
      humanExecutionCompleted: false,
      defectSignoffCompleted: false,
      namedApprovalCompleted: false,
    },
    gateSatisfied: false,
    result: "execution-plan-ready",
  };
}

const expected = {
  appVersion: "0.2.0",
  contentVersion: "2026.07.1",
  artifacts,
};

test("UAT plan binds all artifacts and preserves human boundary", () => {
  assert.doesNotThrow(() =>
    validateReleaseUatPlan(fixture(), expected),
  );
});

test("missing scenario or stale artifact is rejected", () => {
  const missing = fixture();
  missing.scenarios.pop();
  assert.throws(
    () => validateReleaseUatPlan(missing, expected),
    /场景不完整/,
  );

  const stale = fixture();
  stale.candidate.artifacts[0].sha256 = "B".repeat(64);
  assert.throws(
    () => validateReleaseUatPlan(stale, expected),
    /发布物哈希已过期/,
  );
});

test("plan cannot claim testers, defects, or approval", () => {
  const executed = fixture();
  executed.execution.completedParticipantCount = 2;
  executed.execution.executors = ["A", "B"];
  executed.execution.openP0 = 0;
  executed.execution.openP1 = 0;
  assert.throws(
    () => validateReleaseUatPlan(executed, expected),
    /不得冒充真实 UAT/,
  );

  const approved = fixture();
  approved.approval.qualityOwner = "Example";
  approved.approval.decision = "go";
  approved.gateSatisfied = true;
  assert.throws(
    () => validateReleaseUatPlan(approved, expected),
    /不得伪造质量或试点批准/,
  );
});
