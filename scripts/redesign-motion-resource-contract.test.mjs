import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validateMotionResourceReport } from "./redesign-motion-resource-check.mjs";

const exeBytes = Buffer.from("isolated-test-exe");
const sha256 = createHash("sha256").update(exeBytes).digest("hex").toUpperCase();

function run(label, cpuDeltaMs, memoryMiB) {
  const runId = label === "static" ? "static-run" : "motion-run";
  return {
    label,
    reduceMotion: label === "static",
    runId,
    readyMarker: {
      schemaVersion: "1.2",
      runId,
      processId: label === "static" ? 100 : 200,
      readyView: "poem",
      readyMode: "offline-rules",
      performanceScenario: "scene-rain",
    },
    dailyState: { local_date: "2026-10-13", state: "shown", work_id: "poem-a" },
    durationSeconds: 60,
    sampleCount: 60,
    processIds: label === "static" ? [100, 101] : [200, 201],
    rendererCount: 1,
    processorCount: 20,
    cpuTimeDeltaMs: cpuDeltaMs * 60,
    cpuAveragePercent: (cpuDeltaMs * 60) / (60_000 * 20) * 100,
    memoryP95MiB: memoryMiB,
    samples: Array.from({ length: 60 }, (_, index) => ({
      index: index + 1,
      elapsedMs: (index + 1) * 1000,
      cpuDeltaMs,
      memoryMiB,
      rendererCount: 1,
    })),
  };
}

function report() {
  return {
    schemaVersion: "1.0",
    testKind: "isolated-motion-resource-comparison",
    scenario: "scene-rain",
    artifact: { sha256 },
    isolation: {
      profile: "system-temp-only",
      realUserDataTouched: false,
      sameProfileForBothRuns: true,
      order: ["static", "motion"],
    },
    thresholds: { cpuIncreasePercentagePoints: 2, memoryP95IncreaseMiB: 20 },
    results: {
      static: run("static", 10, 100),
      motion: run("motion", 20, 110),
      samePoemAndLocalDate: true,
      cpuIncreasePercentagePoints: 0.05,
      memoryP95IncreaseMiB: 10,
      resourceThresholdSatisfied: true,
    },
    limitations: { syntheticWeatherNotRealLocalWeather: true, a7OverallSatisfied: false },
    result: "resource-comparison-passed",
  };
}

test("同诗境静动资源报告由原始样本重算且绑定 EXE", () => {
  const result = validateMotionResourceReport(report(), exeBytes);
  assert.equal(result.thresholdSatisfied, true);
});

test("样本、作品、哈希或隔离声明被篡改时拒绝报告", () => {
  const alteredSample = report();
  alteredSample.results.motion.samples[0].cpuDeltaMs = 100;
  assert.throws(() => validateMotionResourceReport(alteredSample, exeBytes));

  const alteredPoem = report();
  alteredPoem.results.motion.dailyState.work_id = "poem-b";
  assert.throws(() => validateMotionResourceReport(alteredPoem, exeBytes));

  const alteredHash = report();
  alteredHash.artifact.sha256 = "A".repeat(64);
  assert.throws(() => validateMotionResourceReport(alteredHash, exeBytes));

  const alteredIsolation = report();
  alteredIsolation.isolation.realUserDataTouched = true;
  assert.throws(() => validateMotionResourceReport(alteredIsolation, exeBytes));
});
