import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodeSigningPlan,
  validateCodeSigningPlan,
} from "./code-signing-plan-support.mjs";

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
  })),
  allNotSigned: true,
  signingConfigPresent: false,
  productionDownloadUrlsPresent: false,
  hashes: Object.fromEntries(
    [
      "packageJson",
      "releaseManifest",
      "checksums",
      "tauriConfig",
      "releaseSupport",
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

test("签名计划如实绑定三项 NotSigned 发布物", () => {
  const plan = buildCodeSigningPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  const result = validateCodeSigningPlan(plan, inputs);
  assert.equal(result.artifactCount, 3);
  assert.equal(result.scenarioCount, 10);
  assert.equal(plan.gateSatisfied, false);
});

test("删除篡改、时间戳或服务不可用场景会被拒绝", () => {
  const plan = buildCodeSigningPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  plan.testMatrix = plan.testMatrix.filter(
    (item) => item.id !== "SIG-04",
  );
  assert.throws(
    () => validateCodeSigningPlan(plan, inputs),
    /场景/,
  );
});

test("自动计划不能虚构证书、私钥能力或签名完成", () => {
  const plan = buildCodeSigningPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  plan.organizationDecisions.legalPublisherName =
    "虚构发布主体";
  plan.organizationDecisions.signerThumbprintAllowlist = [
    "A".repeat(40),
  ];
  plan.limitations.artifactsSigned = true;
  plan.gateSatisfied = true;
  assert.throws(
    () => validateCodeSigningPlan(plan, inputs),
    /不得虚构/,
  );
});
