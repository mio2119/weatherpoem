import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const reportPath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${packageJson.version}_DEPENDENCY_AUDIT.json`,
);
const checkOnly = process.argv.includes("--check");
const maxReportAgeMs = 30 * 24 * 60 * 60 * 1000;

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256")
    .update(contents)
    .digest("hex")
    .toUpperCase();
}

function cargoPackages(lockText) {
  return lockText
    .split("[[package]]")
    .slice(1)
    .map((block) => ({
      name: block.match(/^name = "([^"]+)"$/m)?.[1],
      version: block.match(/^version = "([^"]+)"$/m)?.[1],
      source: block.match(/^source = "([^"]+)"$/m)?.[1],
    }))
    .filter(
      (item) =>
        item.name &&
        item.version &&
        item.source?.startsWith("registry+"),
    );
}

async function resolvedWindowsPackages(lockedPackages) {
  const { stdout } = await execFileAsync(
    "cargo",
    [
      "tree",
      "--manifest-path",
      path.join(projectRoot, "src-tauri", "Cargo.toml"),
      "--locked",
      "--offline",
      "--target",
      "x86_64-pc-windows-msvc",
      "--edges",
      "normal,build",
      "--prefix",
      "none",
      "--format",
      "{p}",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true,
    },
  );
  const locked = new Map(
    lockedPackages.map((item) => [
      `${item.name}@${item.version}`,
      item,
    ]),
  );
  const resolved = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^([^\s]+) v([^\s]+)/);
    if (!match) continue;
    const key = `${match[1]}@${match[2]}`;
    const item = locked.get(key);
    if (item) resolved.set(key, item);
  }
  if (resolved.size < 1) {
    throw new Error("无法从 Cargo 目标依赖树解析 crates.io 包");
  }
  return [...resolved.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`,
    ),
  );
}

async function runNpmAudit() {
  const executable =
    process.platform === "win32"
      ? process.env.ComSpec || "cmd.exe"
      : "npm";
  const argumentsForAudit =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm audit --json"]
      : ["audit", "--json"];
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync(executable, argumentsForAudit, {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
      windowsHide: true,
    }));
  } catch (error) {
    stdout = error.stdout ?? "";
    if (!stdout.trim()) throw error;
  }
  const audit = JSON.parse(stdout);
  if (
    audit.auditReportVersion !== 2 ||
    !audit.metadata?.vulnerabilities
  ) {
    throw new Error("npm audit 返回了无法识别的报告结构");
  }
  return audit;
}

