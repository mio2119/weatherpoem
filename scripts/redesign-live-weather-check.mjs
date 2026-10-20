import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportName = process.argv[2];
assert.match(reportName ?? "", /^T09_NATIVE_LIVE_WEATHER_[A-Z0-9_]+\.json$/);
const reportPath = path.join(root, "review", "redesign", "evidence", reportName);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
assert.equal(report.schemaVersion, "1.0");
assert.equal(report.testKind, "isolated-native-live-weather-diagnostic");
assert.equal(report.result, "live-weather-observed-after-start");
assert.equal(report.liveUiConsistent, true);
assert.deepEqual(report.isolation, {
  temporaryProfile: true,
  realUserDataTouched: false,
  systemClockChanged: false,
  systemSettingsChanged: false,
  installedOrUninstalled: false,
  liveReadOnlyWeatherRequest: true,
});

assert.match(report.candidate.path, /^\.work\/redesign-[a-z0-9-]+\/release\/weatherpoem\.exe$/);
const exePath = path.join(root, ...report.candidate.path.split("/"));
const exeHash = createHash("sha256").update(readFileSync(exePath)).digest("hex").toUpperCase();
assert.equal(report.candidate.sha256, exeHash, "Diagnostic belongs to a different EXE");
assert.equal(report.testHarness.path, "scripts/diagnose-redesign-native-weather.mjs");
const harnessHash = createHash("sha256")
  .update(readFileSync(path.join(root, report.testHarness.path))).digest("hex").toUpperCase();
assert.equal(report.testHarness.sha256, harnessHash, "Diagnostic harness bytes changed");

assert.equal(report.readyMarker.readyView, "poem");
assert.equal(report.readyMarker.readyMode, "offline-rules");
assert.equal(report.readyMarker.performanceScenario, null);
assert.equal(report.initialPage.cached, null);
assert.ok(report.initialPage.title);
assert.ok(report.initialPage.context.includes("天气未更新"));
assert.equal(report.naturalWaitMs, 8000);
assert.equal(report.afterNaturalWait.cached.source, "open-meteo");
assert.ok(report.afterNaturalWait.context.includes(report.afterNaturalWait.cached.label));
assert.ok(report.afterNaturalWait.title);
assert.notEqual(report.initialPage.title, report.afterNaturalWait.title);
assert.equal(report.afterNaturalWait.loading, false);
assert.equal(report.afterNaturalWait.warning, false);
assert.ok(report.afterNaturalWait.weatherResources.length >= 2);
assert.equal(report.directRequestAfterObservation.ok, true);
assert.equal(report.directRequestAfterObservation.status, 200);

assert.equal(report.nativeDailyState.state, "shown");
assert.equal(report.nativeDisplayEvents.length, 2);
assert.equal(report.nativeDisplayEvents[0].local_date, report.nativeDailyState.local_date);
assert.equal(report.nativeDisplayEvents[1].local_date, report.nativeDailyState.local_date);
assert.notEqual(report.nativeDisplayEvents[0].work_id, report.nativeDisplayEvents[1].work_id);
assert.equal(report.nativeDisplayEvents[1].work_id, report.nativeDailyState.work_id);

assert.match(report.screenshot, /^review\/redesign\/evidence\/T09_NATIVE_LIVE_WEATHER_[A-Z0-9_]+_after\.png$/);
const screenshot = readFileSync(path.join(root, ...report.screenshot.split("/")));
assert.deepEqual(screenshot.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

console.log(`当前候选的自然在线续取证据有效；首屏仍是离线，不能记为在线首屏性能通过：${reportPath}`);
