import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const capability = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      "src-tauri",
      "capabilities",
      "default.json",
    ),
    "utf8",
  ),
);
const tauriConfig = JSON.parse(
  await readFile(
    path.join(projectRoot, "src-tauri", "tauri.conf.json"),
    "utf8",
  ),
);
const persistence = await readFile(
  path.join(projectRoot, "src", "services", "persistence.ts"),
  "utf8",
);
const desktopShell = await readFile(
  path.join(projectRoot, "src-tauri", "src", "lib.rs"),
  "utf8",
);
const weatherService = await readFile(
  path.join(projectRoot, "src", "services", "weather.ts"),
  "utf8",
);
const appShell = await readFile(
  path.join(projectRoot, "src", "App.vue"),
  "utf8",
);

test("SQLite 只开放应用持久化必需的加载、读取和写入能力", () => {
  assert.deepEqual(capability.windows, ["main"]);
  assert.ok(capability.permissions.includes("sql:default"));
  assert.ok(capability.permissions.includes("sql:allow-execute"));
  assert.equal(
    capability.permissions.filter(
      (item) =>
        typeof item === "string" && item.startsWith("sql:"),
    ).length,
    2,
  );
  assert.match(persistence, /invoke<string>\("database_url"\)/);
  assert.match(persistence, /CREATE TABLE IF NOT EXISTS app_kv/);
});

test("性能数据隔离不借机开放文件系统、Shell、进程或任意 HTTP 权限", () => {
  for (const forbiddenPrefix of [
    "fs:",
    "shell:",
    "process:",
    "http:",
    "global-shortcut:",
  ]) {
    assert.equal(
      capability.permissions.some(
        (item) =>
          typeof item === "string" &&
          item.startsWith(forbiddenPrefix),
      ),
      false,
      forbiddenPrefix,
    );
  }
  assert.match(
    desktopShell,
    /WEATHERPOEM_PERFORMANCE_PROFILE/,
  );
  assert.match(
    desktopShell,
    /WeatherPoem\.Performance\./,
  );
  assert.match(desktopShell, /\.data_directory\(/);
});

test("隐藏启动的主窗口不会在 WebView 初始化时抢占焦点", () => {
  const mainWindow = tauriConfig.app.windows.find(
    (window) => window.label === "main",
  );
  assert.ok(mainWindow);
  assert.equal(mainWindow.visible, false);
  assert.equal(mainWindow.focus, false);
});

test("诗笺与阅读窗的原生尺寸切换只使用列明的窗口能力", () => {
  for (const permission of [
    "core:window:allow-current-monitor",
    "core:window:allow-primary-monitor",
    "core:window:allow-inner-size",
    "core:window:allow-outer-position",
    "core:window:allow-scale-factor",
    "core:window:allow-set-min-size",
    "core:window:allow-set-position",
    "core:window:allow-set-resizable",
    "core:window:allow-set-size",
  ]) {
    assert.ok(capability.permissions.includes(permission), permission);
  }
  assert.equal(
    capability.permissions.includes("core:window:default"),
    false,
  );
});

test("外部链接和第三方许可使用固定目标，不开放任意路径", () => {
  const opener = capability.permissions.find(
    (item) =>
      typeof item === "object" &&
      item.identifier === "opener:allow-open-url",
  );
  assert.deepEqual(opener?.allow, [
    { url: "https://open-meteo.com/en/license" },
  ]);
  assert.equal(capability.permissions.includes("opener:default"), false);
  assert.match(
    desktopShell,
    /fn open_third_party_notices\(app: tauri::AppHandle\)/,
  );
  assert.match(
    desktopShell,
    /\.join\("licenses"\)\s*\.join\("THIRD_PARTY_NOTICES\.md"\)/,
  );
  assert.match(desktopShell, /notice_path\.is_file\(\)/);
});

test("可控天气故障只能从合法临时性能账户传入", () => {
  assert.match(
    desktopShell,
    /WEATHERPOEM_PERFORMANCE_SCENARIO/,
  );
  assert.match(
    desktopShell,
    /性能故障场景只能在隔离性能目录中使用/,
  );
  for (const scenario of [
    "weather-offline",
    "weather-timeout",
    "official-warning",
    "scene-rain",
  ]) {
    assert.match(desktopShell, new RegExp(`"${scenario}"`));
    assert.match(weatherService, new RegExp(`"${scenario}"`));
  }
  assert.match(
    desktopShell,
    /fn performance_scenario\(\) -> Option<String>/,
  );
  assert.match(
    appShell,
    /getPerformanceWeatherScenario\(\)/,
  );
  assert.match(
    appShell,
    /performanceScenario: performanceWeatherScenario/,
  );
});
