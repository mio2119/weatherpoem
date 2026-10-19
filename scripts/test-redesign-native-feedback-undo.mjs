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
  path.basename(candidate).toLowerCase() === "weatherpoem.exe",
"Use an isolated internal candidate");
assert.ok(reportPath.toLowerCase().startsWith(evidenceRoot.toLowerCase()) &&
  reportPath.endsWith(".json"), "Use a redesign evidence JSON path");
assert.ok(existsSync(candidate), "Internal candidate is missing");
assert.ok(!existsSync(reportPath), "Refusing to overwrite native feedback evidence");
const existingProcesses = execFileSync("powershell.exe", [
  "-NoProfile", "-NonInteractive", "-Command",
  "Get-CimInstance Win32_Process -Filter \"name = 'weatherpoem.exe'\" | Select-Object -ExpandProperty ProcessId",
], { encoding: "utf8" }).trim();
assert.equal(existingProcesses, "", "WeatherPoem is already running; refusing to disturb it");

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function previousLocalDate() {
  const now = new Date();
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
}

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

const profile = mkdtempSync(path.join(tmpdir(), "WeatherPoem.Performance.FeedbackUndo."));
const markerPath = path.join(profile, "temp", "probe", "weatherpoem-performance-ready.json");
const databasePath = resolvePerformanceDatabasePath(profile);
for (const segment of ["appdata", "localappdata", "temp/probe"]) {
  mkdirSync(path.join(profile, segment), { recursive: true });
}
seedPerformanceProfile(profile);
const seedDatabase = new DatabaseSync(databasePath);
const preservedDislikeId = "cui-hao-huang-he-lou";
const preservedFavoriteId = "cui-hao-huang-he-lou";
const preservedReplacementId = "legacy-replaced-feedback-preserved";
const previousDate = previousLocalDate();
const previousTimestamp = new Date(new Date().getTime() - 86_400_000).toISOString();
seedDatabase.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    work_id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id TEXT NOT NULL,
    type TEXT NOT NULL,
    context_tags TEXT NOT NULL,
    created_at TEXT NOT NULL,
    local_date TEXT
  );
