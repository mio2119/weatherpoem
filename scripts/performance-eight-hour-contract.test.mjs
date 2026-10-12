import assert from "node:assert/strict";
import test from "node:test";
import {
  validateEightHourPerformance,
} from "./performance-long-run-support.mjs";

const HASH = "A".repeat(64);

function fixture() {
  const generatedAt = Date.now();
  const samples = Array.from({ length: 480 }, (_, index) => ({
    elapsedSeconds: (index + 1) * 60,
    workingSetMiB: 34 + index * 0.001,
    totalProcessorTimeMs: 50,
    recordedAt: new Date(
      generatedAt - (479 - index) * 60 * 1000,
    ).toISOString(),
  }));
  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt: new Date(generatedAt).toISOString(),
    testKind: "performance-eight-hour",
    artifact: {
      path: "src-tauri/target/release/weatherpoem.exe",
      sha256: HASH,
      sizeBytes: 1_000_000,
    },
    configuration: {
      mode: "eight-hour",
      requestedDurationMinutes: 480,
      sampleIntervalSeconds: 60,
      processorCount: 8,
      isolatedProfile: true,
      controlledScenario: "weather-offline",
      realUserDataTouched: false,
      closedToTray: true,
    },
    startup: {
      readyView: "poem",
      readyMode: "offline-rules",
      performanceScenario: "weather-offline",
      nativeReadyMs: 600,
      frontendReadyMs: 400,
      viewRenderMs: 50,
    },
    thresholds: {
      idleCpuAveragePercent: 0.2,
      idleMemoryP95MiB: 100,
      memoryGrowthMiB: 20,
    },
    results: {
      actualDurationSeconds: 28_800,
      sampleCount: samples.length,
      samples,
      closeRequestAccepted: true,
      processStayedAlive: true,
      cpuTimeDeltaMs: 0,
      cpuAveragePercent: 0,
      memoryP95MiB: 34.455,
      memoryGrowthMiB: 0.479,
      durationSatisfied: true,
      cpuThresholdSatisfied: true,
      memoryThresholdSatisfied: true,
      memoryGrowthThresholdSatisfied: true,
    },
    limitations: {
      eightHourIdleMeasured: true,
      sevenDayLongRunMeasured: false,
      sleepWakeMeasured: false,
      realNetworkMeasured: false,
      namedQualitySignoff: false,
    },
    gateSatisfied: false,
    result: "automated-eight-hour-passed",
  };
}

const expected = {
  appVersion: "0.2.0",
  exeSha256: HASH,
};

test("formal report proves eight hours without claiming wider gates", () => {
  assert.doesNotThrow(() =>
    validateEightHourPerformance(fixture(), expected),
  );
});

test("rounded zero working-set samples remain valid while the process stayed alive", () => {
  const trimmed = fixture();
  trimmed.results.samples[255].workingSetMiB = 0;
  trimmed.results.memoryP95MiB = 34.456;

  assert.doesNotThrow(() =>
    validateEightHourPerformance(trimmed, expected),
  );
});

test("negative working-set samples are rejected", () => {
  const invalid = fixture();
  invalid.results.samples[255].workingSetMiB = -0.01;

  assert.throws(
    () => validateEightHourPerformance(invalid, expected),
    /invalid or non-monotonic values/,
  );
});

test("short duration and missing samples are rejected", () => {
  const short = fixture();
  short.results.actualDurationSeconds = 3_600;
  assert.throws(
    () => validateEightHourPerformance(short, expected),
    /duration/,
  );

  const sparse = fixture();
  sparse.results.samples = sparse.results.samples.slice(0, 60);
  sparse.results.sampleCount = 60;
  assert.throws(
    () => validateEightHourPerformance(sparse, expected),
    /too few resource samples/,
  );
});

test("forged metrics and wider gate claims are rejected", () => {
  const forged = fixture();
  forged.results.memoryP95MiB = 1;
  assert.throws(
    () => validateEightHourPerformance(forged, expected),
    /memory conclusions/,
  );

  const overclaim = fixture();
  overclaim.limitations.sevenDayLongRunMeasured = true;
  assert.throws(
    () => validateEightHourPerformance(overclaim, expected),
    /cannot claim seven-day/,
  );
});
