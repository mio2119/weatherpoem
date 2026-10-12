import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERFORMANCE_FAULT_REPORT,
  validatePerformanceFaultMatrix,
} from "./performance-fault-matrix-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const argument = process.argv[2];
if (process.argv.length > 3 || (argument && argument !== "--redesign-candidate")) {
  throw new Error("仅支持 --redesign-candidate 参数");
}
const artifactPath = argument === "--redesign-candidate"
  ? ".work/redesign-target/release/weatherpoem.exe"
  : "src-tauri/target/release/weatherpoem.exe";
const reportPath = argument === "--redesign-candidate"
  ? "review/redesign/evidence/T09_FAULT_MATRIX.json"
  : PERFORMANCE_FAULT_REPORT;
const exePath = path.join(projectRoot, ...artifactPath.split("/"));
const exeHash = createHash("sha256")
  .update(await readFile(exePath))
  .digest("hex")
  .toUpperCase();
const report = JSON.parse(
  await readFile(
    path.join(projectRoot, ...reportPath.split("/")),
    "utf8",
  ),
);
validatePerformanceFaultMatrix(report, {
  appVersion: packageJson.version,
  exeSha256: exeHash,
  artifactPath,
});
console.log(
  "受控性能故障矩阵有效：立即离线、天气超时和隔离官方预警均达到预期状态与阈值；真实在线/预警和长稳仍未测量。",
);
