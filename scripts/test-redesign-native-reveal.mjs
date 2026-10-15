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
const nativeClose = process.argv.includes("--native-close");
const withdrawal = process.argv.includes("--withdrawal");
const capture = process.argv.includes("--capture");
const internalRoot = path.join(root, ".work") + path.sep;
const evidenceRoot = path.join(root, "review", "redesign", "evidence") + path.sep;
assert.ok(candidate.toLowerCase().startsWith(internalRoot.toLowerCase()) && candidate.endsWith("weatherpoem.exe"), "Use an isolated internal candidate");
assert.ok(reportPath.toLowerCase().startsWith(evidenceRoot.toLowerCase()) && reportPath.endsWith(".json"), "Use a redesign evidence JSON path");
assert.ok(existsSync(candidate), "Internal candidate is missing");
assert.ok(!existsSync(reportPath), "Refusing to overwrite evidence");
const running = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -Filter \"name = 'weatherpoem.exe'\" | Select-Object -ExpandProperty ProcessId"], { encoding: "utf8" }).trim();
assert.equal(running, "", "WeatherPoem is already running; refusing to disturb it");

async function waitFor(predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(40);
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
  await Promise.race([exited, delay(5000).then(() => { throw new Error(`Isolated PID ${child.pid} did not exit`); })]);
}

