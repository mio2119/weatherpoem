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
const poemId = process.argv[4] ?? "";
const requireOverflow = process.argv.includes("--require-overflow");
const verifyRestart = process.argv.includes("--verify-restart");
const exerciseFontSetting = process.argv.includes("--exercise-font-setting");
const exerciseGlanceSize = process.argv.includes("--exercise-glance-size");
const verifyKeyboardNavigation = process.argv.includes("--verify-keyboard-navigation");
const theme = process.argv.find((argument) => argument.startsWith("--theme="))?.slice("--theme=".length) ?? "light";
const fontSettingLayout = process.argv.find((argument) => argument.startsWith("--font-setting-layout="))?.slice("--font-setting-layout=".length) ?? "vertical";
const fontSize = process.argv.find((argument) => argument.startsWith("--font-size="))?.slice("--font-size=".length) ?? "large";
const candidateRoot = path.join(root, ".work") + path.sep;
const evidenceRoot = path.join(root, "review", "redesign", "evidence") + path.sep;
assert.ok(candidate.toLowerCase().startsWith(candidateRoot.toLowerCase()) && path.basename(candidate).toLowerCase() === "weatherpoem.exe", "Use an internal candidate");
assert.ok(existsSync(candidate), "Internal candidate is missing");
assert.ok(reportPath.toLowerCase().startsWith(evidenceRoot.toLowerCase()) && reportPath.endsWith(".json"), "Use a redesign evidence report");
assert.ok(!existsSync(reportPath), "Refusing to overwrite layout evidence");
assert.ok(/^[a-z0-9-]+$/.test(poemId), "Specify one catalog poem ID");
assert.ok(["small", "medium", "large"].includes(fontSize), "Use a supported poem font size");
assert.ok(["light", "dark"].includes(theme), "Use a supported theme");
assert.ok(!exerciseFontSetting || verifyRestart, "The settings journey must include a same-profile restart");
assert.ok(!exerciseGlanceSize || verifyRestart, "Glance size verification must include a same-profile restart");
assert.ok(["horizontal", "vertical"].includes(fontSettingLayout), "Use a supported font-setting layout");
const running = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -Filter \"name = 'weatherpoem.exe'\" | Select-Object -ExpandProperty ProcessId"], { encoding: "utf8" }).trim();
assert.equal(running, "", "WeatherPoem is already running; refusing to disturb it");

