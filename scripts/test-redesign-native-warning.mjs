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
import { loadReasonSources } from "./load-reason-sources.mjs";
import { resolvePerformanceDatabasePath, seedPerformanceProfile } from "./seed-performance-profile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidate = path.resolve(process.argv[2] ?? "");
const reportPath = path.resolve(process.argv[3] ?? "");
const theme = process.argv.find((value) => value.startsWith("--theme="))?.slice(8) ?? "light";
assert.ok(["light", "dark"].includes(theme), "Use a supported warning theme");
assert.ok(candidate.toLowerCase().startsWith((path.join(root, ".work") + path.sep).toLowerCase()) && path.basename(candidate).toLowerCase() === "weatherpoem.exe", "Use an internal candidate");
assert.ok(existsSync(candidate), "Internal candidate is missing");
assert.ok(reportPath.toLowerCase().startsWith((path.join(root, "review", "redesign", "evidence") + path.sep).toLowerCase()) && reportPath.endsWith(".json"), "Use a redesign evidence report");
assert.ok(!existsSync(reportPath), "Refusing to overwrite warning evidence");
const running = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -Filter \"name = 'weatherpoem.exe'\" | Select-Object -ExpandProperty ProcessId"], { encoding: "utf8" }).trim();
assert.equal(running, "", "WeatherPoem is already running; refusing to disturb it");

const { POEMS, CONTENT_VERSION, RULE_VERSION } = await loadReasonSources(root);
const seededPoem = POEMS.find((poem) => poem.id === "meng-hao-ran-su-jian-de-jiang");
assert.ok(seededPoem, "Expected catalog work is missing");
const now = new Date();
const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
const profile = mkdtempSync(path.join(tmpdir(), "WeatherPoem.Performance.Warning."));
const markerPath = path.join(profile, "temp", "probe", "weatherpoem-performance-ready.json");
const report = {
  schemaVersion: "1.0",
  testKind: "isolated-native-official-style-warning",
  generatedAt: new Date().toISOString(),
  candidate: { path: path.relative(root, candidate).replaceAll(path.sep, "/"), sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase() },
  isolation: { temporaryProfile: true, syntheticWeather: true, realWeatherWarning: false, realUserDataTouched: false, systemClockChanged: false, systemDisplaySettingsChanged: false, installedOrUninstalled: false },
  setup: { theme, scenario: "official-warning", seededPriorWorkId: seededPoem.id, localDate, contentVersion: CONTENT_VERSION, ruleVersion: RULE_VERSION },
  observations: {},
  limitations: ["This is an app-bundled isolated warning exercise, not a real official gateway response or live weather.", "A startup warning does not prove that a warning arriving while hidden is displayed without an old-poem compositor frame.", "CDP DOM and screenshots do not replace screen-reader or real display-scaling tests."],
  result: "in-progress",
};
let child;
let socket;
let nextId = 0;
const pending = new Map();
let failure;

async function waitFor(predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(60);
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
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
  const imagePath = reportPath.replace(/\.json$/, `_${label}.png`);
  assert.ok(!existsSync(imagePath), "Refusing to overwrite warning screenshot");
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(imagePath, Buffer.from(image.data, "base64"));
  return path.relative(root, imagePath).replaceAll(path.sep, "/");
}

