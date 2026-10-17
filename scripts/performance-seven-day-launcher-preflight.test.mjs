import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const launcherPath = path.join(
  projectRoot,
  "scripts",
  "start-performance-seven-day.ps1",
);
const exeRelativePath =
  "src-tauri/target/release/weatherpoem.exe";
const protectedPaths = [
  "output/WeatherPoem_0.2.0_PERFORMANCE_8H_LAUNCH.json",
  "output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_CHECKPOINT.json",
  "output/WeatherPoem_0.2.0_PERFORMANCE_8H.json",
];
const sevenDayPaths = [
  "output/WeatherPoem_0.2.0_PERFORMANCE_7D_LAUNCH.json",
  "output/WeatherPoem_0.2.0_PERFORMANCE_7D_CHECKPOINT.json",
  "output/WeatherPoem_0.2.0_PERFORMANCE_7D.json",
];

function snapshot(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  const bytes = readFileSync(absolutePath);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    sizeBytes: bytes.length,
    modifiedMs: statSync(absolutePath).mtimeMs,
  };
}

test("launcher preflight binds the release candidate and changes no evidence", () => {
  const before = Object.fromEntries(
    [exeRelativePath, ...protectedPaths].map((relativePath) => [
      relativePath,
      snapshot(relativePath),
    ]),
  );
  const sevenDayBefore = Object.fromEntries(
    sevenDayPaths.map((relativePath) => [
      relativePath,
      existsSync(path.join(projectRoot, relativePath)),
    ]),
  );

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      launcherPath,
      "-Preflight",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.stateChanged, false);
  assert.equal(typeof plan.hostReadiness.acOnline, "boolean");
  assert.equal(plan.readyForLaunch, plan.hostReadiness.acOnline);
  assert.equal(plan.hostReadiness.userInitiatedSleepPrevented, false);
  assert.deepEqual(plan.operatorRequirements, {
    keepConnectedToAcPower: true,
    doNotCloseLidUnlessLidActionIsDoNothing: true,
    doNotSelectSleepOrHibernate: true,
  });
  assert.equal(plan.appVersion, "0.2.0");
  assert.match(plan.runId, /^[a-f0-9]{32}$/);
  assert.deepEqual(plan.configuration, {
    mode: "seven-day",
    requestedDurationMinutes: 10_080,
    sampleIntervalSeconds: 60,
  });
  assert.deepEqual(plan.artifact, {
    path: exeRelativePath,
    sha256: before[exeRelativePath].sha256,
    sizeBytes: before[exeRelativePath].sizeBytes,
  });
  assert.equal(
    plan.releaseManifest.path,
    "output/WeatherPoem_0.2.0_RELEASE.json",
  );
  assert.match(plan.releaseManifest.sha256, /^[A-F0-9]{64}$/);
  assert.deepEqual(
    plan.protectedEvidence.map((item) => item.path),
    protectedPaths,
  );
  assert.equal(
    plan.launch,
    "output/WeatherPoem_0.2.0_PERFORMANCE_7D_LAUNCH.json",
  );
  assert.equal(
    plan.checkpoint,
    "output/WeatherPoem_0.2.0_PERFORMANCE_7D_CHECKPOINT.json",
  );
  assert.equal(
    plan.report,
    "output/WeatherPoem_0.2.0_PERFORMANCE_7D.json",
  );
  assert.deepEqual(plan.samplerArguments.slice(-8), [
    "-EvidenceMode",
    "seven-day",
    "-DurationMinutes",
    "10080",
    "-SampleIntervalSeconds",
    "60",
    "-RunId",
    plan.runId,
  ]);

  for (const relativePath of [exeRelativePath, ...protectedPaths]) {
    assert.deepEqual(snapshot(relativePath), before[relativePath]);
  }
  for (const relativePath of sevenDayPaths) {
    assert.equal(
      existsSync(path.join(projectRoot, relativePath)),
      sevenDayBefore[relativePath],
    );
  }
});

test("npm exposes the seven-day start preflight command", () => {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "npm.cmd run performance:seven-day:start -- -Preflight",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const jsonStart = result.stdout.indexOf("{");
  assert.ok(jsonStart >= 0, result.stdout);
  const plan = JSON.parse(result.stdout.slice(jsonStart));
  assert.equal(plan.stateChanged, false);
  assert.equal(typeof plan.hostReadiness.acOnline, "boolean");
  assert.equal(plan.readyForLaunch, plan.hostReadiness.acOnline);
});
