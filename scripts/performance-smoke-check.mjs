import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  resolvePerformancePaths,
  sha256File,
  validatePerformanceReport,
} from "./performance-smoke-support.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const argument = process.argv[2];
if (
  process.argv.length > 3 ||
  (argument && !["--redesign-candidate", "--baseline-comparison"].includes(argument))
) {
  throw new Error("仅支持 --redesign-candidate 或 --baseline-comparison 参数");
}
const { artifactPath, exePath, reportPath } = resolvePerformancePaths(
  projectRoot,
  argument === "--redesign-candidate"
    ? "redesign"
    : argument === "--baseline-comparison"
      ? "baseline-comparison"
      : "release",
);
const report = JSON.parse(await readFile(reportPath, "utf8"));
const exeSha256 = await sha256File(exePath);

validatePerformanceReport(report, {
  appVersion: packageJson.version,
  exeSha256,
  artifactPath,
});

console.log(
  `性能冒烟报告有效：10 次以上隔离冷启动、` +
    `${report.results.contentReady.sampleCount} 次已配置诗笺首帧/` +
    `${report.results.contentReady.onlineReadyMeasured ? "在线" : "降级"}准备、` +
    `${report.results.idle.durationSeconds} 秒空闲资源均达到已覆盖阈值；` +
    `八小时与七天门禁仍未完成。`,
);