const profile = mkdtempSync(path.join(tmpdir(), "WeatherPoem.Performance.Reveal."));
let child;
let socket;
let nextId = 0;
const pending = new Map();
try {
  for (const segment of ["appdata", "localappdata", "temp/probe"]) {
    mkdirSync(path.join(profile, segment), { recursive: true });
  }
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
      WEATHERPOEM_PERFORMANCE_SCENARIO: "weather-offline",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await waitFor(() => {
    if (child.exitCode !== null) throw new Error(`Isolated candidate exited: ${child.exitCode}`);
    return existsSync(markerPath);
  }, "native ready marker", 25000);
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(marker.readyView, "poem");
  let target;
  await waitFor(async () => {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
      return Boolean(target);
    } catch { return false; }
  }, "isolated WebView2 debugging target");
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
  function send(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "WebView2 evaluation failed");
    return response.result.value;
  }
  async function screenshot(label) {
    if (!capture) return undefined;
    const imagePath = reportPath.replace(/\.json$/, `_${label}.png`);
    assert.ok(!existsSync(imagePath), "Refusing to overwrite a native screenshot");
    const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(imagePath, Buffer.from(image.data, "base64"));
    return path.relative(root, imagePath).replaceAll(path.sep, "/");
  }
  const original = await evaluate("({ date: document.querySelector('.context-strip strong')?.textContent, title: document.querySelector('.poem-view h1')?.textContent, visible: document.visibilityState, poem: Boolean(document.querySelector('.poem-view')) })");
  assert.equal(original.visible, "visible");
  assert.equal(original.poem, true);
  const firstScreenshot = await screenshot("before");
  if (nativeClose) {
    execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(root, "scripts", "request-exact-window-close.ps1"),
      "-TargetProcessId", String(child.pid), "-ExpectedExePath", candidate,
    ], { encoding: "utf8" });
  } else {
    await evaluate("document.querySelector('button[aria-label=\"隐藏到托盘\"]').click()");
  }
  try {
    await waitFor(async () => (await evaluate("(async () => !(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' })) && Boolean(document.querySelector('.loading-view')))()")) === true, "native hidden loading mask");
  } catch (error) {
    const diagnostic = await evaluate("(async () => ({ visibility: document.visibilityState, loading: Boolean(document.querySelector('.loading-view')), poem: Boolean(document.querySelector('.poem-view')), sceneActive: document.documentElement.dataset.sceneActive, nativeVisible: await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' }) }))()");
    throw new Error(`${error.message}; native diagnostic: ${JSON.stringify(diagnostic)}`);
  }
  const hidden = await evaluate("({ visibility: document.visibilityState, poem: Boolean(document.querySelector('.poem-view')), loading: Boolean(document.querySelector('.loading-view')) })");
  let expectedDate;
  let withdrawnWorkId;
  if (withdrawal) {
    const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
    try {
      const daily = database.prepare("SELECT work_id, content_version FROM daily_state ORDER BY local_date DESC LIMIT 1").get();
      assert.ok(daily?.work_id && daily?.content_version, "Isolated daily state was not saved");
      withdrawnWorkId = daily.work_id;
      const manifest = {
        schemaVersion: "1.0",
        contentVersion: daily.content_version,
        revision: 1,
        issuedAt: new Date().toISOString(),
        suspendRecommendations: false,
        withdrawnWorkIds: [daily.work_id],
      };
      await evaluate(`localStorage.setItem('weatherpoem.content-withdrawals.v1', ${JSON.stringify(JSON.stringify(manifest))})`);
    } finally {
      database.close();
    }
  } else {
    expectedDate = await evaluate(`(() => {
      const RealDate = Date;
      const tomorrow = new RealDate(RealDate.now() + 86400000);
      tomorrow.setHours(9, 0, 0, 0);
      const fixed = tomorrow.getTime();
      window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [fixed])); }
        static now() { return fixed; }
      };
      return String(tomorrow.getMonth() + 1) + '月' + tomorrow.getDate() + '日';
    })()`);
  }
  await evaluate(`(() => {
    window.__revealObserved = [];
    const sample = () => window.__revealObserved.push({
      visible: document.visibilityState,
      date: document.querySelector('.context-strip strong')?.textContent,
      poem: Boolean(document.querySelector('.poem-view')),
      loading: Boolean(document.querySelector('.loading-view')),
      correction: Boolean(document.querySelector('.content-correction-view')),
    });
    new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, characterData: true });
    document.addEventListener('visibilitychange', sample);
    sample();
  })()`);
  await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|show', { label: 'main' })");
  await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus', { label: 'main' })");
  if (withdrawal) {
    await waitFor(async () => (await evaluate("Boolean(document.querySelector('.content-correction-view')) && !document.querySelector('.poem-view')")) === true, "native content correction", 25000);
  } else {
    await waitFor(async () => (await evaluate(`document.querySelector('.context-strip strong')?.textContent === ${JSON.stringify(expectedDate)} && Boolean(document.querySelector('.poem-view'))`)) === true, "new local-day native poem", 25000);
  }
  const observed = await evaluate("window.__revealObserved");
  assert.equal(observed.some((frame) => frame.poem && (withdrawal || frame.date === original.date)), false, "Old poem was visible during reveal");
  let correctedDailyState;
  if (withdrawal) {
    const correctionText = await evaluate("document.querySelector('.content-correction-view')?.textContent");
    assert.ok(!correctionText.includes(original.title), "Withdrawn poem title leaked into correction view");
    const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
    try {
      correctedDailyState = database.prepare("SELECT state, work_id FROM daily_state ORDER BY local_date DESC LIMIT 1").get();
      assert.equal(correctedDailyState?.state, "content-withdrawn");
      assert.equal(correctedDailyState?.work_id, withdrawnWorkId);
    } finally {
      database.close();
    }
  }
  const finalScreenshot = await screenshot("after");
  const report = {
    schemaVersion: "1.0",
    testKind: withdrawal ? "isolated-native-hidden-content-withdrawal" : nativeClose ? "isolated-native-close-day-reveal" : "isolated-native-hidden-day-reveal",
    generatedAt: new Date().toISOString(),
    candidate: { path: path.relative(root, candidate).replaceAll(path.sep, "/"), sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase() },
    isolation: { temporaryProfile: true, systemClockChanged: false, installedOrUninstalled: false, realUserDataTouched: false },
    readyView: marker.readyView,
    original,
    hidden,
    expectedDate,
    withdrawnWorkId,
    correctedDailyState,
    screenshots: [firstScreenshot, finalScreenshot].filter(Boolean),
    observed,
    result: "passed",
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ result: report.result, sha256: report.candidate.sha256, reportPath, observations: observed.length })}\n`);
} finally {
  socket?.close();
  await stopExactChild(child);
  const tempRoot = realpathSync(tmpdir()) + path.sep;
  const exact = realpathSync(profile);
  assert.ok(exact.startsWith(tempRoot) && path.basename(exact).startsWith("WeatherPoem.Performance.Reveal."));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(exact, { recursive: true, force: true });
      break;
    } catch (error) {
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code) || attempt === 19) throw error;
      await delay(750);
    }
  }
}
