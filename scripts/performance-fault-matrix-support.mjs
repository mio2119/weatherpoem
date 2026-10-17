export const PERFORMANCE_FAULT_REPORT =
  "output/WeatherPoem_0.2.0_PERFORMANCE_FAULT_MATRIX.json";
export const PERFORMANCE_FAULT_SCHEMA = "1.0";

const EXPECTED_SCENARIOS = [
  {
    id: "weather-offline",
    view: "poem",
    mode: "offline-rules",
    thresholdMs: 2_000,
  },
  {
    id: "weather-timeout",
    view: "poem",
    mode: "offline-rules",
    thresholdMs: 2_000,
  },
  {
    id: "official-warning",
    view: "warning",
    mode: "safety-warning",
    thresholdMs: 2_000,
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} 必须是对象`,
  );
  assert(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort()),
    `${label} 字段不符合契约`,
  );
}

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function near(left, right) {
  return Math.abs(left - right) <= 0.11;
}

export function validatePerformanceFaultMatrix(report, expected) {
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
      "scenarios",
      "limitations",
      "gateSatisfied",
      "result",
    ],
    "受控性能故障矩阵",
  );
  assert(
    report.schemaVersion === PERFORMANCE_FAULT_SCHEMA &&
      report.product === "WeatherPoem" &&
      report.appVersion === expected.appVersion &&
      report.testKind ===
        "controlled-performance-fault-matrix",
    "受控性能故障矩阵身份不匹配",
  );
  const generatedAt = Date.parse(report.generatedAt);
  assert(
    Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 10 * 60 * 1_000,
    "受控性能故障矩阵时间无效",
  );
  exactKeys(
    report.artifact,
    ["path", "sha256", "sizeBytes"],
    "故障矩阵发布物",
  );
  assert(
    report.artifact.path ===
        (expected.artifactPath ?? "src-tauri/target/release/weatherpoem.exe") &&
      report.artifact.sha256 === expected.exeSha256 &&
      /^[A-F0-9]{64}$/.test(report.artifact.sha256) &&
      Number.isInteger(report.artifact.sizeBytes) &&
      report.artifact.sizeBytes > 0,
    "故障矩阵没有绑定当前发布 EXE",
  );
  exactKeys(
    report.configuration,
    [
      "samplesPerScenario",
      "isolatedProfilePerSample",
      "sqliteAndWebviewIsolated",
      "realUserDataTouched",
      "syntheticScenarios",
    ],
    "故障矩阵配置",
  );
  assert(
    Number.isInteger(report.configuration.samplesPerScenario) &&
      report.configuration.samplesPerScenario >= 3 &&
      report.configuration.isolatedProfilePerSample === true &&
      report.configuration.sqliteAndWebviewIsolated === true &&
      report.configuration.realUserDataTouched === false &&
      report.configuration.syntheticScenarios === true,
    "故障矩阵没有使用逐样本隔离的合成场景",
  );
  assert(
    Array.isArray(report.scenarios) &&
      report.scenarios.length === EXPECTED_SCENARIOS.length,
    "故障矩阵场景数量不完整",
  );

  for (const [
    index,
    expectedScenario,
  ] of EXPECTED_SCENARIOS.entries()) {
    const scenario = report.scenarios[index];
    exactKeys(
      scenario,
      [
        "id",
        "expectedView",
        "expectedMode",
        "thresholdMs",
        "simulated",
        "sampleCount",
        "samples",
        "observedReadyP95Ms",
        "expectedStateSatisfied",
        "thresholdSatisfied",
      ],
      `故障场景 ${expectedScenario.id}`,
    );
    assert(
      scenario.id === expectedScenario.id &&
        scenario.expectedView === expectedScenario.view &&
        scenario.expectedMode === expectedScenario.mode &&
        scenario.thresholdMs === expectedScenario.thresholdMs &&
        scenario.simulated === true &&
        scenario.sampleCount ===
          report.configuration.samplesPerScenario &&
        Array.isArray(scenario.samples) &&
        scenario.samples.length === scenario.sampleCount,
      `${expectedScenario.id} 配置或样本数不一致`,
    );
    for (const sample of scenario.samples) {
      exactKeys(
        sample,
        [
          "observedReadyMs",
          "nativeReadyMs",
          "frontendReadyMs",
          "viewRenderMs",
          "readyView",
          "readyMode",
          "performanceScenario",
        ],
        `${expectedScenario.id} 样本`,
      );
      for (const key of [
        "observedReadyMs",
        "nativeReadyMs",
        "frontendReadyMs",
        "viewRenderMs",
      ]) {
        assert(
          Number.isFinite(sample[key]) && sample[key] >= 0,
          `${expectedScenario.id} ${key} 无效`,
        );
      }
      assert(
        sample.readyView === expectedScenario.view &&
          sample.readyMode === expectedScenario.mode &&
          sample.performanceScenario === expectedScenario.id,
        `${expectedScenario.id} 没有到达预期最终状态`,
      );
    }
    const recomputedP95 = percentile95(
      scenario.samples.map((sample) => sample.observedReadyMs),
    );
    assert(
      near(scenario.observedReadyP95Ms, recomputedP95) &&
        scenario.expectedStateSatisfied === true &&
        scenario.thresholdSatisfied ===
          (recomputedP95 <= expectedScenario.thresholdMs),
      `${expectedScenario.id} P95 或阈值结论无法复算`,
    );
  }

  exactKeys(
    report.limitations,
    [
      "realOnlineMeasured",
      "realOfficialWarningMeasured",
      "eightHourIdleMeasured",
      "sevenDayLongRunMeasured",
      "namedQualitySignoff",
    ],
    "故障矩阵限制",
  );
  assert(
    Object.values(report.limitations).every(
      (value) => value === false,
    ),
    "合成故障矩阵不得冒充真实网络、预警或长稳证据",
  );
  assert(
    report.gateSatisfied === false,
    "合成故障矩阵不得冒充完整性能门禁",
  );
  const passed = report.scenarios.every(
    (scenario) => scenario.thresholdSatisfied,
  );
  assert(
    report.result ===
      (passed
        ? "automated-controlled-matrix-passed"
        : "automated-controlled-matrix-failed"),
    "合成故障矩阵总结论不一致",
  );
  assert(passed, "合成故障矩阵仍有失败场景");
}
