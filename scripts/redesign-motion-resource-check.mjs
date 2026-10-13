import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA256 = /^[A-F0-9]{64}$/;

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label} must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} differs from raw samples`);
}

function p95(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

function checkRun(run, label, scenario) {
  assert.equal(run.label, label);
  assert.equal(run.reduceMotion, label === "static");
  assert.equal(run.readyMarker.schemaVersion, "1.2");
  assert.equal(run.readyMarker.runId, run.runId);
  assert.equal(run.readyMarker.readyView, "poem");
  assert.equal(run.readyMarker.performanceScenario, scenario);
  assert.ok(run.readyMarker.readyMode === "offline-rules" || run.readyMarker.readyMode === "live-weather");
  assert.ok(typeof run.dailyState.local_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(run.dailyState.local_date));
  assert.ok(typeof run.dailyState.work_id === "string" && run.dailyState.work_id.length > 0);
  assert.ok(run.dailyState.state === "shown" || run.dailyState.state === "retained");
  assert.ok(Array.isArray(run.processIds) && run.processIds.length >= 2);
  assert.ok(run.processIds.includes(run.readyMarker.processId));
  assert.ok(run.rendererCount >= 1);
  assert.equal(run.processorCount > 0, true);
  assert.equal(run.sampleCount, 60);
  assert.equal(run.samples.length, run.sampleCount);
  assert.ok(run.durationSeconds >= 60);

  let previousElapsed = 0;
  for (const [index, sample] of run.samples.entries()) {
    assert.equal(sample.index, index + 1);
    assert.ok(sample.elapsedMs > previousElapsed);
    assert.ok(sample.cpuDeltaMs >= 0 && Number.isFinite(sample.cpuDeltaMs));
    assert.ok(sample.memoryMiB > 0 && Number.isFinite(sample.memoryMiB));
    assert.ok(sample.rendererCount >= 1);
    previousElapsed = sample.elapsedMs;
  }
  near(previousElapsed / 1000, run.durationSeconds, 1, `${label} duration`);
  const cpuTotal = run.samples.reduce((total, sample) => total + sample.cpuDeltaMs, 0);
  near(run.cpuTimeDeltaMs, cpuTotal, 0.02, `${label} CPU time`);
  const recomputedCpu = (cpuTotal / (run.durationSeconds * 1000 * run.processorCount)) * 100;
  near(run.cpuAveragePercent, recomputedCpu, 0.002, `${label} CPU percent`);
  const recomputedMemory = p95(run.samples.map((sample) => sample.memoryMiB));
  near(run.memoryP95MiB, recomputedMemory, 0.011, `${label} memory P95`);
}

export function validateMotionResourceReport(report, exeBytes) {
  assert.equal(report.schemaVersion, "1.0");
  assert.equal(report.testKind, "isolated-motion-resource-comparison");
  assert.equal(report.scenario, "scene-rain");
  assert.equal(report.isolation.profile, "system-temp-only");
  assert.equal(report.isolation.realUserDataTouched, false);
  assert.equal(report.isolation.sameProfileForBothRuns, true);
  assert.deepEqual(report.isolation.order, ["static", "motion"]);
  assert.ok(SHA256.test(report.artifact.sha256));
  const actualHash = createHash("sha256").update(exeBytes).digest("hex").toUpperCase();
  assert.equal(report.artifact.sha256, actualHash, "report is bound to a different EXE");
  assert.equal(report.thresholds.cpuIncreasePercentagePoints, 2);
  assert.equal(report.thresholds.memoryP95IncreaseMiB, 20);

  const { static: staticRun, motion: motionRun } = report.results;
  checkRun(staticRun, "static", report.scenario);
  checkRun(motionRun, "motion", report.scenario);
  assert.notEqual(staticRun.runId, motionRun.runId);
  const samePoem = staticRun.dailyState.local_date === motionRun.dailyState.local_date &&
    staticRun.dailyState.work_id === motionRun.dailyState.work_id;
  assert.equal(report.results.samePoemAndLocalDate, samePoem);
  assert.equal(samePoem, true);
  const cpuDelta = motionRun.cpuAveragePercent - staticRun.cpuAveragePercent;
  const memoryDelta = motionRun.memoryP95MiB - staticRun.memoryP95MiB;
  near(report.results.cpuIncreasePercentagePoints, cpuDelta, 0.00011, "CPU delta");
  near(report.results.memoryP95IncreaseMiB, memoryDelta, 0.011, "memory delta");
  const thresholdSatisfied = cpuDelta <= 2 && memoryDelta <= 20;
  assert.equal(report.results.resourceThresholdSatisfied, thresholdSatisfied);
  assert.equal(report.result, thresholdSatisfied ? "resource-comparison-passed" : "resource-comparison-failed");
  assert.equal(report.limitations.syntheticWeatherNotRealLocalWeather, true);
  assert.equal(report.limitations.a7OverallSatisfied, false);
  return { cpuDelta, memoryDelta, thresholdSatisfied };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const candidateName = process.argv[2] ?? "motion-20261013";
  assert.match(candidateName, /^[a-z0-9][a-z0-9-]{0,39}$/);
  const expectedArtifact = `.work/redesign-${candidateName}/release/weatherpoem.exe`;
  const reportPath = path.join(projectRoot, "review", "redesign", "evidence", `T07_MOTION_RESOURCE_${candidateName}.json`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(report.artifact.path, expectedArtifact);
  const exeBytes = readFileSync(path.join(projectRoot, expectedArtifact));
  const result = validateMotionResourceReport(report, exeBytes);
  assert.equal(result.thresholdSatisfied, true, "resource thresholds were not met");
  console.log(`A7 isolated resource comparison verified: ${reportPath}`);
}
