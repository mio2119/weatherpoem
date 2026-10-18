import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
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
const simulateLateWarning = process.argv.includes("--simulate-late-warning");
const simulateCrossDayRain = process.argv.includes("--simulate-cross-day-rain");
const simulateFirstUseRain = process.argv.includes("--simulate-first-use-rain");
const auditToastMotion = process.argv.includes("--audit-toast-motion");
assert.ok([simulateLateWarning, simulateCrossDayRain, simulateFirstUseRain].filter(Boolean).length <= 1, "Choose one synthetic weather scenario");
assert.ok(!auditToastMotion || simulateFirstUseRain, "Toast motion audit requires the first-use scenario");
const observeLate = process.argv.includes("--observe-late") || simulateLateWarning || simulateCrossDayRain || simulateFirstUseRain;
assert.ok(candidate.toLowerCase().startsWith((path.join(root, ".work") + path.sep).toLowerCase()) && path.basename(candidate).toLowerCase() === "weatherpoem.exe", "Use an internal EXE");
assert.ok(reportPath.toLowerCase().startsWith((path.join(root, "review", "redesign", "evidence") + path.sep).toLowerCase()) && reportPath.endsWith(".json"), "Use a redesign evidence JSON path");
assert.ok(existsSync(candidate) && !existsSync(reportPath), "Candidate missing or report already exists");
const running = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -Filter \"name = 'weatherpoem.exe'\" | Select-Object -ExpandProperty ProcessId"], { encoding: "utf8" }).trim();
assert.equal(running, "", "Do not disturb another WeatherPoem process");

const profile = mkdtempSync(path.join(tmpdir(), "WeatherPoem.Performance.WeatherDiagnostic."));
const report = {
  schemaVersion: "1.0",
  testKind: "isolated-native-weather-network-diagnostic",
  generatedAt: new Date().toISOString(),
  candidate: {
    path: path.relative(root, candidate).replaceAll(path.sep, "/"),
    sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase(),
  },
  isolation: { temporaryProfile: true, realUserDataTouched: false, installedOrUninstalled: false, systemClockChanged: false, pageLocalClockChanged: simulateCrossDayRain || simulateFirstUseRain },
  simulatedWarning: simulateLateWarning,
  simulatedCrossDayRain: simulateCrossDayRain,
  simulatedFirstUseRain: simulateFirstUseRain,
  auditToastMotion,
  startup: null,
  startupNetwork: [],
  webViewFetches: [],
  nativeViews: null,
  result: "in-progress",
};
let child;
let socket;
let failure;
let nextId = 0;
let interceptedWeatherRequests = 0;
let syntheticObservedAtSeconds;
const pending = new Map();

async function waitFor(predicate, label, timeoutMs = 20000) {
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

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 12000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}

