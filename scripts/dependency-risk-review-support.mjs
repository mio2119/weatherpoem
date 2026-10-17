import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const DEPENDENCY_RISK_REVIEW_REPORT =
  "output/WeatherPoem_0.2.0_DEPENDENCY_RISK_REVIEW.json";
export const DEPENDENCY_RISK_REVIEW_SCHEMA = "2.0";

export const REMOVED_UNIC_PACKAGES = [
  "unic-char-property",
  "unic-char-range",
  "unic-common",
  "unic-ucd-ident",
  "unic-ucd-version",
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

function isSha256(value) {
  return typeof value === "string" && /^[A-F0-9]{64}$/.test(value);
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function stableVersionAtLeastMinor(value, minor) {
  const match = typeof value === "string"
    ? value.match(/^2\.(\d+)\.\d+$/)
    : null;
  return Boolean(match && Number(match[1]) >= minor);
}

export async function sha256File(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
    .toUpperCase();
}

export function validateDependencyRiskReview(report, expected) {
  exactKeys(
    report,
    [
      "schemaVersion",
      "product",
      "appVersion",
      "generatedAt",
      "status",
      "inputs",
      "currentTarget",
      "dependencyCluster",
      "upstream",
      "proposedDisposition",
      "approval",
      "limitations",
      "gateSatisfied",
      "result",
    ],
    "依赖风险处置草案",
  );
  assert(
    report.schemaVersion === DEPENDENCY_RISK_REVIEW_SCHEMA &&
      report.product === "WeatherPoem" &&
      report.appVersion === expected.appVersion &&
      report.status === "upgrade-applied-review-pending",
    "依赖风险处置草案身份无效",
  );
  const generatedAt = Date.parse(report.generatedAt);
  assert(
    Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 10 * 60 * 1000 &&
      generatedAt >= Date.now() - 31 * 24 * 60 * 60 * 1000,
    "依赖风险处置草案已过期或时间无效",
  );

  exactKeys(
    report.inputs,
    [
      "cargoAuditReport",
      "cargoAuditSha256",
      "cargoLock",
      "cargoLockSha256",
      "targetTriple",
    ],
    "处置输入",
  );
  assert(
    report.inputs.cargoAuditReport ===
        "output/WeatherPoem_0.2.0_CARGO_AUDIT.json" &&
      report.inputs.cargoAuditSha256 ===
        expected.cargoAuditSha256 &&
      isSha256(report.inputs.cargoAuditSha256) &&
      report.inputs.cargoLock === "src-tauri/Cargo.lock" &&
      report.inputs.cargoLockSha256 === expected.cargoLockSha256 &&
      isSha256(report.inputs.cargoLockSha256) &&
      report.inputs.targetTriple === "x86_64-pc-windows-msvc",
    "处置草案未绑定当前 RustSec 报告、锁文件或 Windows 目标",
  );

  exactKeys(
    report.currentTarget,
    [
      "vulnerabilityCount",
      "blockingWarningCount",
      "unmaintainedWarningCount",
      "unmaintainedWarnings",
    ],
    "当前 Windows 目标",
  );
  const targetPackages = expected.targetPackages;
  assert(Array.isArray(targetPackages), "缺少当前 Windows 目标依赖树");
  const targetVersion = (name) =>
    targetPackages.find((item) => item.name === name)?.version;
  assert(
    report.currentTarget.vulnerabilityCount === 0 &&
      report.currentTarget.blockingWarningCount === 0 &&
      report.currentTarget.unmaintainedWarningCount === 0 &&
      Array.isArray(report.currentTarget.unmaintainedWarnings) &&
      report.currentTarget.unmaintainedWarnings.length === 0 &&
      Array.isArray(expected.targetUnmaintainedWarnings) &&
      expected.targetUnmaintainedWarnings.length === 0 &&
      REMOVED_UNIC_PACKAGES.every((name) => !targetVersion(name)),
    "处置草案中的 Windows 目标风险与 cargo-audit 不一致",
  );

  exactKeys(
    report.dependencyCluster,
    [
      "independentRiskCount",
      "clusteredWarningCount",
      "frameworkPackage",
      "rootPackage",
      "leafPackage",
      "path",
    ],
    "升级后的依赖链",
  );
  assert(
    report.dependencyCluster.independentRiskCount === 0 &&
      report.dependencyCluster.clusteredWarningCount === 0 &&
      stableVersionAtLeastMinor(targetVersion("tauri"), 12) &&
      stableVersionAtLeastMinor(targetVersion("tauri-utils"), 10) &&
      targetVersion("urlpattern") === "0.6.0" &&
      report.dependencyCluster.frameworkPackage ===
        `tauri-utils@${targetVersion("tauri-utils")}` &&
      report.dependencyCluster.rootPackage ===
        `urlpattern@${targetVersion("urlpattern")}` &&
      report.dependencyCluster.leafPackage === null &&
      JSON.stringify(report.dependencyCluster.path) ===
        JSON.stringify([
          `weatherpoem@${expected.appVersion}`,
          `tauri@${targetVersion("tauri")}`,
          `tauri-utils@${targetVersion("tauri-utils")}`,
          `urlpattern@${targetVersion("urlpattern")}`,
        ]),
    "升级后的 Tauri/urlpattern 依赖链未准确证明旧 unic 包已移除",
  );

  exactKeys(
    report.upstream,
    [
      "checkedAt",
      "tauriLatestStable",
      "tauriUtilsLatestStable",
      "urlpatternLatestStable",
      "urlpattern060RemovesUnicUcdIdent",
      "releasedTauriUtilsRequirement",
      "releasedUrlpatternRequirement",
      "tauriPullRequest",
      "mergeCommitSha",
      "mergedAt",
      "tauriDevDependency",
      "sources",
    ],
    "上游处置状态",
  );
  assert(
    Math.abs(Date.parse(report.upstream.checkedAt) - generatedAt) <=
      1000 &&
      stableVersionAtLeastMinor(report.upstream.tauriLatestStable, 12) &&
      stableVersionAtLeastMinor(report.upstream.tauriUtilsLatestStable, 10) &&
      /^0\.(?:[6-9]|\d{2,})\.\d+$/.test(report.upstream.urlpatternLatestStable) &&
      report.upstream.urlpattern060RemovesUnicUcdIdent === true &&
      /^~2\.(?:1\d|[2-9]\d)\.\d+$/.test(report.upstream.releasedTauriUtilsRequirement) &&
      /^\^0\.6(?:\.\d+)?$/.test(report.upstream.releasedUrlpatternRequirement) &&
      report.upstream.tauriPullRequest ===
        "https://github.com/tauri-apps/tauri/pull/15660" &&
      report.upstream.mergeCommitSha ===
        "dd725f4b13c30a86b398ccc59eb498f151f461c5" &&
      isCommitSha(report.upstream.mergeCommitSha) &&
      report.upstream.mergedAt === "2026-07-06T16:50:43Z" &&
      report.upstream.tauriDevDependency === "urlpattern@0.6",
    "上游稳定版的修复依赖链不准确",
  );
  exactKeys(
    report.upstream.sources,
    [
      "tauriCrate",
      "tauriUtilsCrate",
      "urlpatternCrate",
      "pullRequest",
      "tauriDevCargoToml",
      "tauriStableDependencies",
      "tauriUtilsStableDependencies",
    ],
    "上游来源",
  );
  assert(
    Object.values(report.upstream.sources).every(
      (value) =>
        typeof value === "string" &&
        value.startsWith("https://"),
    ) &&
      report.upstream.sources.tauriStableDependencies ===
        `https://crates.io/api/v1/crates/tauri/${report.upstream.tauriLatestStable}/dependencies` &&
      report.upstream.sources.tauriUtilsStableDependencies ===
        `https://crates.io/api/v1/crates/tauri-utils/${report.upstream.tauriUtilsLatestStable}/dependencies`,
    "上游来源必须是无凭据 HTTPS 地址",
  );

  exactKeys(
    report.proposedDisposition,
    [
      "action",
      "reason",
      "temporaryControl",
      "upgradeTrigger",
      "releaseGate",
      "targetDate",
    ],
    "拟议处置",
  );
  const targetDate = Date.parse(
    `${report.proposedDisposition.targetDate}T23:59:59Z`,
  );
  assert(
    report.proposedDisposition.action ===
      "verify-applied-stable-upgrade-before-release" &&
      report.proposedDisposition.reason ===
        "old-unic-chain-removed-from-windows-target" &&
      report.proposedDisposition.temporaryControl ===
        "block-vulnerabilities-unsound-yanked-and-review-each-candidate" &&
      report.proposedDisposition.upgradeTrigger ===
        "locked-windows-tree-resolves-urlpattern-0.6" &&
      report.proposedDisposition.releaseGate ===
        "before-next-release-candidate" &&
      Number.isFinite(targetDate) &&
      targetDate >= generatedAt &&
      targetDate <= generatedAt + 30 * 24 * 60 * 60 * 1000,
    "拟议处置缺少已应用升级的复核条件、发布门禁或限期",
  );

  exactKeys(
    report.approval,
    ["securityOwner", "decision", "approvedAt", "evidencePath"],
    "安全批准",
  );
  assert(
    report.approval.securityOwner === null &&
      report.approval.decision === null &&
      report.approval.approvedAt === null &&
      report.approval.evidencePath ===
        "review/evidence/RQT-15-security-privacy-review.json",
    "自动草案不得伪造具名安全批准",
  );
  exactKeys(
    report.limitations,
    [
      "upstreamFixReleased",
      "upgradeNotYetApplied",
      "runtimeWarningStillPresent",
      "namedSecurityReviewCompleted",
    ],
    "处置限制",
  );
  assert(
    report.limitations.upstreamFixReleased === true &&
      report.limitations.upgradeNotYetApplied === false &&
      report.limitations.runtimeWarningStillPresent === false &&
      report.limitations.namedSecurityReviewCompleted === false &&
      report.gateSatisfied === false &&
      report.result === "automated-upgrade-verified-review-pending",
    "处置草案掩盖了升级后依赖状态或未批准状态",
  );
}
