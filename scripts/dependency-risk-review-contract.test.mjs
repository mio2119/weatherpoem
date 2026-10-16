import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_UNIC_WARNINGS,
  validateDependencyRiskReview,
} from "./dependency-risk-review-support.mjs";

const HASH = "A".repeat(64);

function fixture() {
  const generatedAt = new Date().toISOString();
  const targetDate = new Date(
    Date.parse(generatedAt) + 29 * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  return {
    schemaVersion: "1.1",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt,
    status: "review-ready-not-approved",
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
      unmaintainedWarningCount: 5,
      unmaintainedWarnings: structuredClone(
        EXPECTED_UNIC_WARNINGS,
      ),
    },
    dependencyCluster: {
      independentRiskCount: 1,
      clusteredWarningCount: 5,
      frameworkPackage: "tauri-utils@2.9.3",
      rootPackage: "urlpattern@0.3.0",
      leafPackage: "unic-ucd-ident@0.9.0",
      path: [
        "weatherpoem@0.2.0",
        "tauri@2.11.5",
        "tauri-utils@2.9.3",
        "urlpattern@0.3.0",
        "unic-ucd-ident@0.9.0",
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
      action: "upgrade-released-stable-tauri-before-release",
      reason: "urlpattern-fix-now-available-in-stable",
      temporaryControl:
        "block-vulnerabilities-unsound-yanked-and-review-each-candidate",
      upgradeTrigger:
        "released-tauri-utils-resolves-urlpattern-0.6",
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
      upgradeNotYetApplied: true,
      runtimeWarningStillPresent: true,
      namedSecurityReviewCompleted: false,
    },
    gateSatisfied: false,
    result: "automated-disposition-draft-ready",
  };
}

const expected = {
  appVersion: "0.2.0",
  cargoAuditSha256: HASH,
  cargoLockSha256: HASH,
  targetUnmaintainedWarnings: EXPECTED_UNIC_WARNINGS,
};

test("five unic advisories are clustered without claiming approval", () => {
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
  changed.currentTarget.unmaintainedWarnings.pop();
  assert.throws(
    () => validateDependencyRiskReview(changed, expected),
    /风险与 cargo-audit 不一致/,
  );
});

test("draft cannot pretend the released fix is already applied or approved", () => {
  const applied = fixture();
  applied.limitations.upgradeNotYetApplied = false;
  assert.throws(
    () => validateDependencyRiskReview(applied, expected),
    /掩盖了尚未升级/,
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
});
