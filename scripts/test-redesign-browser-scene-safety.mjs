import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build, preview } from "vite";
import { loadBundledModule } from "./load-reason-sources.mjs";

// Isolated Chrome layout evidence only. This never represents live weather,
// a real withdrawal, native WebView2, or a Windows display-scale result.
const browserPath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if (!browserPath) throw new Error("Chrome or Edge is required for the browser scene audit");
const reportName = process.argv.find((arg) => arg.startsWith("--report="))
  ?.slice("--report=".length);
if (reportName && !/^T05_[A-Za-z0-9_-]+\.json$/.test(reportName)) {
  throw new Error("--report must be a T05_*.json filename");
}
const capture = process.argv.includes("--capture");
const fixedTime = Date.parse("2026-06-19T09:00:00+08:00");
const localDate = "2026-06-19";
const workId = "wen-xiu-duan-wu";
const profileDirectory = mkdtempSync(join(tmpdir(), "weatherpoem-scene-browser-"));
const captureDirectory = capture
  ? mkdtempSync(join(tmpdir(), "weatherpoem-scene-capture-"))
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
      if (await check()) return;
    } catch {
      // A reload can briefly destroy the current evaluation context.
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

async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await delay(150);
}

async function screenshot(name) {
  if (!captureDirectory) return;
  const result = await send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: false,
  });
  const path = join(captureDirectory, name);
  writeFileSync(path, Buffer.from(result.data, "base64"));
  capturedScreenshots.push(path);
}

