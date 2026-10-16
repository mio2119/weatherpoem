import assert from "node:assert/strict";
import test from "node:test";
import { validateDependencyRiskReview } from "./dependency-risk-review-support.mjs";

const HASH = "A".repeat(64);

function fixture() {
  const generatedAt = new Date().toISOString();
  const targetDate = new Date(
    Date.parse(generatedAt) + 29 * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  return {
    schemaVersion: "2.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt,
    status: "upgrade-applied-review-pending",
    inputs: {
      cargoAuditReport:
        "output/WeatherPoem_0.2.0_CARGO_AUDIT.json",
      cargoAuditSha256: HASH,
      cargoLock: "src-tauri/Cargo.lock",
      cargoLockSha256: HASH,
      targetTriple: "x86_64-pc-windows-msvc",
    },
    currentTarget: {
      vulnerabilityCount: 0,
      blockingWarningCount: 0,
      unmaintainedWarningCount: 0,
      unmaintainedWarnings: [],
    },
    dependencyCluster: {
      independentRiskCount: 0,
      clusteredWarningCount: 0,
      frameworkPackage: "tauri-utils@2.10.2",
      rootPackage: "urlpattern@0.6.0",
      leafPackage: null,
      path: [
        "weatherpoem@0.2.0",
        "tauri@2.12.4",
        "tauri-utils@2.10.2",
        "urlpattern@0.6.0",
      ],
    },
    upstream: {
      checkedAt: generatedAt,
      tauriLatestStable: "2.12.4",
      tauriUtilsLatestStable: "2.10.2",
      urlpatternLatestStable: "0.6.0",
      urlpattern060RemovesUnicUcdIdent: true,
      releasedTauriUtilsRequirement: "~2.10.2",
      releasedUrlpatternRequirement: "^0.6",
      tauriPullRequest:
        "https://github.com/tauri-apps/tauri/pull/15660",
      mergeCommitSha:
        "dd725f4b13c30a86b398ccc59eb498f151f461c5",
      mergedAt: "2026-07-06T16:50:43Z",
      tauriDevDependency: "urlpattern@0.6",
      sources: {
        tauriCrate: "https://crates.io/crates/tauri",
        tauriUtilsCrate:
          "https://crates.io/crates/tauri-utils",
        urlpatternCrate:
          "https://crates.io/crates/urlpattern",
        pullRequest:
          "https://github.com/tauri-apps/tauri/pull/15660",
        tauriDevCargoToml:
          "https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-utils/Cargo.toml",
        tauriStableDependencies:
          "https://crates.io/api/v1/crates/tauri/2.12.4/dependencies",
        tauriUtilsStableDependencies:
          "https://crates.io/api/v1/crates/tauri-utils/2.10.2/dependencies",
      },
    },
    proposedDisposition: {
      action: "verify-applied-stable-upgrade-before-release",
      reason: "old-unic-chain-removed-from-windows-target",
      temporaryControl:
        "block-vulnerabilities-unsound-yanked-and-review-each-candidate",
      upgradeTrigger:
        "locked-windows-tree-resolves-urlpattern-0.6",
      releaseGate: "before-next-release-candidate",
      targetDate,
    },
    approval: {
      securityOwner: null,
      decision: null,
      approvedAt: null,
      evidencePath:
        "review/evidence/RQT-15-security-privacy-review.json",
    },
    limitations: {
      upstreamFixReleased: true,
      upgradeNotYetApplied: false,
      runtimeWarningStillPresent: false,
      namedSecurityReviewCompleted: false,
    },
    gateSatisfied: false,
    result: "automated-upgrade-verified-review-pending",
  };
}

const expected = {
  appVersion: "0.2.0",
  cargoAuditSha256: HASH,
  cargoLockSha256: HASH,
  targetUnmaintainedWarnings: [],
  targetPackages: [
    { name: "tauri", version: "2.12.4" },
    { name: "tauri-utils", version: "2.10.2" },
    { name: "urlpattern", version: "0.6.0" },
  ],
};

test("stable upgrade removes unic advisories without claiming approval", () => {
  assert.doesNotThrow(() =>
    validateDependencyRiskReview(fixture(), expected),
  );
});

test("stale input or changed target warnings are rejected", () => {
  const stale = fixture();
  stale.inputs.cargoAuditSha256 = "B".repeat(64);
  assert.throws(
    () => validateDependencyRiskReview(stale, expected),
    /未绑定当前/,
  );

  const changed = fixture();
  changed.currentTarget.unmaintainedWarnings.push({
    advisoryId: "RUSTSEC-example",
    package: "example",
    version: "1.0.0",
  });
  assert.throws(
    () => validateDependencyRiskReview(changed, expected),
    /风险与 cargo-audit 不一致/,
  );
});

test("draft cannot pretend the upgrade is pending or approved", () => {
  const pending = fixture();
  pending.limitations.upgradeNotYetApplied = true;
  assert.throws(
    () => validateDependencyRiskReview(pending, expected),
    /掩盖了升级后依赖状态/,
  );

  const approved = fixture();
  approved.approval.securityOwner = "Example";
  approved.approval.decision = "accepted";
  approved.approval.approvedAt = new Date().toISOString();
  approved.gateSatisfied = true;
  assert.throws(
    () => validateDependencyRiskReview(approved, expected),
    /不得伪造具名安全批准/,
  );
});

test("draft rejects an unverified stable dependency path", () => {
  const oldUtils = fixture();
  oldUtils.upstream.releasedTauriUtilsRequirement = "~2.9.3";
  assert.throws(
    () => validateDependencyRiskReview(oldUtils, expected),
    /修复依赖链不准确/,
  );

  const oldPattern = fixture();
  oldPattern.upstream.releasedUrlpatternRequirement = "^0.3";
  assert.throws(
    () => validateDependencyRiskReview(oldPattern, expected),
    /修复依赖链不准确/,
  );

  const oldTarget = structuredClone(expected);
  oldTarget.targetPackages.push({ name: "unic-ucd-ident", version: "0.9.0" });
  assert.throws(
    () => validateDependencyRiskReview(fixture(), oldTarget),
    /风险与 cargo-audit 不一致/,
  );
});
