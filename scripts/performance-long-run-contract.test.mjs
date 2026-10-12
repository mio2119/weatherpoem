import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  validateLongRunRehearsal,
} from "./performance-long-run-support.mjs";

const HASH = "A".repeat(64);

function fixture() {
  const startedAt = Date.now() - 120_000;
  const samples = Array.from({ length: 24 }, (_, index) => ({
    elapsedSeconds: (index + 1) * 5,
    workingSetMiB: 32 + index * 0.01,
    totalProcessorTimeMs: 10,
    recordedAt: new Date(
      startedAt + (index + 1) * 5_000,
    ).toISOString(),
  }));
  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt: new Date().toISOString(),
    testKind: "performance-long-run-rehearsal",
    artifact: {
      path: "src-tauri/target/release/weatherpoem.exe",
      sha256: HASH,
      sizeBytes: 1_000_000,
    },
    configuration: {
      mode: "rehearsal",
      requestedDurationMinutes: 2,
      sampleIntervalSeconds: 5,
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
      actualDurationSeconds: 120,
      sampleCount: samples.length,
      samples,
      closeRequestAccepted: true,
      processStayedAlive: true,
      cpuTimeDeltaMs: 0,
      cpuAveragePercent: 0,
      memoryP95MiB: 32.22,
      memoryGrowthMiB: 0.23,
      durationSatisfied: true,
      cpuThresholdSatisfied: true,
      memoryThresholdSatisfied: true,
      memoryGrowthThresholdSatisfied: true,
    },
    limitations: {
      eightHourIdleMeasured: false,
      sevenDayLongRunMeasured: false,
      sleepWakeMeasured: false,
      realNetworkMeasured: false,
      namedQualitySignoff: false,
    },
    gateSatisfied: false,
    result: "automated-rehearsal-passed",
  };
}

test("two-minute rehearsal proves the harness but not eight-hour stability", () => {
  assert.doesNotThrow(() =>
    validateLongRunRehearsal(fixture(), {
      appVersion: "0.2.0",
      exeSha256: HASH,
    }),
  );
});

test("short duration, forged metrics, and an exited process are rejected", () => {
  const short = fixture();
  short.results.actualDurationSeconds = 60;
  assert.throws(
    () =>
      validateLongRunRehearsal(short, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /duration/,
  );

  const forgedMemory = fixture();
  forgedMemory.results.memoryP95MiB = 1;
  assert.throws(
    () =>
      validateLongRunRehearsal(forgedMemory, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /memory conclusions/,
  );

  const forgedCpu = fixture();
  forgedCpu.results.cpuAveragePercent = 0.1;
  assert.throws(
    () =>
      validateLongRunRehearsal(forgedCpu, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /CPU conclusions/,
  );

  const exited = fixture();
  exited.results.processStayedAlive = false;
  assert.throws(
    () =>
      validateLongRunRehearsal(exited, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /process survival/,
  );
});

test("rehearsal cannot claim full-duration or named approval evidence", () => {
  for (const key of [
    "eightHourIdleMeasured",
    "sevenDayLongRunMeasured",
    "namedQualitySignoff",
  ]) {
    const report = fixture();
    report.limitations[key] = true;
    assert.throws(
      () =>
        validateLongRunRehearsal(report, {
          appVersion: "0.2.0",
          exeSha256: HASH,
        }),
      /cannot claim/,
    );
  }
});

test("Windows launcher primes the lazy process environment before indexing it", async () => {
  const script = await readFile(
    new URL("./test-performance-long-run.ps1", import.meta.url),
    "utf8",
  );

  const prime = script.indexOf(
    "[void]$startInfo.EnvironmentVariables",
  );
  const firstWrite = script.indexOf(
    '$startInfo.EnvironmentVariables["APPDATA"] = $appData',
  );
  const finalWrite = script.indexOf(
    '$startInfo.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_SCENARIO"] = "weather-offline"',
  );

  assert.ok(prime > 0);
  assert.ok(firstWrite > prime);
  assert.ok(finalWrite > firstWrite);
});
