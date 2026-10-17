import { spawn } from "node:child_process";
import {
  existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build, preview } from "vite";

// Isolated browser-preview evidence only: no native WebView2, real autostart,
// local user profile, or live weather is involved.
const browserPath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if (!browserPath) throw new Error("Chrome or Edge is required for the onboarding audit");
const reportName = process.argv.find((arg) => arg.startsWith("--report="))
  ?.slice("--report=".length);
if (reportName && !/^T03_[A-Za-z0-9_-]+\.json$/.test(reportName)) {
  throw new Error("--report must be a T03_*.json filename");
}
const capture = process.argv.includes("--capture");
const fixedTime = Date.parse("2026-10-14T09:00:00+08:00");
const profileDirectory = mkdtempSync(join(tmpdir(), "weatherpoem-onboarding-browser-"));
const captureDirectory = capture
  ? mkdtempSync(join(tmpdir(), "weatherpoem-onboarding-capture-"))
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
      // Reloads briefly destroy the current execution context.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function send(method, params = {}) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeoutMs = method === "Page.navigate" || method === "Page.reload"
      ? 30_000 : 10_000;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
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

async function searchCity(value) {
  await evaluate(`(() => {
    const field = document.querySelector("#city-search");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.focus();
  })()`);
  await waitFor(() => evaluate(
    `document.querySelector("#city-search")?.value === ${JSON.stringify(value)}`,
  ), `city search ${value}`);
}

async function key(key, code, virtualKeyCode) {
  for (const type of ["keyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", {
      type, key, code, windowsVirtualKeyCode: virtualKeyCode,
    });
  }
}

