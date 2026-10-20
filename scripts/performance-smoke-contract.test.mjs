import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import test from "node:test";
import {
  REDESIGN_EXE_PATH,
  resolvePerformancePaths,
  validatePerformanceReport,
} from "./performance-smoke-support.mjs";

const HASH = "A".repeat(64);

test("就绪标记缺失时的独立诊断记录不覆盖既有证据", {
  skip: process.platform !== "win32",
}, () => {
  const directory = mkdtempSync(join(tmpdir(), "WeatherPoem.ProbeDiagnostic.Test."));
  const helper = resolve("scripts/performance-smoke-failure.ps1");
  const report = join(directory, "T09_TEST.json");
  const runId = "00000000-0000-4000-8000-000000000001";
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const command = `. ${quote(helper)}; ` + [
    `Write-PerformanceSmokeProbeFailure -ReportPath ${quote(report)}`,
    `-ArtifactPath ${quote("isolated/test-artifact")}`,
    `-ExePath ${quote(helper)}`,
    "-SampleLabel content-03",
    `-RunId ${runId}`,
    "-FailureKind ready-timeout -ElapsedMs 15012.34",
    "-ProcessId 1234 -ProcessAlive $true -MarkerExists $false",
  ].join(" ");
  try {
    const first = spawnSync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-Command", command,
    ], { encoding: "utf8", timeout: 30_000 });
    assert.equal(first.status, 0, first.stderr);
    const failurePath = first.stdout.trim().split(/\r?\n/u).at(-1);
    const record = JSON.parse(readFileSync(failurePath, "utf8"));
    assert.equal(record.result, "ready-timeout");
    assert.equal(record.sample.label, "content-03");
    assert.equal(record.sample.processAliveAtFailure, true);
    assert.equal(record.sample.readyMarkerExistsAtFailure, false);
    assert.match(record.artifact.sha256, /^[0-9A-F]{64}$/u, JSON.stringify(record));
    assert.equal(record.limitations.performanceGateSatisfied, false);
    assert.equal(record.limitations.causeDetermined, false);
    assert.equal(record.limitations.realUserDataTouched, false);

    const exitCommand = command
      .replace(runId, "00000000-0000-4000-8000-000000000002")
      .replace("-FailureKind ready-timeout", "-FailureKind exit-before-ready")
      .replace("-ProcessAlive $true", "-ProcessAlive $false") + " -ExitCode 1";
    const exited = spawnSync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-Command", exitCommand,
    ], { encoding: "utf8", timeout: 30_000 });
    assert.equal(exited.status, 0, exited.stderr);
    const exitPath = exited.stdout.trim().split(/\r?\n/u).at(-1);
    const exitRecord = JSON.parse(readFileSync(exitPath, "utf8"));
    assert.equal(exitRecord.result, "exit-before-ready");
    assert.equal(exitRecord.sample.processAliveAtFailure, false);
    assert.equal(exitRecord.sample.exitCode, 1);

    const duplicate = spawnSync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-Command", command,
    ], { encoding: "utf8", timeout: 30_000 });
    assert.notEqual(duplicate.status, 0);
    assert.deepEqual(JSON.parse(readFileSync(failurePath, "utf8")), record);
  } finally {
    const target = realpathSync(directory);
    const base = realpathSync(tmpdir());
    assert.ok(target.startsWith(`${base}${sep}`));
    assert.ok(basename(target).startsWith("WeatherPoem.ProbeDiagnostic.Test."));
    rmSync(target, { recursive: true, force: false });
  }
});

test("具名内部候选只解析到隔离构建与独立报告路径", () => {
  const paths = resolvePerformancePaths(
    "E:/weatherpoem",
    "candidate:overlap-20261013",
  );
  assert.equal(
    paths.artifactPath,
    ".work/redesign-overlap-20261013/release/weatherpoem.exe",
  );
  assert.match(paths.reportPath, /T09_PERFORMANCE_SMOKE_overlap-20261013\.json$/);
  assert.throws(() =>
    resolvePerformancePaths("E:/weatherpoem", "candidate:../release"),
  );
  assert.throws(() =>
    resolvePerformancePaths("E:/weatherpoem", "candidate:target"),
  );
});

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

test("改版内部候选只接受独立路径和独立哈希", () => {
  const report = fixture();
  report.artifact.path = REDESIGN_EXE_PATH;
  assert.doesNotThrow(() =>
    validatePerformanceReport(report, {
      appVersion: "0.2.0",
      exeSha256: HASH,
      artifactPath: REDESIGN_EXE_PATH,
    }),
  );
  assert.throws(() =>
    validatePerformanceReport(report, {
      appVersion: "0.2.0",
      exeSha256: HASH,
    }),
  );
  assert.match(
    resolvePerformancePaths("E:/weatherpoem", "redesign").reportPath,
    /T09_PERFORMANCE_SMOKE\.json$/,
  );
  assert.match(
    resolvePerformancePaths("E:/weatherpoem", "baseline-comparison")
      .reportPath,
    /T09_BASELINE_PERFORMANCE_SMOKE\.json$/,
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
