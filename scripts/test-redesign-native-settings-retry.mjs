import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
  path.basename(candidate).toLowerCase() === "weatherpoem.exe", "Use an isolated internal candidate");
assert.ok(reportPath.toLowerCase().startsWith(evidenceRoot.toLowerCase()) &&
  reportPath.endsWith(".json"), "Use a redesign evidence JSON path");
assert.ok(existsSync(candidate), "Internal candidate is missing");
assert.ok(!existsSync(reportPath), "Refusing to overwrite settings-retry evidence");
const running = execFileSync("powershell.exe", [
  "-NoProfile", "-NonInteractive", "-Command",
  "Get-CimInstance Win32_Process -Filter \"name = 'weatherpoem.exe'\" | Select-Object -ExpandProperty ProcessId",
], { encoding: "utf8" }).trim();
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
  await Promise.race([
    exited,
    delay(5000).then(() => { throw new Error(`Isolated PID ${child.pid} did not exit`); }),
  ]);
}

const profile = mkdtempSync(path.join(tmpdir(), "WeatherPoem.Performance.SettingsRetry."));
const markerPath = path.join(profile, "temp", "probe", "weatherpoem-performance-ready.json");
const databasePath = resolvePerformanceDatabasePath(profile);
const report = {
  schemaVersion: "1.0",
  testKind: "isolated-native-settings-save-failure-retry",
  generatedAt: new Date().toISOString(),
  candidate: {
    path: path.relative(root, candidate).replaceAll(path.sep, "/"),
    sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase(),
  },
  testHarness: {
    path: "scripts/test-redesign-native-settings-retry.mjs",
  },
  isolation: {
    temporaryProfile: true,
    syntheticSqliteTrigger: true,
    realUserDataTouched: false,
    systemClockChanged: false,
    systemAutostartChanged: false,
    systemDisplaySettingsChanged: false,
    installedOrUninstalled: false,
  },
  limitations: [
    "The SQLite trigger simulates a failed settings write inside an isolated native profile; it is not a physical disk-full, permission, or storage-device failure.",
    "CDP button interaction and the current Windows display do not replace manual input, screen-reader, or multi-DPI testing.",
  ],
};

let child;
let socket;
let database;
let nextId = 0;
const pending = new Map();

async function connectToCandidate() {
  const port = await freePort();
  const env = {
    ...process.env,
    APPDATA: path.join(profile, "appdata"),
    LOCALAPPDATA: path.join(profile, "localappdata"),
    WEATHERPOEM_PERFORMANCE_PROFILE: profile,
    WEATHERPOEM_PERFORMANCE_PROBE: markerPath,
    WEATHERPOEM_PERFORMANCE_RUN_ID: randomUUID().replaceAll("-", ""),
    WEATHERPOEM_PERFORMANCE_SCENARIO: "weather-offline",
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  };
  child = spawn(candidate, [], {
    cwd: path.dirname(candidate),
    windowsHide: false,
    stdio: "ignore",
    env,
  });
  await waitFor(() => {
    if (child.exitCode !== null) throw new Error(`Isolated candidate exited: ${child.exitCode}`);
    return existsSync(markerPath);
  }, "native settings ready marker", 25000);
  const readyMarker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(readyMarker.readyView, "poem");
  report.readyMarker = readyMarker;

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
  nextId = 0;
}

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
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ??
      response.exceptionDetails.text ?? "WebView2 evaluation failed");
  }
  return response.result.value;
}

async function screenshot(label) {
  const imagePath = reportPath.replace(/\.json$/, `_${label}.png`);
  assert.ok(!existsSync(imagePath), "Refusing to overwrite a native settings screenshot");
  const image = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(imagePath, Buffer.from(image.data, "base64"));
  return path.relative(root, imagePath).replaceAll(path.sep, "/");
}

function readStoredSettings() {
  const row = database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get();
  assert.ok(row?.value, "Settings row is missing from isolated SQLite");
  return JSON.parse(row.value);
}