const { POEMS, CONTENT_VERSION, RULE_VERSION } = await loadReasonSources(root);
const poem = POEMS.find((item) => item.id === poemId);
assert.ok(poem, `Unknown catalog poem: ${poemId}`);
const expectedExcerpt = poem.excerpt.join("");
const expectedFullText = poem.fullText.join("");
const now = new Date();
const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
const profile = mkdtempSync(path.join(tmpdir(), "WeatherPoem.Performance.Layout."));
const markerPath = path.join(profile, "temp", "probe", "weatherpoem-performance-ready.json");
const report = {
  schemaVersion: "1.0",
  testKind: "isolated-native-webview2-poem-layout",
  generatedAt: new Date().toISOString(),
  candidate: { path: path.relative(root, candidate).replaceAll(path.sep, "/"), sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase() },
  isolation: { temporaryProfile: true, realUserDataTouched: false, systemClockChanged: false, systemDisplaySettingsChanged: false, installedOrUninstalled: false },
  catalog: { poemId, title: poem.title, localDate, contentVersion: CONTENT_VERSION, ruleVersion: RULE_VERSION },
  setup: { layout: "vertical", fontSize, theme, weather: "offline-rules", exerciseFontSetting, exerciseGlanceSize, verifyKeyboardNavigation, fontSettingLayout: exerciseFontSetting ? fontSettingLayout : null },
  observations: {},
  limitations: ["WebView2 page and the current display only; CDP keys are synthetic and do not replace physical-keyboard, screen-reader, or mixed-DPI testing.", "The catalog poem is preselected only in the temporary SQLite profile, not by the live recommendation algorithm."],
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

async function screenshot(label, expectedWidth) {
  const imagePath = reportPath.replace(/\.json$/, `_${label}.png`);
  assert.ok(!existsSync(imagePath), "Refusing to overwrite a native screenshot");
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const bytes = Buffer.from(image.data, "base64");
  if (expectedWidth !== undefined) {
    assert.ok(Math.abs(bytes.readUInt32BE(16) - expectedWidth) <= 2, `Native screenshot width did not settle for ${label}`);
  }
  writeFileSync(imagePath, bytes);
  return path.relative(root, imagePath).replaceAll(path.sep, "/");
}

async function waitForStableGlanceViewport(targetWidth, label) {
  let stableSince = 0;
  let previous = "";
  await waitFor(async () => {
    const state = await evaluate(`(() => ({ width: innerWidth, height: innerHeight,
      card: Boolean(document.querySelector('.poem-view')),
      toast: Boolean(document.querySelector('.toast-message')) }))()`);
    if (!state.card || state.toast || Math.abs(state.width - targetWidth) > 2) {
      stableSince = 0;
      previous = "";
      return false;
    }
    const key = `${state.width}x${state.height}`;
    if (key !== previous) {
      previous = key;
      stableSince = Date.now();
    }
    return Date.now() - stableSince >= 450;
  }, label);
}

async function nativeWindowSizes() {
  return evaluate(`(async () => ({
    inner: await window.__TAURI_INTERNALS__.invoke('plugin:window|inner_size', { label: 'main' }),
    outer: await window.__TAURI_INTERNALS__.invoke('plugin:window|outer_size', { label: 'main' }),
    monitor: await window.__TAURI_INTERNALS__.invoke('plugin:window|current_monitor'),
    viewport: { width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth }
  }))()`);
}

async function readingState() {
  return evaluate(`(() => {
    const panel = document.querySelector('.reading-panel');
    const frame = panel?.querySelector('.reading-poem-frame');
    const full = panel?.querySelector('.full-poem');
    const back = panel?.querySelector('.back-button');
    const source = panel?.querySelector('.edition-note');
    return panel && frame && full ? {
      title: panel.querySelector('#reading-title')?.textContent,
      text: [...full.querySelectorAll('p')].map(item => item.textContent).join(''),
      vertical: full.classList.contains('is-vertical'),
      writingMode: getComputedStyle(full).writingMode,
      fontSize: panel.dataset.poemFontSize,
      frameClientWidth: frame.clientWidth,
      frameScrollWidth: frame.scrollWidth,
      frameScrollLeft: frame.scrollLeft,
      frameTabIndex: frame.tabIndex,
      panelScrollWidth: panel.scrollWidth,
      panelClientWidth: panel.clientWidth,
      backVisible: Boolean(back && back.getBoundingClientRect().width && back.getBoundingClientRect().height),
      sourcePresent: Boolean(source?.textContent?.includes('文本来源：')),
      viewport: { width: innerWidth, height: innerHeight },
    } : null;
  })()`);
}

async function focusedElementState() {
  return evaluate(`(() => {
    const element = document.activeElement;
    const style = element ? getComputedStyle(element) : null;
    return {
      tagName: element?.tagName ?? null,
      className: typeof element?.className === "string" ? element.className : "",
      role: element?.getAttribute("role") ?? null,
      label: element?.getAttribute("aria-label") ?? null,
      text: element?.innerText?.trim() ?? "",
      tabIndex: element?.tabIndex ?? null,
      focusVisible: element?.matches(":focus-visible") ?? false,
      outlineStyle: style?.outlineStyle ?? null,
      outlineWidth: style?.outlineWidth ?? null,
      outlineColor: style?.outlineColor ?? null,
    };
  })()`);
}

async function pressKey(key, code, windowsVirtualKeyCode, modifiers = 0) {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown", key, code, windowsVirtualKeyCode, modifiers,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp", key, code, windowsVirtualKeyCode, modifiers,
  });
}

async function connectToWebview(port) {
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
}

