import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { resolvePerformanceDatabasePath, seedPerformanceProfile } from "./seed-performance-profile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidate = path.resolve(process.argv[2] ?? "");
const reportPath = path.resolve(process.argv[3] ?? "");
const internalRoot = path.join(root, ".work") + path.sep;
const evidenceRoot = path.join(root, "review", "redesign", "evidence") + path.sep;
assert.ok(candidate.toLowerCase().startsWith(internalRoot.toLowerCase()) &&
  path.basename(candidate).toLowerCase() === "weatherpoem.exe", "Use an internal EXE");
assert.ok(reportPath.toLowerCase().startsWith(evidenceRoot.toLowerCase()) &&
  reportPath.endsWith(".json"), "Use a redesign evidence JSON path");
assert.ok(existsSync(candidate), "Internal EXE is missing");
assert.ok(!existsSync(reportPath), "Refusing to overwrite evidence");
const running = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  "Get-CimInstance Win32_Process -Filter \"name = 'weatherpoem.exe'\" | Select-Object -ExpandProperty ProcessId",
], { encoding: "utf8" }).trim();
assert.equal(running, "", "WeatherPoem is already running");

async function waitFor(predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const profile = mkdtempSync(path.join(tmpdir(), "WeatherPoem.Performance.LiveWeatherTouch."));
const markerPath = path.join(profile, "temp", "probe", "weatherpoem-performance-ready.json");
const screenshotPath = reportPath.replace(/\.json$/, "_after.png");
const report = {
  schemaVersion: "1.0",
  testKind: "isolated-native-live-weather-touched-card",
  generatedAt: new Date().toISOString(),
  candidate: {
    path: path.relative(root, candidate).replaceAll(path.sep, "/"),
    sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase(),
  },
  testHarness: {
    path: "scripts/diagnose-redesign-native-weather-touch.mjs",
    sha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex").toUpperCase(),
  },
  isolation: {
    temporaryProfile: true,
    realUserDataTouched: false,
    systemClockChanged: false,
    systemSettingsChanged: false,
    installedOrUninstalled: false,
    weatherRequest: "natural-app-request-to-open-meteo",
  },
  limitations: [
    "One host, city, date and natural network timing; a first-screen live result makes this particular late-arrival test inconclusive.",
    "CDP mouse input is sent to the isolated native WebView2; it is not a human usability study.",
    "A page screenshot is not a compositor-frame or screen-reader audit.",
  ],
  result: "in-progress",
};
let child;
let socket;
let failure;
let nextId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result.value;
}

const pageState = `(() => {
  let cached = null;
  try {
    const raw = localStorage.getItem('weatherpoem.weather-cache.v1');
    const parsed = raw ? JSON.parse(raw) : null;
    cached = parsed ? { cityId: parsed.cityId, source: parsed.weather?.source,
      label: parsed.weather?.label, observedAt: parsed.weather?.observedAt } : null;
  } catch { cached = { malformed: true }; }
  return {
    title: document.querySelector('.poem-view h1')?.textContent,
    context: document.querySelector('.context-strip')?.textContent,
    loading: Boolean(document.querySelector('.loading-view')),
    warning: Boolean(document.querySelector('.warning-view')),
    cached,
    inputEvents: window.__weatherTouchInputEvents ?? 0,
    weatherResourceDurationsMs: performance.getEntriesByType('resource')
      .filter((item) => item.name.includes('api.open-meteo.com'))
      .map((item) => item.duration),
  };
})()`;

