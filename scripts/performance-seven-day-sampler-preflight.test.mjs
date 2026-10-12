import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import "./performance-seven-day-runtime-support.test.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const scriptPath = path.join(
  projectRoot,
  "scripts",
  "test-performance-long-run.ps1",
);
const runId = "1".repeat(32);
const protectedPaths = [
  "output/WeatherPoem_0.2.0_PERFORMANCE_8H_LAUNCH.json",
  "output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_CHECKPOINT.json",
  "output/WeatherPoem_0.2.0_PERFORMANCE_8H.json",
];
const sevenDayPaths = [
  "output/WeatherPoem_0.2.0_PERFORMANCE_7D_CHECKPOINT.json",
  "output/WeatherPoem_0.2.0_PERFORMANCE_7D.json",
];

function hash(relativePath) {
  const bytes = readFileSync(path.join(projectRoot, relativePath));
  return createHash("sha256").update(bytes).digest("hex");
}

function snapshot(relativePath) {
  return existsSync(path.join(projectRoot, relativePath))
    ? hash(relativePath)
    : null;
}

function runSampler(...extraArguments) {
  return spawnSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      ...extraArguments,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );
}

test("seven-day sampler preflight returns isolated fixed configuration without writes", () => {
  const before = Object.fromEntries(
    protectedPaths.map((relativePath) => [relativePath, hash(relativePath)]),
  );
  const sevenDayBefore = Object.fromEntries(
    sevenDayPaths.map((relativePath) => [
      relativePath,
      snapshot(relativePath),
    ]),
  );

  const result = runSampler(
    "-EvidenceMode",
    "seven-day",
    "-DurationMinutes",
    "10080",
    "-SampleIntervalSeconds",
    "60",
    "-RunId",
    runId,
    "-Preflight",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    stateChanged: false,
    mode: "seven-day",
    runId,
    requestedDurationMinutes: 10_080,
    sampleIntervalSeconds: 60,
    testKind: "performance-seven-day",
    passedResult: "automated-seven-day-passed",
    checkpoint:
      "output/WeatherPoem_0.2.0_PERFORMANCE_7D_CHECKPOINT.json",
    report: "output/WeatherPoem_0.2.0_PERFORMANCE_7D.json",
    continuityProtection: {
      systemSleepPrevented: true,
      automaticSystemSleepPrevented: true,
      userInitiatedSleepPrevented: false,
      displayRequired: false,
      continuousAcPowerRequired: true,
      lidMustRemainOpenUnlessHostPolicyIsDoNothing: true,
      executionStateRenewedEverySample: true,
      maximumSampleGapSeconds: 150,
      failFast: true,
    },
    limitations: {
      eightHourIdleMeasured: true,
      sevenDayLongRunMeasured: true,
      sleepWakeMeasured: false,
      realNetworkMeasured: false,
      namedQualitySignoff: false,
    },
  });
  for (const relativePath of protectedPaths) {
    assert.equal(hash(relativePath), before[relativePath]);
  }
  for (const relativePath of sevenDayPaths) {
    assert.equal(snapshot(relativePath), sevenDayBefore[relativePath]);
  }
});

test("seven-day sampler rejects a duration other than exactly 10080 minutes", () => {
  const result = runSampler(
    "-EvidenceMode",
    "seven-day",
    "-DurationMinutes",
    "10079",
    "-SampleIntervalSeconds",
    "60",
    "-RunId",
    runId,
    "-Preflight",
  );

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /Seven-day evidence must run for exactly 10080 minutes/,
  );
});

test("seven-day runtime rechecks AC power, renews the lease, and retries cleanup", () => {
  const source = readFileSync(scriptPath, "utf8");
  const loopStart = source.indexOf(
    "while ($measurement.Elapsed.TotalMinutes -lt $DurationMinutes)",
  );
  const loopSource = source.slice(loopStart);

  assert.ok(loopStart >= 0, "sampling loop is missing");
  assert.match(loopSource, /Assert-SevenDayAcPower/);
  assert.match(loopSource, /Enter-SevenDayExecutionState/);
  assert.match(source, /for \(\$attempt = 1; \$attempt -le 10; \$attempt\+\+\)/);
  assert.match(
    source,
    /Could not remove the isolated seven-day profile after ten retries/,
  );
});
