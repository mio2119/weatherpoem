import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { seedPerformanceProfile } from "./seed-performance-profile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidate = path.resolve(process.argv[2] ?? "");
const reportPath = path.resolve(process.argv[3] ?? "");
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
  isolation: { temporaryProfile: true, realUserDataTouched: false, installedOrUninstalled: false, systemClockChanged: false },
  startup: null,
  startupNetwork: [],
  webViewFetches: [],
  result: "in-progress",
};
let child;
let socket;
let failure;
let nextId = 0;
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
  await waitFor(() => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Isolated EXE exited before ready");
    return existsSync(markerPath);
  }, "native ready marker", 25000);
  report.startup = JSON.parse(readFileSync(markerPath, "utf8"));
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
