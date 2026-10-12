import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPENDENCY_RISK_REVIEW_REPORT,
  sha256File,
  validateDependencyRiskReview,
} from "./dependency-risk-review-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const cargoAuditPath = path.join(
  projectRoot,
  "output",
  "WeatherPoem_0.2.0_CARGO_AUDIT.json",
);
const cargoLockPath = path.join(
  projectRoot,
  "src-tauri",
  "Cargo.lock",
);
const cargoAudit = JSON.parse(
  await readFile(cargoAuditPath, "utf8"),
);
const report = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      ...DEPENDENCY_RISK_REVIEW_REPORT.split("/"),
    ),
    "utf8",
  ),
);

validateDependencyRiskReview(report, {
  appVersion: packageJson.version,
  cargoAuditSha256: await sha256File(cargoAuditPath),
  cargoLockSha256: await sha256File(cargoLockPath),
  targetUnmaintainedWarnings:
    cargoAudit.targetResolution.warnings.unmaintained,
});

console.log(
  "依赖风险处置草案有效：5 项 unic-* 公告已归并到同一上游链；修复已合并但尚未进入稳定 Tauri，具名安全批准仍未完成。",
);