try {
  for (const segment of ["appdata", "localappdata", "temp/probe"]) mkdirSync(path.join(profile, segment), { recursive: true });
  seedPerformanceProfile(profile);
  if (simulateFirstUseRain) {
    const database = new DatabaseSync(resolvePerformanceDatabasePath(profile));
    try {
      const settings = JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value);
      settings.configured = false;
      database.prepare("UPDATE app_kv SET value = ? WHERE key = 'settings'").run(JSON.stringify(settings));
    } finally {
      database.close();
    }
  }
  const markerPath = path.join(profile, "temp", "probe", "weatherpoem-performance-ready.json");
  const port = await freePort();
  child = spawn(candidate, [], {
    cwd: path.dirname(candidate),
    windowsHide: false,
    stdio: "ignore",
    env: {
      ...process.env,
      APPDATA: path.join(profile, "appdata"),
      LOCALAPPDATA: path.join(profile, "localappdata"),
      WEATHERPOEM_PERFORMANCE_PROFILE: profile,
      WEATHERPOEM_PERFORMANCE_PROBE: markerPath,
      WEATHERPOEM_PERFORMANCE_RUN_ID: randomUUID().replaceAll("-", ""),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  let target;
  await waitFor(async () => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Isolated EXE exited before WebView2 target");
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
    if ((simulateLateWarning || simulateCrossDayRain || simulateFirstUseRain) && message.method === "Fetch.requestPaused" && message.params?.request?.url?.startsWith("https://api.open-meteo.com/")) {
      interceptedWeatherRequests += 1;
      const requestId = message.params.requestId;
      if (interceptedWeatherRequests === 2) {
        const payload = JSON.stringify({ current: {
          time: syntheticObservedAtSeconds ?? Math.floor(Date.now() / 1000),
          weather_code: (simulateCrossDayRain || simulateFirstUseRain) ? 61 : 95,
          temperature_2m: 20,
          apparent_temperature: 20,
          precipitation: (simulateCrossDayRain || simulateFirstUseRain) ? 0.3 : 12,
          wind_speed_10m: 8,
        } });
        const fulfill = () => {
          void send("Fetch.fulfillRequest", {
            requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: "application/json" },
              { name: "Access-Control-Allow-Origin", value: "*" },
            ],
            body: Buffer.from(payload).toString("base64"),
          }).catch((error) => { failure ??= error; });
        };
        if (simulateCrossDayRain || simulateFirstUseRain) setTimeout(fulfill, 1800);
        else fulfill();
      }
    }
    if (message.method === "Network.requestWillBeSent" && message.params?.request?.url?.startsWith("https://api.open-meteo.com/")) {
      report.startupNetwork.push({ requestId: message.params.requestId, event: "request", timestamp: message.params.timestamp });
    }
    if (["Network.responseReceived", "Network.loadingFailed", "Network.loadingFinished"].includes(message.method)) {
      const event = report.startupNetwork.find((entry) => entry.requestId === message.params?.requestId);
      if (event) {
        report.startupNetwork.push({ requestId: event.requestId, event: message.method.slice(8), timestamp: message.params.timestamp, status: message.params.response?.status, errorText: message.params.errorText, canceled: message.params.canceled });
      }
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  await send("Network.enable");
  if (simulateLateWarning || simulateFirstUseRain) {
    await send("Fetch.enable", { patterns: [{ urlPattern: "https://api.open-meteo.com/*" }] });
  }
  await waitFor(() => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Isolated EXE exited before ready");
    return existsSync(markerPath);
  }, "native ready marker", 25000);
  report.startup = JSON.parse(readFileSync(markerPath, "utf8"));
  if (observeLate) {
    const view = () => evaluate(`(() => ({
      title: document.querySelector('.poem-view h1')?.textContent ?? null,
      context: document.querySelector('.context-strip')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
      warning: Boolean(document.querySelector('.warning-view')),
      loading: Boolean(document.querySelector('.loading-view')),
      toast: document.querySelector('.toast-message')?.textContent ?? null,
      toastOverlapsReadButton: (() => {
        const toast = document.querySelector('.toast-message');
        const read = document.querySelector('.poem-view .read-button');
        if (!toast || !read) return null;
        const a = toast.getBoundingClientRect();
        const b = read.getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      })(),
    }))()`);
    const pageTomorrowClock = () => evaluate(`(() => {
      const RealDate = Date;
      const tomorrow = new RealDate(RealDate.now() + 86400000);
      tomorrow.setHours(9, 0, 0, 0);
      const fixed = tomorrow.getTime();
      window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [fixed])); }
        static now() { return fixed; }
      };
      return { localDate: tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0'), displayDate: String(tomorrow.getMonth() + 1) + '月' + tomorrow.getDate() + '日', unixSeconds: Math.floor(fixed / 1000) };
    })()`);
    const screenshot = async (label) => {
      const imagePath = reportPath.replace(/\.json$/, `_${label}.png`);
      assert.ok(!existsSync(imagePath), "Refusing to overwrite a native screenshot");
      const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(imagePath, Buffer.from(image.data, "base64"));
      return path.relative(root, imagePath).replaceAll(path.sep, "/");
    };
    report.nativeViews = {
      atReady: await view(),
      atReadyScreenshot: await screenshot("ready"),
    };
    if (!simulateFirstUseRain) await delay(6500);
    if (simulateFirstUseRain) {
      const clock = await pageTomorrowClock();
      syntheticObservedAtSeconds = clock.unixSeconds;
      report.firstUse = { clock, pageLocalOnly: true, selectedCityId: "hangzhou" };
      assert.equal(report.startup.readyMode, "local-onboarding");
      if (auditToastMotion) await evaluate(`(() => {
        const samples = [];
        const sample = () => {
          const view = document.querySelector('.poem-view');
          const read = view?.querySelector('.read-button');
          const toast = document.querySelector('.toast-message');
          const viewRect = view?.getBoundingClientRect();
          const readRect = read?.getBoundingClientRect();
          const toastRect = toast?.getBoundingClientRect();
          samples.push({ elapsedMs: Math.round(performance.now() - started), viewportHeight: innerHeight,
            toastText: toast?.textContent ?? null,
            viewScrollHeight: view?.scrollHeight ?? null, viewClientHeight: view?.clientHeight ?? null,
            readFullyVisible: Boolean(viewRect && readRect && readRect.top >= viewRect.top && readRect.bottom <= viewRect.bottom),
            toastOverlapsRead: Boolean(toastRect && readRect && toastRect.left < readRect.right && toastRect.right > readRect.left && toastRect.top < readRect.bottom && toastRect.bottom > readRect.top) });
        };
        const started = performance.now();
        sample();
        window.__weatherpoemToastMotion = { samples, interval: setInterval(sample, 50) };
      })()`);
      await evaluate(`(() => {
        const search = document.querySelector('#city-search');
        search.value = '杭州';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await waitFor(() => evaluate("Boolean(document.querySelector('input[value=\"hangzhou\"]'))"), "Hangzhou choice");
      await evaluate(`(() => {
        document.querySelector('input[value="hangzhou"]').click();
        document.querySelector('.consent-row input').click();
        document.querySelector('.onboarding-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()`);
      await waitFor(async () => {
        const current = await view();
        return current.context?.includes(clock.displayDate) && current.context?.includes("天气未更新") && current.title;
      }, "first-use offline poem", 25000);
      report.nativeViews.firstUseBeforeLate = await view();
      report.nativeViews.firstUseBeforeLateScreenshot = await screenshot("first_use_before_late");
      await waitFor(async () => (await view()).context?.includes("小雨"), "delayed first-use rainy weather", 15000);
      report.nativeViews.afterWait = await view();
      report.nativeViews.afterWaitScreenshot = await screenshot("after");
      report.interceptedWeatherRequests = interceptedWeatherRequests;
      assert.ok(interceptedWeatherRequests >= 2, "The first-use request and retry were not both intercepted");
      assert.notEqual(report.nativeViews.firstUseBeforeLate.title, report.nativeViews.afterWait.title, "Late rain did not update the untouched first-use poem");
      assert.ok(report.nativeViews.afterWait.context?.includes(clock.displayDate));
      assert.notEqual(report.nativeViews.afterWait.toastOverlapsReadButton, true, "Toast covers the first-use read button");
      const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
      try {
        report.savedSettings = JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value);
        report.savedDailyState = database.prepare("SELECT local_date, state, work_id FROM daily_state ORDER BY local_date DESC LIMIT 1").get();
      } finally {
        database.close();
      }
      assert.equal(report.savedSettings.cityId, "hangzhou");
      assert.equal(report.savedDailyState?.local_date, clock.localDate);
      assert.equal(report.savedDailyState?.state, "shown");
      if (auditToastMotion) {
        await delay(2800);
        report.toastMotion = await evaluate(`(() => {
          clearInterval(window.__weatherpoemToastMotion.interval);
          return window.__weatherpoemToastMotion.samples;
        })()`);
        assert.ok(report.toastMotion.length > 50, "Toast motion timeline is too short");
        assert.equal(report.toastMotion.some((sample) => sample.toastOverlapsRead), false, "Toast briefly covered the read button during enter or leave");
        assert.equal(report.toastMotion.at(-1)?.toastText, null, "The toast did not leave after its display period");
      }
    } else if (simulateCrossDayRain) {
      report.nativeViews.beforeCrossDay = await view();
      const clock = await pageTomorrowClock();
      syntheticObservedAtSeconds = clock.unixSeconds;
      report.crossDay = { clock, pageLocalOnly: true };
      await send("Fetch.enable", { patterns: [{ urlPattern: "https://api.open-meteo.com/*" }] });
      await evaluate("window.dispatchEvent(new Event('focus'))");
      await waitFor(async () => {
        const current = await view();
        return current.context?.includes(clock.displayDate) && current.title;
      }, "new local-day native poem", 25000);
      report.nativeViews.newDayBeforeLate = await view();
      report.nativeViews.newDayBeforeLateScreenshot = await screenshot("new_day_before_late");
      await waitFor(async () => (await view()).context?.includes("小雨"), "delayed cross-day rainy weather", 15000);
      report.nativeViews.afterWait = await view();
      report.nativeViews.afterWaitScreenshot = await screenshot("after");
      report.interceptedWeatherRequests = interceptedWeatherRequests;
      assert.ok(interceptedWeatherRequests >= 2, "The cross-day request and delayed retry were not both intercepted");
      assert.ok(report.nativeViews.afterWait.context?.includes(clock.displayDate));
      assert.ok(report.nativeViews.afterWait.context?.includes("小雨"));
      assert.notEqual(report.nativeViews.afterWait.toastOverlapsReadButton, true, "Toast covers the cross-day read button");
      const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
      try {
        report.savedDailyState = database.prepare("SELECT local_date, state, work_id FROM daily_state ORDER BY local_date DESC LIMIT 1").get();
      } finally {
        database.close();
      }
      assert.equal(report.savedDailyState?.local_date, clock.localDate);
      assert.equal(report.savedDailyState?.state, "shown");
    } else {
      report.nativeViews.afterWait = await view();
      report.nativeViews.afterWaitScreenshot = await screenshot("after");
    }
    if (simulateLateWarning) {
      report.interceptedWeatherRequests = interceptedWeatherRequests;
      assert.ok(interceptedWeatherRequests >= 2, "The initial request and delayed retry were not both intercepted");
      if (report.nativeViews.atReady.warning) {
        assert.equal(report.nativeViews.atReady.title, null, "An old poem was visible at the ready marker");
      }
      assert.equal(report.nativeViews.afterWait.warning, true, "The delayed warning did not suppress the poem");
      assert.equal(report.nativeViews.afterWait.title, null, "An old poem remains visible after the delayed warning");
      const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
      try {
        report.savedDailyState = database.prepare("SELECT local_date, state, work_id FROM daily_state ORDER BY local_date DESC LIMIT 1").get();
      } finally {
        database.close();
      }
      assert.equal(report.savedDailyState?.state, "alert-suppressed");
    }
  } else {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=39.9042&longitude=116.4074&current=temperature_2m%2Capparent_temperature%2Cprecipitation%2Cweather_code%2Cwind_speed_10m&timezone=auto&timeformat=unixtime";
    for (const timeoutMs of [1100, 5000]) {
      report.webViewFetches.push(await evaluate(`(async () => {
      const controller = new AbortController();
      const started = performance.now();
      const timer = setTimeout(() => controller.abort(), ${timeoutMs});
      try {
        const response = await fetch(${JSON.stringify(url)}, { signal: controller.signal });
        const payload = await response.json();
        return { timeoutMs: ${timeoutMs}, elapsedMs: Math.round(performance.now() - started), httpStatus: response.status, currentTime: payload.current?.time ?? null, hasRequiredFields: Boolean(payload.current && Number.isInteger(payload.current.weather_code) && Number.isFinite(payload.current.temperature_2m) && Number.isFinite(payload.current.wind_speed_10m) && Number.isFinite(payload.current.precipitation)) };
      } catch (error) {
        return { timeoutMs: ${timeoutMs}, elapsedMs: Math.round(performance.now() - started), errorName: error.name, errorMessage: String(error.message).slice(0, 200) };
      } finally { clearTimeout(timer); }
      })()`));
    }
  }
  report.result = "diagnostic-captured";
} catch (error) {
  failure = error;
  report.result = "failed";
  report.error = String(error?.stack ?? error);
} finally {
  socket?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    try { await Promise.race([exited, delay(5000).then(() => { throw new Error("Exact isolated EXE did not exit"); })]); }
    catch (error) { failure ??= error; report.result = "failed"; report.cleanupError = String(error); }
  }
  const exact = realpathSync(profile);
  assert.ok(exact.startsWith(realpathSync(tmpdir()) + path.sep) && path.basename(exact).startsWith("WeatherPoem.Performance.WeatherDiagnostic."));
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { rmSync(exact, { recursive: true, force: true }); break; }
      catch (error) {
        if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code) || attempt === 19) {
          failure ??= error; report.result = "failed"; report.cleanupError = String(error); break;
        }
        await delay(750);
      }
    }
  } else {
    report.result = "failed";
    report.cleanupError = "Exact isolated EXE remains running; temporary profile retained";
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
if (failure) throw failure;
process.stdout.write(`${JSON.stringify({ result: report.result, startupMode: report.startup?.readyMode, webViewFetches: report.webViewFetches })}\n`);
