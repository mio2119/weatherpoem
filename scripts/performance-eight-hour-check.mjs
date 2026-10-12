import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERFORMANCE_EIGHT_HOUR_REPORT,
  validateEightHourPerformance,
} from "./performance-long-run-support.mjs";

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
const exeSha256 = createHash("sha256")
  .update(await readFile(exePath))
  .digest("hex")
  .toUpperCase();
const report = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      ...PERFORMANCE_EIGHT_HOUR_REPORT.split("/"),
    ),
    "utf8",
  ),
);

validateEightHourPerformance(report, {
  appVersion: packageJson.version,
  exeSha256,
});
console.log(
  "Eight-hour tray evidence is valid and bound to the current EXE; seven-day, sleep/wake, real-network, and named approval remain open.",
);