try {
  for (const segment of ["appdata", "localappdata", "temp/probe"]) mkdirSync(path.join(profile, segment), { recursive: true });
  seedPerformanceProfile(profile);
  const database = new DatabaseSync(resolvePerformanceDatabasePath(profile));
  try {
    const settings = JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value);
    Object.assign(settings, { theme, poemLayout: "vertical", poemFontSize: fontSize });
    database.prepare("UPDATE app_kv SET value = ? WHERE key = 'settings'").run(JSON.stringify(settings));
    database.exec("CREATE TABLE daily_state (local_date TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, work_id TEXT, shown_at TEXT, content_version TEXT NOT NULL, rule_version TEXT NOT NULL)");
    database.prepare("INSERT INTO daily_state (local_date, state, work_id, shown_at, content_version, rule_version) VALUES (?, 'shown', ?, ?, ?, ?)")
      .run(localDate, poemId, now.toISOString(), CONTENT_VERSION, RULE_VERSION);
  } finally { database.close(); }
  const port = await freePort();
  const launchEnv = {
    ...process.env,
    APPDATA: path.join(profile, "appdata"),
    LOCALAPPDATA: path.join(profile, "localappdata"),
    WEATHERPOEM_PERFORMANCE_PROFILE: profile,
    WEATHERPOEM_PERFORMANCE_PROBE: markerPath,
    WEATHERPOEM_PERFORMANCE_RUN_ID: randomUUID().replaceAll("-", ""),
    WEATHERPOEM_PERFORMANCE_SCENARIO: "weather-offline",
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  };
  child = spawn(candidate, [], { cwd: path.dirname(candidate), windowsHide: false, stdio: "ignore", env: launchEnv });
  await waitFor(() => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Isolated candidate exited: ${child.exitCode ?? child.signalCode}`);
    return existsSync(markerPath);
  }, "native ready marker", 25000);
  report.observations.readyMarker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(report.observations.readyMarker.readyView, "poem");
  await connectToWebview(port);

  await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "preselected poem card");
  if (exerciseGlanceSize) await waitForStableGlanceViewport(392, "initial small glance width");
  const glance = await evaluate(`(() => {
    const view = document.querySelector('.poem-view');
    const lines = view?.querySelector('.poem-lines');
    const paper = view?.querySelector('.poem-paper');
    const actions = view?.querySelector('.card-actions');
    return view && lines && paper && actions ? {
      title: view.querySelector('#daily-poem-title')?.textContent,
      text: [...lines.querySelectorAll('p')].map(item => item.textContent).join(''),
      vertical: lines.classList.contains('is-vertical'),
      fontSize: view.dataset.poemFontSize,
      fallbackNote: view.querySelector('.layout-fallback-note')?.textContent ?? null,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      actionsInScrollRegion: actions.getBoundingClientRect().bottom <= view.getBoundingClientRect().bottom || view.scrollHeight > view.clientHeight,
      paperWidth: paper.getBoundingClientRect().width,
      viewport: { width: innerWidth, height: innerHeight },
    } : null;
  })()`);
  report.observations.glance = glance;
  assert.ok(glance && glance.title === poem.title && glance.text === expectedExcerpt, "Native glance poem differs from catalog");
  assert.equal(glance.fontSize, fontSize);
  assert.equal(glance.documentOverflow, false);
  assert.equal(glance.actionsInScrollRegion, true);
  report.observations.glanceScreenshot = await screenshot("glance");

  await evaluate("document.querySelector('.read-button').click()");
  await waitFor(async () => {
    const reading = await readingState();
    return reading?.viewport.width >= 500;
  }, "resized native reading window");
  await delay(150);
  const initial = await readingState();
  report.observations.readingInitial = initial;
  assert.ok(initial && initial.title === poem.title && initial.text === expectedFullText, "Native reading poem differs from catalog");
  assert.equal(initial.vertical, true);
  assert.equal(initial.writingMode, "vertical-rl");
  assert.equal(initial.fontSize, fontSize);
  assert.equal(initial.frameTabIndex, 0);
  assert.equal(initial.backVisible, true);
  assert.equal(initial.sourcePresent, true);
  assert.ok(initial.panelScrollWidth <= initial.panelClientWidth + 1, "Reading panel overflowed horizontally");
  if (requireOverflow) assert.ok(initial.frameScrollWidth > initial.frameClientWidth + 1, "Expected long vertical poem to require horizontal scrolling");
  report.observations.readingScreenshot = await screenshot("reading_vertical");

  if (verifyKeyboardNavigation) {
    const keyboard = { initialFocus: null, steps: [], openedDetails: [] };
    report.observations.keyboardNavigation = keyboard;
    await waitFor(() => evaluate("document.activeElement?.matches('.reading-panel')"), "reading route initial focus");
    keyboard.initialFocus = await focusedElementState();
    assert.equal(keyboard.initialFocus.className, "reading-panel", "Reading route did not receive initial focus");
    const tabStops = [
      { selector: ".reading-panel .back-button", label: "返回诗笺" },
      { selector: ".reading-panel .icon-button[aria-pressed]", label: "收藏" },
      { selector: ".reading-layout-action button", label: "排版切换" },
      { selector: ".reading-poem-frame[tabindex='0']", label: "可滚动竖排诗文" },
      { selector: ".reading-section summary", label: "放回它的时代" },
      { selector: ".reading-section:nth-of-type(2) summary", label: "放进今天" },
    ];
    for (const stop of tabStops) {
      await pressKey("Tab", "Tab", 9);
      await waitFor(
        () => evaluate(`document.activeElement?.matches(${JSON.stringify(stop.selector)})`),
        `keyboard Tab to ${stop.label}`,
      );
      const active = { expected: stop.label, ...(await focusedElementState()) };
      keyboard.steps.push(active);
      assert.equal(active.focusVisible, true, `Keyboard focus was not visible at ${stop.label}`);
      assert.equal(active.outlineStyle, "solid", `Focus outline style was not explicit at ${stop.label}`);
      assert.ok(Number.parseFloat(active.outlineWidth) >= 2, `Focus outline was too thin at ${stop.label}`);
      if (stop.label === "放回它的时代" || stop.label === "放进今天") {
        if (stop.label === "放回它的时代") {
          keyboard.focusedSummaryScreenshot = await screenshot("keyboard_focus_summary");
        }
        await pressKey(" ", "Space", 32);
        const open = await evaluate(`document.querySelector(${JSON.stringify(stop.selector)})?.closest('details')?.open`);
        keyboard.openedDetails.push({ label: stop.label, open });
        assert.equal(open, true, `Space did not expand ${stop.label}`);
      }
    }
  }

  if (initial.frameScrollWidth > initial.frameClientWidth + 1) {
    await evaluate("document.querySelector('.reading-poem-frame').focus()");
    for (let index = 0; index < 20; index += 1) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
    }
    await delay(300);
    report.observations.readingAfterKeyboard = await readingState();
    assert.notEqual(report.observations.readingAfterKeyboard.frameScrollLeft, initial.frameScrollLeft, "ArrowLeft did not move the native horizontal poem scroller");
  }

  await evaluate("document.querySelector('.reading-layout-action button').click()");
  await waitFor(async () => !(await readingState())?.vertical, "horizontal layout switch");
  report.observations.readingHorizontal = await readingState();
  assert.equal(report.observations.readingHorizontal.text, expectedFullText);
  assert.ok(report.observations.readingHorizontal.panelScrollWidth <= report.observations.readingHorizontal.panelClientWidth + 1);
  await waitFor(() => {
    const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
    try { return JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value).poemLayout === "horizontal"; }
    finally { database.close(); }
  }, "SQLite layout preference saved");
  report.observations.sqliteLayoutAfterSwitch = "horizontal";
  await evaluate("document.querySelector('.reading-panel .back-button').click()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "return to same poem card");
  report.observations.returnedGlance = await evaluate("({ title: document.querySelector('.poem-view #daily-poem-title')?.textContent, vertical: document.querySelector('.poem-view .poem-lines')?.classList.contains('is-vertical') })");
  assert.equal(report.observations.returnedGlance.title, poem.title);
  assert.equal(report.observations.returnedGlance.vertical, false);
  if (exerciseGlanceSize) {
    report.observations.glanceSizeJourney = [];
    for (const [selectedSize, targetWidth] of [["small", 392], ["medium", 456], ["large", 520]]) {
      await evaluate("document.querySelector('button[aria-label=\"设置\"]').click()");
      await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "native settings for glance size");
      await evaluate(`(() => {
        const select = document.querySelector('select[name="glance-size"]');
        select.value = ${JSON.stringify(selectedSize)};
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('.settings-form').requestSubmit();
      })()`);
      await waitFor(() => {
        const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
        try { return JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value).glanceSize === selectedSize; }
        finally { database.close(); }
      }, `SQLite glance size ${selectedSize}`);
      if (await evaluate("Boolean(document.querySelector('.settings-panel'))")) {
        await evaluate("document.querySelector('.settings-panel .back-button').click()");
      }
      await waitForStableGlanceViewport(targetWidth, `stable native glance width ${selectedSize}`);
      const geometry = await evaluate(`(() => {
        const view = document.querySelector('.poem-view');
        const actions = view?.querySelector('.card-actions');
        view.scrollTop = view.scrollHeight;
        const rect = view.getBoundingClientRect();
        const actionRect = actions.getBoundingClientRect();
        return { title: view.querySelector('#daily-poem-title')?.textContent,
          poemFontSize: view.dataset.poemFontSize, width: innerWidth, height: innerHeight,
          documentOverflow: document.documentElement.scrollWidth > innerWidth,
          actionReachable: actionRect.top >= rect.top && actionRect.bottom <= rect.bottom,
          viewScrollHeight: view.scrollHeight, viewClientHeight: view.clientHeight };
      })()`);
      assert.equal(geometry.title, poem.title);
      assert.equal(geometry.poemFontSize, fontSize, "Window size changed the poem font setting");
      assert.equal(geometry.documentOverflow, false);
      assert.equal(geometry.actionReachable, true, "Glance actions are unreachable after resizing");
      report.observations.glanceSizeJourney.push({ selectedSize, geometry, nativeWindow: await nativeWindowSizes(), screenshot: await screenshot(`glance_${selectedSize}`, targetWidth) });
    }
  }
  if (exerciseFontSetting) {
    report.observations.fontSettingJourney = [];
    for (const selectedSize of ["small", "medium", "large"]) {
      await evaluate("document.querySelector('button[aria-label=\"设置\"]').click()");
      await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "native settings panel");
      const previous = await evaluate("document.querySelector('select[name=\"poem-font-size\"]')?.value");
      await evaluate(`(() => {
        const select = document.querySelector('select[name="poem-font-size"]');
        select.value = ${JSON.stringify(selectedSize)};
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const layout = document.querySelector('select[name="poem-layout"]');
        layout.value = ${JSON.stringify(fontSettingLayout)};
        layout.dispatchEvent(new Event('input', { bubbles: true }));
        layout.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('.settings-form').requestSubmit();
      })()`);
      await waitFor(() => {
        const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
        try { return JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value).poemFontSize === selectedSize; }
        finally { database.close(); }
      }, `SQLite font preference ${selectedSize}`);
      const settingsAfterSave = await evaluate("({ panel: Boolean(document.querySelector('.settings-panel')), selected: document.querySelector('select[name=\"poem-font-size\"]')?.value ?? null, layout: document.querySelector('select[name=\"poem-layout\"]')?.value ?? null, notice: document.querySelector('[role=\"status\"]')?.textContent ?? null })");
      if (settingsAfterSave.panel) await evaluate("document.querySelector('.settings-panel .back-button').click()");
      await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "poem card after setting save");
      await waitFor(() => evaluate(`document.querySelector('.poem-view')?.dataset.poemFontSize === ${JSON.stringify(selectedSize)}`), `rendered font ${selectedSize}`);
      const glanceAfterSave = await evaluate(`(() => {
        const view = document.querySelector('.poem-view');
        return {
          title: view.querySelector('#daily-poem-title')?.textContent,
          text: [...view.querySelectorAll('.poem-lines p')].map(item => item.textContent).join(''),
          fontSize: view.dataset.poemFontSize,
          computedPoemFontSize: getComputedStyle(view.querySelector('.poem-lines p')).fontSize,
          vertical: view.querySelector('.poem-lines').classList.contains('is-vertical'),
          documentOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      })()`);
      assert.equal(glanceAfterSave.title, poem.title);
      assert.equal(glanceAfterSave.text, expectedExcerpt);
      assert.equal(glanceAfterSave.fontSize, selectedSize);
      assert.equal(glanceAfterSave.vertical, fontSettingLayout === "vertical");
      assert.equal(glanceAfterSave.documentOverflow, false);
      await waitFor(() => evaluate("!document.querySelector('.toast-message')"), "save notification to settle");
      const evidence = { selectedSize, previous, settingsAfterSave, glanceAfterSave, screenshot: await screenshot(`settings_font_${selectedSize}`) };
      report.observations.fontSettingJourney.push(evidence);
    }
    const pixels = report.observations.fontSettingJourney.map((entry) => Number.parseFloat(entry.glanceAfterSave.computedPoemFontSize));
    assert.ok(pixels[0] < pixels[1] && pixels[1] < pixels[2], "Native poem font pixels did not increase across small/medium/large");
    await evaluate("document.querySelector('.read-button').click()");
    await waitFor(async () => (await readingState())?.fontSize === "large", "reading panel after UI font save");
    report.observations.readingAfterFontSave = await readingState();
    assert.equal(report.observations.readingAfterFontSave.text, expectedFullText);
    assert.equal(report.observations.readingAfterFontSave.vertical, fontSettingLayout === "vertical");
    report.observations.readingAfterFontSaveScreenshot = await screenshot("reading_after_font_save");
    await evaluate("document.querySelector('.reading-panel .back-button').click()");
    await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "card before restart after font save");
  }
  if (verifyRestart) {
    if (exerciseGlanceSize) {
      const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
      try { report.observations.sqliteSettingsBeforeRestart = JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value); }
      finally { database.close(); }
    }
    socket.close();
    socket = undefined;
    child.kill();
    await waitFor(() => child.exitCode !== null || child.signalCode !== null, "first isolated candidate exit", 5000);
    await delay(500);
    const restartPort = await freePort();
    const restartMarker = path.join(profile, "temp", "probe", "restart", "weatherpoem-performance-ready.json");
    mkdirSync(path.dirname(restartMarker), { recursive: true });
    child = spawn(candidate, [], {
      cwd: path.dirname(candidate), windowsHide: false, stdio: "ignore",
      env: {
        ...launchEnv,
        WEATHERPOEM_PERFORMANCE_PROBE: restartMarker,
        WEATHERPOEM_PERFORMANCE_RUN_ID: randomUUID().replaceAll("-", ""),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${restartPort}`,
      },
    });
    await waitFor(() => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Restarted candidate exited: ${child.exitCode ?? child.signalCode}`);
      return existsSync(restartMarker);
    }, "same-profile restart ready marker", 25000);
    report.observations.restartReadyMarker = JSON.parse(readFileSync(restartMarker, "utf8"));
    assert.equal(report.observations.restartReadyMarker.readyView, "poem");
    await connectToWebview(restartPort);
    await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "same-profile restarted poem card");
    if (exerciseGlanceSize) {
      const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
      try { report.observations.sqliteSettingsAfterRestart = JSON.parse(database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get().value); }
      finally { database.close(); }
      report.observations.restartViewportSamples = [];
      for (let index = 0; index < 20; index += 1) {
        report.observations.restartViewportSamples.push(await evaluate("({ width: innerWidth, height: innerHeight, card: Boolean(document.querySelector('.poem-view')) })"));
        await delay(100);
      }
      report.observations.restartNativeWindow = await nativeWindowSizes();
    }
    report.observations.restartGlance = await evaluate("({ title: document.querySelector('.poem-view #daily-poem-title')?.textContent, text: [...document.querySelectorAll('.poem-view .poem-lines p')].map(item => item.textContent).join(''), vertical: document.querySelector('.poem-view .poem-lines')?.classList.contains('is-vertical'), fontSize: document.querySelector('.poem-view')?.dataset.poemFontSize })");
    assert.equal(report.observations.restartGlance.title, poem.title);
    assert.equal(report.observations.restartGlance.text, expectedExcerpt);
    assert.equal(report.observations.restartGlance.vertical, exerciseFontSetting && fontSettingLayout === "vertical");
    assert.equal(report.observations.restartGlance.fontSize, exerciseFontSetting ? "large" : fontSize);
    if (exerciseGlanceSize) {
      await waitForStableGlanceViewport(520, "saved large glance width after restart");
      report.observations.restartGlance.viewportWidth = await evaluate("innerWidth");
      assert.ok(Math.abs(report.observations.restartGlance.viewportWidth - 520) <= 2, "Saved large glance width was not restored");
    }
    report.observations.restartScreenshot = await screenshot("restart_horizontal");
  }
  report.result = exerciseGlanceSize
    ? "native-glance-size-setting-and-restart-passed"
    : exerciseFontSetting
    ? "native-font-setting-layout-reading-and-restart-passed"
    : verifyRestart
      ? "native-layout-reading-scroll-and-restart-passed"
      : "native-layout-reading-scroll-and-sqlite-save-passed";
} catch (error) {
  failure = error;
  report.result = "failed";
  report.error = String(error?.stack ?? error);
} finally {
  socket?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill();
    try { await waitFor(() => child.exitCode !== null || child.signalCode !== null, "exact isolated candidate exit", 5000); }
    catch (error) { failure ??= error; report.result = "failed"; report.cleanupError = String(error); }
  }
  const tempRoot = realpathSync(tmpdir()) + path.sep;
  const exact = realpathSync(profile);
  assert.ok(exact.startsWith(tempRoot) && path.basename(exact).startsWith("WeatherPoem.Performance.Layout."), "Refusing to delete unvalidated temporary profile");
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
process.stdout.write(`${JSON.stringify({ result: report.result, sha256: report.candidate.sha256, poemId, reportPath })}\n`);
