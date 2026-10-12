import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { selectEightHourStatusEvidence } from "./performance-eight-hour-status-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.join(projectRoot, "output");
const launch = JSON.parse(
  await readFile(
    path.join(
      outputDirectory,
      "WeatherPoem_0.2.0_PERFORMANCE_8H_LAUNCH.json",
    ),
    "utf8",
  ),
);
const checkpoint = JSON.parse(
  await readFile(
    path.join(
      outputDirectory,
      "WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_CHECKPOINT.json",
    ),
    "utf8",
  ),
);
const report = JSON.parse(
  await readFile(
    path.join(outputDirectory, "WeatherPoem_0.2.0_PERFORMANCE_8H.json"),
    "utf8",
  ),
);
const exeSha256 = createHash("sha256")
  .update(
    await readFile(
      path.join(
        projectRoot,
        "src-tauri",
        "target",
        "release",
        "weatherpoem.exe",
      ),
    ),
  )
  .digest("hex")
  .toUpperCase();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function processAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

assert(
  launch.schemaVersion === "1.0" &&
    launch.product === "WeatherPoem" &&
    launch.appVersion === "0.2.0" &&
    launch.requestedDurationMinutes === 480 &&
    launch.sampleIntervalSeconds === 60 &&
    launch.artifact.sha256 === exeSha256,
  "Eight-hour launch record is not bound to the frozen candidate.",
);
const evidence = selectEightHourStatusEvidence({
  launch,
  checkpoint,
  report,
  exeSha256,
});

const launcherAlive = processAlive(launch.launcherProcessId);
const appAlive = Number.isInteger(evidence.processId)
  ? processAlive(evidence.processId)
  : false;
if (evidence.status === "running") {
  assert(
    launcherAlive && appAlive,
    "Eight-hour run says running but a required process exited.",
  );
}

const elapsedSeconds = evidence.elapsedSeconds;
const progressPercent = Math.min(
  100,
  (elapsedSeconds / (480 * 60)) * 100,
);
console.log(
  JSON.stringify(
    {
      status: evidence.status,
      source: evidence.source,
      runId: launch.runId,
      artifactSha256: exeSha256,
      launcherProcessId: launch.launcherProcessId,
      launcherAlive,
      appProcessId: evidence.processId,
      appAlive,
      sampleCount: evidence.sampleCount,
      elapsedSeconds,
      progressPercent: Number(progressPercent.toFixed(3)),
      startedAt: evidence.startedAt,
      updatedAt: evidence.updatedAt,
      report:
        evidence.status === "completed"
          ? launch.report
          : null,
    },
    null,
    2,
  ),
);
