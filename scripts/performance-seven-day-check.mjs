import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PERFORMANCE_SEVEN_DAY_REPORT,
  validateSevenDayPerformance,
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
      ...PERFORMANCE_SEVEN_DAY_REPORT.split("/"),
    ),
    "utf8",
  ),
);

validateSevenDayPerformance(report, {
  appVersion: packageJson.version,
  exeSha256,
});
console.log(
  "Seven-day tray evidence is valid and bound to the current EXE; sleep/wake, real-network, content/update recovery, event backlog, and named approval remain open.",
);
