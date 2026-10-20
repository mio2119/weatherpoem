import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportName = process.argv[2];
assert.match(reportName ?? "", /^T09_NATIVE_LIVE_WEATHER_TOUCHED_[A-Z0-9_]+\.json$/);
const reportPath = path.join(root, "review", "redesign", "evidence", reportName);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
assert.equal(report.schemaVersion, "1.0");
assert.equal(report.testKind, "isolated-native-live-weather-touched-card");
assert.equal(report.result, "passed-poem-preserved-live-context-updated");
assert.deepEqual(report.isolation, {
  temporaryProfile: true,
  realUserDataTouched: false,
  systemClockChanged: false,
  systemSettingsChanged: false,
  installedOrUninstalled: false,
  weatherRequest: "natural-app-request-to-open-meteo",
});

assert.match(report.candidate.path, /^\.work\/redesign-[a-z0-9-]+\/release\/weatherpoem\.exe$/);
const exePath = path.join(root, ...report.candidate.path.split("/"));
const exeHash = createHash("sha256").update(readFileSync(exePath)).digest("hex").toUpperCase();
assert.equal(report.candidate.sha256, exeHash, "Diagnostic belongs to a different EXE");
assert.equal(report.testHarness.path, "scripts/diagnose-redesign-native-weather-touch.mjs");
const harnessHash = createHash("sha256")
  .update(readFileSync(path.join(root, report.testHarness.path))).digest("hex").toUpperCase();
assert.equal(report.testHarness.sha256, harnessHash, "Diagnostic harness bytes changed");

assert.equal(report.readyMarker.readyView, "poem");
assert.equal(report.readyMarker.readyMode, "offline-rules");
assert.equal(report.readyMarker.performanceScenario, null);
assert.equal(report.initialPage.cached, null);
assert.ok(report.initialPage.title);
assert.ok(report.initialPage.context.includes("天气未更新"));
assert.equal(report.afterTouch.title, report.initialPage.title);
assert.equal(report.afterTouch.inputEvents, 1);
assert.equal(report.naturalWaitMs, 8000);
assert.equal(report.afterNaturalWait.cached.source, "open-meteo");
assert.ok(report.afterNaturalWait.context.includes(report.afterNaturalWait.cached.label));
assert.equal(report.afterNaturalWait.title, report.initialPage.title);
assert.equal(report.afterNaturalWait.loading, false);
assert.equal(report.afterNaturalWait.warning, false);
assert.ok(report.afterNaturalWait.weatherResourceDurationsMs.length >= 2);

assert.equal(report.nativeDailyState.state, "shown");
assert.equal(report.nativeDisplayEvents.length, 1);
assert.equal(report.nativeDisplayEvents[0].local_date, report.nativeDailyState.local_date);
assert.equal(report.nativeDisplayEvents[0].work_id, report.nativeDailyState.work_id);
assert.match(report.screenshot,
  /^review\/redesign\/evidence\/T09_NATIVE_LIVE_WEATHER_TOUCHED_[A-Z0-9_]+_after\.png$/);
const screenshot = readFileSync(path.join(root, ...report.screenshot.split("/")));
assert.deepEqual(screenshot.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

console.log(`当前候选的真实天气晚到后保留已读诗笺证据有效；不等于在线首屏通过：${reportPath}`);
