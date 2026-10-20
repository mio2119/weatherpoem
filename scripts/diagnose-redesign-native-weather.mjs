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
assert.ok(!existsSync(reportPath), "Refusing to overwrite weather diagnostics");
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

async function stopExactChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, delay(5000).then(() => {
    throw new Error(`Isolated PID ${child.pid} did not exit`);
  })]);
}

const profile = mkdtempSync(path.join(tmpdir(), "WeatherPoem.Performance.LiveWeather."));
const markerPath = path.join(profile, "temp", "probe", "weatherpoem-performance-ready.json");
const screenshotPath = reportPath.replace(/\.json$/, "_after.png");
const harnessPath = fileURLToPath(import.meta.url);
const report = {
  schemaVersion: "1.0",
  testKind: "isolated-native-live-weather-diagnostic",
  generatedAt: new Date().toISOString(),
  candidate: {
    path: path.relative(root, candidate).replaceAll(path.sep, "/"),
    sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase(),
  },
  testHarness: {
    path: "scripts/diagnose-redesign-native-weather.mjs",
    sha256: createHash("sha256").update(readFileSync(harnessPath)).digest("hex").toUpperCase(),
  },
  isolation: {
    temporaryProfile: true,
    realUserDataTouched: false,
    systemClockChanged: false,
    systemSettingsChanged: false,
    installedOrUninstalled: false,
    liveReadOnlyWeatherRequest: true,
  },
  limitations: [
    "This is one host and one session; a direct WebView2 fetch does not prove the app's 1.1-second first-screen deadline.",
    "The direct WebView2 request runs only after the app's natural eight-second state and SQLite history have been captured.",
    "The screenshot and page state are samples, not compositor-frame or production service monitoring.",
  ],
  result: "in-progress",
};
let child;
let socket;
let nextId = 0;
let failure;
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
  const cachedText = localStorage.getItem('weatherpoem.weather-cache.v1');
  let cached = null;
  try {
    const parsed = cachedText ? JSON.parse(cachedText) : null;
    cached = parsed ? {
      cityId: parsed.cityId,
      source: parsed.weather?.source,
      label: parsed.weather?.label,
      observedAt: parsed.weather?.observedAt,
      cachedAt: parsed.cachedAt,
    } : null;
  } catch { cached = { malformed: true }; }
  return {
    pageUrl: location.href,
    onlineHint: navigator.onLine,
    title: document.querySelector('.poem-view h1')?.textContent,
    context: document.querySelector('.context-strip')?.textContent,
    warning: Boolean(document.querySelector('.warning-view')),
    loading: Boolean(document.querySelector('.loading-view')),
    cached,
    weatherResources: performance.getEntriesByType('resource')
      .filter((item) => item.name.includes('api.open-meteo.com'))
      .map((item) => ({ name: item.name.split('?')[0], durationMs: item.duration, transferSize: item.transferSize })),
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
  }, "native weather ready marker", 25000);
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
  assert.ok(!existsSync(screenshotPath), "Refusing to overwrite native weather screenshot");
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(shot.data, "base64"));
  report.screenshot = path.relative(root, screenshotPath).replaceAll(path.sep, "/");
  report.directRequestAfterObservation = await evaluate(`(async () => {
    const started = performance.now();
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=39.9042&longitude=116.4074&current=temperature_2m%2Capparent_temperature%2Cprecipitation%2Cweather_code%2Cwind_speed_10m&timezone=auto&timeformat=unixtime';
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const body = response.ok ? await response.json() : null;
      return {
        ok: response.ok, status: response.status,
        elapsedMs: performance.now() - started,
        currentTime: body?.current?.time,
        weatherCode: body?.current?.weather_code,
        hostNowUnixSeconds: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      return { ok: false, errorName: error?.name, errorMessage: String(error?.message ?? error), elapsedMs: performance.now() - started };
    }
  })()`);
  report.liveUiConsistent = report.afterNaturalWait.cached?.source === "open-meteo" &&
    Boolean(report.afterNaturalWait.title) &&
    Boolean(report.afterNaturalWait.context?.includes(report.afterNaturalWait.cached.label)) &&
    !report.afterNaturalWait.loading && !report.afterNaturalWait.warning;
  report.result = report.liveUiConsistent
    ? "live-weather-observed-after-start"
    : report.directRequestAfterObservation.ok
      ? "webview-api-reachable-but-live-view-unconfirmed"
      : "webview-api-unreachable-in-this-session";
} catch (error) {
  report.result = "diagnostic-failed";
  report.error = String(error?.stack ?? error);
  failure = error;
} finally {
  socket?.close();
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
  try { await stopExactChild(child); } catch (error) {
    failure ??= error;
    report.cleanupError = String(error);
    report.result = "diagnostic-failed-cleanup";
  }
  if (existsSync(profile)) {
    const tempRoot = realpathSync(tmpdir()) + path.sep;
    const exact = realpathSync(profile);
    assert.ok(exact.toLowerCase().startsWith(tempRoot.toLowerCase()) &&
      path.basename(exact).startsWith("WeatherPoem.Performance.LiveWeather."),
    "Refusing to remove an unexpected native weather profile");
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
process.stdout.write(`${JSON.stringify({ result: report.result, reportPath, candidateSha256: report.candidate.sha256 })}\n`);