async function queryOsv(packages) {
  const rawFindings = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    for (let offset = 0; offset < packages.length; offset += 500) {
      const batch = packages.slice(offset, offset + 500);
      const response = await fetch(
        "https://api.osv.dev/v1/querybatch",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            queries: batch.map((item) => ({
              version: item.version,
              package: {
                ecosystem: "crates.io",
                name: item.name,
              },
            })),
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(
          `OSV API 请求失败：HTTP ${response.status}`,
        );
      }
      const body = await response.json();
      if (
        !Array.isArray(body.results) ||
        body.results.length !== batch.length
      ) {
        throw new Error(
          "OSV API 返回数量与 Cargo.lock 查询数量不一致",
        );
      }
      body.results.forEach((result, index) => {
        if (result.next_page_token) {
          throw new Error("OSV API 结果发生分页，当前审计拒绝截断");
        }
        for (const vulnerability of result.vulns ?? []) {
          rawFindings.push({
            id: vulnerability.id,
            modified: vulnerability.modified,
            package: batch[index].name,
            version: batch[index].version,
          });
        }
      });
    }
  } finally {
    clearTimeout(timer);
  }
  const details = new Map();
  await Promise.all(
    [...new Set(rawFindings.map((item) => item.id))].map(
      async (id) => {
        const response = await fetch(
          `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
        );
        if (!response.ok) {
          throw new Error(
            `OSV 漏洞详情请求失败：${id} / HTTP ${response.status}`,
          );
        }
        details.set(id, await response.json());
      },
    ),
  );
  const findings = rawFindings.map((item) => {
    const detail = details.get(item.id);
    const affected = detail?.affected?.find(
      (entry) =>
        entry.package?.ecosystem === "crates.io" &&
        entry.package?.name === item.package,
    );
    return {
      ...item,
      summary: detail?.summary ?? "",
      informational:
        affected?.database_specific?.informational ?? null,
      severity: Array.isArray(detail?.severity)
        ? detail.severity
        : [],
    };
  });
  return findings.sort((left, right) =>
    `${left.id}:${left.package}`.localeCompare(
      `${right.id}:${right.package}`,
    ),
  );
}

function assertZeroCounts(counts, label) {
  const levels = [
    "info",
    "low",
    "moderate",
    "high",
    "critical",
    "total",
  ];
  if (
    levels.some(
      (level) =>
        !Number.isInteger(counts?.[level]) ||
        counts[level] !== 0,
    )
  ) {
    throw new Error(`${label} 仍包含已知漏洞`);
  }
}

async function assertCurrentReport(report) {
  const packageLockPath = path.join(projectRoot, "package-lock.json");
  const cargoLockPath = path.join(
    projectRoot,
    "src-tauri",
    "Cargo.lock",
  );
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== "WeatherPoem" ||
    report?.version !== packageJson.version ||
    report?.result !== "passed"
  ) {
    throw new Error("依赖审计报告的产品、版本、结构或结果无效");
  }
  const scannedAt = Date.parse(report.scannedAt);
  if (
    !Number.isFinite(scannedAt) ||
    scannedAt > Date.now() + 5 * 60 * 1000 ||
    Date.now() - scannedAt > maxReportAgeMs
  ) {
    throw new Error("依赖审计报告已过期或时间无效");
  }
  if (
    report?.locks?.npm?.name !== "package-lock.json" ||
    report.locks.npm.sha256 !== (await sha256(packageLockPath)) ||
    report?.locks?.cargo?.name !== "src-tauri/Cargo.lock" ||
    report.locks.cargo.sha256 !== (await sha256(cargoLockPath))
  ) {
    throw new Error("依赖审计报告未绑定当前 npm/Cargo 锁文件");
  }
  if (
    report?.scanners?.npm?.source !== "npm-audit-v2" ||
    report?.scanners?.rust?.source !== "osv-querybatch-v1" ||
    report?.scanners?.rust?.ecosystem !== "crates.io"
  ) {
    throw new Error("依赖审计报告没有使用约定的数据源");
  }
  assertZeroCounts(
    report.scanners.npm.vulnerabilities,
    "npm 锁文件",
  );
  if (
    !Number.isInteger(report.scanners.rust.packageCount) ||
    report.scanners.rust.packageCount < 1 ||
    !Array.isArray(report.scanners.rust.findings) ||
    report.scanners.rust.findingCount !==
      report.scanners.rust.findings.length ||
    report.scanners.rust.vulnerabilityCount !== 0 ||
    report.scanners.rust.informationalCount +
        report.scanners.rust.vulnerabilityCount !==
      report.scanners.rust.findingCount ||
    report.scanners.rust.findings.some(
      (finding) => !finding.informational,
    ) ||
    report.scanners.rust.target !== "x86_64-pc-windows-msvc" ||
    report?.limitations?.cargoAuditNativeCompleted !== false
  ) {
    throw new Error("Rust 锁文件审计仍有发现或范围说明不完整");
  }
}

if (checkOnly) {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  await assertCurrentReport(report);
  console.log(
    `依赖审计报告有效：${path.relative(projectRoot, reportPath)}；npm 与 Windows 目标 crates.io 已知安全漏洞均为 0。`,
  );
  process.exit(0);
}

const packageLockPath = path.join(projectRoot, "package-lock.json");
const cargoLockPath = path.join(
  projectRoot,
  "src-tauri",
  "Cargo.lock",
);
const [packageLockStat, cargoLockStat, cargoLockText, npmAudit] =
  await Promise.all([
    stat(packageLockPath),
    stat(cargoLockPath),
    readFile(cargoLockPath, "utf8"),
    runNpmAudit(),
  ]);
const rustPackages = await resolvedWindowsPackages(
  cargoPackages(cargoLockText),
);
const rustFindings = await queryOsv(rustPackages);
const rustVulnerabilities = rustFindings.filter(
  (finding) => !finding.informational,
);
const rustInformational = rustFindings.filter(
  (finding) => finding.informational,
);
const npmCounts = npmAudit.metadata.vulnerabilities;
const passed =
  npmCounts.total === 0 && rustVulnerabilities.length === 0;
const report = {
  schemaVersion: "1.0",
  product: "WeatherPoem",
  version: packageJson.version,
  scannedAt: new Date().toISOString(),
  locks: {
    npm: {
      name: "package-lock.json",
      bytes: packageLockStat.size,
      sha256: await sha256(packageLockPath),
    },
    cargo: {
      name: "src-tauri/Cargo.lock",
      bytes: cargoLockStat.size,
      sha256: await sha256(cargoLockPath),
    },
  },
  scanners: {
    npm: {
      source: "npm-audit-v2",
      dependencyCount: npmAudit.metadata.dependencies.total,
      vulnerabilities: npmCounts,
    },
    rust: {
      source: "osv-querybatch-v1",
      endpoint: "https://api.osv.dev/v1/querybatch",
      ecosystem: "crates.io",
      target: "x86_64-pc-windows-msvc",
      edges: ["normal", "build"],
      packageCount: rustPackages.length,
      findingCount: rustFindings.length,
      vulnerabilityCount: rustVulnerabilities.length,
      informationalCount: rustInformational.length,
      findings: rustFindings,
    },
  },
  limitations: {
    pointInTimeKnownVulnerabilitiesOnly: true,
    sourceReviewStillRequired: true,
    cargoAuditNativeCompleted: false,
    cargoAuditReason:
      "本报告只覆盖 npm audit 与 Windows 目标 OSV；原生 RustSec 结果由 WeatherPoem_0.2.0_CARGO_AUDIT.json 独立记录和复核。",
  },
  result: passed ? "passed" : "failed",
};
await writeFile(
  reportPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await assertCurrentReport(report);
console.log(
  `依赖审计通过：npm ${npmAudit.metadata.dependencies.total} 个依赖，Windows 目标 Rust ${rustPackages.length} 个 crates.io 包，已知安全漏洞均为 0，信息性公告 ${rustInformational.length} 项；报告：${reportPath}`,
);
