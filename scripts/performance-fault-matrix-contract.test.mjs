import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePerformanceFaultMatrix,
} from "./performance-fault-matrix-support.mjs";

const HASH = "A".repeat(64);

function sample(id, view, mode, time) {
  return {
    observedReadyMs: time,
    nativeReadyMs: time - 20,
    frontendReadyMs: time - 200,
    viewRenderMs: 50,
    readyView: view,
    readyMode: mode,
    performanceScenario: id,
  };
}

function fixture() {
  const definitions = [
    ["weather-offline", "poem", "offline-rules", 700],
    ["weather-timeout", "poem", "offline-rules", 1_700],
    ["official-warning", "warning", "safety-warning", 750],
  ];
  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt: new Date().toISOString(),
    testKind: "controlled-performance-fault-matrix",
    artifact: {
      path: "src-tauri/target/release/weatherpoem.exe",
      sha256: HASH,
      sizeBytes: 1_000_000,
    },
    configuration: {
      samplesPerScenario: 3,
      isolatedProfilePerSample: true,
      sqliteAndWebviewIsolated: true,
      realUserDataTouched: false,
      syntheticScenarios: true,
    },
    scenarios: definitions.map(([id, view, mode, time]) => ({
      id,
      expectedView: view,
      expectedMode: mode,
      thresholdMs: 2_000,
      simulated: true,
      sampleCount: 3,
      samples: Array.from({ length: 3 }, () =>
        sample(id, view, mode, time),
      ),
      observedReadyP95Ms: time,
      expectedStateSatisfied: true,
      thresholdSatisfied: true,
    })),
    limitations: {
      realOnlineMeasured: false,
      realOfficialWarningMeasured: false,
      eightHourIdleMeasured: false,
      sevenDayLongRunMeasured: false,
      namedQualitySignoff: false,
    },
    gateSatisfied: false,
    result: "automated-controlled-matrix-passed",
  };
}

test("三种隔离故障场景均可绑定发布物和逐次最终状态", () => {
  assert.doesNotThrow(() =>
    validatePerformanceFaultMatrix(fixture(), {
      appVersion: "0.2.0",
      exeSha256: HASH,
    }),
  );
});

test("改版故障矩阵只能绑定指定内部候选", () => {
  const report = fixture();
  report.artifact.path = ".work/redesign-target/release/weatherpoem.exe";
  assert.doesNotThrow(() =>
    validatePerformanceFaultMatrix(report, {
      appVersion: "0.2.0",
      exeSha256: HASH,
      artifactPath: ".work/redesign-target/release/weatherpoem.exe",
    }),
  );
  assert.throws(() =>
    validatePerformanceFaultMatrix(report, {
      appVersion: "0.2.0",
      exeSha256: HASH,
    }),
  );
});

test("错误最终视图、伪造 P95 和过期 EXE 都会失败", () => {
  const wrongView = fixture();
  wrongView.scenarios[2].samples[0].readyView = "poem";
  assert.throws(
    () =>
      validatePerformanceFaultMatrix(wrongView, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /预期最终状态/,
  );

  const forgedP95 = fixture();
  forgedP95.scenarios[1].observedReadyP95Ms = 100;
  assert.throws(
    () =>
      validatePerformanceFaultMatrix(forgedP95, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /无法复算/,
  );

  assert.throws(
    () =>
      validatePerformanceFaultMatrix(fixture(), {
        appVersion: "0.2.0",
        exeSha256: "B".repeat(64),
      }),
    /当前发布 EXE/,
  );
});

test("合成场景不能声明真实在线、真实预警或完整性能门禁", () => {
  const fakeOnline = fixture();
  fakeOnline.limitations.realOnlineMeasured = true;
  assert.throws(
    () =>
      validatePerformanceFaultMatrix(fakeOnline, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /不得冒充/,
  );

  const fakeGate = fixture();
  fakeGate.gateSatisfied = true;
  assert.throws(
    () =>
      validatePerformanceFaultMatrix(fakeGate, {
        appVersion: "0.2.0",
        exeSha256: HASH,
      }),
    /完整性能门禁/,
  );
});