try {
  for (const segment of ["appdata", "localappdata", "temp/probe"]) {
    mkdirSync(path.join(profile, segment), { recursive: true });
  }
  seedPerformanceProfile(profile);
  database = new DatabaseSync(databasePath);
  const initialStoredSettings = readStoredSettings();
  assert.equal(initialStoredSettings.cityId, "beijing");
  report.initialStoredSettings = initialStoredSettings;

  await connectToCandidate();
  const original = await evaluate(`({
    title: document.querySelector('.poem-view h1')?.textContent,
    visible: document.visibilityState,
    poem: Boolean(document.querySelector('.poem-view')),
    glanceSize: document.querySelector('.poem-view')?.dataset.glanceSize,
  })`);
  assert.equal(original.poem, true);
  assert.equal(original.visible, "visible");
  report.original = original;

  await evaluate(`document.querySelector('button[aria-label="设置"]').click()`);
  await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "settings panel");
  const initialDraft = await evaluate(`({
    glanceSize: document.querySelector('select[name="glance-size"]')?.value,
    layout: document.querySelector('select[name="poem-layout"]')?.value,
    fontSize: document.querySelector('select[name="poem-font-size"]')?.value,
  })`);
  assert.equal(initialDraft.glanceSize, "small");
  report.initialDraft = initialDraft;

  await evaluate(`(() => {
    const select = document.querySelector('select[name="glance-size"]');
    select.value = 'large';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(() => evaluate("document.querySelector('select[name=\"glance-size\"]')?.value === 'large'"), "large size draft");
  report.draftBeforeFailure = await evaluate(`({
    glanceSize: document.querySelector('select[name="glance-size"]')?.value,
    submitDisabled: document.querySelector('.settings-panel button[type="submit"]')?.disabled,
  })`);
  assert.equal(report.draftBeforeFailure.glanceSize, "large");

  database.exec(`CREATE TRIGGER isolated_settings_save_fault
    BEFORE INSERT ON app_kv WHEN NEW.key = 'settings'
    BEGIN SELECT RAISE(ABORT, 'isolated settings save fault'); END`);
  await evaluate(`document.querySelector('.settings-panel button[type="submit"]').click()`);
  await waitFor(() => evaluate(
    "document.querySelector('.toast-message')?.textContent?.includes('设置未能保存，请重试。')",
  ), "settings failure notice");
  report.failedSave = await evaluate(`({
    panelOpen: Boolean(document.querySelector('.settings-panel')),
    draftSize: document.querySelector('select[name="glance-size"]')?.value,
    notice: document.querySelector('.toast-message')?.textContent,
    submitDisabled: document.querySelector('.settings-panel button[type="submit"]')?.disabled,
  })`);
  assert.equal(report.failedSave.panelOpen, true, "Failed save unexpectedly left settings");
  assert.equal(report.failedSave.draftSize, "large", "Failed save lost the user's draft");
  assert.equal(report.failedSave.submitDisabled, false, "Retry button remained disabled");
  report.storedAfterFailure = readStoredSettings();
  assert.equal(report.storedAfterFailure.glanceSize ?? "small", "small",
    "Failed settings write changed the stored preference");
  report.failedSave.screenshot = await screenshot("settings_save_failed");

  database.exec("DROP TRIGGER isolated_settings_save_fault");
  await evaluate(`document.querySelector('.settings-panel button[type="submit"]').click()`);
  await waitFor(() => evaluate(`(() => {
    const notice = document.querySelector('.toast-message')?.textContent ?? '';
    return notice.includes('设置已保存') ||
      notice.includes('其他设置已保存；隔离测试不会修改系统开机启动。');
  })()`), "settings retry success notice");
  report.retry = await evaluate(`({
    panelOpen: Boolean(document.querySelector('.settings-panel')),
    poemTitle: document.querySelector('.poem-view h1')?.textContent,
    notice: document.querySelector('.toast-message')?.textContent,
    draftSize: document.querySelector('select[name="glance-size"]')?.value,
  })`);
  assert.ok(report.retry.notice.includes("设置已保存") ||
    report.retry.notice.includes("其他设置已保存；隔离测试不会修改系统开机启动。"));
  report.storedAfterRetry = readStoredSettings();
  assert.equal(report.storedAfterRetry.glanceSize, "large",
    "Successful retry did not persist the drafted preference");
  assert.equal(report.retry.draftSize, "large");
  if (report.retry.panelOpen) {
    assert.ok(report.retry.notice.includes("隔离测试不会修改系统开机启动"),
      "Settings remained open without the expected isolated autostart notice");
  } else {
    assert.ok(report.retry.poemTitle, "Successful save left neither settings nor poem visible");
  }
  report.retry.screenshot = await screenshot("settings_save_retried");

  socket.close();
  socket = undefined;
  await stopExactChild(child);
  child = undefined;
  await delay(500);
  if (existsSync(markerPath)) unlinkSync(markerPath);
  await connectToCandidate();
  await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "poem after same-profile restart");
  await evaluate(`document.querySelector('button[aria-label="设置"]').click()`);
  await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "reopened settings after restart");
  report.afterRestart = await evaluate(`({
    glanceSize: document.querySelector('select[name="glance-size"]')?.value,
    layout: document.querySelector('select[name="poem-layout"]')?.value,
    fontSize: document.querySelector('select[name="poem-font-size"]')?.value,
  })`);
  assert.equal(report.afterRestart.glanceSize, "large");
  report.result = "native-isolated-settings-save-failure-retry-and-restart-passed";
} catch (error) {
  report.result = "failed";
  report.error = String(error?.stack ?? error);
  throw error;
} finally {
  socket?.close();
  await stopExactChild(child);
  database?.close();
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();

  if (existsSync(profile)) {
    const tempRoot = realpathSync(tmpdir()) + path.sep;
    const exact = realpathSync(profile);
    assert.ok(exact.startsWith(tempRoot) &&
      path.basename(exact).startsWith("WeatherPoem.Performance.SettingsRetry."),
    "Refusing to remove an unvalidated settings test profile");
    let removed = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        rmSync(exact, { recursive: true, force: true });
        removed = !existsSync(exact);
        if (removed) break;
      } catch (error) {
        if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 19) {
          report.cleanupError = String(error);
          break;
        }
      }
      await delay(500);
    }
    if (!removed) {
      report.cleanupError ??= `Temporary profile remains after cleanup retries: ${exact}`;
      report.result = "failed-cleanup";
    }
  }
  const harnessPath = path.join(root, "scripts", "test-redesign-native-settings-retry.mjs");
  report.testHarness.sha256 = createHash("sha256").update(readFileSync(harnessPath)).digest("hex").toUpperCase();
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

process.stdout.write(`${JSON.stringify({ result: report.result, sha256: report.candidate.sha256, reportPath })}\n`);
