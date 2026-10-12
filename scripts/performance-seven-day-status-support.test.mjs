import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSevenDayStatus,
  selectSevenDayStatusEvidence,
} from "./performance-seven-day-status-support.mjs";
import {
  expectedSevenDay,
  sevenDayFixture,
} from "./performance-seven-day-test-fixture.mjs";

function launchFor(report) {
  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    runId: report.runId,
    startedAt: new Date(
      Date.parse(report.results.samples[0].recordedAt) - 60_000,
    ).toISOString(),
    requestedDurationMinutes: 10_080,
    sampleIntervalSeconds: 60,
    launcherProcessId: 12_345,
    artifact: {
      sha256: expectedSevenDay.exeSha256,
      sizeBytes: 1_000_000,
    },
    releaseManifest: {
      path: "output/WeatherPoem_0.2.0_RELEASE.json",
      sha256: "C".repeat(64),
    },
    protectedEvidence: [
      { path: "output/a.json", sha256: "D".repeat(64) },
      { path: "output/b.json", sha256: "E".repeat(64) },
      { path: "output/c.json", sha256: "F".repeat(64) },
    ],
    report: "output/WeatherPoem_0.2.0_PERFORMANCE_7D.json",
  };
}

function runningCheckpoint(launch) {
  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    mode: "seven-day",
    status: "running",
    startedAt: launch.startedAt,
    updatedAt: new Date(
      Date.parse(launch.startedAt) + 180_000,
    ).toISOString(),
    requestedDurationMinutes: 10_080,
    sampleIntervalSeconds: 60,
    processId: 54_321,
    sampleCount: 3,
    lastSample: {
      elapsedSeconds: 180,
      recordedAt: new Date(
        Date.parse(launch.startedAt) + 180_000,
      ).toISOString(),
    },
    message: "",
    runId: launch.runId,
  };
}

test("selects a matching running seven-day checkpoint", () => {
  const report = sevenDayFixture();
  const launch = launchFor(report);
  const evidence = selectSevenDayStatusEvidence({
    launch,
    checkpoint: runningCheckpoint(launch),
    report: null,
    expected: expectedSevenDay,
  });

  assert.deepEqual(evidence, {
    source: "checkpoint",
    status: "running",
    message: "",
    processId: 54_321,
    sampleCount: 3,
    elapsedSeconds: 180,
    startedAt: launch.startedAt,
    updatedAt: new Date(
      Date.parse(launch.startedAt) + 180_000,
    ).toISOString(),
    lastSampleAt: new Date(
      Date.parse(launch.startedAt) + 180_000,
    ).toISOString(),
  });
});

test("uses a fully valid formal report after natural completion", () => {
  const report = sevenDayFixture();
  const launch = launchFor(report);
  const evidence = selectSevenDayStatusEvidence({
    launch,
    checkpoint: null,
    report,
    expected: expectedSevenDay,
  });

  assert.equal(evidence.source, "formal-report");
  assert.equal(evidence.status, "completed");
  assert.equal(evidence.processId, null);
  assert.equal(evidence.sampleCount, 10_080);
  assert.equal(evidence.elapsedSeconds, 604_800);
});

test("rejects an eight-hour checkpoint or a mismatched run id", () => {
  const report = sevenDayFixture();
  const launch = launchFor(report);
  const wrongMode = {
    ...runningCheckpoint(launch),
    mode: "eight-hour",
  };
  assert.throws(
    () =>
      selectSevenDayStatusEvidence({
        launch,
        checkpoint: wrongMode,
        report: null,
        expected: expectedSevenDay,
      }),
    /identity or state is invalid/,
  );

  const wrongRun = {
    ...runningCheckpoint(launch),
    runId: "2".repeat(32),
  };
  assert.throws(
    () =>
      selectSevenDayStatusEvidence({
        launch,
        checkpoint: wrongRun,
        report: null,
        expected: expectedSevenDay,
      }),
    /identity or state is invalid/,
  );
});

