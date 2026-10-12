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
const exePath = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "release",
  "weatherpoem.exe",
);
const exeHash = createHash("sha256")
  .update(await readFile(exePath))
  .digest("hex")
  .toUpperCase();
const report = JSON.parse(
  await readFile(
    path.join(projectRoot, ...PERFORMANCE_FAULT_REPORT.split("/")),
    "utf8",
  ),
);
validatePerformanceFaultMatrix(report, {
  appVersion: packageJson.version,
  exeSha256: exeHash,
});
console.log(
  "受控性能故障矩阵有效：立即离线、天气超时和隔离官方预警均达到预期状态与阈值；真实在线/预警和长稳仍未测量。",
);

