import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build, preview } from "vite";
import { loadBundledModule } from "./load-reason-sources.mjs";

// --layout-audit inspects browser-preview geometry, not native WebView2.
// --matrix-audit additionally checks theme, layout, and font-size combinations.
// --reading-audit checks the full reading panel and a labeled synthetic punctuation probe.
// --favorites-audit follows a card-to-favorites round trip in an isolated browser.
// --midnight-audit advances a page-local clock while returning from reading/favorites.
// --corrupt-storage-audit checks that damaged browser records are not reset.
// --legacy-matrix-audit separates migratable old fields from damaged existing fields.
// --settings-audit checks settings disclosures and controls at regular/compact viewports.
// --capture leaves screenshots in a separately named temporary directory.
const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chromePath = chromeCandidates.find(existsSync);
if (!chromePath) throw new Error("Chrome or Edge is required for the isolated browser storage check");
const matrixAudit = process.argv.includes("--matrix-audit");
const readingAudit = process.argv.includes("--reading-audit");
const favoritesAudit = process.argv.includes("--favorites-audit");
const midnightAudit = process.argv.includes("--midnight-audit");
const corruptStorageAudit = process.argv.includes("--corrupt-storage-audit");
const legacyMatrixAudit = process.argv.includes("--legacy-matrix-audit");
const settingsAudit = process.argv.includes("--settings-audit");
const reasonBoundaryAudit = process.argv.includes("--reason-boundary");
const layoutAudit = process.argv.includes("--layout-audit") || matrixAudit || readingAudit;
const seededPoemAudit = layoutAudit || favoritesAudit || midnightAudit;
const captureLayout = (seededPoemAudit || corruptStorageAudit || legacyMatrixAudit || settingsAudit) && process.argv.includes("--capture");
if ((favoritesAudit && (matrixAudit || readingAudit || midnightAudit)) ||
    (midnightAudit && (matrixAudit || readingAudit)) ||
    (corruptStorageAudit && (seededPoemAudit || legacyMatrixAudit)) ||
    (legacyMatrixAudit && seededPoemAudit) ||
    (settingsAudit && (seededPoemAudit || corruptStorageAudit || legacyMatrixAudit))) {
  throw new Error("Specialized browser audits must run separately");
}
const boundaryReason = "这是隔离排版样本，仅用于核对四十字理由完整显示，不能视为真实诗词推荐或天气说明。";
if (reasonBoundaryAudit && (!matrixAudit || Array.from(boundaryReason).length !== 40)) {
  throw new Error("--reason-boundary requires --matrix-audit and a 40-character sample");
}
const matrixReportName = process.argv.find((arg) => arg.startsWith("--report="))
  ?.slice("--report=".length);
if (matrixReportName && (!matrixAudit || !/^T05_[A-Za-z0-9_-]+\.json$/.test(matrixReportName))) {
  throw new Error("--report requires --matrix-audit and a T05_*.json filename");
}
const readingReportName = process.argv.find((arg) => arg.startsWith("--reading-report="))
  ?.slice("--reading-report=".length);
if (readingReportName && (!readingAudit || !/^T06_[A-Za-z0-9_-]+\.json$/.test(readingReportName))) {
  throw new Error("--reading-report requires --reading-audit and a T06_*.json filename");
}
const favoritesReportName = process.argv.find((arg) => arg.startsWith("--favorites-report="))
  ?.slice("--favorites-report=".length);
if (favoritesReportName && (!favoritesAudit || !/^T08_[A-Za-z0-9_-]+\.json$/.test(favoritesReportName))) {
  throw new Error("--favorites-report requires --favorites-audit and a T08_*.json filename");
}
const midnightReportName = process.argv.find((arg) => arg.startsWith("--midnight-report="))
  ?.slice("--midnight-report=".length);
if (midnightReportName && (!midnightAudit || !/^T01_[A-Za-z0-9_-]+\.json$/.test(midnightReportName))) {
  throw new Error("--midnight-report requires --midnight-audit and a T01_*.json filename");
}
const corruptReportName = process.argv.find((arg) => arg.startsWith("--corrupt-report="))
  ?.slice("--corrupt-report=".length);
if (corruptReportName && (!corruptStorageAudit || !/^T03_[A-Za-z0-9_-]+\.json$/.test(corruptReportName))) {
  throw new Error("--corrupt-report requires --corrupt-storage-audit and a T03_*.json filename");
}
const legacyReportName = process.argv.find((arg) => arg.startsWith("--legacy-report="))
  ?.slice("--legacy-report=".length);
if (legacyReportName && (!legacyMatrixAudit || !/^T03_[A-Za-z0-9_-]+\.json$/.test(legacyReportName))) {
  throw new Error("--legacy-report requires --legacy-matrix-audit and a T03_*.json filename");
}
const settingsReportName = process.argv.find((arg) => arg.startsWith("--settings-report="))
  ?.slice("--settings-report=".length);
if (settingsReportName && (!settingsAudit || !/^T03_[A-Za-z0-9_-]+\.json$/.test(settingsReportName))) {
  throw new Error("--settings-report requires --settings-audit and a T03_*.json filename");
}
const layoutPoemId = process.argv.find((arg) => arg.startsWith("--poem-id="))
  ?.slice("--poem-id=".length) ?? "cui-hao-huang-he-lou";
const layoutDate = process.argv.find((arg) => arg.startsWith("--date="))
  ?.slice("--date=".length) ?? (midnightAudit ? "2026-10-13" : undefined);
if (layoutDate && !/^\d{4}-\d{2}-\d{2}$/.test(layoutDate)) {
  throw new Error("--date must be formatted YYYY-MM-DD");
}
if (midnightAudit && layoutDate !== "2026-10-13") {
  throw new Error("--midnight-audit uses the fixed 2026-10-13 to 2026-10-15 fixture");
}

const profileDirectory = mkdtempSync(join(tmpdir(), "weatherpoem-browser-storage-"));
const captureDirectory = captureLayout
  ? mkdtempSync(join(tmpdir(), "weatherpoem-layout-capture-"))
  : undefined;
const capturedScreenshots = [];
let browser;
let previewServer;
let socket;
let requestId = 0;
const pending = new Map();

async function waitFor(check, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // Navigation can briefly destroy the evaluation context.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function send(method, params = {}) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 10_000);
    pending.set(id, { resolve, reject, timeout });
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
    throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed");
  }
  return response.result.value;
}

async function changeSelect(selector, value) {
  const changed = await evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) return false;
    field.value = ${JSON.stringify(value)};
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!changed) throw new Error(`Missing select: ${selector}`);
}

