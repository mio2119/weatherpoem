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
const cachedWarning = process.argv.includes("--cached-warning");
const sameDay = process.argv.includes("--same-day");
const motion = process.argv.includes("--motion");
const minimize = process.argv.includes("--minimize");
const secondInstance = process.argv.includes("--second-instance");
const capture = process.argv.includes("--capture");
const captureRevealMask = process.argv.includes("--capture-reveal-mask");
const compactWarning = process.argv.includes("--compact-warning");
const record = process.argv.includes("--record");
assert.ok(!(motion && withdrawal), "Choose motion or withdrawal evidence");
assert.ok(!cachedWarning || (!withdrawal && !motion), "Cached warning requires its own isolated scenario");
assert.ok(!sameDay || (!cachedWarning && !withdrawal && !motion), "Same-day recovery requires its own isolated scenario");
assert.ok(!minimize || secondInstance, "Minimized recovery must use the native second-instance path");
assert.ok(!record || motion, "Motion recording requires the native rain scene");
assert.ok(!captureRevealMask || (cachedWarning && capture), "Reveal-mask capture requires cached warning and screenshots");
assert.ok(!compactWarning || (cachedWarning && capture), "Compact warning audit requires cached warning and screenshots");
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
let secondary;
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
  const launchEnv = {
      ...process.env,
      APPDATA: path.join(profile, "appdata"),
      LOCALAPPDATA: path.join(profile, "localappdata"),
      WEATHERPOEM_PERFORMANCE_PROFILE: profile,
      WEATHERPOEM_PERFORMANCE_PROBE: markerPath,
      WEATHERPOEM_PERFORMANCE_RUN_ID: randomUUID().replaceAll("-", ""),
      WEATHERPOEM_PERFORMANCE_SCENARIO: cachedWarning ? "" : motion ? "scene-rain" : "weather-offline",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: cachedWarning
        ? `--remote-debugging-port=${port} --host-resolver-rules="MAP api.open-meteo.com 127.0.0.1" --no-proxy-server`
        : `--remote-debugging-port=${port}`,
  };
  child = spawn(candidate, [], {
    cwd: path.dirname(candidate),
    windowsHide: false,
    stdio: "ignore",
    env: launchEnv,
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
  async function sceneMotion() {
    return evaluate(`(() => {
      const paper = document.querySelector('.poem-paper');
      const line = document.querySelector('.loading-line');
      return {
        sceneActive: document.documentElement.dataset.sceneActive,
        sceneKind: paper?.getAttribute('data-scene'),
        sceneAnimation: paper ? getComputedStyle(paper, '::before').animationName : null,
        loaderAnimation: line ? getComputedStyle(line, '::after').animationName : null,
        runningAnimations: document.getAnimations().filter((item) => item.playState === 'running').map((item) => item.animationName ?? 'unknown'),
      };
    })()`);
  }
  const original = await evaluate("({ date: document.querySelector('.context-strip strong')?.textContent, title: document.querySelector('.poem-view h1')?.textContent, context: document.querySelector('.context-strip')?.textContent, visible: document.visibilityState, poem: Boolean(document.querySelector('.poem-view')) })");
  assert.equal(original.visible, "visible");
  assert.equal(original.poem, true);
  if (cachedWarning) assert.ok(original.context?.includes("天气未更新"), "Initial poem must use blocked-network offline weather");
  let initialDisplayEvents;
  if (sameDay) {
    const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
    try { initialDisplayEvents = database.prepare("SELECT COUNT(*) AS count FROM recommendation_display_events").get().count; }
    finally { database.close(); }
  }
  const initialMotion = motion ? await sceneMotion() : undefined;
  if (motion) {
    assert.equal(initialMotion.sceneKind, "rain");
    assert.equal(initialMotion.sceneAnimation, "scene-drift");
  }
  const firstScreenshot = await screenshot("before");
  let motionRecording;
  if (record) {
    const frameDirectory = path.join(profile, "temp", "probe", "frames");
    mkdirSync(frameDirectory);
    const count = 24;
    const intervalMs = 250;
    const startedAt = Date.now();
    for (let index = 0; index < count; index += 1) {
      const remaining = startedAt + index * intervalMs - Date.now();
      if (remaining > 0) await delay(remaining);
      const state = await evaluate("({ title: document.title, poemTitle: document.querySelector('.poem-view h1')?.textContent, scene: document.querySelector('.poem-paper')?.getAttribute('data-scene'), active: document.documentElement.dataset.sceneActive, visible: document.visibilityState })");
      assert.equal(state.poemTitle, original.title, "Poem changed during motion capture");
      assert.equal(state.scene, "rain", "Scene changed during motion capture");
      assert.equal(state.active, "true", "Scene was inactive during motion capture");
      assert.equal(state.visible, "visible", "WebView2 page was not visible during capture");
      assert.ok(state.title.includes("WeatherPoem"), "Frame source is not WeatherPoem");
      const frame = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(path.join(frameDirectory, `frame-${String(index).padStart(3, "0")}.png`), Buffer.from(frame.data, "base64"));
    }
    const gifPath = reportPath.replace(/\.json$/, "_motion.gif");
    assert.ok(!existsSync(gifPath), "Refusing to overwrite native motion recording");
    const python = process.env.WEATHERPOEM_PYTHON ?? "python";
    const encoded = execFileSync(python, [
      path.join(root, "scripts", "encode-isolated-motion-gif.py"), frameDirectory, gifPath, String(intervalMs),
    ], { encoding: "utf8" });
    motionRecording = {
      path: path.relative(root, gifPath).replaceAll(path.sep, "/"),
      ...JSON.parse(encoded),
      captureWallMs: Date.now() - startedAt,
      source: "isolated WebView2 CDP page",
    };
  }
  if (nativeClose) {
    execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(root, "scripts", "request-exact-window-close.ps1"),
      "-TargetProcessId", String(child.pid), "-ExpectedExePath", candidate,
    ], { encoding: "utf8" });
  } else if (minimize) {
    await evaluate("document.querySelector('button[aria-label=\"最小化\"]').click()");
  } else {
    await evaluate("document.querySelector('button[aria-label=\"隐藏到托盘\"]').click()");
  }
  try {
    const nativeHidden = minimize
      ? "await window.__TAURI_INTERNALS__.invoke('plugin:window|is_minimized', { label: 'main' })"
      : "!(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' }))";
    await waitFor(async () => (await evaluate(`(async () => ${nativeHidden} && Boolean(document.querySelector('.loading-view')))()`)) === true, "native hidden loading mask");
  } catch (error) {
    const diagnostic = await evaluate("(async () => ({ visibility: document.visibilityState, loading: Boolean(document.querySelector('.loading-view')), poem: Boolean(document.querySelector('.poem-view')), sceneActive: document.documentElement.dataset.sceneActive, nativeVisible: await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' }) }))()");
    throw new Error(`${error.message}; native diagnostic: ${JSON.stringify(diagnostic)}`);
  }
  const hidden = await evaluate("({ visibility: document.visibilityState, poem: Boolean(document.querySelector('.poem-view')), loading: Boolean(document.querySelector('.loading-view')) })");
  const hiddenMotion = motion ? await sceneMotion() : undefined;
  let steadyHiddenMotion;
  if (motion) {
    assert.equal(hiddenMotion.sceneActive, "false");
    assert.equal(hiddenMotion.sceneAnimation, null);
    assert.equal(hiddenMotion.loaderAnimation, "none", `Hidden loading line must stop: ${JSON.stringify(hiddenMotion)}`);
    assert.equal(hiddenMotion.runningAnimations.length, 0, `Hidden window still has running animations: ${JSON.stringify(hiddenMotion)}`);
    await delay(3000);
    steadyHiddenMotion = await sceneMotion();
    assert.equal(steadyHiddenMotion.sceneActive, "false");
    assert.equal(steadyHiddenMotion.loaderAnimation, "none");
    assert.equal(steadyHiddenMotion.runningAnimations.length, 0, `Hidden animation resumed: ${JSON.stringify(steadyHiddenMotion)}`);
  }
  let expectedDate;
  let withdrawnWorkId;
  if (cachedWarning) {
    await evaluate(`(() => {
      const now = new Date();
      const warning = {
        id: 'official-isolated-reveal-exercise',
        title: '隔离暴雨预警演练',
        level: 'warning',
        description: ${compactWarning
          ? "'这是临时资料中的长文排版演练，不是真实气象预警。'.repeat(8)"
          : "'这是临时资料中的安全提醒演练，不是真实气象预警。'"},
        source: 'WeatherPoem 隔离性能演练',
        origin: 'official',
        area: '北京市',
        publishedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      };
      localStorage.setItem('weatherpoem.weather-cache.v1', JSON.stringify({
        cityId: 'beijing',
        cachedAt: now.getTime(),
        weather: {
          kind: 'clear', label: '晴', observedAt: now.toISOString(),
          freshness: 'fresh', source: 'open-meteo',
          warnings: [warning], shouldSuppressPoem: true,
        },
      }));
    })()`);
  } else if (withdrawal) {
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
  } else if (sameDay) {
    expectedDate = original.date;
  } else if (!motion) {
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
  } else {
    expectedDate = original.date;
  }
  await evaluate(`(() => {
    window.__revealObserved = [];
    const sample = () => window.__revealObserved.push({
      visible: document.visibilityState,
      date: document.querySelector('.context-strip strong')?.textContent,
      poem: Boolean(document.querySelector('.poem-view')),
      loading: Boolean(document.querySelector('.loading-view')),
      correction: Boolean(document.querySelector('.content-correction-view')),
      warning: Boolean(document.querySelector('.warning-view')),
    });
    new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, characterData: true });
    document.addEventListener('visibilitychange', sample);
    sample();
  })()`);
  const revealStartedAt = Date.now();
  if (secondInstance) {
    secondary = spawn(candidate, [], {
      cwd: path.dirname(candidate), windowsHide: true, stdio: "ignore", env: launchEnv,
    });
    await waitFor(() => secondary.exitCode !== null, "second-instance activation", 10000);
  } else {
    await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|show', { label: 'main' })");
    await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus', { label: 'main' })");
  }
  let revealMask;
  if (captureRevealMask) {
    await waitFor(() => evaluate(`(async () =>
      Boolean(document.querySelector('.loading-view')) &&
      await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' })
    )()`), "visible native safety-check mask", 5000);
    revealMask = await evaluate("({ text: document.querySelector('.loading-view p')?.textContent, poem: Boolean(document.querySelector('.poem-view')), warning: Boolean(document.querySelector('.warning-view')) })");
    assert.equal(revealMask.text, "正在核对今日内容与安全信息");
    assert.equal(revealMask.poem, false);
    revealMask.screenshot = await screenshot("reveal_mask");
  }
  if (cachedWarning) {
    try {
      await waitFor(async () => (await evaluate("Boolean(document.querySelector('.warning-view')) && !document.querySelector('.poem-view')")) === true, "native cached safety warning", 25000);
    } catch (error) {
      const diagnostic = await evaluate("({ poemTitle: document.querySelector('.poem-view h1')?.textContent, warning: Boolean(document.querySelector('.warning-view')), loading: Boolean(document.querySelector('.loading-view')), observed: window.__revealObserved })");
      throw new Error(`${error.message}; diagnostic: ${JSON.stringify(diagnostic)}`);
    }
  } else if (withdrawal) {
    await waitFor(async () => (await evaluate("Boolean(document.querySelector('.content-correction-view')) && !document.querySelector('.poem-view')")) === true, "native content correction", 25000);
  } else {
    await waitFor(async () => (await evaluate(`document.querySelector('.context-strip strong')?.textContent === ${JSON.stringify(expectedDate)} && Boolean(document.querySelector('.poem-view'))`)) === true, "new local-day native poem", 25000);
  }
  const revealElapsedMs = Date.now() - revealStartedAt;
  const observed = await evaluate("window.__revealObserved");
  if (!motion && !sameDay) {
    assert.equal(observed.some((frame) => frame.poem && (withdrawal || cachedWarning || frame.date === original.date)), false, "Old poem was visible during reveal");
  }
  let finalDisplayEvents;
  if (sameDay) {
    const recoveredTitle = await evaluate("document.querySelector('.poem-view h1')?.textContent");
    assert.equal(recoveredTitle, original.title, "Same-day recovery changed the current poem");
    const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
    try { finalDisplayEvents = database.prepare("SELECT COUNT(*) AS count FROM recommendation_display_events").get().count; }
    finally { database.close(); }
    assert.equal(finalDisplayEvents, initialDisplayEvents, "Same-day recovery recorded an extra poem display");
  }
  const restoredMotion = motion ? await sceneMotion() : undefined;
  if (motion) {
    assert.equal(restoredMotion.sceneActive, "true");
    assert.equal(restoredMotion.sceneAnimation, "scene-drift");
  }
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
  let warningText;
  let warningDailyState;
  if (cachedWarning) {
    warningText = await evaluate("document.querySelector('.warning-view')?.textContent");
    assert.ok(warningText.includes("隔离暴雨预警演练"), "Isolated warning was not rendered");
    assert.ok(warningText.includes("没有连接真实预警网关"), "Isolated warning was misrepresented as live gateway data");
    assert.ok(!warningText.includes(original.title), "Old poem title leaked into safety warning");
    const database = new DatabaseSync(resolvePerformanceDatabasePath(profile), { readOnly: true });
    try {
      warningDailyState = database.prepare("SELECT state, work_id FROM daily_state ORDER BY local_date DESC LIMIT 1").get();
      assert.equal(warningDailyState?.state, "alert-suppressed");
      assert.ok(warningDailyState?.work_id, "Suppressed daily state lost the original work ID");
    } finally { database.close(); }
  }
  let compactWarningAudit;
  if (compactWarning) {
    await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|set_min_size', { label: 'main', value: null })");
    await evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 320, height: 260 } } })");
    await waitFor(() => evaluate("window.innerWidth <= 320 && window.innerHeight <= 260"), "isolated compact warning window", 5000);
    const measureWarning = `(() => {
      const root = document.querySelector('.warning-view');
      const disclaimer = root.querySelector('.warning-disclaimer');
      const introduction = root.querySelector('h1 + p');
      const warningTitle = root.querySelector('.warning-item h2');
      const rootRect = root.getBoundingClientRect();
      const disclaimerRect = disclaimer.getBoundingClientRect();
      const introRect = introduction.getBoundingClientRect();
      const titleRect = warningTitle.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        scroll: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, clientHeight: root.clientHeight, scrollHeight: root.scrollHeight, scrollTop: root.scrollTop },
        rootRect: { top: rootRect.top, bottom: rootRect.bottom },
        introductionRect: { top: introRect.top, bottom: introRect.bottom },
        warningTitleRect: { top: titleRect.top, bottom: titleRect.bottom },
        disclaimerRect: { top: disclaimerRect.top, bottom: disclaimerRect.bottom },
        warningCount: root.querySelectorAll('.warning-item').length,
        hasOldPoem: Boolean(document.querySelector('.poem-view')),
      };
    })()`;
    const top = await evaluate(measureWarning);
    assert.ok(top.scroll.scrollHeight > top.scroll.clientHeight, "Long warning should scroll in the compact window");
    assert.ok(top.scroll.scrollWidth <= top.scroll.clientWidth + 1, "Long warning overflowed horizontally");
    assert.ok(top.introductionRect.bottom <= top.rootRect.bottom + 1, "Compact warning hides the safety explanation on first view");
    assert.ok(top.warningTitleRect.top < top.rootRect.bottom, "Compact warning hides the alert title on first view");
    assert.equal(top.hasOldPoem, false);
    const topScreenshot = await screenshot("compact_warning_top");
    await evaluate("document.querySelector('.warning-view').scrollTop = document.querySelector('.warning-view').scrollHeight");
    await waitFor(() => evaluate("(() => { const e = document.querySelector('.warning-view'); return e.scrollTop + e.clientHeight >= e.scrollHeight - 2; })()"), "warning bottom scroll", 5000);
    const bottom = await evaluate(measureWarning);
    assert.ok(bottom.disclaimerRect.top >= bottom.rootRect.top - 1 && bottom.disclaimerRect.bottom <= bottom.rootRect.bottom + 1, "Safety disclaimer is unreachable at compact size");
    assert.ok(bottom.scroll.scrollWidth <= bottom.scroll.clientWidth + 1, "Long warning overflowed horizontally after scroll");
    const bottomScreenshot = await screenshot("compact_warning_bottom");
    compactWarningAudit = { syntheticLongText: true, top, bottom, screenshots: [topScreenshot, bottomScreenshot] };
  }
  const finalScreenshot = await screenshot("after");
  const report = {
    schemaVersion: "1.0",
    testKind: cachedWarning ? "isolated-native-hidden-cached-safety-warning" : sameDay ? "isolated-native-hidden-same-day-reveal" : motion ? minimize ? "isolated-native-minimized-motion" : "isolated-native-hidden-motion" : withdrawal ? "isolated-native-hidden-content-withdrawal" : nativeClose ? "isolated-native-close-day-reveal" : "isolated-native-hidden-day-reveal",
    generatedAt: new Date().toISOString(),
    candidate: { path: path.relative(root, candidate).replaceAll(path.sep, "/"), sha256: createHash("sha256").update(readFileSync(candidate)).digest("hex").toUpperCase() },
    isolation: { temporaryProfile: true, systemClockChanged: false, installedOrUninstalled: false, realUserDataTouched: false, processOnlyWeatherHostBlock: cachedWarning },
    scenario: cachedWarning ? "network-blocked-cached-warning" : motion ? "scene-rain" : "weather-offline",
    concealAction: nativeClose ? "native-close" : minimize ? "minimize-button" : "tray-hide-button",
    activationPath: secondInstance ? "native-single-instance" : "isolated-window-commands",
    revealElapsedMs,
    readyView: marker.readyView,
    original,
    initialDisplayEvents,
    hidden,
    revealMask,
    expectedDate,
    withdrawnWorkId,
    correctedDailyState,
    finalDisplayEvents,
    warningDailyState,
    warningText: cachedWarning ? warningText : undefined,
    compactWarningAudit,
    motion: motion ? { initial: initialMotion, hidden: hiddenMotion, steadyHiddenAfter3s: steadyHiddenMotion, restored: restoredMotion } : undefined,
    motionRecording,
    screenshots: [firstScreenshot, finalScreenshot].filter(Boolean),
    observed,
    result: "passed",
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ result: report.result, sha256: report.candidate.sha256, reportPath, observations: observed.length })}\n`);
} finally {
  socket?.close();
  await stopExactChild(secondary);
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