try {
  for (const segment of ["appdata", "localappdata", "temp/probe"]) {
    mkdirSync(path.join(profile, segment), { recursive: true });
  }
  seedPerformanceProfile(profile);
  const port = await freePort();
  child = spawn(candidate, [], {
    cwd: path.dirname(candidate), windowsHide: false, stdio: "ignore",
    env: {
      ...process.env,
      APPDATA: path.join(profile, "appdata"),
      LOCALAPPDATA: path.join(profile, "localappdata"),
      WEATHERPOEM_PERFORMANCE_PROFILE: profile,
      WEATHERPOEM_PERFORMANCE_PROBE: markerPath,
      WEATHERPOEM_PERFORMANCE_RUN_ID: randomUUID().replaceAll("-", ""),
      WEATHERPOEM_PERFORMANCE_SCENARIO: "",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await waitFor(() => {
    if (child.exitCode !== null) throw new Error(`Isolated EXE exited: ${child.exitCode}`);
    return existsSync(markerPath);
  }, "native ready marker", 25000);
  report.readyMarker = JSON.parse(readFileSync(markerPath, "utf8"));

  let target;
  await waitFor(async () => {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
      return Boolean(target);
    } catch { return false; }
  }, "isolated WebView2 target");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });

  report.initialPage = await evaluate(pageState);
  if (report.readyMarker.readyMode !== "offline-rules" || !report.initialPage.title) {
    report.result = "inconclusive-no-initial-offline-poem";
  } else {
    const point = await evaluate(`(() => {
      window.__weatherTouchInputEvents = 0;
      document.addEventListener('pointerdown', (event) => {
        if (event.target instanceof Element && event.target.closest('.poem-view')) {
          window.__weatherTouchInputEvents += 1;
        }
      }, { capture: true, once: true });
      const element = document.querySelector('.poem-view h1');
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`);
    assert.ok(point, "Poem title has no hit target");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y,
      button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y,
      button: "left", buttons: 0, clickCount: 1 });
    report.afterTouch = await evaluate(pageState);
    assert.equal(report.afterTouch.inputEvents, 1, "Native pointerdown did not reach the poem card");
    report.naturalWaitMs = 8000;
    await delay(report.naturalWaitMs);
    report.afterNaturalWait = await evaluate(pageState);
    const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
    try {
      report.nativeDailyState = database.prepare(
        "SELECT local_date, state, work_id FROM daily_state ORDER BY local_date DESC LIMIT 1",
      ).get();
      report.nativeDisplayEvents = database.prepare(
        "SELECT local_date, work_id, primary_context FROM recommendation_display_events ORDER BY id",
      ).all();
    } finally {
      database.close();
    }
    assert.ok(!existsSync(screenshotPath), "Refusing to overwrite screenshot");
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(screenshotPath, Buffer.from(shot.data, "base64"));
    report.screenshot = path.relative(root, screenshotPath).replaceAll(path.sep, "/");
    const live = report.afterNaturalWait.cached?.source === "open-meteo";
    report.result = !live ? "inconclusive-live-weather-not-observed" :
      report.afterNaturalWait.title === report.initialPage.title &&
      report.afterNaturalWait.context?.includes(report.afterNaturalWait.cached.label) &&
      report.nativeDisplayEvents?.length === 1 &&
      report.nativeDailyState?.work_id === report.nativeDisplayEvents[0].work_id &&
      !report.afterNaturalWait.loading && !report.afterNaturalWait.warning
        ? "passed-poem-preserved-live-context-updated"
        : "failed-reader-poem-preservation";
  }
} catch (error) {
  report.result = "diagnostic-failed";
  report.error = String(error?.stack ?? error);
  failure = error;
} finally {
  socket?.close();
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    try {
      await Promise.race([exited, delay(5000).then(() => {
        throw new Error(`Isolated PID ${child.pid} did not exit`);
      })]);
    } catch (error) {
      failure ??= error;
      report.cleanupError = String(error);
      report.result = "diagnostic-failed-cleanup";
    }
  }
  if (existsSync(profile)) {
    const tempRoot = realpathSync(tmpdir()) + path.sep;
    const exact = realpathSync(profile);
    assert.ok(exact.toLowerCase().startsWith(tempRoot.toLowerCase()) &&
      path.basename(exact).startsWith("WeatherPoem.Performance.LiveWeatherTouch."),
    "Refusing to remove an unexpected native profile");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { rmSync(exact, { recursive: true, force: true }); break; }
      catch (error) {
        if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code) || attempt === 19) {
          failure ??= error;
          report.cleanupError = String(error);
          report.result = "diagnostic-failed-cleanup";
          break;
        }
        await delay(500);
      }
    }
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (failure) throw failure;
process.stdout.write(`${JSON.stringify({ result: report.result, reportPath,
  candidateSha256: report.candidate.sha256 })}\n`);
