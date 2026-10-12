import assert from "node:assert/strict";
import test from "node:test";
import {
  validateScopeFreezeProposal,
} from "./scope-freeze-support.mjs";

const HASH = "A".repeat(64);

function fixture() {
  return {
    schemaVersion: "1.0",
    proposalVersion: "2026.07-safe-pilot-v1",
    status: "proposal-ready-not-approved",
    generatedAt: new Date().toISOString(),
    candidate: {
      product: "WeatherPoem",
      appVersion: "0.2.0",
      contentVersion: "2026.07.1",
      ruleVersion: "2026.07.1",
      releaseChannel: "trial",
      trustLevel: "unsigned-trial",
      portableSha256: HASH,
    },
    distribution: {
      currentAllowedScope: [
        "internal-demonstration",
        "controlled-internal-testing",
      ],
      campusPilotAllowedAfterRequiredGates: true,
      publicDistributionAllowed: false,
      downloadUrl: null,
      platforms: ["windows-x64"],
    },
    pilot: {
      minimumParticipants: 30,
      maximumParticipants: 50,
      minimumAge: 18,
      durationDays: 28,
      recruitmentStarted: false,
      requiresSeparateConsent: true,
    },
    onlineCapabilities: {
      weather:
        "open-meteo-best-effort-with-cache-and-offline-fallback",
      aiReason: "local-rules-only-until-production-gate",
      officialWarning:
        "disabled-until-authorized-gateway-and-csp-gate",
      pilotTelemetry:
        "local-daily-and-session-aggregate-manual-export-v2-separate-opt-in",
      clientSecrets: "none",
    },
    budget: {
      paidAiEnabled: false,
      paidAiMonthlyCapCny: 0,
      otherPaidServiceMonthlyCapCny: 0,
      budgetOwner: null,
      changeRequiresSignedApproval: true,
    },
    rollback: {
      binary: "manual-reinstall-last-approved-build",
      content:
        "signed-off-withdrawal-manifest-or-global-suspension",
      onlineEnhancements:
        "disable-endpoint-and-fall-back-to-local-rules",
      rollbackOwnerRole: "发布负责人",
      secondApproverRole: "安全或内容负责人",
    },
    responsibilities: Object.fromEntries(
      [
        ["projectSponsor", "项目发起人"],
        ["pilotOwner", "试点负责人"],
        ["releaseOwner", "发布负责人"],
        ["rollbackOwner", "回滚负责人"],
        ["contentReviewer", "内容审核负责人"],
        ["securityPrivacyOwner", "安全与隐私负责人"],
        ["qualityOwner", "质量负责人"],
      ].map(([key, role]) => [key, { role, name: null }]),
    ),
    approval: {
      projectSponsorName: null,
      decision: null,
      decidedAt: null,
      evidencePath:
        "review/evidence/RQT-18-scope-ai-version-freeze.json",
    },
    limitations: {
      namedPeopleAssigned: false,
      budgetApproved: false,
      goNoGoHeld: false,
      campusPilotAuthorized: false,
      publicReleaseAuthorized: false,
    },
    gateSatisfied: false,
    result: "safe-default-proposal-ready",
  };
}

const expected = {
  appVersion: "0.2.0",
  contentVersion: "2026.07.1",
  releaseChannel: "trial",
  trustLevel: "unsigned-trial",
  portableSha256: HASH,
  pilot: {
    minimumParticipants: 30,
    maximumParticipants: 50,
    minimumAge: 18,
  },
};

test("safe defaults bind the current unsigned pilot candidate", () => {
  assert.doesNotThrow(() =>
    validateScopeFreezeProposal(fixture(), expected),
  );
});

test("public distribution or paid AI cannot be enabled by default", () => {
  const publicRelease = fixture();
  publicRelease.distribution.publicDistributionAllowed = true;
  assert.throws(
    () => validateScopeFreezeProposal(publicRelease, expected),
    /分发边界不安全/,
  );

  const paidAi = fixture();
  paidAi.budget.paidAiEnabled = true;
  paidAi.budget.paidAiMonthlyCapCny = 500;
  assert.throws(
    () => validateScopeFreezeProposal(paidAi, expected),
    /不得默认启用付费服务/,
  );
});

test("proposal cannot invent people or approval", () => {
  const named = fixture();
  named.responsibilities.projectSponsor.name = "Example";
  assert.throws(
    () => validateScopeFreezeProposal(named, expected),
    /不能伪造真实姓名/,
  );

  const approved = fixture();
  approved.approval.projectSponsorName = "Example";
  approved.approval.decision = "go";
  approved.approval.decidedAt = new Date().toISOString();
  approved.gateSatisfied = true;
  assert.throws(
    () => validateScopeFreezeProposal(approved, expected),
    /不得冒充项目发起人批准/,
  );
});
