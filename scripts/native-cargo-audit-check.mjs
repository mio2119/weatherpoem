import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  NATIVE_CARGO_AUDIT_REPORT,
  NATIVE_CARGO_AUDIT_TARGET,
  sha256File,
  validateNativeCargoAuditReport,
} from "./native-cargo-audit-support.mjs";

const projectRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const reportPath = path.join(
  projectRoot,
  ...NATIVE_CARGO_AUDIT_REPORT.split("/"),
);
const report = JSON.parse(await readFile(reportPath, "utf8"));
const lockPath = path.join(projectRoot, "src-tauri", "Cargo.lock");

const tree = spawnSync(
  "cargo",
  [
    "tree",
    "--locked",
    "--offline",
    "--target",
    NATIVE_CARGO_AUDIT_TARGET,
    "--manifest-path",
    path.join(projectRoot, "src-tauri", "Cargo.toml"),
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
    maxBuffer: 20 * 1024 * 1024,
  },
);
if (tree.status !== 0) {
  throw new Error(
    `无法离线解析 Windows 目标依赖树：${tree.stderr}`,
  );
}
const targetPackageKeys = [
  ...new Set(
    tree.stdout
      .split(/\r?\n/)
      .map((line) =>
        line.match(/^([A-Za-z0-9_-]+) v([^ ]+)/),
      )
      .filter(Boolean)
      .map((match) => `${match[1]}@${match[2]}`),
  ),
];

const summary = validateNativeCargoAuditReport(report, {
  appVersion: packageJson.version,
  lockSha256: await sha256File(lockPath),
  targetPackageKeys,
});

console.log(
  `原生 cargo-audit 报告有效：Windows 目标 ${summary.targetPackageCount - 1} 个依赖、` +
    `${summary.targetVulnerabilityCount} 个漏洞；` +
    `${summary.targetUnmaintainedCount} 项停止维护公告仍需具名评审。` +
    `另保留 ${summary.excludedNonTargetVulnerabilityCount} 个非 Windows 目标原始发现。`,
);
