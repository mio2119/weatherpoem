import assert from "node:assert/strict";
import test from "node:test";
import {
  validateNativeCargoAuditReport,
} from "./native-cargo-audit-support.mjs";

const LOCK_HASH = "A".repeat(64);
const ARCHIVE_HASH = "B".repeat(64);
const COMMIT = "c".repeat(40);

function packageList() {
  return [
    { name: "weatherpoem", version: "0.2.0" },
    { name: "unic-common", version: "0.9.0" },
    ...Array.from({ length: 100 }, (_, index) => ({
      name: `fixture-${String(index).padStart(3, "0")}`,
      version: "1.0.0",
    })),
  ];
}

function rawFinding(
  kind,
  advisoryId,
  packageName,
  version,
) {
  return {
    kind,
    package: { name: packageName, version },
    advisory: { id: advisoryId },
  };
}

function fixture() {
  const packages = packageList();
  const vulnerability = rawFinding(
    "vulnerability",
    "RUSTSEC-TEST-0001",
    "rsa",
    "0.9.10",
  );
  const targetWarning = rawFinding(
    "unmaintained",
    "RUSTSEC-TEST-0002",
    "unic-common",
    "0.9.0",
  );
  const excludedWarning = rawFinding(
    "unmaintained",
    "RUSTSEC-TEST-0003",
    "gtk",
    "0.18.2",
  );
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt: now,
    tool: {
      name: "cargo-audit",
      version: "cargo-audit 0.22.2",
    },
    lockfile: {
      path: "src-tauri/Cargo.lock",
      sha256: LOCK_HASH,
    },
    database: {
      source: "https://github.com/RustSec/advisory-db",
      apiUrl:
        "https://api.github.com/repos/RustSec/advisory-db/commits/main",
      archiveUrl:
        `https://codeload.github.com/RustSec/advisory-db/zip/${COMMIT}`,
      ref: "main",
      commitSha: COMMIT,
      commitDate: now,
      archiveSha256: ARCHIVE_HASH,
      fetchedAt: now,
      transport: "official-github-api-and-codeload-https",
    },
    command: {
      noFetch: true,
      allowStaleSnapshot: true,
      targetTriple: "x86_64-pc-windows-msvc",
      cargoTreeOffline: true,
    },
    cargoAuditExitCode: 1,
    stderr: "",
    audit: {
      database: { "advisory-count": 1_200 },
      lockfile: { "dependency-count": 200 },
      settings: {
        target_os: ["windows"],
        target_arch: ["x86_64"],
      },
      vulnerabilities: {
        found: true,
        count: 1,
        list: [vulnerability],
      },
      warnings: {
        unmaintained: [targetWarning, excludedWarning],
        unsound: [],
      },
    },
    targetResolution: {
      packageCount: packages.length,
      packages,
      vulnerabilities: [],
      excludedNonTargetVulnerabilities: [
        {
          kind: "vulnerability",
          advisoryId: "RUSTSEC-TEST-0001",
          package: "rsa",
          version: "0.9.10",
        },
      ],
      warnings: {
        unmaintained: [
          {
            kind: "unmaintained",
            advisoryId: "RUSTSEC-TEST-0002",
            package: "unic-common",
            version: "0.9.0",
          },
        ],
        unsound: [],
      },
      excludedNonTargetWarnings: {
        unmaintained: [
          {
            kind: "unmaintained",
            advisoryId: "RUSTSEC-TEST-0003",
            package: "gtk",
            version: "0.18.2",
          },
        ],
        unsound: [],
      },
      blockingWarningKinds: ["unsound", "yanked"],
      blockingWarningCount: 0,
      targetScanSatisfied: true,
    },
    limitations: {
      targetSpecific: true,
      nonTargetFindingsRetained: true,
      unmaintainedRequiresHumanReview: true,
      namedSecurityReviewCompleted: false,
    },
    gateSatisfied: false,
    result: "automated-target-scan-passed",
  };
}

function expected(report) {
  return {
    appVersion: "0.2.0",
    lockSha256: LOCK_HASH,
    targetPackageKeys: report.targetResolution.packages.map(
      (value) => `${value.name}@${value.version}`,
    ),
  };
}

test("官方 RustSec 快照、锁文件和 Windows 目标过滤均可复算", () => {
  const report = fixture();
  const result = validateNativeCargoAuditReport(
    report,
    expected(report),
  );
  assert.equal(result.targetVulnerabilityCount, 0);
  assert.equal(result.targetUnmaintainedCount, 1);
  assert.equal(result.excludedNonTargetVulnerabilityCount, 1);
});

test("非目标漏洞不能被偷偷移入或移出 Windows 目标结论", () => {
  const report = fixture();
  report.targetResolution.vulnerabilities =
    report.targetResolution.excludedNonTargetVulnerabilities;
  report.targetResolution.excludedNonTargetVulnerabilities = [];
  assert.throws(
    () =>
      validateNativeCargoAuditReport(report, expected(report)),
    /准确分组/,
  );
});

test("当前锁文件、官方提交和目标依赖树任一过期都会失败", () => {
  const staleLock = fixture();
  assert.throws(
    () =>
      validateNativeCargoAuditReport(staleLock, {
        ...expected(staleLock),
        lockSha256: "D".repeat(64),
      }),
    /Cargo\.lock/,
  );

  const forgedSource = fixture();
  forgedSource.database.source =
    "https://mirror.example/advisory-db";
  assert.throws(
    () =>
      validateNativeCargoAuditReport(
        forgedSource,
        expected(forgedSource),
      ),
    /官方 GitHub/,
  );

  const staleTree = fixture();
  const expectation = expected(staleTree);
  expectation.targetPackageKeys = [
    ...expectation.targetPackageKeys,
    "new-package@1.0.0",
  ];
  assert.throws(
    () =>
      validateNativeCargoAuditReport(staleTree, expectation),
    /目标依赖树已过期/,
  );
});

test("Windows 目标漏洞或 unsound 警告不能以自动通过结论保存", () => {
  const vulnerable = fixture();
  vulnerable.targetResolution.packages.push({
    name: "rsa",
    version: "0.9.10",
  });
  vulnerable.targetResolution.packageCount += 1;
  const expectation = expected(vulnerable);
  assert.throws(
    () =>
      validateNativeCargoAuditReport(
        vulnerable,
        expectation,
      ),
    /准确分组|结论|总结论|阻断/,
  );

  const unsound = fixture();
  const finding = rawFinding(
    "unsound",
    "RUSTSEC-TEST-0004",
    "unic-common",
    "0.9.0",
  );
  unsound.audit.warnings.unsound.push(finding);
  unsound.targetResolution.warnings.unsound.push({
    kind: "unsound",
    advisoryId: "RUSTSEC-TEST-0004",
    package: "unic-common",
    version: "0.9.0",
  });
  assert.throws(
    () =>
      validateNativeCargoAuditReport(
        unsound,
        expected(unsound),
      ),
    /阻断性 RustSec 警告计数/,
  );
});

test("自动扫描必须保留停止维护与具名评审限制", () => {
  const report = fixture();
  report.limitations.namedSecurityReviewCompleted = true;
  assert.throws(
    () =>
      validateNativeCargoAuditReport(report, expected(report)),
    /人工评审限制/,
  );
});
