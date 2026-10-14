import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build, preview } from "vite";
import { loadBundledModule } from "./load-reason-sources.mjs";

// --layout-audit inspects browser-preview geometry, not native WebView2.
// --matrix-audit additionally checks theme, layout, and font-size combinations.
// --capture leaves screenshots in a separately named temporary directory.
const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chromePath = chromeCandidates.find(existsSync);
if (!chromePath) throw new Error("Chrome or Edge is required for the isolated browser storage check");
const matrixAudit = process.argv.includes("--matrix-audit");
const reasonBoundaryAudit = process.argv.includes("--reason-boundary");
const layoutAudit = process.argv.includes("--layout-audit") || matrixAudit;
const captureLayout = layoutAudit && process.argv.includes("--capture");
const boundaryReason = "这是隔离排版样本，仅用于核对四十字理由完整显示，不能视为真实诗词推荐或天气说明。";
if (reasonBoundaryAudit && (!matrixAudit || Array.from(boundaryReason).length !== 40)) {
  throw new Error("--reason-boundary requires --matrix-audit and a 40-character sample");
}
const matrixReportName = process.argv.find((arg) => arg.startsWith("--report="))
  ?.slice("--report=".length);
if (matrixReportName && (!matrixAudit || !/^T05_[A-Za-z0-9_-]+\.json$/.test(matrixReportName))) {
  throw new Error("--report requires --matrix-audit and a T05_*.json filename");
}
const layoutPoemId = process.argv.find((arg) => arg.startsWith("--poem-id="))
  ?.slice("--poem-id=".length) ?? "cui-hao-huang-he-lou";
const layoutDate = process.argv.find((arg) => arg.startsWith("--date="))
  ?.slice("--date=".length);
if (layoutDate && !/^\d{4}-\d{2}-\d{2}$/.test(layoutDate)) {
  throw new Error("--date must be formatted YYYY-MM-DD");
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
  if (layoutAudit && layoutDate) {
    const fixedTime = Date.parse(`${layoutDate}T09:00:00+08:00`);
    if (!Number.isFinite(fixedTime)) throw new Error("Invalid layout audit date");
    await send("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" });
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const RealDate = Date;
        const fixedTime = ${fixedTime};
        function FixedDate(...args) {
          if (new.target) return new RealDate(...(args.length ? args : [fixedTime]));
          return new RealDate(fixedTime).toString();
        }
        FixedDate.prototype = RealDate.prototype;
        Object.setPrototypeOf(FixedDate, RealDate);
        FixedDate.now = () => fixedTime;
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
  if (layoutAudit) {
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
  await send("Page.reload", { ignoreCache: true });
  try {
    await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "legacy profile poem view");
  } catch (error) {
    const visibleText = await evaluate("document.body.innerText.slice(0, 500)").catch(() => "unavailable");
    throw new Error(`${error.message}; visible page: ${visibleText}`);
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
