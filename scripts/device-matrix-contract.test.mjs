import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const matrix = JSON.parse(
  await readFile(
    path.join(projectRoot, "review", "device-matrix-plan.json"),
    "utf8",
  ),
);

test("设备矩阵绑定当前应用版本且浏览器逻辑尺寸检查完整", () => {
  assert.equal(matrix.appVersion, packageJson.version);
  assert.equal(matrix.browserLayoutMatrix.result, "passed");
  assert.equal(matrix.browserLayoutMatrix.combinations, 8);
  assert.deepEqual(
    matrix.browserLayoutMatrix.sizes.map(
      ({ width, height }) => `${width}x${height}`,
    ),
    ["430x680", "390x620"],
  );
  assert.deepEqual(
    new Set(matrix.browserLayoutMatrix.scenarios),
    new Set([
      "onboarding",
      "reading",
      "warning",
      "official-warning",
    ]),
  );
  assert.ok(
    matrix.currentMachineObservation.scope.includes(
      "nsis-silent-install-launch-uninstall",
    ),
  );
  assert.ok(
    matrix.currentMachineObservation.scope.includes(
      "msi-administrative-image-extract-launch",
    ),
  );
  assert.ok(
    matrix.currentMachineObservation.scope.includes(
      "close-to-tray-second-instance-reveal",
    ),
  );
  assert.ok(
    matrix.currentMachineObservation.scope.includes(
      "current-logical-display-bottom-right-position",
    ),
  );
  assert.equal(
    matrix.currentMachineObservation.logicalDisplayCount,
    1,
  );
  assert.ok(
    matrix.currentMachineObservation.physicalMonitorProbeCount >=
      matrix.currentMachineObservation.logicalDisplayCount,
  );
  assert.equal(matrix.currentMachineObservation.result, "partial");
});

test("真实设备计划覆盖系统、缩放、多显示器和特殊模式", () => {
  const cases = matrix.requiredCases;
  assert.ok(cases.length >= 9);
  assert.deepEqual(
    new Set(cases.map((item) => item.scalePercent)),
    new Set([100, 125, 150, 200]),
  );
  assert.ok(cases.some((item) => item.os.startsWith("Windows 10")));
  assert.ok(cases.some((item) => item.os.startsWith("Windows 11")));
  assert.ok(cases.some((item) => item.display.includes("mixed-dpi")));
  assert.ok(cases.some((item) => item.launch === "autostart"));
  assert.ok(cases.some((item) => item.specialMode === "focus-assist"));
  assert.ok(
    cases.some(
      (item) => item.specialMode === "fullscreen-presentation",
    ),
  );
  assert.ok(
    cases.some((item) =>
      item.installLifecycle.includes("uninstall"),
    ),
  );
});

test("完成用例必须具名、带时间和证据，未完成项不能冒充通过", () => {
  const allowed = new Set(matrix.releaseGate.allowedResults);
  const ids = new Set();
  for (const item of matrix.requiredCases) {
    assert.match(item.id, /^DM-\d{2}$/);
    assert.ok(!ids.has(item.id), `重复用例 ${item.id}`);
    ids.add(item.id);
    assert.ok(allowed.has(item.result));
    if (item.result === "passed") {
      assert.ok(item.executor.trim());
      assert.match(item.executedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.ok(item.evidence.trim());
      assert.equal(item.issue.trim(), "");
    }
    if (item.result === "failed" || item.result === "blocked") {
      assert.ok(item.issue.trim());
    }
  }
  assert.equal(matrix.releaseGate.requiredForPublicRelease, true);
  assert.equal(matrix.releaseGate.requiredResult, "passed");
});
