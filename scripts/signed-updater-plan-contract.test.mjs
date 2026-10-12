import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignedUpdaterPlan,
  validateSignedUpdaterPlan,
} from "./signed-updater-plan-support.mjs";

const sha = "A".repeat(64);
const inputs = {
  appVersion: "0.2.0",
  releaseChannel: "trial",
  releaseTrustLevel: "unsigned-trial",
  portableSha256: sha,
  updaterCargoDependencyPresent: false,
  updaterPluginInitialized: false,
  updaterConfigPresent: false,
  updaterArtifactsEnabled: false,
  endpointConfigured: false,
  publicKeyConfigured: false,
  hashes: Object.fromEntries(
    [
      "packageJson",
      "releaseManifest",
      "tauriConfig",
      "cargoToml",
      "cargoLock",
      "libRs",
    ].map((key) => [
      key,
      {
        path: `${key}.fixture`,
        sha256: sha,
      },
    ]),
  ),
};

test("安全计划覆盖完整场景且保持 updater 未启用", () => {
  const plan = buildSignedUpdaterPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  const result = validateSignedUpdaterPlan(plan, inputs);
  assert.equal(result.scenarioCount, 12);
  assert.equal(plan.gateSatisfied, false);
});

test("删减损坏、降级或轮换场景会被拒绝", () => {
  const plan = buildSignedUpdaterPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  plan.testMatrix = plan.testMatrix.filter(
    (item) => item.id !== "UPD-03",
  );
  assert.throws(
    () => validateSignedUpdaterPlan(plan, inputs),
    /场景矩阵/,
  );
});

test("计划不能虚构密钥、端点、执行或批准", () => {
  const plan = buildSignedUpdaterPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  plan.proposedConfiguration.publicKey = "FAKE";
  plan.proposedConfiguration.endpoints = [
    "https://example.invalid/latest.json",
  ];
  plan.approval.releaseOwner = "虚构负责人";
  plan.gateSatisfied = true;
  assert.throws(
    () => validateSignedUpdaterPlan(plan, inputs),
    /不得虚构/,
  );
});
