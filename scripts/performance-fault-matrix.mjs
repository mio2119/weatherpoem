import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { seedPerformanceProfile } from "./seed-performance-profile.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const exePath = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "release",
  "weatherpoem.exe",
);
const reportPath = path.join(
  projectRoot,
  "output",
  "WeatherPoem_0.2.0_PERFORMANCE_FAULT_MATRIX.json",
);
const samplesArgument = Number(
  process.argv.find((value) => value.startsWith("--samples="))
    ?.split("=")[1] ?? 3,
);
if (
  !Number.isInteger(samplesArgument) ||
  samplesArgument < 3 ||
  samplesArgument > 20
) {
  throw new Error("--samples 必须是 3 到 20 的整数");
}

const scenarioPlans = [
  {
    id: "weather-offline",
    expectedView: "poem",
    expectedMode: "offline-rules",
    thresholdMs: 2_000,
  },
  {
    id: "weather-timeout",
    expectedView: "poem",
    expectedMode: "offline-rules",
    thresholdMs: 2_000,
  },
  {
    id: "official-warning",
    expectedView: "warning",
    expectedMode: "safety-warning",
    thresholdMs: 2_000,
  },
];

function sleep(milliseconds) {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function ensureNoExistingProcess() {
  const result = spawnSync(
    "tasklist.exe",
    [
      "/FI",
      "IMAGENAME eq weatherpoem.exe",
      "/FO",
      "CSV",
      "/NH",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (
    result.status === 0 &&
    /"weatherpoem\.exe"/i.test(result.stdout)
  ) {
    throw new Error(
      "WeatherPoem 已在运行；退出后再执行隔离故障矩阵",
    );
  }
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256")
    .update(bytes)
    .digest("hex")
    .toUpperCase();
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) =>
    child.once("exit", resolve),
  );
  child.kill();
  await Promise.race([exited, sleep(5_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error("受控故障场景进程未能在 5 秒内退出");
  }
}

async function readMarker(markerPath, child, deadline) {
  let lastError;
  while (performance.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `WeatherPoem 在写入就绪探针前退出：${child.exitCode}`,
      );
    }
    try {
      return JSON.parse(await readFile(markerPath, "utf8"));
    } catch (error) {
      lastError = error;
      await sleep(20);
    }
  }
  throw new Error(
    `15 秒内没有取得完整就绪探针：${lastError?.message ?? "missing"}`,
  );
}

async function runSample(runRoot, plan, index) {
  const profilePath = path.join(
    runRoot,
    `${plan.id}-${String(index).padStart(2, "0")}`,
  );
  const appData = path.join(profilePath, "appdata");
  const localAppData = path.join(profilePath, "localappdata");
  const probeDirectory = path.join(profilePath, "temp", "probe");
  await Promise.all([
    mkdir(appData, { recursive: true }),
    mkdir(localAppData, { recursive: true }),
    mkdir(probeDirectory, { recursive: true }),
  ]);
  seedPerformanceProfile(profilePath);
  const markerPath = path.join(
    probeDirectory,
    "weatherpoem-performance-ready.json",
  );
  const runId = randomUUID();
  const startedAt = performance.now();
  const child = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      WEATHERPOEM_PERFORMANCE_PROFILE: profilePath,
      WEATHERPOEM_PERFORMANCE_PROBE: markerPath,
      WEATHERPOEM_PERFORMANCE_RUN_ID: runId,
      WEATHERPOEM_PERFORMANCE_SCENARIO: plan.id,
    },
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    const marker = await readMarker(
      markerPath,
      child,
      performance.now() + 15_000,
    );
    const observedReadyMs = performance.now() - startedAt;
    if (
      marker.schemaVersion !== "1.2" ||
      marker.runId !== runId ||
      marker.appVersion !== packageJson.version ||
      marker.processId !== child.pid ||
      marker.performanceScenario !== plan.id
    ) {
      throw new Error(`${plan.id} 就绪探针身份或场景不一致`);
    }
    return {
      observedReadyMs: Number(observedReadyMs.toFixed(2)),
      nativeReadyMs: marker.nativeReadyMs,
      frontendReadyMs: marker.frontendReadyMs,
      viewRenderMs: marker.viewRenderMs,
      readyView: marker.readyView,
      readyMode: marker.readyMode,
      performanceScenario: marker.performanceScenario,
    };
  } finally {
    await stopChild(child);
  }
}

async function removeRunRoot(runRoot, tempRoot) {
  const resolved = path.resolve(runRoot);
  const relative = path.relative(tempRoot, resolved);
  const topDirectory = relative.split(path.sep)[0];
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !topDirectory.startsWith("WeatherPoem.Performance.")
  ) {
    throw new Error("拒绝清理不受控的故障矩阵目录");
  }
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(resolved, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
}

ensureNoExistingProcess();
await stat(exePath);
const tempRoot = path.resolve(os.tmpdir());
const runRoot = path.join(
  tempRoot,
  `WeatherPoem.Performance.Fault.${randomUUID().replaceAll("-", "")}`,
);
await mkdir(runRoot);

const scenarioResults = [];
try {
  for (const plan of scenarioPlans) {
    const samples = [];
    for (let index = 1; index <= samplesArgument; index += 1) {
      samples.push(await runSample(runRoot, plan, index));
      await sleep(200);
    }
    const p95Ms = percentile95(
      samples.map((sample) => sample.observedReadyMs),
    );
    const expectedStateSatisfied = samples.every(
      (sample) =>
        sample.readyView === plan.expectedView &&
        sample.readyMode === plan.expectedMode &&
        sample.performanceScenario === plan.id,
    );
    scenarioResults.push({
      ...plan,
      simulated: true,
      sampleCount: samples.length,
      samples,
      observedReadyP95Ms: Number(p95Ms.toFixed(2)),
      expectedStateSatisfied,
      thresholdSatisfied:
        expectedStateSatisfied && p95Ms <= plan.thresholdMs,
    });
  }

  const matrixSatisfied = scenarioResults.every(
    (scenario) => scenario.thresholdSatisfied,
  );
  const executable = await stat(exePath);
  const report = {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: packageJson.version,
    generatedAt: new Date().toISOString(),
    testKind: "controlled-performance-fault-matrix",
    artifact: {
      path: "src-tauri/target/release/weatherpoem.exe",
      sha256: await sha256File(exePath),
      sizeBytes: executable.size,
    },
    configuration: {
      samplesPerScenario: samplesArgument,
      isolatedProfilePerSample: true,
      sqliteAndWebviewIsolated: true,
      realUserDataTouched: false,
      syntheticScenarios: true,
    },
    scenarios: scenarioResults,
    limitations: {
      realOnlineMeasured: false,
      realOfficialWarningMeasured: false,
      eightHourIdleMeasured: false,
      sevenDayLongRunMeasured: false,
      namedQualitySignoff: false,
    },
    gateSatisfied: false,
    result: matrixSatisfied
      ? "automated-controlled-matrix-passed"
      : "automated-controlled-matrix-failed",
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (!matrixSatisfied) {
    throw new Error(
      `受控性能故障矩阵未通过：${reportPath}`,
    );
  }
  console.log(`受控性能故障矩阵通过：${reportPath}`);
} finally {
  await removeRunRoot(runRoot, tempRoot);
}
