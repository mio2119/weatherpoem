import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERFORMANCE_LONG_RUN_REHEARSAL_REPORT,
  validateLongRunRehearsal,
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
      ...PERFORMANCE_LONG_RUN_REHEARSAL_REPORT.split("/"),
    ),
    "utf8",
  ),
);

validateLongRunRehearsal(report, {
  appVersion: packageJson.version,
  exeSha256,
});
console.log(
  "Long-run rehearsal evidence is valid: isolated tray sampling passed; eight-hour, seven-day, and sleep/wake evidence remain open.",
);
