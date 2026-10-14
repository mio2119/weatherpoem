import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build, preview } from "vite";

const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chromePath = chromeCandidates.find(existsSync);
if (!chromePath) throw new Error("Chrome or Edge is required for the isolated browser storage check");

const profileDirectory = mkdtempSync(join(tmpdir(), "weatherpoem-browser-storage-"));
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
  await send("Page.navigate", { url });
  await waitFor(() => evaluate("location.origin === " + JSON.stringify(new URL(url).origin)), "preview origin");
  await evaluate(`localStorage.setItem("weatherpoem.local.v1", ${JSON.stringify(JSON.stringify({
    settings: { configured: true, cityId: "beijing" },
    history: [],
    favorites: ["wang-an-shi-yuan-ri"],
    feedback: [],
  }))})`);
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*://api.open-meteo.com/*"] });
  await send("Page.reload", { ignoreCache: true });
  await waitFor(() => evaluate("Boolean(document.querySelector('.poem-view'))"), "legacy profile poem view");

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
  console.log(JSON.stringify({
    result: "passed",
    browser: browserVersion.Browser ?? basename(chromePath),
    draft,
    reloaded,
    legacyFavoritePreserved: true,
    legacyFavoriteVisible: favoriteVisible,
    isolatedProfile: true,
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
