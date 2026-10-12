export const PERFORMANCE_LONG_RUN_REHEARSAL_REPORT =
  "output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_REHEARSAL.json";
export const PERFORMANCE_EIGHT_HOUR_REPORT =
  "output/WeatherPoem_0.2.0_PERFORMANCE_8H.json";
export const PERFORMANCE_SEVEN_DAY_REPORT =
  "output/WeatherPoem_0.2.0_PERFORMANCE_7D.json";

const MODE_CONTRACTS = {
  rehearsal: {
    minimumMinutes: 2,
    maximumMinutes: 30,
    testKind: "performance-long-run-rehearsal",
    result: "automated-rehearsal-passed",
    eightHourMeasured: false,
    sevenDayMeasured: false,
  },
  "eight-hour": {
    minimumMinutes: 480,
    maximumMinutes: 1_440,
    testKind: "performance-eight-hour",
    result: "automated-eight-hour-passed",
    eightHourMeasured: true,
    sevenDayMeasured: false,
  },
  "seven-day": {
    minimumMinutes: 10_080,
    maximumMinutes: 10_080,
    testKind: "performance-seven-day",
    result: "automated-seven-day-passed",
    eightHourMeasured: true,
    sevenDayMeasured: true,
    maximumSampleGapSeconds: 150,
    minimumUtcDateCount: 7,
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort()),
    `${label} fields do not match the contract`,
  );
}

function p95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function near(left, right, tolerance = 0.02) {
  return Math.abs(left - right) <= tolerance;
}

