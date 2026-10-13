import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validateReducedMotionReport } from "./test-redesign-system-reduced-motion.mjs";

const exeBytes = Buffer.from("isolated-candidate");
const sha256 = createHash("sha256").update(exeBytes).digest("hex").toUpperCase();

function validReport() {
  return {
    schemaVersion: "1.0",
    testKind: "isolated-webview-reduced-motion",
    scenario: "scene-rain",
    webViewArguments: "--force-prefers-reduced-motion",
    realUserDataTouched: false,
    systemSettingChanged: false,
    artifact: {
      path: ".work/redesign-motion-probe-20261013/release/weatherpoem.exe",
      sha256,
    },
    runId: "test-run",
    processId: 123,
    readyMarker: {
      schemaVersion: "1.2",
      runId: "test-run",
      processId: 123,
      readyView: "poem",
      performanceScenario: "scene-rain",
      sceneMotion: {
        sceneKind: "rain",
        appReduced: false,
        systemReduced: true,
        sceneActive: true,
        visibilityState: "visible",
        animationName: "scene-drift",
        animationDuration: "1e-05s",
        animationIterationCount: "1",
      },
    },
    result: "reduced-motion-passed",
  };
}

test("隔离 WebView 强制减少动态后，雨纹不再无限循环", () => {
  assert.equal(validateReducedMotionReport(validReport(), exeBytes).systemReduced, true);
});

test("若媒体偏好、动画时长或候选哈希不对则拒绝签收", () => {
  const notReduced = validReport();
  notReduced.readyMarker.sceneMotion.systemReduced = false;
  assert.throws(() => validateReducedMotionReport(notReduced, exeBytes));

  const stillAnimating = validReport();
  stillAnimating.readyMarker.sceneMotion.animationIterationCount = "infinite";
  assert.throws(() => validateReducedMotionReport(stillAnimating, exeBytes));

  const wrongHash = validReport();
  wrongHash.artifact.sha256 = "A".repeat(64);
  assert.throws(() => validateReducedMotionReport(wrongHash, exeBytes));
});
