export const HASH = "A".repeat(64);
export const SAMPLE_COUNT = 10_080;

export function sevenDayFixture() {
  const generatedAt = Date.now() - 1_000;
  const startedAt = generatedAt - SAMPLE_COUNT * 60_000;
  const samples = Array.from(
    { length: SAMPLE_COUNT },
    (_, index) => ({
      elapsedSeconds: (index + 1) * 60,
      workingSetMiB: 35,
      totalProcessorTimeMs: 0,
      recordedAt: new Date(
        startedAt + (index + 1) * 60_000,
      ).toISOString(),
    }),
  );

  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt: new Date(generatedAt).toISOString(),
    runId: "1".repeat(32),
    testKind: "performance-seven-day",
    artifact: {
      path: "src-tauri/target/release/weatherpoem.exe",
      sha256: HASH,
      sizeBytes: 1_000_000,
    },
    configuration: {
      mode: "seven-day",
      requestedDurationMinutes: 10_080,
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
      actualDurationSeconds: 604_800,
      sampleCount: samples.length,
      samples,
      closeRequestAccepted: true,
      processStayedAlive: true,
      cpuTimeDeltaMs: 0,
      cpuAveragePercent: 0,
      memoryP95MiB: 35,
      memoryGrowthMiB: 0,
      durationSatisfied: true,
      cpuThresholdSatisfied: true,
      memoryThresholdSatisfied: true,
      memoryGrowthThresholdSatisfied: true,
    },
    limitations: {
      eightHourIdleMeasured: true,
      sevenDayLongRunMeasured: true,
      sleepWakeMeasured: false,
      realNetworkMeasured: false,
      namedQualitySignoff: false,
    },
    gateSatisfied: false,
    result: "automated-seven-day-passed",
  };
}

export const expectedSevenDay = {
  appVersion: "0.2.0",
  exeSha256: HASH,
};