try {
  for (const segment of ["appdata", "localappdata", "temp/probe"]) mkdirSync(path.join(profile, segment), { recursive: true });
  seedPerformanceProfile(profile);
  const database = new DatabaseSync(resolvePerformanceDatabasePath(profile));
  try {
    const settings = JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value);
    settings.theme = theme;
    database.prepare("UPDATE app_kv SET value = ? WHERE key = 'settings'").run(JSON.stringify(settings));
    database.exec("CREATE TABLE daily_state (local_date TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, work_id TEXT, shown_at TEXT, content_version TEXT NOT NULL, rule_version TEXT NOT NULL)");
    database.prepare("INSERT INTO daily_state (local_date, state, work_id, shown_at, content_version, rule_version) VALUES (?, 'shown', ?, ?, ?, ?)")
      .run(localDate, seededPoem.id, now.toISOString(), CONTENT_VERSION, RULE_VERSION);
  } finally { database.close(); }
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
      WEATHERPOEM_PERFORMANCE_SCENARIO: "official-warning",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await waitFor(() => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Isolated candidate exited: ${child.exitCode ?? child.signalCode}`);
    return existsSync(markerPath);
  }, "native warning ready marker", 25000);
  report.observations.readyMarker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(report.observations.readyMarker.readyView, "warning");
  let target;
  await waitFor(async () => {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
      return Boolean(target);
    } catch { return false; }
  }, "isolated WebView2 warning target");
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
  await waitFor(() => evaluate("Boolean(document.querySelector('.warning-view'))"), "warning view");
  report.observations.view = await evaluate(`(() => {
    const main = document.querySelector('.warning-view');
    const item = main?.querySelector('.warning-item');
    const disclaimer = main?.querySelector('.warning-disclaimer');
    return {
      title: main?.querySelector('#warning-title')?.textContent,
      role: main?.getAttribute('role'),
      itemTitle: item?.querySelector('h2')?.textContent,
      itemDescription: item?.querySelector('p')?.textContent,
      source: item?.querySelector('small')?.textContent,
      disclaimer: disclaimer?.textContent,
      oldPoemPresent: document.body.textContent.includes(${JSON.stringify(seededPoem.title)}),
      poemViewPresent: Boolean(document.querySelector('.poem-view')),
      theme: document.documentElement.dataset.theme,
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { height: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight },
    };
  })()`);
  const view = report.observations.view;
  assert.equal(view.title, "今日诗笺暂缓展示");
  assert.equal(view.role, "alert");
  assert.equal(view.itemTitle, "受控暴雨预警演练");
  assert.ok(view.itemDescription.includes("不是真实气象预警"));
  assert.ok(view.source.includes("WeatherPoem 隔离性能演练"));
  assert.ok(view.disclaimer.includes("没有连接真实预警网关"));
  assert.equal(view.oldPoemPresent, false);
  assert.equal(view.poemViewPresent, false);
  assert.equal(view.theme, theme);
  report.observations.topScreenshot = await screenshot("warning_top");
  await evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  await delay(120);
  report.observations.bottom = await evaluate("({ scrollY, disclaimerBottom: document.querySelector('.warning-disclaimer')?.getBoundingClientRect().bottom, viewportHeight: innerHeight })");
  assert.ok(report.observations.bottom.disclaimerBottom <= report.observations.bottom.viewportHeight + 1, "Warning disclaimer is not reachable by scrolling");
  report.observations.bottomScreenshot = await screenshot("warning_bottom");
  const saved = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
  try { report.observations.dailyState = saved.prepare("SELECT state, work_id FROM daily_state WHERE local_date = ?").get(localDate); }
  finally { saved.close(); }
  assert.equal(report.observations.dailyState?.state, "alert-suppressed");
  assert.equal(report.observations.dailyState?.work_id, seededPoem.id);
  report.result = "native-isolated-warning-suppression-passed";
} catch (error) {
  failure = error;
  report.result = "failed";
  report.error = String(error?.stack ?? error);
} finally {
  socket?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill();
    try { await waitFor(() => child.exitCode !== null || child.signalCode !== null, "exact isolated warning candidate exit", 5000); }
    catch (error) { failure ??= error; report.result = "failed"; report.cleanupError = String(error); }
  }
  const tempRoot = realpathSync(tmpdir()) + path.sep;
  const exact = realpathSync(profile);
  assert.ok(exact.startsWith(tempRoot) && path.basename(exact).startsWith("WeatherPoem.Performance.Warning."), "Refusing to delete an unvalidated temporary profile");
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
    report.cleanupError = "Exact isolated candidate remains running; temporary profile preserved";
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
if (failure) throw failure;
process.stdout.write(`${JSON.stringify({ result: report.result, theme, sha256: report.candidate.sha256, reportPath })}\n`);