`);
seedDatabase.prepare(
  "INSERT INTO feedback (work_id, type, context_tags, created_at, local_date) VALUES (?, 'disliked', ?, ?, ?)",
).run(preservedDislikeId, JSON.stringify(["preserved-test-entry"]), previousTimestamp, previousDate);
seedDatabase.prepare(
  "INSERT INTO feedback (work_id, type, context_tags, created_at, local_date) VALUES (?, 'replaced', ?, ?, ?)",
).run(preservedReplacementId, JSON.stringify(["preserved-test-entry"]), previousTimestamp, previousDate);
seedDatabase.prepare("INSERT INTO favorites (work_id, created_at) VALUES (?, ?)")
  .run(preservedFavoriteId, previousTimestamp);
seedDatabase.close();

const candidateHash = createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase();
const report = {
  schemaVersion: "1.0",
  testKind: "isolated-native-feedback-undo-restart-and-preservation",
  generatedAt: new Date().toISOString(),
  candidate: {
    path: path.relative(root, candidate).replaceAll(path.sep, "/"),
    sha256: candidateHash,
  },
  isolation: {
    temporaryProfile: true,
    systemClockChanged: false,
    systemAutostartChanged: false,
    realUserDataTouched: false,
    installedOrUninstalled: false,
    weatherScenario: "offline",
  },
  preservedSeed: {
    dislikedWorkId: preservedDislikeId,
    replacedWorkId: preservedReplacementId,
    favoriteWorkId: preservedFavoriteId,
    localDate: previousDate,
  },
  limitations: [
    "UI interaction is driven through the isolated WebView2 debugging interface; this is not physical mouse or keyboard testing.",
    "The test uses the temporary SQLite profile and does not simulate disk-full, permission, filesystem, or device failures.",
  ],
  result: "in-progress",
};

let child;
let socket;
let nextId = 0;
let failure;
const pending = new Map();

function readSnapshot() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const feedback = database.prepare(
      "SELECT work_id, type, context_tags, created_at, local_date FROM feedback ORDER BY id DESC",
    ).all();
    const favorites = database.prepare(
      "SELECT work_id, created_at FROM favorites ORDER BY created_at DESC",
    ).all();
    const dailyState = database.prepare(
      "SELECT local_date, state, work_id FROM daily_state ORDER BY local_date DESC LIMIT 1",
    ).get() ?? null;
    return { feedback, favorites, dailyState };
  } finally {
    database.close();
  }
}

async function stopExactChild() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    delay(5000).then(() => { throw new Error(`Isolated candidate PID ${child.pid} did not exit`); }),
  ]);
}

async function send(method, params = {}) {
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
  const imagePath = reportPath.replace(/\.json$/u, `_${label}.png`);
  assert.ok(!existsSync(imagePath), "Refusing to overwrite a native feedback screenshot");
  const image = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(imagePath, Buffer.from(image.data, "base64"));
  return path.relative(root, imagePath).replaceAll(path.sep, "/");
}

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
  }, "native app ready marker", 25000);
  const readyMarker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(readyMarker.readyView, "poem");
  report.readyMarker ??= readyMarker;
  let target;
  await waitFor(async () => {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
      return Boolean(target);
    } catch {
      return false;
    }
  }, "native WebView2 target");
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

try {
  await connectToCandidate();
  await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view h1'))"), "initial poem card");
  report.initial = await evaluate(`({
    title: document.querySelector('.poem-view h1')?.textContent,
    favoriteCount: document.querySelector('.context-favorites')?.textContent,
    localDate: document.querySelector('.context-strip strong')?.textContent,
  })`);
  const initialSnapshot = readSnapshot();
  assert.equal(initialSnapshot.feedback.filter((item) => item.type === "disliked").length, 1);
  assert.equal(initialSnapshot.feedback.filter((item) => item.type === "replaced").length, 1);
  assert.equal(initialSnapshot.favorites.length, 1);
  report.initialDailyState = initialSnapshot.dailyState;
  assert.ok(initialSnapshot.dailyState?.work_id, "Today's selected work is missing from SQLite");

  await evaluate("document.querySelector('.more-action')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.secondary-actions'))"), "secondary poem actions");
  const dislikeState = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.secondary-actions button')]
      .find((item) => item.textContent.trim() === '不太贴合');
    return button ? { disabled: button.disabled, text: button.textContent.trim() } : null;
  })()`);
  assert.ok(dislikeState, "The not-relevant feedback action is missing");
  assert.equal(dislikeState.disabled, false, "The current poem cannot receive a new feedback entry");
  await evaluate(`([...document.querySelectorAll('.secondary-actions button')]
    .find((item) => item.textContent.trim() === '不太贴合')).click()`);
  await waitFor(() => {
    const snapshot = readSnapshot();
    return snapshot.feedback.filter((item) => item.type === "disliked").length === 2;
  }, "native SQLite feedback write");
  await waitFor(() => evaluate("document.querySelector('.toast-message')?.textContent?.includes('已记下')"),
    "feedback success notice");
  const afterRecord = readSnapshot();
  report.afterRecord = {
    feedback: afterRecord.feedback,
    latestDislikeWorkId: afterRecord.feedback.find((item) => item.type === "disliked")?.work_id,
    favoriteCount: afterRecord.favorites.length,
  };
  assert.equal(report.afterRecord.latestDislikeWorkId, initialSnapshot.dailyState.work_id,
    "The new dislike does not reference the displayed poem");
  assert.equal(afterRecord.favorites.length, 1, "Recording feedback changed the preserved favorite");
  report.feedbackSavedScreenshot = await screenshot("feedback_saved");

  await evaluate("document.querySelector('button[aria-label=\"设置\"]')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "settings panel");
  const undoControl = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.settings-panel button.settings-navigation')]
      .find((item) => item.textContent.includes('撤销最近一次'));
    button?.scrollIntoView({ block: 'center' });
    return button ? { text: button.textContent.trim(), disabled: button.disabled } : null;
  })()`);
  assert.ok(undoControl, "Settings do not expose undo for the latest dislike");
  assert.equal(undoControl.disabled, false);
  report.undoControl = undoControl;
  report.undoControlScreenshot = await screenshot("undo_control");
  await evaluate(`([...document.querySelectorAll('.settings-panel button.settings-navigation')]
    .find((item) => item.textContent.includes('撤销最近一次')).click())`);
  await waitFor(() => evaluate("document.querySelector('.toast-message')?.textContent?.includes('已撤销最近一次')"),
    "feedback undo notice");
  const afterUndo = readSnapshot();
  report.afterUndo = {
    feedback: afterUndo.feedback,
    favoriteCount: afterUndo.favorites.length,
    undoControl: await evaluate(`(() => {
      const button = [...document.querySelectorAll('.settings-panel button.settings-navigation')]
        .find((item) => item.textContent.includes('撤销最近一次'));
      return button?.textContent.trim() ?? null;
    })()`),
  };
  assert.equal(afterUndo.feedback.filter((item) => item.type === "disliked").length, 1,
    "Undo did not remove only the newest dislike");
  assert.equal(afterUndo.feedback.filter((item) => item.type === "replaced").length, 1,
    "Undo removed a different feedback type");
  assert.equal(afterUndo.feedback.find((item) => item.type === "disliked")?.work_id, preservedDislikeId,
    "The pre-existing dislike was not preserved");
  assert.equal(afterUndo.feedback.find((item) => item.type === "replaced")?.work_id, preservedReplacementId,
    "The pre-existing replacement feedback was not preserved");
  assert.equal(afterUndo.favorites.length, 1);
  assert.equal(afterUndo.favorites[0]?.work_id, preservedFavoriteId,
    "Undo changed the preserved favorite");
  assert.ok(report.afterUndo.undoControl?.includes("黄鹤楼"),
    "The surviving prior dislike is not reflected in settings");
  report.undoCompletedScreenshot = await screenshot("undo_completed");

  socket.close();
  socket = undefined;
  await stopExactChild();
  child = undefined;
  if (existsSync(markerPath)) unlinkSync(markerPath);
  await delay(300);
  await connectToCandidate();
  await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view h1'))"), "poem after restart");
  assert.equal(await evaluate("document.querySelector('.poem-view h1')?.textContent"), report.initial.title,
    "Restart changed the same-day poem");
  await evaluate("document.querySelector('button[aria-label=\"设置\"]')?.click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "settings after restart");
  const afterRestart = readSnapshot();
  report.afterRestart = {
    dailyState: afterRestart.dailyState,
    dislikedCount: afterRestart.feedback.filter((item) => item.type === "disliked").length,
    replacedCount: afterRestart.feedback.filter((item) => item.type === "replaced").length,
    favoriteCount: afterRestart.favorites.length,
    undoControl: await evaluate(`(() => {
      const button = [...document.querySelectorAll('.settings-panel button.settings-navigation')]
        .find((item) => item.textContent.includes('撤销最近一次'));
      button?.scrollIntoView({ block: 'center' });
      return button?.textContent.trim() ?? null;
    })()`),
  };
  assert.equal(report.afterRestart.dailyState?.work_id, initialSnapshot.dailyState.work_id);
  assert.equal(report.afterRestart.dislikedCount, 1, "The undone feedback returned after restart");
  assert.equal(report.afterRestart.replacedCount, 1, "The other feedback was not preserved after restart");
  assert.equal(report.afterRestart.favoriteCount, 1, "The favorite was not preserved after restart");
  assert.ok(report.afterRestart.undoControl?.includes("黄鹤楼"),
    "The surviving prior dislike did not reload in settings");
  report.restartScreenshot = await screenshot("after_restart");
  report.result = "native-isolated-feedback-undo-restart-and-preservation-passed";
} catch (error) {
  failure = error;
  report.result = "failed";
  report.error = String(error?.stack ?? error);
} finally {
  socket?.close();
  await stopExactChild().catch((error) => {
    failure ??= error;
    report.result = "failed-cleanup";
    report.cleanupError = String(error);
  });
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
  if (existsSync(profile)) {
    const tempRoot = realpathSync(tmpdir()) + path.sep;
    const exact = realpathSync(profile);
    assert.ok(exact.startsWith(tempRoot) &&
      path.basename(exact).startsWith("WeatherPoem.Performance.FeedbackUndo."),
    "Refusing to remove an unvalidated feedback test profile");
    let removed = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        rmSync(exact, { recursive: true, force: true });
        removed = !existsSync(exact);
        if (removed) break;
      } catch (error) {
        if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code) || attempt === 19) {
          report.cleanupError = String(error);
          break;
        }
      }
      await delay(500);
    }
    if (!removed) {
      report.cleanupError ??= `Temporary feedback profile remains after cleanup retries: ${exact}`;
      report.result = "failed-cleanup";
    }
  }
  report.testHarness = {
    path: "scripts/test-redesign-native-feedback-undo.mjs",
    sha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex").toUpperCase(),
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

process.stdout.write(`${JSON.stringify({ result: report.result, sha256: candidateHash, reportPath })}\n`);
if (failure) throw failure;