function validateLongRunReport(report, expected, mode) {
  const modeContract = MODE_CONTRACTS[mode];
  assert(modeContract, "long-run validation mode is invalid");
  const isRehearsal = mode === "rehearsal";
  const isSevenDay = mode === "seven-day";

  exactKeys(
    report,
    [
      "schemaVersion",
      "product",
      "appVersion",
      "generatedAt",
      "testKind",
      "artifact",
      "configuration",
      "startup",
      "thresholds",
      "results",
      "limitations",
      "gateSatisfied",
      "result",
      ...(isSevenDay ? ["runId"] : []),
    ],
    "long-run report",
  );
  assert(
    report.schemaVersion === "1.0" &&
      report.product === "WeatherPoem" &&
      report.appVersion === expected.appVersion &&
      report.testKind === modeContract.testKind &&
      (!isSevenDay || /^[a-f0-9]{32}$/i.test(report.runId)),
    "long-run report identity does not match",
  );
  assert(
    Number.isFinite(Date.parse(report.generatedAt)) &&
      Date.parse(report.generatedAt) <= Date.now() + 10 * 60 * 1000,
    "long-run report generation time is invalid",
  );
  exactKeys(
    report.artifact,
    ["path", "sha256", "sizeBytes"],
    "long-run artifact",
  );
  assert(
    report.artifact.path ===
        "src-tauri/target/release/weatherpoem.exe" &&
      report.artifact.sha256 === expected.exeSha256 &&
      /^[A-F0-9]{64}$/.test(report.artifact.sha256) &&
      Number.isInteger(report.artifact.sizeBytes) &&
      report.artifact.sizeBytes > 0,
    "long-run report is not bound to the current release EXE",
  );

  exactKeys(
    report.configuration,
    [
      "mode",
      "requestedDurationMinutes",
      "sampleIntervalSeconds",
      "processorCount",
      "isolatedProfile",
      "controlledScenario",
      "realUserDataTouched",
      "closedToTray",
    ],
    "long-run configuration",
  );
  assert(
    report.configuration.mode === mode &&
      report.configuration.requestedDurationMinutes >=
        modeContract.minimumMinutes &&
      report.configuration.requestedDurationMinutes <=
        modeContract.maximumMinutes &&
      report.configuration.sampleIntervalSeconds >= 5 &&
      report.configuration.sampleIntervalSeconds <= 300 &&
      Number.isInteger(report.configuration.processorCount) &&
      report.configuration.processorCount > 0 &&
      report.configuration.isolatedProfile === true &&
      report.configuration.controlledScenario ===
        "weather-offline" &&
      report.configuration.realUserDataTouched === false &&
      report.configuration.closedToTray === true,
    "long-run report did not use the controlled isolated tray setup",
  );
  exactKeys(
    report.startup,
    [
      "readyView",
      "readyMode",
      "performanceScenario",
      "nativeReadyMs",
      "frontendReadyMs",
      "viewRenderMs",
    ],
    "long-run startup",
  );
  assert(
    report.startup.readyView === "poem" &&
      report.startup.readyMode === "offline-rules" &&
      report.startup.performanceScenario === "weather-offline" &&
      Number.isFinite(report.startup.nativeReadyMs) &&
      report.startup.nativeReadyMs > 0 &&
      Number.isFinite(report.startup.frontendReadyMs) &&
      report.startup.frontendReadyMs > 0 &&
      Number.isFinite(report.startup.viewRenderMs) &&
      report.startup.viewRenderMs > 0,
    "long-run report did not enter the controlled offline poem view",
  );
  exactKeys(
    report.thresholds,
    [
      "idleCpuAveragePercent",
      "idleMemoryP95MiB",
      "memoryGrowthMiB",
    ],
    "long-run thresholds",
  );
  assert(
    report.thresholds.idleCpuAveragePercent === 0.2 &&
      report.thresholds.idleMemoryP95MiB === 100 &&
      report.thresholds.memoryGrowthMiB === 20,
    "long-run thresholds were changed",
  );

  const results = report.results;
  exactKeys(
    results,
    [
      "actualDurationSeconds",
      "sampleCount",
      "samples",
      "closeRequestAccepted",
      "processStayedAlive",
      "cpuTimeDeltaMs",
      "cpuAveragePercent",
      "memoryP95MiB",
      "memoryGrowthMiB",
      "durationSatisfied",
      "cpuThresholdSatisfied",
      "memoryThresholdSatisfied",
      "memoryGrowthThresholdSatisfied",
    ],
    "long-run results",
  );
  const requestedSeconds =
    report.configuration.requestedDurationMinutes * 60;
  const minimumSampleCount = Math.floor(
    requestedSeconds /
      report.configuration.sampleIntervalSeconds,
  );
  assert(
    Array.isArray(results.samples) &&
      results.samples.length === results.sampleCount &&
      results.sampleCount >= minimumSampleCount,
    "long-run report has too few resource samples",
  );
  let previousElapsed = 0;
  let previousRecordedAt = 0;
  const observedUtcDates = new Set();
  for (const sample of results.samples) {
    exactKeys(
      sample,
      [
        "elapsedSeconds",
        "workingSetMiB",
        "totalProcessorTimeMs",
        "recordedAt",
      ],
      "long-run sample",
    );
    const recordedAt = Date.parse(sample.recordedAt);
    assert(
      Number.isFinite(sample.elapsedSeconds) &&
        sample.elapsedSeconds > previousElapsed &&
        Number.isFinite(sample.workingSetMiB) &&
        sample.workingSetMiB >= 0 &&
        Number.isFinite(sample.totalProcessorTimeMs) &&
        sample.totalProcessorTimeMs >= 0 &&
        Number.isFinite(recordedAt) &&
        recordedAt > previousRecordedAt,
      "long-run sample contains invalid or non-monotonic values",
    );
    if (isSevenDay && previousElapsed > 0) {
      assert(
        sample.elapsedSeconds - previousElapsed <=
            modeContract.maximumSampleGapSeconds &&
          (recordedAt - previousRecordedAt) / 1000 <=
            modeContract.maximumSampleGapSeconds,
        "seven-day sample continuity exceeded 150 seconds",
      );
    }
    observedUtcDates.add(sample.recordedAt.slice(0, 10));
    previousElapsed = sample.elapsedSeconds;
    previousRecordedAt = recordedAt;
  }
  if (isSevenDay) {
    assert(
      observedUtcDates.size >= modeContract.minimumUtcDateCount,
      "seven-day evidence does not cover enough UTC dates",
    );
  }
  assert(
    results.actualDurationSeconds >= requestedSeconds &&
      previousElapsed >= requestedSeconds &&
      results.durationSatisfied === true &&
      results.closeRequestAccepted === true &&
      results.processStayedAlive === true,
    "long-run duration, tray behavior, or process survival is invalid",
  );

  const memoryValues = results.samples.map(
    (sample) => sample.workingSetMiB,
  );
  const memoryP95 = p95(memoryValues);
  const memoryGrowth =
    memoryValues.at(-1) - memoryValues[0];
  assert(
    near(results.memoryP95MiB, memoryP95) &&
      near(results.memoryGrowthMiB, memoryGrowth) &&
      results.memoryThresholdSatisfied ===
        (memoryP95 < report.thresholds.idleMemoryP95MiB) &&
      results.memoryGrowthThresholdSatisfied ===
        (memoryGrowth < report.thresholds.memoryGrowthMiB),
    "long-run memory conclusions cannot be recomputed",
  );

  const cpuAveragePercent =
    (results.cpuTimeDeltaMs /
      (results.actualDurationSeconds *
        1000 *
        report.configuration.processorCount)) *
    100;
  assert(
    Number.isFinite(results.cpuTimeDeltaMs) &&
      results.cpuTimeDeltaMs >= 0 &&
      near(results.cpuAveragePercent, cpuAveragePercent) &&
      results.cpuThresholdSatisfied ===
        (cpuAveragePercent <
          report.thresholds.idleCpuAveragePercent),
    "long-run CPU conclusions cannot be recomputed",
  );

  exactKeys(
    report.limitations,
    [
      "eightHourIdleMeasured",
      "sevenDayLongRunMeasured",
      "sleepWakeMeasured",
      "realNetworkMeasured",
      "namedQualitySignoff",
    ],
    "long-run limitations",
  );
  assert(
    report.limitations.eightHourIdleMeasured ===
        modeContract.eightHourMeasured &&
      report.limitations.sevenDayLongRunMeasured ===
        modeContract.sevenDayMeasured &&
      report.limitations.sleepWakeMeasured === false &&
      report.limitations.realNetworkMeasured === false &&
      report.limitations.namedQualitySignoff === false &&
      report.gateSatisfied === false,
    isRehearsal
      ? "a rehearsal cannot claim eight-hour, seven-day, or named approval"
      : isSevenDay
        ? "seven-day evidence cannot claim sleep/wake, network, or named approval"
        : "eight-hour evidence cannot claim seven-day, network, or named approval",
  );

  const passed =
    results.durationSatisfied &&
    results.cpuThresholdSatisfied &&
    results.memoryThresholdSatisfied &&
    results.memoryGrowthThresholdSatisfied &&
    results.processStayedAlive;
  assert(
    report.result === modeContract.result && passed,
    "long-run report result is inconsistent or failed",
  );
}

export function validateLongRunRehearsal(report, expected) {
  validateLongRunReport(report, expected, "rehearsal");
}

export function validateEightHourPerformance(report, expected) {
  validateLongRunReport(report, expected, "eight-hour");
}

export function validateSevenDayPerformance(report, expected) {
  validateLongRunReport(report, expected, "seven-day");
}
