import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePerformanceReport,
} from "./performance-smoke-support.mjs";

const HASH = "A".repeat(64);

function fixture() {
  return {
    schemaVersion: "1.2",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt: new Date().toISOString(),
    testKind: "automated-performance-smoke",
    artifact: {
      path: "src-tauri/target/release/weatherpoem.exe",
      sha256: HASH,
      sizeBytes: 1_000_000,
      authenticodeStatus: "NotSigned",
    },
    host: {
      os: "Windows",
      version: "10.0",
      build: "test",
      processorCount: 8,
    },
    configuration: {
      startupSamplesRequired: 10,
      contentSamplesRequired: 10,
      resourceDurationSeconds: 60,
      sampleIntervalMs: 1_000,
      cleanProfilePerStartup: true,
      seededConfiguredProfile: true,
      isolatedProfile: true,
      realUserDataTouched: false,
    },
    thresholds: {
      cleanStartupP95Ms: 2_000,
      contentFirstFrameP95Ms: 300,
      onlineReadyP95Ms: 5_000,
      degradedReadyP95Ms: 2_000,
      idleCpuAveragePercent: 0.2,
      idleMemoryP95MiB: 100,
    },
    results: {
      startup: {
        sampleCount: 10,
        observedReadyMs: Array(10).fill(600),
        nativeReadyMs: Array(10).fill(550),
        frontendReadyMs: Array(10).fill(400),
        observedReadyP95Ms: 600,
        nativeReadyP95Ms: 550,
        frontendReadyP95Ms: 400,
        thresholdSatisfied: true,
      },
      contentReady: {
        sampleCount: 10,
        observedReadyMs: Array(10).fill(900),
        nativeReadyMs: Array(10).fill(850),
        frontendReadyMs: Array(10).fill(800),
        viewRenderMs: Array(10).fill(40),
        readyViews: Array(10).fill("poem"),
        readyModes: Array(10).fill("live-weather"),
        observedReadyP95Ms: 900,
        nativeReadyP95Ms: 850,
        frontendReadyP95Ms: 800,
        viewRenderP95Ms: 40,
        poemFirstFrameThresholdSatisfied: true,
        onlineObservedReadyMs: Array(10).fill(900),
        onlineObservedReadyP95Ms: 900,
        onlineReadyMeasured: true,
        onlineThresholdSatisfied: true,
        degradedObservedReadyMs: [],
        degradedObservedReadyP95Ms: null,
        degradedReadyMeasured: false,
        degradedThresholdSatisfied: false,
        preparationThresholdSatisfied: true,
      },
      idle: {
        durationSeconds: 60,
        sampleCount: 60,
        closeRequestAccepted: true,
        processorCount: 8,
        cpuTimeDeltaMs: 48,
        wallTimeMs: 60_000,
        cpuAveragePercent: 0.01,
        memorySamplesMiB: Array(60).fill(50),
        memoryP95MiB: 50,
        cpuThresholdSatisfied: true,
        memoryThresholdSatisfied: true,
      },
    },
    limitations: {
      poemFirstFrameMeasured: true,
      onlineReadyMeasured: true,
      degradedReadyMeasured: false,
      eightHourIdleMeasured: false,
      sevenDayLongRunMeasured: false,
      contentUpdateAtomicityMeasured: false,
      eventBacklogMeasured: false,
      namedQualitySignoff: false,
    },
    gateSatisfied: false,
    result: "automated-smoke-passed",
  };
}

test("性能报告绑定当前发布物并保留完整门禁限制", () => {
  assert.doesNotThrow(() =>
    validatePerformanceReport(fixture(), {
      appVersion: "0.2.0",
      exeSha256: HASH,
    }),
  );
});

test("短时冒烟不能冒充八小时或七天长稳", () => {
  const report = fixture();
  report.limitations.eightHourIdleMeasured = true;
  assert.throws(
    () =>
      validatePerformanceReport(report, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /eightHourIdleMeasured/,
  );
});

test("过期哈希、伪造 P95 或真实用户目录都会被拒绝", () => {
  const stale = fixture();
  assert.throws(
    () =>
      validatePerformanceReport(stale, {
        appVersion: "0.2.0",
        exeSha256: "B".repeat(64),
      }),
    /哈希已过期/,
  );

  const forged = fixture();
  forged.results.startup.observedReadyP95Ms = 300;
  assert.throws(
    () =>
      validatePerformanceReport(forged, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /无法由样本复算/,
  );

  const unsafe = fixture();
  unsafe.configuration.realUserDataTouched = true;
  assert.throws(
    () =>
      validatePerformanceReport(unsafe, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /真实用户数据/,
  );
});

test("诗笺视图、首帧样本和在线模式声明必须一致", () => {
  const wrongView = fixture();
  wrongView.results.contentReady.readyViews[0] = "onboarding";
  assert.throws(
    () =>
      validatePerformanceReport(wrongView, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /全部到达诗笺视图/,
  );

  const forgedFrame = fixture();
  forgedFrame.results.contentReady.viewRenderP95Ms = 20;
  assert.throws(
    () =>
      validatePerformanceReport(forgedFrame, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /内容准备 P95/,
  );

  const fakeMode = fixture();
  fakeMode.limitations.onlineReadyMeasured = false;
  assert.throws(
    () =>
      validatePerformanceReport(fakeMode, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /覆盖声明/,
  );
});

test("在线与降级样本混合时分别复算各自 P95", () => {
  const report = fixture();
  report.results.contentReady.observedReadyMs[9] = 1_600;
  report.results.contentReady.nativeReadyMs[9] = 1_550;
  report.results.contentReady.frontendReadyMs[9] = 1_500;
  report.results.contentReady.readyModes[9] = "offline-rules";
  report.results.contentReady.observedReadyP95Ms = 1_600;
  report.results.contentReady.nativeReadyP95Ms = 1_550;
  report.results.contentReady.frontendReadyP95Ms = 1_500;
  report.results.contentReady.onlineObservedReadyMs =
    Array(9).fill(900);
  report.results.contentReady.onlineObservedReadyP95Ms = 900;
  report.results.contentReady.degradedObservedReadyMs = [1_600];
  report.results.contentReady.degradedObservedReadyP95Ms = 1_600;
  report.results.contentReady.degradedReadyMeasured = true;
  report.results.contentReady.degradedThresholdSatisfied = true;
  report.limitations.degradedReadyMeasured = true;

  assert.doesNotThrow(() =>
    validatePerformanceReport(report, {
      appVersion: "0.2.0",
      exeSha256: HASH,
    }),
  );
});
