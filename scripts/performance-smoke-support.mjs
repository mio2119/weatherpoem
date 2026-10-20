import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const PERFORMANCE_REPORT_SCHEMA_VERSION = "1.2";
export const PERFORMANCE_REPORT_NAME =
  "WeatherPoem_0.2.0_PERFORMANCE_SMOKE.json";
export const RELEASE_EXE_PATH =
  "src-tauri/target/release/weatherpoem.exe";
export const REDESIGN_EXE_PATH =
  ".work/redesign-target/release/weatherpoem.exe";
export const REDESIGN_REPORT_PATH =
  "review/redesign/evidence/T09_PERFORMANCE_SMOKE.json";
export const BASELINE_COMPARISON_REPORT_PATH =
  "review/redesign/evidence/T09_BASELINE_PERFORMANCE_SMOKE.json";

const REQUIRED_LIMITATIONS = [
  "poemFirstFrameMeasured",
  "onlineReadyMeasured",
  "degradedReadyMeasured",
  "eightHourIdleMeasured",
  "sevenDayLongRunMeasured",
  "contentUpdateAtomicityMeasured",
  "eventBacklogMeasured",
  "namedQualitySignoff",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExactKeys(value, expected, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} 必须是对象`,
  );
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(wanted),
    `${label} 字段不符合契约`,
  );
}

function assertFiniteNumbers(values, label, allowEmpty = false) {
  assert(
    Array.isArray(values) && (allowEmpty || values.length > 0),
    `${label} 必须是非空数组`,
  );
  for (const value of values) {
    assert(
      Number.isFinite(value) && value >= 0,
      `${label} 包含非法数值`,
    );
  }
}

export function percentile95(values) {
  assertFiniteNumbers(values, "P95 样本");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function approximatelyEqual(left, right, tolerance = 0.02) {
  return Math.abs(left - right) <= tolerance;
}

export function validatePerformanceReport(report, expected) {
  assertExactKeys(
    report,
    [
      "schemaVersion",
      "product",
      "appVersion",
      "generatedAt",
      "testKind",
      "artifact",
      "host",
      "configuration",
      "thresholds",
      "results",
      "limitations",
      "gateSatisfied",
      "result",
    ],
    "性能报告",
  );
  assert(
    report.schemaVersion === PERFORMANCE_REPORT_SCHEMA_VERSION,
    "性能报告 Schema 不匹配",
  );
  assert(report.product === "WeatherPoem", "性能报告产品名不匹配");
  assert(
    report.appVersion === expected.appVersion,
    "性能报告应用版本不是当前版本",
  );
  assert(
    report.testKind === "automated-performance-smoke",
    "性能报告类型不合法",
  );
  const generatedAt = Date.parse(report.generatedAt);
  assert(Number.isFinite(generatedAt), "性能报告时间不合法");
  assert(
    generatedAt <= Date.now() + 10 * 60 * 1_000,
    "性能报告时间位于未来",
  );

  assertExactKeys(
    report.artifact,
    ["path", "sha256", "sizeBytes", "authenticodeStatus"],
    "性能报告 artifact",
  );
  assert(
    report.artifact.path === (expected.artifactPath ?? RELEASE_EXE_PATH),
    "性能报告未绑定预期 EXE",
  );
  assert(
    report.artifact.sha256 === expected.exeSha256,
    "性能报告 EXE 哈希已过期",
  );
  assert(
    Number.isInteger(report.artifact.sizeBytes) &&
      report.artifact.sizeBytes > 0,
    "EXE 尺寸不合法",
  );
  assert(
    typeof report.artifact.authenticodeStatus === "string" &&
      report.artifact.authenticodeStatus.length > 0,
    "Authenticode 状态缺失",
  );

  assertExactKeys(
    report.configuration,
    [
      "startupSamplesRequired",
      "contentSamplesRequired",
      "resourceDurationSeconds",
      "sampleIntervalMs",
      "cleanProfilePerStartup",
      "seededConfiguredProfile",
      "isolatedProfile",
      "realUserDataTouched",
    ],
    "性能报告 configuration",
  );
  assert(
    report.configuration.startupSamplesRequired >= 10,
    "冷启动样本要求少于 10",
  );
  assert(
    report.configuration.contentSamplesRequired >= 10,
    "内容准备样本要求少于 10",
  );
  assert(
    report.configuration.resourceDurationSeconds >= 60,
    "空闲资源冒烟少于 60 秒",
  );
  assert(
    report.configuration.sampleIntervalMs >= 500,
    "资源采样间隔过短",
  );
  assert(
    report.configuration.cleanProfilePerStartup === true,
    "冷启动未使用独立干净目录",
  );
  assert(
    report.configuration.seededConfiguredProfile === true,
    "内容准备未使用隔离的已配置账户",
  );
  assert(
    report.configuration.isolatedProfile === true,
    "性能测试未隔离用户目录",
  );
  assert(
    report.configuration.realUserDataTouched === false,
    "性能测试声称接触了真实用户数据",
  );

  assertExactKeys(
    report.thresholds,
    [
      "cleanStartupP95Ms",
      "contentFirstFrameP95Ms",
      "onlineReadyP95Ms",
      "degradedReadyP95Ms",
      "idleCpuAveragePercent",
      "idleMemoryP95MiB",
    ],
    "性能报告 thresholds",
  );
  assert(
    report.thresholds.cleanStartupP95Ms === 2_000,
    "冷启动阈值被擅自更改",
  );
  assert(
    report.thresholds.contentFirstFrameP95Ms === 300,
    "内容首帧阈值被擅自更改",
  );
  assert(
    report.thresholds.onlineReadyP95Ms === 5_000,
    "在线准备阈值被擅自更改",
  );
  assert(
    report.thresholds.degradedReadyP95Ms === 2_000,
    "降级准备阈值被擅自更改",
  );
  assert(
    report.thresholds.idleCpuAveragePercent === 0.2,
    "空闲 CPU 阈值被擅自更改",
  );
  assert(
    report.thresholds.idleMemoryP95MiB === 100,
    "空闲内存阈值被擅自更改",
  );

  assertExactKeys(
    report.results,
    ["startup", "contentReady", "idle"],
    "性能报告 results",
  );
  const startup = report.results.startup;
  assertExactKeys(
    startup,
    [
      "sampleCount",
      "observedReadyMs",
      "nativeReadyMs",
      "frontendReadyMs",
      "observedReadyP95Ms",
      "nativeReadyP95Ms",
      "frontendReadyP95Ms",
      "thresholdSatisfied",
    ],
    "性能报告 startup",
  );
  assertFiniteNumbers(startup.observedReadyMs, "observedReadyMs");
  assertFiniteNumbers(startup.nativeReadyMs, "nativeReadyMs");
  assertFiniteNumbers(startup.frontendReadyMs, "frontendReadyMs");
  assert(startup.sampleCount >= 10, "冷启动样本不足 10 次");
  assert(
    startup.sampleCount === startup.observedReadyMs.length,
    "观察启动样本数不一致",
  );
  assert(
    startup.sampleCount === startup.nativeReadyMs.length,
    "原生启动样本数不一致",
  );
  assert(
    startup.sampleCount === startup.frontendReadyMs.length,
    "前端启动样本数不一致",
  );
  assert(
    approximatelyEqual(
      startup.observedReadyP95Ms,
      percentile95(startup.observedReadyMs),
      0.11,
    ),
    "观察启动 P95 无法由样本复算",
  );
  assert(
    approximatelyEqual(
      startup.nativeReadyP95Ms,
      percentile95(startup.nativeReadyMs),
      0.11,
    ),
    "原生启动 P95 无法由样本复算",
  );
  assert(
    approximatelyEqual(
      startup.frontendReadyP95Ms,
      percentile95(startup.frontendReadyMs),
      0.11,
    ),
    "前端启动 P95 无法由样本复算",
  );
  assert(
    startup.thresholdSatisfied ===
      (startup.observedReadyP95Ms <=
        report.thresholds.cleanStartupP95Ms),
    "冷启动阈值结论与样本不一致",
  );

  const content = report.results.contentReady;
  assertExactKeys(
    content,
    [
      "sampleCount",
      "observedReadyMs",
      "nativeReadyMs",
      "frontendReadyMs",
      "viewRenderMs",
      "readyViews",
      "readyModes",
      "observedReadyP95Ms",
      "nativeReadyP95Ms",
      "frontendReadyP95Ms",
      "viewRenderP95Ms",
      "poemFirstFrameThresholdSatisfied",
      "onlineObservedReadyMs",
      "onlineObservedReadyP95Ms",
      "onlineReadyMeasured",
      "onlineThresholdSatisfied",
      "degradedObservedReadyMs",
      "degradedObservedReadyP95Ms",
      "degradedReadyMeasured",
      "degradedThresholdSatisfied",
      "preparationThresholdSatisfied",
    ],
    "性能报告 contentReady",
  );
  for (const [key, values] of [
    ["content observedReadyMs", content.observedReadyMs],
    ["content nativeReadyMs", content.nativeReadyMs],
    ["content frontendReadyMs", content.frontendReadyMs],
    ["content viewRenderMs", content.viewRenderMs],
  ]) {
    assertFiniteNumbers(values, key);
    assert(
      values.length === content.sampleCount,
      `${key} 样本数不一致`,
    );
  }
  assert(
    content.sampleCount >= 10 &&
      content.sampleCount ===
        report.configuration.contentSamplesRequired,
    "内容准备样本不足或与配置不一致",
  );
  assert(
    Array.isArray(content.readyViews) &&
      content.readyViews.length === content.sampleCount &&
      content.readyViews.every((view) => view === "poem"),
    "已配置样本没有全部到达诗笺视图",
  );
  assert(
    Array.isArray(content.readyModes) &&
      content.readyModes.length === content.sampleCount &&
      content.readyModes.every(
        (mode) =>
          mode === "live-weather" || mode === "offline-rules",
      ),
    "内容准备模式样本数不一致",
  );
  const onlineObservedReadyMs = content.observedReadyMs.filter(
    (_, index) => content.readyModes[index] === "live-weather",
  );
  const degradedObservedReadyMs = content.observedReadyMs.filter(
    (_, index) => content.readyModes[index] === "offline-rules",
  );
  assertFiniteNumbers(
    content.onlineObservedReadyMs,
    "onlineObservedReadyMs",
    true,
  );
  assertFiniteNumbers(
    content.degradedObservedReadyMs,
    "degradedObservedReadyMs",
    true,
  );
  assert(
    JSON.stringify(content.onlineObservedReadyMs) ===
        JSON.stringify(onlineObservedReadyMs) &&
      JSON.stringify(content.degradedObservedReadyMs) ===
        JSON.stringify(degradedObservedReadyMs),
    "内容准备样本必须完整覆盖在线或降级模式之一",
  );
  assert(
    approximatelyEqual(
      content.observedReadyP95Ms,
      percentile95(content.observedReadyMs),
      0.11,
    ) &&
      approximatelyEqual(
        content.nativeReadyP95Ms,
        percentile95(content.nativeReadyMs),
        0.11,
      ) &&
      approximatelyEqual(
        content.frontendReadyP95Ms,
        percentile95(content.frontendReadyMs),
        0.11,
      ) &&
      approximatelyEqual(
        content.viewRenderP95Ms,
        percentile95(content.viewRenderMs),
        0.11,
      ),
    "内容准备 P95 无法由样本复算",
  );
  assert(
    content.poemFirstFrameThresholdSatisfied ===
      (content.viewRenderP95Ms <=
        report.thresholds.contentFirstFrameP95Ms),
    "诗笺首帧阈值结论与样本不一致",
  );
  const onlineMeasured = onlineObservedReadyMs.length > 0;
  const degradedMeasured = degradedObservedReadyMs.length > 0;
  assert(
    content.onlineReadyMeasured === onlineMeasured &&
      content.degradedReadyMeasured === degradedMeasured,
    "在线或降级准备覆盖声明与样本不一致",
  );
  const expectedOnlineP95 = onlineMeasured
    ? percentile95(onlineObservedReadyMs)
    : null;
  const expectedDegradedP95 = degradedMeasured
    ? percentile95(degradedObservedReadyMs)
    : null;
  assert(
    (onlineMeasured &&
      Number.isFinite(content.onlineObservedReadyP95Ms) &&
      approximatelyEqual(
        content.onlineObservedReadyP95Ms,
        expectedOnlineP95,
        0.11,
      )) ||
      (!onlineMeasured &&
        content.onlineObservedReadyP95Ms === null),
    "在线准备 P95 无法由在线子样本复算",
  );
  assert(
    (degradedMeasured &&
      Number.isFinite(content.degradedObservedReadyP95Ms) &&
      approximatelyEqual(
        content.degradedObservedReadyP95Ms,
        expectedDegradedP95,
        0.11,
      )) ||
      (!degradedMeasured &&
        content.degradedObservedReadyP95Ms === null),
    "降级准备 P95 无法由降级子样本复算",
  );
  const onlineThresholdSatisfied =
    onlineMeasured &&
    expectedOnlineP95 <= report.thresholds.onlineReadyP95Ms;
  const degradedThresholdSatisfied =
    degradedMeasured &&
    expectedDegradedP95 <= report.thresholds.degradedReadyP95Ms;
  assert(
    content.onlineThresholdSatisfied ===
        onlineThresholdSatisfied &&
      content.degradedThresholdSatisfied ===
        degradedThresholdSatisfied,
    "在线或降级准备阈值结论与子样本不一致",
  );
  const preparationThresholdSatisfied =
    (onlineMeasured || degradedMeasured) &&
    (!onlineMeasured || onlineThresholdSatisfied) &&
    (!degradedMeasured || degradedThresholdSatisfied);
  assert(
    content.preparationThresholdSatisfied ===
      preparationThresholdSatisfied,
    "内容准备阈值结论与样本不一致",
  );

  const idle = report.results.idle;
  assertExactKeys(
    idle,
    [
      "durationSeconds",
      "sampleCount",
      "closeRequestAccepted",
      "processorCount",
      "cpuTimeDeltaMs",
      "wallTimeMs",
      "cpuAveragePercent",
      "memorySamplesMiB",
      "memoryP95MiB",
      "cpuThresholdSatisfied",
      "memoryThresholdSatisfied",
    ],
    "性能报告 idle",
  );
  assert(idle.durationSeconds >= 60, "空闲资源测试不足 60 秒");
  assert(idle.sampleCount >= 30, "空闲资源样本不足");
  assert(
    idle.closeRequestAccepted === true,
    "未证明窗口已经请求关闭到托盘",
  );
  assert(
    Number.isInteger(idle.processorCount) && idle.processorCount > 0,
    "处理器数量不合法",
  );
  assert(
    Number.isFinite(idle.cpuTimeDeltaMs) && idle.cpuTimeDeltaMs >= 0,
    "CPU 时间不合法",
  );
  assert(
    Number.isFinite(idle.wallTimeMs) && idle.wallTimeMs > 0,
    "墙钟时间不合法",
  );
  const recomputedCpu =
    (idle.cpuTimeDeltaMs / (idle.wallTimeMs * idle.processorCount)) * 100;
  assert(
    approximatelyEqual(idle.cpuAveragePercent, recomputedCpu, 0.001),
    "空闲 CPU 平均值无法复算",
  );
  assertFiniteNumbers(idle.memorySamplesMiB, "memorySamplesMiB");
  assert(
    idle.sampleCount === idle.memorySamplesMiB.length,
    "内存样本数不一致",
  );
  assert(
    approximatelyEqual(
      idle.memoryP95MiB,
      percentile95(idle.memorySamplesMiB),
      0.02,
    ),
    "空闲内存 P95 无法复算",
  );
  assert(
    idle.cpuThresholdSatisfied ===
      (idle.cpuAveragePercent <
        report.thresholds.idleCpuAveragePercent),
    "空闲 CPU 阈值结论与样本不一致",
  );
  assert(
    idle.memoryThresholdSatisfied ===
      (idle.memoryP95MiB < report.thresholds.idleMemoryP95MiB),
    "空闲内存阈值结论与样本不一致",
  );

  assertExactKeys(
    report.limitations,
    REQUIRED_LIMITATIONS,
    "性能报告 limitations",
  );
  for (const key of [
    "eightHourIdleMeasured",
    "sevenDayLongRunMeasured",
    "contentUpdateAtomicityMeasured",
    "eventBacklogMeasured",
    "namedQualitySignoff",
  ]) {
    assert(
      report.limitations[key] === false,
      `性能冒烟不得冒充 ${key}`,
    );
  }
  assert(
    report.limitations.poemFirstFrameMeasured === true &&
      report.limitations.onlineReadyMeasured === onlineMeasured &&
      report.limitations.degradedReadyMeasured === degradedMeasured,
    "自动性能覆盖声明与内容样本不一致",
  );
  assert(
    report.gateSatisfied === false,
    "短时性能冒烟不得声明完整门禁通过",
  );
  const expectedResult =
    startup.thresholdSatisfied &&
    content.poemFirstFrameThresholdSatisfied &&
    content.preparationThresholdSatisfied &&
    idle.cpuThresholdSatisfied &&
    idle.memoryThresholdSatisfied
      ? "automated-smoke-passed"
      : "automated-smoke-failed";
  assert(
    report.result === expectedResult,
    "性能冒烟总结果与子项不一致",
  );
  assert(
    report.result === "automated-smoke-passed",
    "当前性能冒烟未达到已覆盖阈值",
  );
  return report;
}

export async function sha256File(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex").toUpperCase();
}

export function resolvePerformancePaths(projectRoot, variant = "release") {
  if (variant.startsWith("candidate:")) {
    const name = variant.slice("candidate:".length);
    assert(
      /^[a-z0-9][a-z0-9-]{0,39}$/.test(name) && name !== "target",
      "内部候选名称不合法",
    );
    const artifactPath = `.work/redesign-${name}/release/weatherpoem.exe`;
    const relativeReportPath =
      `review/redesign/evidence/T09_PERFORMANCE_SMOKE_${name}.json`;
    return {
      artifactPath,
      exePath: path.join(projectRoot, ...artifactPath.split("/")),
      reportPath: path.join(projectRoot, ...relativeReportPath.split("/")),
    };
  }
  if (variant === "redesign") {
    return {
      artifactPath: REDESIGN_EXE_PATH,
      exePath: path.join(projectRoot, ...REDESIGN_EXE_PATH.split("/")),
      reportPath: path.join(projectRoot, ...REDESIGN_REPORT_PATH.split("/")),
    };
  }
  if (variant === "baseline-comparison") {
    return {
      artifactPath: RELEASE_EXE_PATH,
      exePath: path.join(projectRoot, ...RELEASE_EXE_PATH.split("/")),
      reportPath: path.join(
        projectRoot,
        ...BASELINE_COMPARISON_REPORT_PATH.split("/"),
      ),
    };
  }
  assert(variant === "release", "未知性能候选类型");
  return {
    artifactPath: RELEASE_EXE_PATH,
    exePath: path.join(projectRoot, ...RELEASE_EXE_PATH.split("/")),
    reportPath: path.join(
      projectRoot,
      "output",
      PERFORMANCE_REPORT_NAME,
    ),
  };
}
