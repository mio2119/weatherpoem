import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const NATIVE_CARGO_AUDIT_REPORT =
  "output/WeatherPoem_0.2.0_CARGO_AUDIT.json";
export const NATIVE_CARGO_AUDIT_SCHEMA = "1.0";
export const NATIVE_CARGO_AUDIT_TARGET =
  "x86_64-pc-windows-msvc";

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

function validSha256(value) {
  return typeof value === "string" && /^[A-F0-9]{64}$/.test(value);
}

function validCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function findingSummary(value, kind) {
  return {
    kind,
    advisoryId:
      value.advisory && typeof value.advisory.id === "string"
        ? value.advisory.id
        : null,
    package: value.package.name,
    version: value.package.version,
  };
}

function assertFinding(value, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} 必须是对象`,
  );
  assert(
    value.package &&
      typeof value.package.name === "string" &&
      value.package.name.length > 0 &&
      typeof value.package.version === "string" &&
      value.package.version.length > 0,
    `${label} 缺少包名或版本`,
  );
}

function warningMap(value, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} 必须是对象`,
  );
  for (const [kind, findings] of Object.entries(value)) {
    assert(
      typeof kind === "string" &&
        kind.length > 0 &&
        Array.isArray(findings),
      `${label} 的警告分类无效`,
    );
    findings.forEach((finding, index) =>
      assertFinding(finding, `${label}.${kind}[${index}]`),
    );
  }
  return value;
}