async function snapshot(scrollToEnd = false) {
  return evaluate(`(() => {
    const main = document.querySelector(".onboarding-view");
    if (${scrollToEnd}) main?.scrollTo(0, main.scrollHeight);
    const button = document.querySelector('.onboarding-form button[type="submit"]');
    const rect = button?.getBoundingClientRect();
    return {
      view: Boolean(main),
      search: document.querySelector("#city-search")?.value,
      options: [...document.querySelectorAll(".city-option input")]
        .map((input) => ({ value: input.value, checked: input.checked })),
      emptyState: document.querySelector(".city-empty")?.textContent?.trim() ?? null,
      selection: document.querySelector(".city-selection")?.textContent?.trim(),
      consent: document.querySelector(".consent-row input")?.checked,
      saveError: document.querySelector(".onboarding-save-error")?.textContent?.trim() ?? null,
      submitDisabled: button?.disabled,
      focused: document.activeElement?.getAttribute("value") ??
        document.activeElement?.id ?? null,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      mainScrollHeight: main?.scrollHeight,
      mainClientHeight: main?.clientHeight,
      submitBox: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom) } : null,
      viewport: { width: innerWidth, height: innerHeight },
    };
  })()`);
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

async function closeBrowser() {
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
  browser = spawn(browserPath, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`, "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  const portFile = join(profileDirectory, "DevToolsActivePort");
  const debuggingPort = await waitFor(() => {
    if (browser.exitCode !== null) throw new Error("Headless browser exited early");
    return existsSync(portFile)
      ? Number(readFileSync(portFile, "utf8").split(/\r?\n/u)[0])
      : undefined;
  }, "headless browser debugging port");
  const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json`)
    .then((response) => response.json());
  const browserVersion = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)
    .then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No browser page target");
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
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*://api.open-meteo.com/*"] });
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
  await waitFor(() => evaluate("Boolean(document.querySelector('.onboarding-view'))"),
    "first-use view");
  await viewport(560, 720);
  const initial = await snapshot();
  await searchCity("深圳");
  const unsupported = await snapshot();
  await screenshot("unsupported-city-isolated.png");
  await searchCity("杭州");
  await key("Tab", "Tab", 9);
  const keyboardFocus = await snapshot();
  await key(" ", "Space", 32);
  const selectedWithoutConsent = await snapshot();
  await searchCity("深圳");
  const clearedSelection = await snapshot();
  await searchCity("杭州");
  await key("Tab", "Tab", 9);
  await key(" ", "Space", 32);
  await evaluate("document.querySelector('.consent-row input').click()");
  const ready = await snapshot();
  await screenshot("selected-city-isolated.png");
  await viewport(320, 260);
  const compact = await snapshot(true);
  await screenshot("selected-city-compact-isolated.png");
  await send("Emulation.clearDeviceMetricsOverride");
  const beforeSubmit = await evaluate(
    "JSON.parse(localStorage.getItem('weatherpoem.local.v1') ?? 'null')",
  );
  if (
    !initial.view || !initial.submitDisabled || initial.documentOverflow ||
    initial.options.length !== 12 ||
    !unsupported.emptyState?.includes("暂未找到支持的城市") ||
    unsupported.options.length !== 0 || !unsupported.submitDisabled ||
    keyboardFocus.focused !== "hangzhou" ||
    !selectedWithoutConsent.selection?.includes("浙江 · 杭州") ||
    selectedWithoutConsent.submitDisabled !== true ||
    !clearedSelection.submitDisabled ||
    clearedSelection.selection?.includes("杭州") ||
    ready.submitDisabled !== false || ready.consent !== true ||
    ready.options[0]?.checked !== true ||
    compact.documentOverflow || !compact.submitBox ||
    compact.submitBox.top < 0 || compact.submitBox.bottom > 260 ||
    beforeSubmit?.settings?.configured === true
  ) {
    throw new Error(`Onboarding browser audit failed: ${JSON.stringify({
      initial, unsupported, keyboardFocus, selectedWithoutConsent,
      clearedSelection, ready, compact, beforeSubmit,
    })}`);
  }
  await evaluate("document.querySelector('.onboarding-form').requestSubmit()");
  await waitFor(() => evaluate(`(() => {
    const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1") ?? "null");
    return Boolean(document.querySelector(".poem-view")) &&
      data?.settings?.configured === true && data.settings.cityId === "hangzhou";
  })()`), "saved Hangzhou poem view");
  const saved = await evaluate(`(() => ({
    cityLabel: document.querySelector(".window-chrome")?.textContent,
    weatherLabel: document.querySelector(".context-strip")?.textContent,
    settings: JSON.parse(localStorage.getItem("weatherpoem.local.v1")).settings,
  }))()`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"),
    "reloaded configured poem view");
  const reloaded = await evaluate(`(() => ({
    onboardingVisible: Boolean(document.querySelector(".onboarding-view")),
    cityLabel: document.querySelector(".window-chrome")?.textContent,
    cityId: JSON.parse(localStorage.getItem("weatherpoem.local.v1")).settings.cityId,
  }))()`);
  if (
    !saved.cityLabel?.includes("杭州") ||
    !saved.weatherLabel?.includes("天气未更新") ||
    reloaded.onboardingVisible || !reloaded.cityLabel?.includes("杭州") ||
    reloaded.cityId !== "hangzhou"
  ) throw new Error(`Onboarding save/reload failed: ${JSON.stringify({ saved, reloaded })}`);
  await evaluate("localStorage.removeItem('weatherpoem.local.v1')");
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("Boolean(document.querySelector('.onboarding-view'))"),
    "new first-use view for failed-save retry");
  await viewport(560, 720);
  await searchCity("杭州");
  await key("Tab", "Tab", 9);
  await key(" ", "Space", 32);
  await evaluate("document.querySelector('.consent-row input').click()");
  await evaluate(`(() => {
    window.__auditOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "weatherpoem.local.v1") {
        throw new DOMException("Isolated quota failure", "QuotaExceededError");
      }
      return window.__auditOriginalSetItem.call(this, key, value);
    };
  })()`);
  await evaluate("document.querySelector('.onboarding-form').requestSubmit()");
  await waitFor(() => evaluate("Boolean(document.querySelector('.onboarding-save-error'))"),
    "inline first-use save error");
  const failedSave = await snapshot();
  const globalErrorVisible = await evaluate("Boolean(document.querySelector('.error-view'))");
  await screenshot("failed-save-keeps-draft-isolated.png");
  if (
    !failedSave.view || !failedSave.saveError?.includes("首次设置未能保存") ||
    !failedSave.selection?.includes("浙江 · 杭州") ||
    failedSave.options[0]?.checked !== true || failedSave.consent !== true ||
    failedSave.submitDisabled !== false || globalErrorVisible
  ) throw new Error(`Failed first-use save lost its draft: ${JSON.stringify({
    failedSave, globalErrorVisible,
  })}`);
  await evaluate(`(() => {
    Storage.prototype.setItem = window.__auditOriginalSetItem;
    delete window.__auditOriginalSetItem;
  })()`);
  await evaluate("document.querySelector('.onboarding-form').requestSubmit()");
  await waitFor(() => evaluate(`(() => {
    const data = JSON.parse(localStorage.getItem("weatherpoem.local.v1") ?? "null");
    return Boolean(document.querySelector(".poem-view")) &&
      data?.settings?.configured === true && data.settings.cityId === "hangzhou";
  })()`), "retried Hangzhou poem view");
  const retriedSave = await evaluate(`(() => ({
    cityLabel: document.querySelector(".window-chrome")?.textContent,
    cityId: JSON.parse(localStorage.getItem("weatherpoem.local.v1")).settings.cityId,
  }))()`);
  if (!retriedSave.cityLabel?.includes("杭州") || retriedSave.cityId !== "hangzhou") {
    throw new Error(`First-use retry failed: ${JSON.stringify(retriedSave)}`);
  }
  const result = {
    schemaVersion: "1.0", result: "passed",
    browser: browserVersion.Browser ?? basename(browserPath),
    isolatedProfile: true, nativeWebView2: false,
    weatherNetworkBlocked: true, systemAutostartUntouched: true,
    fixedLocalTime: "2026-10-14 09:00 Asia/Shanghai",
    stages: { initial, unsupported, keyboardFocus, selectedWithoutConsent,
      clearedSelection, ready, compact, saved, reloaded, failedSave, retriedSave },
  };
  if (reportName) {
    const reportPath = join(process.cwd(), "review", "redesign", "evidence", reportName);
    if (existsSync(reportPath)) throw new Error(`Refusing to overwrite: ${reportPath}`);
    writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ...result, capturedScreenshots }));
} finally {
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error("Browser audit is closing"));
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
    !basename(profile).startsWith("weatherpoem-onboarding-browser-")
  ) throw new Error("Refusing to remove an unexpected browser profile");
  rmSync(profile, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 });
}
