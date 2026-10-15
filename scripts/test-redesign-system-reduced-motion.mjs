import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedPerformanceProfile } from "./seed-performance-profile.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateOption = process.argv.find((argument) => argument.startsWith("--candidate="));
const candidateName = candidateOption?.slice("--candidate=".length) ?? "motion-probe-20261013";
assert.match(candidateName, /^[a-z0-9][a-z0-9-]{0,39}$/, "Invalid isolated candidate name");
const artifactRelativePath = `.work/redesign-${candidateName}/release/weatherpoem.exe`;
const exePath = path.join(projectRoot, artifactRelativePath);
const reportPath = path.join(projectRoot, `review/redesign/evidence/T07_SYSTEM_REDUCED_MOTION_${candidateName}.json`);
const scenario = "scene-rain";
const webViewArguments = "--force-prefers-reduced-motion";

function durationMilliseconds(value) {
  const match = /^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)(ms|s)$/i.exec(value);
  assert.ok(match, `Unexpected CSS animation duration: ${value}`);
  const amount = Number(match[1]);
  return match[2] === "s" ? amount * 1000 : amount;
}

export function validateReducedMotionReport(report, exeBytes) {
  assert.equal(report.schemaVersion, "1.0");
  assert.equal(report.testKind, "isolated-webview-reduced-motion");
  assert.equal(report.scenario, scenario);
  assert.equal(report.webViewArguments, webViewArguments);
  assert.equal(report.realUserDataTouched, false);
  assert.equal(report.systemSettingChanged, false);
  assert.equal(report.artifact.path, artifactRelativePath);
  const hash = createHash("sha256").update(exeBytes).digest("hex").toUpperCase();
  assert.equal(report.artifact.sha256, hash);
  assert.equal(report.readyMarker.schemaVersion, "1.2");
  assert.equal(report.readyMarker.runId, report.runId);
  assert.equal(report.readyMarker.processId, report.processId);
  assert.equal(report.readyMarker.readyView, "poem");
  assert.equal(report.readyMarker.performanceScenario, scenario);
  const motion = report.readyMarker.sceneMotion;
  assert.equal(motion.sceneKind, "rain");
  assert.equal(motion.appReduced, false);
  assert.equal(motion.systemReduced, true);
  assert.equal(motion.sceneActive, true);
  assert.equal(motion.visibilityState, "visible");
  assert.equal(motion.animationName, "scene-drift");
  assert.equal(motion.animationIterationCount, "1");
  assert.ok(durationMilliseconds(motion.animationDuration) <= 0.02);
  assert.equal(report.result, "reduced-motion-passed");
  return motion;
}

function ensureNoProductRunning() {
  const output = execFileSync("tasklist.exe", ["/FI", "IMAGENAME eq weatherpoem.exe", "/FO", "CSV", "/NH"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.ok(!output.toLowerCase().includes('"weatherpoem.exe"'), "WeatherPoem is already running");
}

async function waitForMarker(markerPath, child) {
  const deadline = Date.now() + 15_000;
  while (!existsSync(markerPath)) {
    if (child.exitCode !== null) throw new Error(`Internal EXE exited before ready: ${child.exitCode}`);
    if (Date.now() >= deadline) throw new Error("Internal EXE did not emit a ready marker within 15 seconds");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return JSON.parse(readFileSync(markerPath, "utf8"));
}

async function stopExactChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`PID ${child.pid} did not exit`)), 5000)),
  ]);
}

async function cleanupIsolatedRoot(root) {
  const tempRoot = realpathSync(os.tmpdir());
  const resolved = realpathSync(root);
  assert.ok(resolved.toLowerCase().startsWith(`${tempRoot}${path.sep}`.toLowerCase()));
  assert.ok(path.basename(resolved).startsWith("WeatherPoem.Performance.ReducedMotion."));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(resolved, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code) || attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
}

async function runProbe() {
  ensureNoProductRunning();
  assert.ok(!existsSync(reportPath), "Refusing to overwrite reduced-motion evidence");
  const exeBytes = readFileSync(exePath);
  const root = mkdtempSync(path.join(os.tmpdir(), "WeatherPoem.Performance.ReducedMotion."));
  let child;
  try {
    for (const segment of ["appdata", "localappdata", "temp/probe"]) {
      mkdirSync(path.join(root, segment), { recursive: true });
    }
    seedPerformanceProfile(root, { reduceMotion: false });
    const runId = randomUUID();
    const markerPath = path.join(root, "temp", "probe", "weatherpoem-performance-ready.json");
    child = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        APPDATA: path.join(root, "appdata"),
        LOCALAPPDATA: path.join(root, "localappdata"),
        WEATHERPOEM_PERFORMANCE_PROFILE: root,
        WEATHERPOEM_PERFORMANCE_PROBE: markerPath,
        WEATHERPOEM_PERFORMANCE_RUN_ID: runId,
        WEATHERPOEM_PERFORMANCE_SCENARIO: scenario,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: webViewArguments,
      },
    });
    const marker = await waitForMarker(markerPath, child);
    const report = {
      schemaVersion: "1.0",
      testKind: "isolated-webview-reduced-motion",
      generatedAt: new Date().toISOString(),
      artifact: {
        path: artifactRelativePath,
        sha256: createHash("sha256").update(exeBytes).digest("hex").toUpperCase(),
      },
      scenario,
      webViewArguments,
      realUserDataTouched: false,
      systemSettingChanged: false,
      runId,
      processId: child.pid,
      readyMarker: marker,
      result: "reduced-motion-passed",
    };
    try {
      validateReducedMotionReport(report, exeBytes);
    } catch (error) {
      report.result = "reduced-motion-failed";
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      throw error;
    }
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Reduced-motion WebView probe passed: ${reportPath}`);
  } finally {
    await stopExactChild(child);
    await cleanupIsolatedRoot(root);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = process.argv.slice(2);
  if (options.some((option) => option !== "--check" && option !== candidateOption)) {
    throw new Error("Unknown reduced-motion probe option");
  }
  if (options.includes("--check")) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    validateReducedMotionReport(report, readFileSync(exePath));
    console.log(`Reduced-motion WebView evidence verified: ${reportPath}`);
  } else {
    await runProbe();
  }
}