function summaryWarningMap(value, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} 必须是对象`,
  );
  for (const [kind, findings] of Object.entries(value)) {
    assert(
      typeof kind === "string" &&
        kind.length > 0 &&
        Array.isArray(findings),
      `${label} 的警告分类无效`,
    );
    findings.forEach((finding, index) => {
      exactKeys(
        finding,
        ["kind", "advisoryId", "package", "version"],
        `${label}.${kind}[${index}]`,
      );
      assert(
        finding.kind === kind &&
          (finding.advisoryId === null ||
            typeof finding.advisoryId === "string") &&
          typeof finding.package === "string" &&
          finding.package.length > 0 &&
          typeof finding.version === "string" &&
          finding.version.length > 0,
        `${label}.${kind}[${index}] 摘要无效`,
      );
    });
  }
  return value;
}

function sortedPackageKeys(packages) {
  return packages
    .map((value) => `${value.name}@${value.version}`)
    .sort();
}

export async function sha256File(path) {
  const bytes = await readFile(path);
  return createHash("sha256")
    .update(bytes)
    .digest("hex")
    .toUpperCase();
}

export function validateNativeCargoAuditReport(report, expected) {
  exactKeys(
    report,
    [
      "schemaVersion",
      "product",
      "appVersion",
      "generatedAt",
      "tool",
      "lockfile",
      "database",
      "command",
      "cargoAuditExitCode",
      "stderr",
      "audit",
      "targetResolution",
      "limitations",
      "gateSatisfied",
      "result",
    ],
    "原生 cargo-audit 报告",
  );
  assert(
    report.schemaVersion === NATIVE_CARGO_AUDIT_SCHEMA,
    "原生 cargo-audit 报告 Schema 不匹配",
  );
  assert(report.product === "WeatherPoem", "cargo-audit 产品名不匹配");
  assert(
    report.appVersion === expected.appVersion,
    "cargo-audit 报告版本不是当前应用版本",
  );
  const generatedAt = Date.parse(report.generatedAt);
  assert(Number.isFinite(generatedAt), "cargo-audit 报告时间无效");
  assert(
    generatedAt <= Date.now() + 10 * 60 * 1_000 &&
      generatedAt >= Date.now() - 31 * 24 * 60 * 60 * 1_000,
    "cargo-audit 报告时间位于未来或已经过期",
  );

  exactKeys(report.tool, ["name", "version"], "cargo-audit 工具");
  assert(
    report.tool.name === "cargo-audit" &&
      /^cargo-audit 0\.22\.\d+$/.test(report.tool.version),
    "cargo-audit 工具版本不受当前契约支持",
  );

  exactKeys(report.lockfile, ["path", "sha256"], "cargo-audit 锁文件");
  assert(
    report.lockfile.path === "src-tauri/Cargo.lock" &&
      report.lockfile.sha256 === expected.lockSha256,
    "cargo-audit 报告未绑定当前 Cargo.lock",
  );
  assert(validSha256(report.lockfile.sha256), "Cargo.lock 哈希格式无效");

  exactKeys(
    report.database,
    [
      "source",
      "apiUrl",
      "archiveUrl",
      "ref",
      "commitSha",
      "commitDate",
      "archiveSha256",
      "fetchedAt",
      "transport",
    ],
    "RustSec 数据库",
  );
  assert(
    report.database.source ===
        "https://github.com/RustSec/advisory-db" &&
      report.database.apiUrl ===
        "https://api.github.com/repos/RustSec/advisory-db/commits/main" &&
      report.database.ref === "main" &&
      report.database.transport ===
        "official-github-api-and-codeload-https",
    "RustSec 数据库不是官方 GitHub 来源",
  );
  assert(
    validCommitSha(report.database.commitSha) &&
      report.database.archiveUrl ===
        `https://codeload.github.com/RustSec/advisory-db/zip/${report.database.commitSha}`,
    "RustSec 归档没有绑定官方提交 SHA",
  );
  assert(
    validSha256(report.database.archiveSha256),
    "RustSec 归档 SHA-256 无效",
  );
  const commitDate = Date.parse(report.database.commitDate);
  const fetchedAt = Date.parse(report.database.fetchedAt);
  assert(
    Number.isFinite(commitDate) &&
      Number.isFinite(fetchedAt) &&
      commitDate <= fetchedAt + 10 * 60 * 1_000 &&
      Math.abs(fetchedAt - generatedAt) <= 1_000,
    "RustSec 提交或抓取时间无效",
  );

  exactKeys(
    report.command,
    [
      "noFetch",
      "allowStaleSnapshot",
      "targetTriple",
      "cargoTreeOffline",
    ],
    "cargo-audit 命令",
  );
  assert(
    report.command.noFetch === true &&
      report.command.allowStaleSnapshot === true &&
      report.command.targetTriple === NATIVE_CARGO_AUDIT_TARGET &&
      report.command.cargoTreeOffline === true,
    "cargo-audit 没有使用固定官方快照和 Windows 目标树",
  );
  assert(
    report.cargoAuditExitCode === 0 ||
      report.cargoAuditExitCode === 1,
    "cargo-audit 原始退出码无效",
  );
  assert(typeof report.stderr === "string", "cargo-audit stderr 无效");

  const audit = report.audit;
  assert(
    audit &&
      audit.database &&
      Number.isInteger(audit.database["advisory-count"]) &&
      audit.database["advisory-count"] >= 1_000,
    "RustSec 公告数据库数量异常",
  );
  assert(
    audit.lockfile &&
      Number.isInteger(audit.lockfile["dependency-count"]) &&
      audit.lockfile["dependency-count"] >= 100,
    "cargo-audit 锁文件依赖数量异常",
  );
  assert(
    Array.isArray(audit.settings?.target_os) &&
      audit.settings.target_os.length === 1 &&
      audit.settings.target_os[0] === "windows" &&
      Array.isArray(audit.settings?.target_arch) &&
      audit.settings.target_arch.length === 1 &&
      audit.settings.target_arch[0] === "x86_64",
    "cargo-audit 原始扫描没有声明 Windows x86_64",
  );
  assert(
    audit.vulnerabilities &&
      Array.isArray(audit.vulnerabilities.list) &&
      audit.vulnerabilities.count ===
        audit.vulnerabilities.list.length &&
      audit.vulnerabilities.found ===
        (audit.vulnerabilities.count > 0),
    "cargo-audit 原始漏洞计数不一致",
  );
  audit.vulnerabilities.list.forEach((finding, index) =>
    assertFinding(finding, `原始漏洞[${index}]`),
  );
  const rawWarnings = warningMap(
    audit.warnings,
    "cargo-audit 原始警告",
  );
  assert(
    report.cargoAuditExitCode ===
      (audit.vulnerabilities.count > 0 ? 1 : 0),
    "cargo-audit 原始退出码与漏洞数量不一致",
  );

  const target = report.targetResolution;
  exactKeys(
    target,
    [
      "packageCount",
      "packages",
      "vulnerabilities",
      "excludedNonTargetVulnerabilities",
      "warnings",
      "excludedNonTargetWarnings",
      "blockingWarningKinds",
      "blockingWarningCount",
      "targetScanSatisfied",
    ],
    "Windows 目标解析",
  );
  assert(
    Array.isArray(target.packages) &&
      target.packages.length === target.packageCount &&
      target.packageCount >= 100,
    "Windows 目标依赖树数量异常",
  );
  for (const [index, value] of target.packages.entries()) {
    exactKeys(value, ["name", "version"], `目标包[${index}]`);
    assert(
      typeof value.name === "string" &&
        value.name.length > 0 &&
        typeof value.version === "string" &&
        value.version.length > 0,
      "Windows 目标包名或版本无效",
    );
  }
  const targetPackageKeys = sortedPackageKeys(target.packages);
  assert(
    new Set(targetPackageKeys).size === targetPackageKeys.length &&
      targetPackageKeys.includes(
        `weatherpoem@${expected.appVersion}`,
      ),
    "Windows 目标依赖树重复或缺少应用根包",
  );
  assert(
    JSON.stringify(targetPackageKeys) ===
      JSON.stringify([...expected.targetPackageKeys].sort()),
    "报告中的 Windows 目标依赖树已过期",
  );
  const targetSet = new Set(targetPackageKeys);

  const rawVulnerabilitySummaries =
    audit.vulnerabilities.list.map((value) =>
      findingSummary(value, "vulnerability"),
    );
  const expectedTargetVulnerabilities =
    rawVulnerabilitySummaries.filter((value) =>
      targetSet.has(`${value.package}@${value.version}`),
    );
  const expectedExcludedVulnerabilities =
    rawVulnerabilitySummaries.filter(
      (value) =>
        !targetSet.has(`${value.package}@${value.version}`),
    );
  assert(
    JSON.stringify(target.vulnerabilities) ===
        JSON.stringify(expectedTargetVulnerabilities) &&
      JSON.stringify(target.excludedNonTargetVulnerabilities) ===
        JSON.stringify(expectedExcludedVulnerabilities),
    "原始漏洞没有按当前 Windows 目标依赖树准确分组",
  );

  const targetWarnings = summaryWarningMap(
    target.warnings,
    "Windows 目标警告",
  );
  const excludedWarnings = summaryWarningMap(
    target.excludedNonTargetWarnings,
    "非目标警告",
  );
  assert(
    JSON.stringify(Object.keys(targetWarnings).sort()) ===
        JSON.stringify(Object.keys(rawWarnings).sort()) &&
      JSON.stringify(Object.keys(excludedWarnings).sort()) ===
        JSON.stringify(Object.keys(rawWarnings).sort()),
    "警告分类没有完整保留",
  );
  for (const [kind, findings] of Object.entries(rawWarnings)) {
    const summaries = findings.map((value) =>
      findingSummary(value, kind),
    );
    const expectedTarget = summaries.filter((value) =>
      targetSet.has(`${value.package}@${value.version}`),
    );
    const expectedExcluded = summaries.filter(
      (value) =>
        !targetSet.has(`${value.package}@${value.version}`),
    );
    assert(
      JSON.stringify(targetWarnings[kind]) ===
          JSON.stringify(expectedTarget) &&
        JSON.stringify(excludedWarnings[kind]) ===
          JSON.stringify(expectedExcluded),
      `${kind} 警告没有按 Windows 目标依赖树准确分组`,
    );
  }
  assert(
    JSON.stringify(target.blockingWarningKinds) ===
      JSON.stringify(["unsound", "yanked"]),
    "阻断性 RustSec 警告分类被改变",
  );
  const blockingWarningCount =
    (targetWarnings.unsound?.length ?? 0) +
    (targetWarnings.yanked?.length ?? 0);
  assert(
    target.blockingWarningCount === blockingWarningCount,
    "阻断性 RustSec 警告计数不一致",
  );
  const targetScanSatisfied =
    expectedTargetVulnerabilities.length === 0 &&
    blockingWarningCount === 0;
  assert(
    target.targetScanSatisfied === targetScanSatisfied,
    "Windows 目标 RustSec 结论与原始结果不一致",
  );

  exactKeys(
    report.limitations,
    [
      "targetSpecific",
      "nonTargetFindingsRetained",
      "unmaintainedRequiresHumanReview",
      "namedSecurityReviewCompleted",
    ],
    "cargo-audit 限制",
  );
  assert(
    report.limitations.targetSpecific === true &&
      report.limitations.nonTargetFindingsRetained === true &&
      report.limitations.unmaintainedRequiresHumanReview === true &&
      report.limitations.namedSecurityReviewCompleted === false,
    "cargo-audit 报告掩盖了目标范围或人工评审限制",
  );
  assert(
    report.gateSatisfied === false,
    "自动 cargo-audit 不得冒充具名安全评审完成",
  );
  assert(
    report.result ===
      (targetScanSatisfied
        ? "automated-target-scan-passed"
        : "automated-target-scan-failed"),
    "cargo-audit 总结论与目标结果不一致",
  );
  assert(
    report.result === "automated-target-scan-passed",
    "Windows 目标原生 cargo-audit 尚有阻断发现",
  );

  return {
    targetPackageCount: target.packageCount,
    targetVulnerabilityCount:
      expectedTargetVulnerabilities.length,
    targetUnmaintainedCount:
      targetWarnings.unmaintained?.length ?? 0,
    excludedNonTargetVulnerabilityCount:
      expectedExcludedVulnerabilities.length,
  };
}
