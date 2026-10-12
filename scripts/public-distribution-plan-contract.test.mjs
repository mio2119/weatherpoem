import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicDistributionPlan,
  validatePublicDistributionPlan,
} from "./public-distribution-plan-support.mjs";

const sha = "A".repeat(64);
const inputs = {
  appVersion: "0.2.0",
  releaseChannel: "trial",
  releaseTrustLevel: "unsigned-trial",
  artifacts: ["portable", "nsis", "msi"].map((kind) => ({
    kind,
    name: `${kind}.fixture`,
    size: 100,
    sha256: sha,
    signatureStatus: "NotSigned",
    downloadUrl: null,
  })),
  allArtifactsSigned: false,
  allDownloadUrlsConfigured: false,
  contentWithdrawalAutomated: true,
  hashes: Object.fromEntries(
    [
      "packageJson",
      "releaseManifest",
      "checksums",
      "withdrawalReport",
      "incidentRunbook",
      "releaseTrust",
    ].map((key) => [
      key,
      {
        path: `${key}.fixture`,
        sha256: sha,
      },
    ]),
  ),
};

test("计划绑定三项未签名基线且覆盖公开撤回闭环", () => {
  const plan = buildPublicDistributionPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  const result = validatePublicDistributionPlan(plan, inputs);
  assert.equal(result.artifactCount, 3);
  assert.equal(result.scenarioCount, 10);
  assert.equal(plan.gateSatisfied, false);
});

test("删除哈希、内容撤回或二进制撤回场景会被拒绝", () => {
  const plan = buildPublicDistributionPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  plan.testMatrix = plan.testMatrix.filter(
    (item) => item.id !== "DST-08",
  );
  assert.throws(
    () => validatePublicDistributionPlan(plan, inputs),
    /正反场景/,
  );
});

test("计划不能虚构托管地址、上传执行或批准", () => {
  const plan = buildPublicDistributionPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  plan.hostingDecision.primaryDownloadHost =
    "downloads.example.invalid";
  plan.limitations.publicUploadPerformed = true;
  plan.approval.releaseOwner = "虚构负责人";
  plan.gateSatisfied = true;
  assert.throws(
    () => validatePublicDistributionPlan(plan, inputs),
    /不得虚构/,
  );
});