async function tabTo(selector, maxTabs = 8) {
  await send("Page.bringToFront");
  for (let index = 0; index < maxTabs; index += 1) {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
    });
    if (await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`)) {
      return index + 1;
    }
  }
  return null;
}

async function measure(expectedView, width, height, scrollToEnd = false) {
  await viewport(width, height);
  return evaluate(`(() => {
    const main = document.querySelector(${JSON.stringify(`.${expectedView}`)});
    if (${scrollToEnd}) main.scrollTop = main.scrollHeight;
    const box = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? {
        top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        left: Math.round(rect.left), right: Math.round(rect.right),
      } : null;
    };
    const fontSize = (selector) => {
      const element = document.querySelector(selector);
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
    };
    return {
      theme: document.documentElement.dataset.theme,
      view: main?.className,
      mainFocused: document.activeElement === main,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth ||
        (main?.scrollWidth ?? 0) > (main?.clientWidth ?? 0),
      scrollHeight: main?.scrollHeight,
      clientHeight: main?.clientHeight,
      scrollTop: main?.scrollTop,
      scene: document.querySelector(".poem-paper")?.dataset.scene,
      sceneDescription: document.querySelector(".scene-mark")?.getAttribute("aria-label"),
      context: document.querySelector(".context-strip")?.textContent,
      reason: document.querySelector(".reason-block")?.textContent,
      poemVisible: Boolean(document.querySelector(".poem-paper")),
      warningTitle: document.querySelector(".warning-item h2")?.textContent,
      warningDescription: document.querySelector(".warning-item p")?.textContent,
      warningSource: document.querySelector(".warning-item small")?.textContent,
      warningDisclaimer: document.querySelector(".warning-disclaimer")?.textContent,
      disclaimerBox: box(document.querySelector(".warning-disclaimer")),
      warningIntroFontSize: fontSize(".warning-view > h1 + p"),
      warningDescriptionFontSize: fontSize(".warning-item p"),
      warningSourceFontSize: fontSize(".warning-item small"),
      warningDisclaimerFontSize: fontSize(".warning-disclaimer"),
      correctionTitle: document.querySelector("#content-correction-title")?.textContent,
      correctionBodyFontSize: fontSize(".content-correction-view > p:not(.eyebrow)"),
      correctionSmallFontSize: fontSize(".content-correction-view small"),
      replaceButton: box(document.querySelector(".content-correction-view button")),
      replaceButtonText: document.querySelector(".content-correction-view button")?.textContent,
      bodyText: main?.textContent,
      viewport: { width: innerWidth, height: innerHeight },
    };
  })()`);
}

async function closeBrowser() {
  if (!browser || browser.exitCode !== null) return;
  browser.kill();
  await Promise.race([
    new Promise((resolve) => browser.once("exit", resolve)),
    delay(5_000),
  ]);
}

try {
  const { CONTENT_VERSION } = await loadBundledModule(
    process.cwd(), "src/core/recommendation.ts",
  );
  await build({ logLevel: "error" });
  previewServer = await preview({
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  const address = previewServer.httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Preview server did not expose a TCP port");
  }
  const url = `http://127.0.0.1:${address.port}/`;
  browser = spawn(browserPath, [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  const portFile = join(profileDirectory, "DevToolsActivePort");
  let debuggingPort;
  await waitFor(() => {
    if (browser.exitCode !== null) throw new Error("Headless browser exited early");
    if (!existsSync(portFile)) return false;
    debuggingPort = Number(readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
    return Number.isInteger(debuggingPort);
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
  await send("Page.navigate", { url });
  await waitFor(() => evaluate(
    `location.origin === ${JSON.stringify(new URL(url).origin)}`,
  ), "preview origin");
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*://api.open-meteo.com/*"] });

  const longWarningDescription =
    "隔离演练：这里是为了检查长安全说明在较小窗口中的完整呈现，不是真实天气预警。".repeat(12);
  const scenarios = [
    { name: "festival", expectedView: "poem-view" },
    { name: "official-warning", expectedView: "warning-view" },
    { name: "proxy-warning", expectedView: "warning-view" },
    { name: "withdrawn", expectedView: "content-correction-view" },
    { name: "suspended", expectedView: "content-correction-view" },
  ];
  const measurements = [];
  const failures = [];
  for (const theme of ["light", "dark"]) {
    for (const scenario of scenarios) {
      const profile = {
        settings: { configured: true, cityId: "beijing", theme },
        history: [], favorites: [], feedback: [],
        dailyState: {
          localDate, state: "shown", workId,
          contentVersion: CONTENT_VERSION, ruleVersion: "1.2.2",
        },
      };
      const official = scenario.name === "official-warning";
      const isWarning = official || scenario.name === "proxy-warning";
      const warning = isWarning ? {
        id: `isolated-${scenario.name}`,
        title: official ? "隔离演练：暴雨预警布局" : "隔离演练：强降水提示布局",
        level: "warning",
        description: longWarningDescription,
        source: "WeatherPoem 隔离演练，非真实气象信息",
        origin: official ? "official" : "weather-proxy",
        area: official ? "虚构测试区" : undefined,
        publishedAt: official ? new Date(fixedTime).toISOString() : undefined,
        expiresAt: official ? new Date(fixedTime + 6 * 3_600_000).toISOString() : undefined,
      } : undefined;
      const weatherCache = warning ? {
        cityId: "beijing", cachedAt: fixedTime,
        weather: {
          kind: "heavy-rain", label: "隔离演练天气", freshness: "fresh",
          source: "synthetic", warnings: [warning], shouldSuppressPoem: true,
        },
      } : undefined;
      const withdrawal = scenario.name === "withdrawn" || scenario.name === "suspended"
        ? {
            schemaVersion: "1.0", contentVersion: CONTENT_VERSION,
            revision: 1, issuedAt: new Date(fixedTime - 1000).toISOString(),
            suspendRecommendations: scenario.name === "suspended",
            withdrawnWorkIds: scenario.name === "withdrawn" ? [workId] : [],
          }
        : undefined;
      await evaluate(`(() => {
        localStorage.setItem("weatherpoem.local.v1", ${JSON.stringify(JSON.stringify(profile))});
        ${weatherCache
          ? `localStorage.setItem("weatherpoem.weather-cache.v1", ${JSON.stringify(JSON.stringify(weatherCache))});`
          : 'localStorage.removeItem("weatherpoem.weather-cache.v1");'}
        ${withdrawal
          ? `localStorage.setItem("weatherpoem.content-withdrawals.v1", ${JSON.stringify(JSON.stringify(withdrawal))});`
          : 'localStorage.removeItem("weatherpoem.content-withdrawals.v1");'}
      })()`);
      await send("Page.reload", { ignoreCache: true });
      await waitFor(() => evaluate(
        `Boolean(document.querySelector(${JSON.stringify(`.${scenario.expectedView}`)}))`,
      ), `${theme}/${scenario.name} view`);
      await waitFor(() => evaluate(
        `document.activeElement === document.querySelector(${JSON.stringify(`.${scenario.expectedView}`)})`,
      ), `${theme}/${scenario.name} initial focus`);
      const roomy = await measure(scenario.expectedView, 392, 720);
      await screenshot(`${scenario.name}-${theme}-top.png`);
      const compact = await measure(scenario.expectedView, 320, 260, true);
      if (scenario.name === "official-warning") {
        await screenshot(`${scenario.name}-${theme}-compact-bottom.png`);
      }
      const tabsToReplace = scenario.name === "withdrawn"
        ? await tabTo(".content-correction-view button")
        : null;
      const row = {
        theme, scenario: scenario.name, expectedView: scenario.expectedView,
        roomy, compact, tabsToReplace,
      };
      measurements.push(row);
      const safety = scenario.expectedView !== "poem-view";
      if (
        roomy.theme !== theme || roomy.horizontalOverflow || compact.horizontalOverflow ||
        !roomy.mainFocused ||
        safety && (roomy.poemVisible || compact.poemVisible) ||
        scenario.name === "festival" && (
          roomy.scene !== "festival" ||
          !roomy.sceneDescription?.includes("端午节") ||
          !roomy.reason?.includes("端午") ||
          !roomy.context?.includes("端午节")
        ) ||
        isWarning && (
          roomy.warningDescription !== longWarningDescription ||
          !roomy.warningTitle?.includes("隔离演练") ||
          !roomy.warningSource?.includes("非真实气象信息") ||
          roomy.warningIntroFontSize < 13 ||
          roomy.warningDescriptionFontSize < 13 ||
          roomy.warningSourceFontSize < 11 ||
          roomy.warningDisclaimerFontSize < 11 ||
          !compact.disclaimerBox ||
          compact.disclaimerBox.bottom > compact.viewport.height
        ) ||
        scenario.name === "withdrawn" && (
          roomy.correctionBodyFontSize < 13 ||
          !roomy.replaceButton ||
          !roomy.replaceButtonText?.includes("换一首") ||
          !compact.replaceButton ||
          compact.replaceButton.bottom > compact.viewport.height ||
          !tabsToReplace
        ) ||
        scenario.name === "suspended" && (
          roomy.replaceButton || roomy.correctionSmallFontSize < 11
        )
      ) failures.push(row);
      await send("Emulation.clearDeviceMetricsOverride");
    }
  }
  if (failures.length > 0) {
    throw new Error(`Scene/safety browser audit failed: ${JSON.stringify(failures)}`);
  }
  if (reportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", reportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify({
      schemaVersion: "1.0",
      browser: browserVersion.Browser ?? basename(browserPath),
      nativeWebView2: false,
      isolatedProfile: true,
      syntheticWeatherAndWithdrawal: true,
      localDate, workId,
      measurements,
    }, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    result: "passed", cases: measurements.length,
    browser: browserVersion.Browser ?? basename(browserPath),
    capturedScreenshots,
  }));
} finally {
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error("Browser check is closing"));
  }
  pending.clear();
  socket?.close();
  await closeBrowser();
  if (previewServer) {
    await new Promise((resolve) => previewServer.httpServer.close(resolve));
  }
  const tempRoot = realpathSync(tmpdir()).toLowerCase();
  const profile = realpathSync(profileDirectory);
  if (
    !profile.toLowerCase().startsWith(`${tempRoot}${sep}`) ||
    !basename(profile).startsWith("weatherpoem-scene-browser-")
  ) throw new Error("Refusing to remove an unexpected browser profile");
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