test("rejects a report from before the launch", () => {
  const report = sevenDayFixture();
  const launch = {
    ...launchFor(report),
    startedAt: new Date(
      Date.parse(report.generatedAt) + 1_000,
    ).toISOString(),
  };

  assert.throws(
    () =>
      selectSevenDayStatusEvidence({
        launch,
        checkpoint: null,
        report,
        expected: expectedSevenDay,
      }),
    /identity or state is invalid/,
  );
});

test("rejects a formal report that overclaims sleep wake coverage", () => {
  const report = sevenDayFixture();
  report.limitations.sleepWakeMeasured = true;
  const launch = launchFor(report);

  assert.throws(
    () =>
      selectSevenDayStatusEvidence({
        launch,
        checkpoint: null,
        report,
        expected: expectedSevenDay,
      }),
    /identity or state is invalid/,
  );
});

test("builds running status only when artifact and protected hashes still match", () => {
  const report = sevenDayFixture();
  const launch = launchFor(report);
  const checkpoint = runningCheckpoint(launch);
  const status = buildSevenDayStatus({
    launch,
    checkpoint,
    report: null,
    expected: expectedSevenDay,
    currentArtifact: {
      sha256: expectedSevenDay.exeSha256,
      sizeBytes: 1_000_000,
    },
    currentReleaseManifestSha256: "C".repeat(64),
    currentProtectedEvidence: launch.protectedEvidence,
    processAlive: (processId) => [12_345, 54_321].includes(processId),
  });

  assert.equal(status.status, "running");
  assert.equal(status.source, "checkpoint");
  assert.equal(status.runId, launch.runId);
  assert.equal(status.message, "");
  assert.equal(status.launcherAlive, true);
  assert.equal(status.appAlive, true);
  assert.equal(status.sampleCount, 3);
  assert.equal(status.progressPercent, 0.03);

  assert.throws(
    () =>
      buildSevenDayStatus({
        launch,
        checkpoint,
        report: null,
        expected: expectedSevenDay,
        currentArtifact: {
          sha256: "B".repeat(64),
          sizeBytes: 1_000_000,
        },
        currentReleaseManifestSha256: "C".repeat(64),
        currentProtectedEvidence: launch.protectedEvidence,
        processAlive: () => true,
      }),
    /frozen candidate/,
  );
});

test("returns failed status when an active launcher process exited", () => {
  const report = sevenDayFixture();
  const launch = launchFor(report);
  const checkpoint = runningCheckpoint(launch);
  const status = buildSevenDayStatus({
    launch,
    checkpoint,
    report: null,
    expected: expectedSevenDay,
    currentArtifact: {
      sha256: expectedSevenDay.exeSha256,
      sizeBytes: 1_000_000,
    },
    currentReleaseManifestSha256: "C".repeat(64),
    currentProtectedEvidence: launch.protectedEvidence,
    processAlive: (processId) => processId === 54_321,
  });

  assert.deepEqual(
    {
      status: status.status,
      message: status.message,
      launcherAlive: status.launcherAlive,
      appAlive: status.appAlive,
    },
    {
      status: "failed",
      message: "Seven-day run says active but the launcher process exited.",
      launcherAlive: false,
      appAlive: true,
    },
  );
});

test("returns failed status when a running app process exited", () => {
  const report = sevenDayFixture();
  const launch = launchFor(report);
  const checkpoint = runningCheckpoint(launch);
  const status = buildSevenDayStatus({
    launch,
    checkpoint,
    report: null,
    expected: expectedSevenDay,
    currentArtifact: {
      sha256: expectedSevenDay.exeSha256,
      sizeBytes: 1_000_000,
    },
    currentReleaseManifestSha256: "C".repeat(64),
    currentProtectedEvidence: launch.protectedEvidence,
    processAlive: (processId) => processId === 12_345,
  });

  assert.deepEqual(
    {
      status: status.status,
      message: status.message,
      launcherAlive: status.launcherAlive,
      appAlive: status.appAlive,
    },
    {
      status: "failed",
      message: "Seven-day run says running but the app process exited.",
      launcherAlive: true,
      appAlive: false,
    },
  );
});