async function click(selector) {
  const clicked = await evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Missing button: ${selector}`);
}

async function currentSettings() {
  return evaluate(`(() => ({
    cityId: document.querySelector(".settings-form select")?.value,
    poemLayout: document.querySelector('select[name="poem-layout"]')?.value,
    poemFontSize: document.querySelector('select[name="poem-font-size"]')?.value,
  }))()`);
}

async function favoriteFlowSnapshot(stage) {
  const state = await evaluate(`(() => {
    const saved = JSON.parse(localStorage.getItem("weatherpoem.local.v1") ?? "null");
    const active = document.activeElement;
    return {
      panel: document.querySelector(".reading-panel") ? "reading" :
        document.querySelector(".favorites-panel") ? "favorites" :
        document.querySelector(".poem-view") ? "card" : "other",
      focusPanel: active?.closest(".reading-panel, .favorites-panel, .poem-view")?.className ?? null,
      activeIsPanel: Boolean(active?.matches(".reading-panel, .favorites-panel, .poem-view")),
      cardTitle: document.querySelector("#daily-poem-title")?.textContent ?? null,
      readingTitle: document.querySelector("#reading-title")?.textContent ?? null,
      backLabel: document.querySelector(".reading-panel .back-button, .favorites-panel .back-button")?.textContent?.trim() ?? null,
      cardFavorite: document.querySelector(".poem-view .card-actions button[aria-pressed]")?.getAttribute("aria-pressed") ?? null,
      readingFavorite: document.querySelector(".reading-panel .icon-button[aria-pressed]")?.getAttribute("aria-pressed") ?? null,
      poemFontSize: document.querySelector(".poem-view, .reading-panel")?.getAttribute("data-poem-font-size") ?? null,
      poemVertical: Boolean(document.querySelector(".poem-lines.is-vertical, .reading-poem-frame.is-vertical")),
      favoriteTitles: [...document.querySelectorAll(".favorite-open strong")].map((item) => item.textContent),
      favoriteCount: document.querySelector(".context-favorites")?.textContent?.trim() ?? null,
      storageFavorites: saved?.favorites ?? null,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  })()`);
  return { stage, ...state };
}

async function midnightSnapshot(stage) {
  const state = await evaluate(`(() => {
    const saved = JSON.parse(localStorage.getItem("weatherpoem.local.v1") ?? "null");
    return {
      view: document.querySelector(".reading-panel") ? "reading" :
        document.querySelector(".favorites-panel") ? "favorites" :
        document.querySelector(".poem-view") ? "card" : "other",
      displayDate: document.querySelector(".context-strip strong")?.textContent ?? null,
      cardTitle: document.querySelector("#daily-poem-title")?.textContent ?? null,
      dailyDate: saved?.dailyState?.localDate ?? null,
      historyDates: saved?.history?.map((item) => item.localDate) ?? null,
      favorites: saved?.favorites ?? null,
      focusPanel: document.activeElement?.closest(".reading-panel, .favorites-panel, .poem-view")?.className ?? null,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  })()`);
  return { stage, ...state };
}

async function damagedStorageSnapshot(stage, damaged) {
  const state = await evaluate(`(() => {
    const raw = localStorage.getItem("weatherpoem.local.v1");
    return {
      error: document.querySelector(".error-view")?.textContent?.trim() ?? null,
      onboardingVisible: Boolean(document.querySelector(".onboarding-view")),
      poemVisible: Boolean(document.querySelector(".poem-view")),
      damagedBytesUnchanged: raw === ${JSON.stringify(damaged)},
      savedCity: raw && raw !== ${JSON.stringify(damaged)} ? JSON.parse(raw).settings?.cityId : null,
      savedFavorites: raw && raw !== ${JSON.stringify(damaged)} ? JSON.parse(raw).favorites : null,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  return { stage, ...state };
}

async function legacyMatrixSnapshot(name, expectedRaw) {
  const state = await evaluate(`(() => {
    const raw = localStorage.getItem("weatherpoem.local.v1");
    let saved = null;
    try { saved = JSON.parse(raw); } catch { /* A failed parse is also a valid test fixture. */ }
    const poemText = document.querySelector(".poem-lines p");
    const paper = document.querySelector(".poem-paper");
    const luminance = (color) => {
      const values = color.match(/[0-9.]+/g)?.slice(0, 3).map(Number) ?? [];
      if (values.length !== 3) return null;
      return values.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const textLight = poemText ? luminance(getComputedStyle(poemText).color) : null;
    const paperLight = paper ? luminance(getComputedStyle(paper).backgroundColor) : null;
    return {
      errorVisible: Boolean(document.querySelector(".error-view")),
      onboardingVisible: Boolean(document.querySelector(".onboarding-view")),
      poemVisible: Boolean(document.querySelector(".poem-view")),
      cityHeadingVisible: document.body.innerText.includes("杭州"),
      poemText: poemText?.textContent?.trim() ?? null,
      poemTextColor: poemText ? getComputedStyle(poemText).color : null,
      paperColor: paper ? getComputedStyle(paper).backgroundColor : null,
      poemContrast: textLight === null || paperLight === null ? null
        : (Math.max(textLight, paperLight) + 0.05) / (Math.min(textLight, paperLight) + 0.05),
      rawUnchanged: raw === ${JSON.stringify(expectedRaw)},
      savedCity: saved?.settings?.cityId ?? null,
      savedFavorites: Array.isArray(saved?.favorites) ? saved.favorites : null,
      historyWorkIds: Array.isArray(saved?.history)
        ? saved.history.map((item) => item?.workId ?? null) : null,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  return { name, ...state };
}

async function measureGlance(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await delay(200);
  return evaluate(`(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return rect ? {
        top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        left: Math.round(rect.left), right: Math.round(rect.right),
      } : null;
    };
    const view = document.querySelector(".poem-view");
    const content = document.querySelector(".glance-content");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      theme: document.documentElement.dataset.theme,
      title: document.querySelector("#daily-poem-title")?.textContent,
      fontSize: view?.dataset.poemFontSize,
      vertical: Boolean(document.querySelector(".poem-lines.is-vertical")),
      poemText: [...document.querySelectorAll(".poem-lines p")]
        .map((line) => line.textContent).join(""),
      reasonText: document.querySelector(".reason-block")?.textContent,
      viewClientHeight: view?.clientHeight,
      viewScrollHeight: view?.scrollHeight,
      requestedWindowHeight: content ? Math.ceil(content.scrollHeight + 82) : null,
      documentScrollWidth: document.documentElement.scrollWidth,
      chrome: box(".window-chrome"),
      context: box(".context-strip"),
      titleBox: box(".poem-heading h1"),
      authorBox: box(".poem-heading p"),
      paper: box(".poem-paper"),
      poem: box(".poem-lines"),
      reason: box(".reason-block"),
      actions: box(".card-actions"),
      actionButtons: [...document.querySelectorAll(".card-actions button")]
        .map((button) => ({ text: button.textContent.trim(), rect: box(
          ".card-actions button:nth-child(" + ([...button.parentElement.children].indexOf(button) + 1) + ")",
        ) })),
      secondaryActions: box(".secondary-actions"),
    };
  })()`);
}

async function measureReading(width, height, scrollToEnd = false) {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await delay(200);
  return evaluate(`(() => {
    const panel = document.querySelector(".reading-panel");
    const frame = document.querySelector(".reading-poem-frame");
    if (${scrollToEnd}) panel.scrollTop = panel.scrollHeight;
    const box = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? {
        top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        left: Math.round(rect.left), right: Math.round(rect.right),
      } : null;
    };
    const font = (selector) => {
      const element = document.querySelector(selector);
      return element ? parseFloat(getComputedStyle(element).fontSize) : null;
    };
    const initialFrameScroll = frame?.scrollLeft ?? 0;
    if (frame?.classList.contains("is-vertical")) {
      frame.scrollLeft = -frame.scrollWidth;
    }
    return {
      theme: document.documentElement.dataset.theme,
      fontSize: panel?.dataset.poemFontSize,
      vertical: Boolean(frame?.classList.contains("is-vertical")),
      title: document.querySelector("#reading-title")?.textContent,
      poemText: [...document.querySelectorAll(".full-poem p")]
        .map((line) => line.textContent).join(""),
      poemLineCount: document.querySelectorAll(".full-poem p").length,
      documentScrollWidth: document.documentElement.scrollWidth,
      panelClientHeight: panel?.clientHeight,
      panelScrollHeight: panel?.scrollHeight,
      panelScrollTop: panel?.scrollTop,
      frameClientWidth: frame?.clientWidth,
      frameScrollWidth: frame?.scrollWidth,
      frameInitialScroll: initialFrameScroll,
      frameEndScroll: frame?.scrollLeft,
      back: box(document.querySelector(".reading-panel .back-button")),
      layoutAction: box(document.querySelector(".reading-layout-action button")),
      edition: box(document.querySelector(".edition-note")),
      editionText: document.querySelector(".edition-note")?.textContent,
      typography: {
        sectionBody: font(".reading-section > p"),
        annotationTerm: font(".annotation-list dt"),
        annotationExplanation: font(".annotation-list dd"),
        edition: font(".edition-note"),
      },
      viewport: { width: innerWidth, height: innerHeight },
    };
  })()`);
}

async function captureScreenshot(name) {
  if (!captureDirectory) return;
  const result = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: false,
  });
  const path = join(captureDirectory, name);
  writeFileSync(path, Buffer.from(result.data, "base64"));
  capturedScreenshots.push(path);
}

async function closeOwnedBrowser() {
  if (!browser || browser.exitCode !== null) return;
  browser.kill();
  await Promise.race([
    new Promise((resolve) => browser.once("exit", resolve)),
    delay(5_000),
  ]);
}

try {
  await build({ logLevel: "error" });
  previewServer = await preview({
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const address = previewServer.httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Preview server did not expose a TCP port");
  }
  const url = `http://127.0.0.1:${address.port}/`;
  browser = spawn(chromePath, [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  const portFile = join(profileDirectory, "DevToolsActivePort");
  const debuggingPort = await waitFor(() => {
    if (browser.exitCode !== null) throw new Error("Headless browser exited early");
    return existsSync(portFile)
      ? Number(readFileSync(portFile, "utf8").split(/\r?\n/)[0])
      : undefined;
  }, "headless browser debugging port");
  const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json`)
    .then((response) => response.json());
  const browserVersion = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)
    .then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No headless browser page target");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  if (seededPoemAudit && layoutDate) {
    const fixedTime = Date.parse(`${layoutDate}T${midnightAudit ? "23:59:00" : "09:00:00"}+08:00`);
    if (!Number.isFinite(fixedTime)) throw new Error("Invalid layout audit date");
    await send("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" });
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const RealDate = Date;
        let currentTime = ${fixedTime};
        window.__weatherpoemSetTestClock = (next) => { currentTime = next; };
        function FixedDate(...args) {
          if (new.target) return new RealDate(...(args.length ? args : [currentTime]));
          return new RealDate(currentTime).toString();
        }
        FixedDate.prototype = RealDate.prototype;
        Object.setPrototypeOf(FixedDate, RealDate);
        FixedDate.now = () => currentTime;
        window.Date = FixedDate;
      })();`,
    });
  }
  await send("Page.navigate", { url });
  await waitFor(() => evaluate("location.origin === " + JSON.stringify(new URL(url).origin)), "preview origin");
  const legacyProfile = {
    settings: { configured: true, cityId: "beijing" },
    history: [],
    favorites: ["wang-an-shi-yuan-ri"],
    feedback: [],
  };
  if (seededPoemAudit) {
    const today = new Date();
    const localDate = layoutDate ?? [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    legacyProfile.dailyState = {
      localDate,
      state: "shown",
      workId: layoutPoemId,
      contentVersion: "legacy",
      ruleVersion: "legacy",
    };
  }
  await evaluate(`localStorage.setItem("weatherpoem.local.v1", ${JSON.stringify(JSON.stringify(legacyProfile))})`);
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*://api.open-meteo.com/*"] });
  const corruptFlow = [];
  const legacyMatrixFlow = [];
  if (legacyMatrixAudit) {
    const oldHistory = {
      localDate: "2026-07-23", workId: "wang-an-shi-yuan-ri",
      author: "王安石", primaryContext: "festival",
    };
    const cases = [
      { name: "0.2.0-old-preferences-and-history", valid: true, profile: {
        settings: { configured: true, cityId: "hangzhou", autostart: false,
          anonymousMetrics: false, theme: "dark", reduceMotion: true },
        history: [oldHistory], favorites: ["wang-an-shi-yuan-ri"], feedback: [],
      } },
      { name: "old-profile-missing-optional-collections", valid: true, profile: {
        settings: { configured: true, cityId: "hangzhou" },
        history: [oldHistory], favorites: ["wang-an-shi-yuan-ri"],
      } },
      { name: "configured-city-missing", valid: false, profile: {
        settings: { configured: true },
        history: [oldHistory], favorites: ["wang-an-shi-yuan-ri"], feedback: [],
      } },
      { name: "configured-city-wrong-type", valid: false, profile: {
        settings: { configured: true, cityId: 12 },
        history: [oldHistory], favorites: ["wang-an-shi-yuan-ri"], feedback: [],
      } },
      { name: "history-item-wrong-type", valid: false, profile: {
        settings: { configured: true, cityId: "hangzhou" },
        history: ["wang-an-shi-yuan-ri"], favorites: ["wang-an-shi-yuan-ri"], feedback: [],
      } },
      { name: "feedback-tags-wrong-type", valid: false, profile: {
        settings: { configured: true, cityId: "hangzhou" },
        history: [oldHistory], favorites: ["wang-an-shi-yuan-ri"],
        feedback: [{ workId: "wang-an-shi-yuan-ri", type: "replaced",
          contextTags: "festival", createdAt: "2026-07-23T08:01:00+08:00" }],
      } },
      { name: "daily-impossible-date", valid: false, profile: {
        settings: { configured: true, cityId: "hangzhou" },
        dailyState: { localDate: "2026-02-30", state: "shown",
          workId: "wang-an-shi-yuan-ri", contentVersion: "legacy", ruleVersion: "legacy" },
        history: [oldHistory], favorites: ["wang-an-shi-yuan-ri"], feedback: [],
      } },
      { name: "history-noncanonical-date", valid: false, profile: {
        settings: { configured: true, cityId: "hangzhou" },
        history: [{ ...oldHistory, localDate: "2026-2-3" }],
        favorites: ["wang-an-shi-yuan-ri"], feedback: [],
      } },
      { name: "feedback-impossible-date", valid: false, profile: {
        settings: { configured: true, cityId: "hangzhou" },
        history: [oldHistory], favorites: ["wang-an-shi-yuan-ri"],
        feedback: [{ workId: "wang-an-shi-yuan-ri", type: "replaced",
          contextTags: ["festival"], createdAt: "2026-07-23T08:01:00+08:00",
          localDate: "2026-02-30" }],
      } },
    ];
    await send("Emulation.setDeviceMetricsOverride", {
      width: 392, height: 430, deviceScaleFactor: 1, mobile: false,
    });
    for (const entry of cases) {
      const raw = JSON.stringify(entry.profile);
      await evaluate(`localStorage.setItem("weatherpoem.local.v1", ${JSON.stringify(raw)})`);
      await send("Page.reload", { ignoreCache: true });
      const selector = entry.valid ? ".poem-view" : ".error-view";
      await waitFor(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), entry.name);
      const themeReadyStartedAt = Date.now();
      if (entry.valid) {
        await waitFor(async () => {
          const visible = await legacyMatrixSnapshot(entry.name, raw);
          return visible.poemContrast !== null && visible.poemContrast >= 4.5;
        }, `${entry.name} legible poem ink`, 5_000);
      }
      const result = await legacyMatrixSnapshot(entry.name, raw);
      result.poemReadableAfterMs = entry.valid ? Date.now() - themeReadyStartedAt : null;
      legacyMatrixFlow.push(result);
      if (entry.valid) {
        if (!result.poemVisible || result.errorVisible || result.onboardingVisible ||
            !result.cityHeadingVisible || result.savedCity !== "hangzhou" ||
            !result.savedFavorites?.includes("wang-an-shi-yuan-ri") ||
            !result.historyWorkIds?.includes("wang-an-shi-yuan-ri") ||
            result.poemContrast === null || result.poemContrast < 4.5 ||
            result.documentOverflow) {
          throw new Error(`Old browser profile did not migrate: ${JSON.stringify(result)}`);
        }
      } else if (!result.errorVisible || result.poemVisible || result.onboardingVisible ||
          !result.rawUnchanged || result.documentOverflow) {
        throw new Error(`Damaged browser profile was not protected: ${JSON.stringify(result)}`);
      }
      if (entry.name === "0.2.0-old-preferences-and-history" ||
          entry.name === "configured-city-wrong-type") {
        await delay(400);
        await captureScreenshot(`T03_${entry.name}.png`);
      }
    }
    await evaluate(`localStorage.setItem("weatherpoem.local.v1", ${JSON.stringify(JSON.stringify(legacyProfile))})`);
    await send("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "restored legacy profile");
    await send("Emulation.clearDeviceMetricsOverride");
  } else if (corruptStorageAudit) {
    const damaged = '{"settings":{"configured":true},';
    await evaluate(`localStorage.setItem("weatherpoem.local.v1", ${JSON.stringify(damaged)})`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 392, height: 430, deviceScaleFactor: 1, mobile: false,
    });
    await send("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate("Boolean(document.querySelector('.error-view'))"), "damaged-data error view");
    corruptFlow.push(await damagedStorageSnapshot("damaged-load", damaged));
    if (!corruptFlow.at(-1).error.includes("原始资料未被覆盖") ||
        corruptFlow.at(-1).onboardingVisible || !corruptFlow.at(-1).damagedBytesUnchanged) {
      throw new Error(`Damaged data was silently replaced: ${JSON.stringify(corruptFlow.at(-1))}`);
    }
    await captureScreenshot("T03_damaged_storage_error.png");
    await click(".error-view button");
    await delay(400);
    corruptFlow.push(await damagedStorageSnapshot("retry-still-damaged", damaged));
    if (!corruptFlow.at(-1).error || corruptFlow.at(-1).onboardingVisible ||
        !corruptFlow.at(-1).damagedBytesUnchanged) {
      throw new Error(`Retry overwrote damaged data: ${JSON.stringify(corruptFlow.at(-1))}`);
    }
    await evaluate(`localStorage.setItem("weatherpoem.local.v1", ${JSON.stringify(JSON.stringify(legacyProfile))})`);
    await click(".error-view button");
    await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "recovered legacy poem view");
    corruptFlow.push(await damagedStorageSnapshot("repaired-load", damaged));
    if (corruptFlow.at(-1).savedCity !== "beijing" ||
        !corruptFlow.at(-1).savedFavorites.includes("wang-an-shi-yuan-ri") ||
        corruptFlow.at(-1).documentOverflow) {
      throw new Error(`Repaired legacy data did not recover: ${JSON.stringify(corruptFlow.at(-1))}`);
    }
    await captureScreenshot("T03_repaired_storage_poem.png");
    await send("Emulation.clearDeviceMetricsOverride");
  } else {
    await send("Page.reload", { ignoreCache: true });
    try {
      await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "legacy profile poem view");
    } catch (error) {
      const visibleText = await evaluate("document.body.innerText.slice(0, 500)").catch(() => "unavailable");
      throw new Error(`${error.message}; visible page: ${visibleText}`);
    }
  }
  const layoutMeasurements = [];
  let moreMeasurement;
  if (layoutAudit) {
    for (const [width, height] of [[392, 320], [392, 430], [320, 260]]) {
      layoutMeasurements.push(await measureGlance(width, height));
      if (width === 392 && height === 430) {
        await captureScreenshot("long-title-horizontal.png");
      }
    }
    await send("Emulation.setDeviceMetricsOverride", {
      width: 392, height: 470, deviceScaleFactor: 1, mobile: false,
    });
    await click(".more-action");
    moreMeasurement = await measureGlance(392, 470);
    await click(".more-action");
    await send("Emulation.clearDeviceMetricsOverride");
  }

  await click('button[aria-label="设置"]');
  await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "settings panel");
  const settingsMeasurements = [];
  if (settingsAudit) {
    for (const theme of ["light", "dark"]) {
      await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
      for (const [width, height] of [[430, 680], [320, 260]]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width, height, deviceScaleFactor: 1, mobile: false,
        });
        await evaluate("document.querySelector('.settings-panel').scrollTop = 0");
        await captureScreenshot(`T03_settings_${theme}_${width}x${height}_top.png`);
        const measurement = await evaluate(`(() => {
          const panel = document.querySelector('.settings-panel');
          const font = (selector) => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
          const sizes = {
            groupHeading: font('.settings-group h2'),
            switchDescription: font('.switch-row small'),
            settingsNote: font('.settings-note'),
            releaseDescription: font('.release-row small'),
            trustHeading: font('.trust-disclosure > strong'),
            trustBody: font('.trust-disclosure p'),
            trustFootnote: font('.trust-disclosure small'),
            trustAction: font('.trust-actions button'),
            navigationDescription: font('.settings-navigation small'),
            clearDataAction: font('.danger-link'),
          };
          panel.scrollTop = panel.scrollHeight;
          const save = panel.querySelector('button[type="submit"]').getBoundingClientRect();
          return {
            theme: ${JSON.stringify(theme)}, width: ${width}, height: ${height}, sizes,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            panelScrollHeight: panel.scrollHeight,
            panelClientHeight: panel.clientHeight,
            saveReachable: save.top >= 0 && save.bottom <= innerHeight,
          };
        })()`);
        settingsMeasurements.push(measurement);
        await captureScreenshot(`T03_settings_${theme}_${width}x${height}_bottom.png`);
        if (
          measurement.horizontalOverflow || !measurement.saveReachable ||
          measurement.sizes.groupHeading < 13 ||
          measurement.sizes.switchDescription < 12 ||
          measurement.sizes.settingsNote < 12 ||
          measurement.sizes.releaseDescription < 12 ||
          measurement.sizes.trustHeading < 13 ||
          measurement.sizes.trustBody < 12 ||
          measurement.sizes.trustFootnote < 12 ||
          measurement.sizes.trustAction < 12 ||
          measurement.sizes.navigationDescription < 12 ||
          measurement.sizes.clearDataAction < 12
        ) throw new Error(`Settings readability audit failed: ${JSON.stringify(measurement)}`);
      }
      await send("Emulation.clearDeviceMetricsOverride");
    }
    await evaluate("document.documentElement.dataset.theme = 'light'");
  }
  await changeSelect(".settings-form select", "hangzhou");
  await changeSelect('select[name="poem-layout"]', "vertical");
  await changeSelect('select[name="poem-font-size"]', "large");
  const favoritesOpened = await evaluate(`(() => {
    const button = [...document.querySelectorAll(".settings-navigation")]
      .find((item) => item.textContent.includes("我的收藏"));
    button?.click();
    return Boolean(button);
  })()`);
  if (!favoritesOpened) throw new Error("Favorites navigation is missing");
  await waitFor(() => evaluate("Boolean(document.querySelector('.favorites-panel'))"), "favorites panel");
  const favoriteVisible = await evaluate(
    "document.querySelector('.favorites-panel')?.textContent.includes('元日')",
  );
  if (!favoriteVisible) throw new Error("Legacy favorite is missing from the visible favorites panel");
  await click('button[aria-label="设置"]');
  await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "returned settings panel");
  const draft = await currentSettings();
  if (JSON.stringify(draft) !== JSON.stringify({
    cityId: "hangzhou", poemLayout: "vertical", poemFontSize: "large",
  })) throw new Error(`Settings draft was lost: ${JSON.stringify(draft)}`);

  await evaluate("document.querySelector('.settings-form').requestSubmit()");
  await waitFor(() => evaluate(`(() => {
    const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1") ?? "null");
    return data?.settings?.cityId === "hangzhou" &&
      data?.settings?.poemLayout === "vertical" &&
      data?.settings?.poemFontSize === "large";
  })()`), "saved browser settings");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "reloaded poem view");
  await click('button[aria-label="设置"]');
  await waitFor(() => evaluate("Boolean(document.querySelector('.settings-panel'))"), "reloaded settings panel");
  const reloaded = await currentSettings();
  if (JSON.stringify(reloaded) !== JSON.stringify(draft)) {
    throw new Error(`Saved settings did not survive page reload: ${JSON.stringify(reloaded)}`);
  }
  const favoritePreserved = await evaluate(`JSON.parse(localStorage.getItem("weatherpoem.local.v1"))
    .favorites.includes("wang-an-shi-yuan-ri")`);
  if (!favoritePreserved) throw new Error("Legacy favorite was lost");
  const favoriteFlow = [];
  let favoriteCompactReading;
  if (favoritesAudit) {
    const { POEMS } = await loadBundledModule(process.cwd(), "src/data/poems.ts");
    const expectedPoem = POEMS.find((poem) => poem.id === layoutPoemId);
    if (!expectedPoem || layoutPoemId === "wang-an-shi-yuan-ri") {
      throw new Error(`Choose an available, initially uncollected poem: ${layoutPoemId}`);
    }
    await evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
      data.dailyState.workId = ${JSON.stringify(layoutPoemId)};
      data.settings.poemLayout = "horizontal";
      data.settings.poemFontSize = "medium";
      localStorage.setItem("weatherpoem.local.v1", JSON.stringify(data));
    })()`);
    await send("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "seeded card after settings");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 392, height: 430, deviceScaleFactor: 1, mobile: false,
    });
    await waitFor(() => evaluate("document.activeElement?.classList.contains('poem-view')"), "card focus");
    favoriteFlow.push(await favoriteFlowSnapshot("card-before"));
    if (favoriteFlow.at(-1).cardTitle !== expectedPoem.title ||
        favoriteFlow.at(-1).cardFavorite !== "false") {
      throw new Error(`Unexpected initial poem/favorite state: ${JSON.stringify(favoriteFlow.at(-1))}`);
    }
    await captureScreenshot("T08_card_before.png");

    await click(".read-button");
    await waitFor(() => evaluate("document.activeElement?.classList.contains('reading-panel')"), "reading focus from card");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 560, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    favoriteFlow.push(await favoriteFlowSnapshot("reading-from-card"));
    if (favoriteFlow.at(-1).readingTitle !== expectedPoem.title ||
        !favoriteFlow.at(-1).backLabel.includes("今日诗笺")) {
      throw new Error(`Reading did not retain its card origin: ${JSON.stringify(favoriteFlow.at(-1))}`);
    }
    await click(".reading-panel .icon-button[aria-pressed]");
    await waitFor(() => evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
      return data.favorites.includes(${JSON.stringify(layoutPoemId)}) &&
        document.querySelector(".reading-panel .icon-button[aria-pressed]")?.getAttribute("aria-pressed") === "true";
    })()`), "favorite persisted from reading");
    favoriteFlow.push(await favoriteFlowSnapshot("reading-collected"));
    await waitFor(() => evaluate("!document.querySelector('.toast-message')"), "collection confirmation to clear");
    await captureScreenshot("T08_reading_collected.png");

    await click(".reading-panel .back-button");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 392, height: 430, deviceScaleFactor: 1, mobile: false,
    });
    await waitFor(() => evaluate("document.activeElement?.classList.contains('poem-view')"), "card focus after reading");
    favoriteFlow.push(await favoriteFlowSnapshot("card-collected"));
    if (favoriteFlow.at(-1).cardFavorite !== "true" ||
        favoriteFlow.at(-1).documentScrollWidth > 392) {
      throw new Error(`Card did not reflect saved favorite: ${JSON.stringify(favoriteFlow.at(-1))}`);
    }
    await send("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate("document.activeElement?.classList.contains('poem-view')"), "card focus after reload");
    favoriteFlow.push(await favoriteFlowSnapshot("card-after-reload"));
    if (favoriteFlow.at(-1).cardTitle !== expectedPoem.title ||
        favoriteFlow.at(-1).cardFavorite !== "true" ||
        !favoriteFlow.at(-1).storageFavorites.includes(layoutPoemId)) {
      throw new Error(`Favorite did not survive page reload: ${JSON.stringify(favoriteFlow.at(-1))}`);
    }
    await click(".context-favorites");
    await waitFor(() => evaluate("document.activeElement?.classList.contains('favorites-panel')"), "favorites focus from card");
    favoriteFlow.push(await favoriteFlowSnapshot("favorites-list"));
    if (favoriteFlow.at(-1).favoriteTitles[0] !== expectedPoem.title ||
        !favoriteFlow.at(-1).backLabel.includes("今日诗笺")) {
      throw new Error(`Saved poem is not findable in favorites: ${JSON.stringify(favoriteFlow.at(-1))}`);
    }
    await captureScreenshot("T08_favorites_list.png");

    const opened = await evaluate(`(() => {
      const button = [...document.querySelectorAll(".favorite-open")]
        .find((item) => item.querySelector("strong")?.textContent === ${JSON.stringify(expectedPoem.title)});
      button?.click();
      return Boolean(button);
    })()`);
    if (!opened) throw new Error("Saved poem cannot be opened from favorites");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 560, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    await waitFor(() => evaluate("document.activeElement?.classList.contains('reading-panel')"), "reading focus from favorites");
    favoriteFlow.push(await favoriteFlowSnapshot("reading-from-favorites"));
    const fullText = await evaluate(`[...document.querySelectorAll(".full-poem p")]
      .map((line) => line.textContent).join("")`);
    if (favoriteFlow.at(-1).readingTitle !== expectedPoem.title ||
        !favoriteFlow.at(-1).backLabel.includes("我的收藏") ||
        fullText !== expectedPoem.fullText.join("")) {
      throw new Error(`Reopened reading content/origin mismatch: ${JSON.stringify(favoriteFlow.at(-1))}`);
    }
    favoriteCompactReading = await measureReading(320, 260, true);
    if (!favoriteCompactReading.back || favoriteCompactReading.back.bottom > 260 ||
        favoriteCompactReading.documentScrollWidth > 320 ||
        !favoriteCompactReading.edition || favoriteCompactReading.edition.bottom > 260) {
      throw new Error(`Compact reading lost back/source access: ${JSON.stringify(favoriteCompactReading)}`);
    }
    await captureScreenshot("T08_reading_compact_bottom.png");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 560, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    await click(".reading-panel .icon-button[aria-pressed]");
    await waitFor(() => evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
      return !data.favorites.includes(${JSON.stringify(layoutPoemId)}) &&
        document.querySelector(".reading-panel .icon-button[aria-pressed]")?.getAttribute("aria-pressed") === "false";
    })()`), "unfavorite persisted from reopened reading");
    favoriteFlow.push(await favoriteFlowSnapshot("reading-uncollected"));

    await click(".reading-panel .back-button");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 392, height: 430, deviceScaleFactor: 1, mobile: false,
    });
    await waitFor(() => evaluate("document.activeElement?.classList.contains('favorites-panel')"), "favorites focus after reading");
    favoriteFlow.push(await favoriteFlowSnapshot("favorites-after-remove"));
    if (favoriteFlow.at(-1).favoriteTitles.includes(expectedPoem.title) ||
        !favoriteFlow.at(-1).favoriteTitles.includes("元日")) {
      throw new Error(`Favorite removal did not synchronize list: ${JSON.stringify(favoriteFlow.at(-1))}`);
    }
    await waitFor(() => evaluate("!document.querySelector('.toast-message')"), "removal confirmation to clear");
    await captureScreenshot("T08_favorites_after_remove.png");
    await click(".favorites-panel .back-button");
    await waitFor(() => evaluate("document.activeElement?.classList.contains('poem-view')"), "card focus after favorites");
    favoriteFlow.push(await favoriteFlowSnapshot("card-after-remove"));
    if (favoriteFlow.at(-1).cardFavorite !== "false" ||
        favoriteFlow.at(-1).storageFavorites.includes(layoutPoemId) ||
        favoriteFlow.at(-1).documentScrollWidth > 392) {
      throw new Error(`Card/storage did not reflect removal: ${JSON.stringify(favoriteFlow.at(-1))}`);
    }
    await captureScreenshot("T08_card_after_remove.png");
    await send("Emulation.clearDeviceMetricsOverride");
  }
  const midnightFlow = [];
  if (midnightAudit) {
    await evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
      data.dailyState.localDate = "2026-10-13";
      data.dailyState.workId = ${JSON.stringify(layoutPoemId)};
      data.dailyState.state = "shown";
      data.history = [];
      data.settings.poemLayout = "horizontal";
      data.settings.poemFontSize = "medium";
      localStorage.setItem("weatherpoem.local.v1", JSON.stringify(data));
    })()`);
    await send("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "pre-midnight card");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 392, height: 430, deviceScaleFactor: 1, mobile: false,
    });
    midnightFlow.push(await midnightSnapshot("card-13"));
    if (midnightFlow.at(-1).dailyDate !== "2026-10-13" ||
        midnightFlow.at(-1).displayDate !== "10月13日") {
      throw new Error(`Unexpected pre-midnight card: ${JSON.stringify(midnightFlow.at(-1))}`);
    }
    await captureScreenshot("T01_card_oct13.png");
    await click(".read-button");
    await waitFor(() => evaluate("Boolean(document.querySelector('.reading-panel'))"), "pre-midnight reading");
    await evaluate(`window.__weatherpoemSetTestClock(${Date.parse("2026-10-14T00:01:00+08:00")})`);
    await click(".reading-panel .back-button");
    await waitFor(() => evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
      return document.querySelector(".context-strip strong")?.textContent === "10月14日" &&
        data.dailyState?.localDate === "2026-10-14";
    })()`), "October 14 card after reading return");
    midnightFlow.push(await midnightSnapshot("card-14-after-reading"));
    await captureScreenshot("T01_card_oct14_after_reading.png");

    await click('.card-actions button[aria-pressed="false"]');
    await waitFor(() => evaluate("document.querySelector('.card-actions button[aria-pressed]')?.getAttribute('aria-pressed') === 'true'"), "favorite on October 14");
    const favoriteId = await evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
      return data.dailyState.workId;
    })()`);
    await click(".context-favorites");
    await waitFor(() => evaluate("Boolean(document.querySelector('.favorites-panel'))"), "favorites before second midnight");
    const opened = await evaluate(`(() => {
      const button = document.querySelector(".favorite-open");
      button?.click();
      return Boolean(button);
    })()`);
    if (!opened) throw new Error("Cannot open a saved poem before second midnight");
    await waitFor(() => evaluate("Boolean(document.querySelector('.reading-panel'))"), "favorite reading before second midnight");
    await evaluate(`window.__weatherpoemSetTestClock(${Date.parse("2026-10-15T00:01:00+08:00")})`);
    await click(".reading-panel .back-button");
    await waitFor(() => evaluate("Boolean(document.querySelector('.favorites-panel'))"), "favorites after second midnight");
    midnightFlow.push(await midnightSnapshot("favorites-15"));
    await click(".favorites-panel .back-button");
    await waitFor(() => evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
      return document.querySelector(".context-strip strong")?.textContent === "10月15日" &&
        data.dailyState?.localDate === "2026-10-15";
    })()`), "October 15 card after favorites return");
    midnightFlow.push(await midnightSnapshot("card-15-after-favorites"));
    await waitFor(() => evaluate("!document.querySelector('.toast-message')"), "favorite confirmation to clear");
    await captureScreenshot("T01_card_oct15_after_favorites.png");
    const final = midnightFlow.at(-1);
    if (final.historyDates[0] !== "2026-10-15" ||
        final.historyDates.filter((date) => date === "2026-10-15").length !== 1 ||
        !final.favorites.includes(favoriteId) ||
        final.documentScrollWidth > final.viewportWidth) {
      throw new Error(`Midnight return lost history/favorite or overflowed: ${JSON.stringify(final)}`);
    }
    await send("Emulation.clearDeviceMetricsOverride");
  }
  const largeVerticalMeasurements = [];
  let lowWorkAreaActionsReachable = false;
  if (layoutAudit) {
    await evaluate(`(() => {
      const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
      data.dailyState.workId = ${JSON.stringify(layoutPoemId)};
      localStorage.setItem("weatherpoem.local.v1", JSON.stringify(data));
    })()`);
    await send("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "large vertical poem view");
    for (const [width, height] of [[392, 430], [392, 580], [320, 260]]) {
      largeVerticalMeasurements.push(await measureGlance(width, height));
      if (width === 392 && height === 580) {
        await captureScreenshot("long-title-vertical-large.png");
      }
    }
    lowWorkAreaActionsReachable = await evaluate(`(() => {
      const view = document.querySelector(".poem-view");
      const actions = document.querySelector(".card-actions");
      view.scrollTop = view.scrollHeight;
      const rect = actions.getBoundingClientRect();
      return rect.top >= 59 && rect.bottom <= innerHeight;
    })()`);
    await send("Emulation.clearDeviceMetricsOverride");
    const medium = layoutMeasurements[1];
    const largeVertical = largeVerticalMeasurements[1];
    const shortWorkArea = largeVerticalMeasurements[2];
    if (
      !medium?.actions || medium.actions.bottom >= medium.viewport.height ||
      !medium.requestedWindowHeight || medium.requestedWindowHeight > medium.viewport.height ||
      !moreMeasurement?.secondaryActions ||
      moreMeasurement.secondaryActions.bottom >= moreMeasurement.viewport.height ||
      !moreMeasurement.requestedWindowHeight ||
      moreMeasurement.requestedWindowHeight > moreMeasurement.viewport.height ||
      medium.documentScrollWidth > medium.viewport.width ||
      !medium.titleBox || !medium.authorBox ||
      medium.authorBox.top < medium.titleBox.bottom - 1 ||
      !largeVertical?.actions ||
      largeVertical.actions.bottom >= largeVertical.viewport.height ||
      !largeVertical.requestedWindowHeight ||
      largeVertical.requestedWindowHeight > largeVertical.viewport.height ||
      largeVertical.documentScrollWidth > largeVertical.viewport.width ||
      !largeVertical.vertical || largeVertical.fontSize !== "large" ||
      !shortWorkArea ||
      shortWorkArea.viewScrollHeight <= shortWorkArea.viewClientHeight ||
      shortWorkArea.documentScrollWidth > shortWorkArea.viewport.width ||
      !lowWorkAreaActionsReachable
    ) {
      throw new Error("Glance card layout failed the long-title viewport checks");
    }
  }
  const matrixMeasurements = [];
  if (matrixAudit) {
    const { POEMS } = await loadBundledModule(process.cwd(), "src/data/poems.ts");
    const expectedPoem = POEMS.find((poem) => poem.id === layoutPoemId);
    if (!expectedPoem) throw new Error(`Unknown matrix poem: ${layoutPoemId}`);
    const expectedText = expectedPoem.excerpt.join("");
    const failures = [];
    for (const theme of ["light", "dark"]) {
      for (const layout of ["horizontal", "vertical"]) {
        for (const fontSize of ["small", "medium", "large"]) {
          await evaluate(`(() => {
            const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
            data.settings.theme = ${JSON.stringify(theme)};
            data.settings.poemLayout = ${JSON.stringify(layout)};
            data.settings.poemFontSize = ${JSON.stringify(fontSize)};
            data.dailyState.workId = ${JSON.stringify(layoutPoemId)};
            localStorage.setItem("weatherpoem.local.v1", JSON.stringify(data));
          })()`);
          await send("Page.reload", { ignoreCache: true });
          await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"),
            `${theme}/${layout}/${fontSize} poem view`);
          if (reasonBoundaryAudit) {
            await evaluate(`document.querySelector(".reason-block").textContent = ${JSON.stringify(boundaryReason)}`);
          }
          const roomy = await measureGlance(392, 720);
          const fittedHeight = Math.max(320, Math.min(720,
            (roomy.requestedWindowHeight ?? 720) + 2));
          const fitted = await measureGlance(392, fittedHeight);
          const captureThis =
            (theme === "light" && layout === "horizontal" && fontSize === "medium") ||
            (theme === "dark" && layout === "horizontal" && fontSize === "large") ||
            (theme === "light" && layout === "vertical" && fontSize === "large") ||
            (theme === "dark" && layout === "vertical" && fontSize === "small");
          if (captureThis) {
            await captureScreenshot(`${layoutPoemId}-${theme}-${layout}-${fontSize}.png`);
          }
          const compact = await measureGlance(320, 260);
          const compactActionsReachable = await evaluate(`(() => {
            const view = document.querySelector(".poem-view");
            const actions = document.querySelector(".card-actions");
            view.scrollTop = view.scrollHeight;
            const rect = actions.getBoundingClientRect();
            return rect.top >= 59 && rect.bottom <= innerHeight;
          })()`);
          const measured = {
            theme, layout, fontSize,
            requestedWindowHeight: roomy.requestedWindowHeight,
            fittedHeight,
            actualVertical: fitted.vertical,
            actualPoemFontSize: fitted.fontSize,
            poemTextMatches: fitted.poemText === expectedText,
            reasonLength: Array.from(fitted.reasonText ?? "").length,
            fittedDocumentOverflow: fitted.documentScrollWidth > 392,
            fittedActionsVisible: Boolean(fitted.actions &&
              fitted.actions.bottom < fittedHeight),
            fittedPoemInsidePaper: Boolean(fitted.paper && fitted.poem &&
              fitted.poem.left >= fitted.paper.left - 1 &&
              fitted.poem.right <= fitted.paper.right + 1),
            actionButtonCount: fitted.actionButtons.length,
            compactDocumentOverflow: compact.documentScrollWidth > 320,
            compactActionsReachable,
          };
          matrixMeasurements.push(measured);
          if (
            fitted.theme !== theme || fitted.fontSize !== fontSize ||
            fitted.vertical !== (layout === "vertical") ||
            !measured.poemTextMatches ||
            measured.reasonLength < 6 || measured.reasonLength > 40 ||
            (reasonBoundaryAudit && measured.reasonLength !== 40) ||
            !roomy.requestedWindowHeight || roomy.requestedWindowHeight > 720 ||
            measured.fittedDocumentOverflow || !measured.fittedActionsVisible ||
            !measured.fittedPoemInsidePaper || measured.actionButtonCount !== 4 ||
            measured.compactDocumentOverflow || !compactActionsReachable
          ) failures.push(measured);
        }
      }
    }
    await send("Emulation.clearDeviceMetricsOverride");
    if (failures.length > 0) {
      throw new Error(`Glance matrix failed: ${JSON.stringify(failures)}`);
    }
  }
  const readingMeasurements = [];
  let syntheticPunctuation;
  let expandedDetailsMeasurement;
  if (readingAudit) {
    const { POEMS } = await loadBundledModule(process.cwd(), "src/data/poems.ts");
    const expectedPoem = POEMS.find((poem) => poem.id === layoutPoemId);
    if (!expectedPoem) throw new Error(`Unknown reading poem: ${layoutPoemId}`);
    const expectedText = expectedPoem.fullText.join("");
    const failures = [];
    for (const theme of ["light", "dark"]) {
      for (const layout of ["horizontal", "vertical"]) {
        for (const fontSize of ["small", "medium", "large"]) {
          await evaluate(`(() => {
            const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1"));
            data.settings.theme = ${JSON.stringify(theme)};
            data.settings.poemLayout = ${JSON.stringify(layout)};
            data.settings.poemFontSize = ${JSON.stringify(fontSize)};
            data.dailyState.workId = ${JSON.stringify(layoutPoemId)};
            localStorage.setItem("weatherpoem.local.v1", JSON.stringify(data));
          })()`);
          await send("Page.reload", { ignoreCache: true });
          await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"),
            `${theme}/${layout}/${fontSize} glance view`);
          await click(".read-button");
          await waitFor(() => evaluate("Boolean(document.querySelector('.reading-panel'))"),
            `${theme}/${layout}/${fontSize} reading view`);
          const roomy = await measureReading(560, 720);
          const captureThis =
            (theme === "light" && layout === "horizontal" && fontSize === "medium") ||
            (theme === "dark" && layout === "vertical" && fontSize === "large") ||
            (theme === "light" && layout === "vertical" && fontSize === "small") ||
            (theme === "dark" && layout === "horizontal" && fontSize === "large");
          if (captureThis) {
            await evaluate("document.querySelector('.reading-poem-frame').scrollLeft = 0");
            await captureScreenshot(`${layoutPoemId}-reading-${theme}-${layout}-${fontSize}.png`);
          }
          const compact = await measureReading(320, 260, true);
          const row = {
            theme, layout, fontSize,
            fullTextMatches: roomy.poemText === expectedText &&
              compact.poemText === expectedText,
            roomy, compact,
          };
          readingMeasurements.push(row);
          if (
            roomy.theme !== theme || roomy.fontSize !== fontSize ||
            roomy.vertical !== (layout === "vertical") ||
            roomy.title !== expectedPoem.title || !row.fullTextMatches ||
            roomy.documentScrollWidth > 560 || compact.documentScrollWidth > 320 ||
            !roomy.back || roomy.back.bottom > 720 ||
            !compact.back || compact.back.bottom > 260 ||
            !compact.edition || compact.edition.bottom > 260 ||
            roomy.typography.sectionBody < 14 ||
            roomy.typography.edition < 12 ||
            (expectedPoem.annotations.length > 0 && (
              roomy.typography.annotationTerm < 13 ||
              roomy.typography.annotationExplanation < 13
            )) ||
            compact.panelScrollHeight <= compact.panelClientHeight ||
            (layout === "vertical" &&
              roomy.frameScrollWidth > roomy.frameClientWidth &&
              roomy.frameEndScroll === roomy.frameInitialScroll)
          ) failures.push(row);
          await send("Emulation.clearDeviceMetricsOverride");
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(`Reading layout matrix failed: ${JSON.stringify(failures)}`);
    }
    await evaluate(`document.querySelectorAll('.reading-section').forEach((section) => { section.open = true; })`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 560, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    await evaluate(`(() => {
      const panel = document.querySelector('.reading-panel');
      const notes = document.querySelector('.annotation-list');
      if (notes) panel.scrollTop = notes.offsetTop - 300;
    })()`);
    await captureScreenshot(`${layoutPoemId}-reading-expanded-notes.png`);
    expandedDetailsMeasurement = await measureReading(320, 260, true);
    await captureScreenshot(`${layoutPoemId}-reading-expanded-details-bottom.png`);
    if (
      expandedDetailsMeasurement.documentScrollWidth > 320 ||
      !expandedDetailsMeasurement.edition ||
      expandedDetailsMeasurement.edition.bottom > 260 ||
      !expandedDetailsMeasurement.editionText.includes(expectedPoem.sourceName)
    ) throw new Error(`Expanded reading details lost the source: ${JSON.stringify(expandedDetailsMeasurement)}`);
    const { displayedPoemLines } = await loadBundledModule(
      process.cwd(), "src/core/poem-layout.ts",
    );
    const syntheticLines = [
      "《九月九日》：“2026年，登高？”",
      "长江东去，星河未尽。",
    ];
    const syntheticText = syntheticLines.join("");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 560, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    const syntheticModes = [];
    for (const layout of ["horizontal", "vertical"]) {
      const lines = displayedPoemLines(syntheticLines, layout);
      const observed = await evaluate(`(() => {
        const frame = document.querySelector(".reading-poem-frame");
        const poem = document.querySelector(".full-poem");
        let note = document.querySelector("#synthetic-layout-note");
        if (!note) {
          note = document.createElement("p");
          note.id = "synthetic-layout-note";
          note.textContent = "隔离排版样本，非作品原文";
          note.style.color = "var(--accent)";
          frame.before(note);
        }
        frame.classList.toggle("is-vertical", ${layout === "vertical"});
        poem.classList.toggle("is-vertical", ${layout === "vertical"});
        poem.replaceChildren(...${JSON.stringify(lines)}.map((line) => {
          const p = document.createElement("p");
          p.textContent = line;
          return p;
        }));
        return {
          label: note.textContent,
          text: [...poem.querySelectorAll("p")].map((p) => p.textContent).join(""),
          lineCount: poem.querySelectorAll("p").length,
          writingMode: getComputedStyle(poem).writingMode,
          documentOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      })()`);
      syntheticModes.push({ layout, ...observed });
      await captureScreenshot(`synthetic-punctuation-${layout}.png`);
    }
    if (syntheticModes.some((row) =>
      row.text !== syntheticText || row.documentOverflow ||
      !row.label.includes("非作品原文") ||
      row.writingMode !== (row.layout === "vertical" ? "vertical-rl" : "horizontal-tb")
    )) throw new Error(`Synthetic punctuation layout failed: ${JSON.stringify(syntheticModes)}`);
    syntheticPunctuation = {
      layoutOnly: true,
      publishedPoem: false,
      sourceLines: syntheticLines,
      modes: syntheticModes,
    };
    await send("Emulation.clearDeviceMetricsOverride");
  }
  const browserName = browserVersion.Browser ?? basename(chromePath);
  if (matrixReportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", matrixReportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify({
      schemaVersion: "1.0",
      browser: browserName,
      localDate: layoutDate,
      poemId: layoutPoemId,
      isolatedProfile: true,
      nativeWebView2: false,
      reasonSource: reasonBoundaryAudit ? "synthetic-layout-only" : "application-rule",
      matrixMeasurements,
    }, null, 2)}\n`);
  }
  if (readingReportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", readingReportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify({
      schemaVersion: "1.0",
      browser: browserName,
      localDate: layoutDate,
      poemId: layoutPoemId,
      isolatedProfile: true,
      nativeWebView2: false,
      readingMeasurements,
      expandedDetailsMeasurement,
      syntheticPunctuation,
    }, null, 2)}\n`);
  }
  if (favoritesReportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", favoritesReportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify({
      schemaVersion: "1.0",
      browser: browserName,
      localDate: layoutDate,
      poemId: layoutPoemId,
      isolatedProfile: true,
      nativeWebView2: false,
      favoriteFlow,
      favoriteCompactReading,
    }, null, 2)}\n`);
  }
  if (midnightReportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", midnightReportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify({
      schemaVersion: "1.0",
      browser: browserName,
      isolatedProfile: true,
      nativeWebView2: false,
      weather: "offline-blocked",
      clock: "page-local-controlled-Asia/Shanghai",
      midnightFlow,
    }, null, 2)}\n`);
  }
  if (corruptReportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", corruptReportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify({
      schemaVersion: "1.0",
      browser: browserName,
      isolatedProfile: true,
      nativeWebView2: false,
      originalFixture: "legacy-browser-profile-with-existing-favorite",
      corruptFlow,
    }, null, 2)}\n`);
  }
  if (legacyReportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", legacyReportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify({
      schemaVersion: "1.0",
      browser: browserName,
      isolatedProfile: true,
      nativeWebView2: false,
      weather: "offline-blocked",
      legacyMatrixFlow,
    }, null, 2)}\n`);
  }
  if (settingsReportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", settingsReportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify({
      schemaVersion: "1.0",
      browser: browserName,
      isolatedProfile: true,
      nativeWebView2: false,
      settingsMeasurements,
    }, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    result: "passed",
    browser: browserName,
    draft,
    reloaded,
    legacyFavoritePreserved: true,
    legacyFavoriteVisible: favoriteVisible,
    isolatedProfile: true,
    ...(layoutAudit ? {
      layoutMeasurements, moreMeasurement, largeVerticalMeasurements,
      lowWorkAreaActionsReachable,
    } : {}),
    ...(matrixAudit ? { matrixMeasurements, reasonBoundaryAudit } : {}),
    ...(readingAudit ? { readingMeasurements, expandedDetailsMeasurement, syntheticPunctuation } : {}),
    ...(favoritesAudit ? { favoriteFlow, favoriteCompactReading } : {}),
    ...(midnightAudit ? { midnightFlow } : {}),
    ...(corruptStorageAudit ? { corruptFlow } : {}),
    ...(legacyMatrixAudit ? { legacyMatrixFlow } : {}),
    ...(settingsAudit ? { settingsMeasurements } : {}),
    ...(captureLayout ? { capturedScreenshots } : {}),
  }));
} finally {
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error("Browser check is closing"));
  }
  pending.clear();
  socket?.close();
  await closeOwnedBrowser();
  if (previewServer) {
    await new Promise((resolve) => previewServer.httpServer.close(resolve));
  }
  const tempRoot = realpathSync(tmpdir()).toLowerCase();
  const profile = realpathSync(profileDirectory);
  if (
    !profile.toLowerCase().startsWith(`${tempRoot}${sep}`) ||
    !basename(profile).startsWith("weatherpoem-browser-storage-")
  ) throw new Error("Refusing to remove an unexpected browser profile");
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
