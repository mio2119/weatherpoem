import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const elevatedScript = await readFile(
  path.join(
    projectRoot,
    "scripts",
    "test-msi-elevated-lifecycle.ps1",
  ),
  "utf8",
);
const autostartScript = await readFile(
  path.join(
    projectRoot,
    "scripts",
    "test-autostart-reboot.ps1",
  ),
  "utf8",
);
const upgradeScript = await readFile(
  path.join(
    projectRoot,
    "scripts",
    "test-nsis-upgrade-rollback.ps1",
  ),
  "utf8",
);
const releaseVerifier = await readFile(
  path.join(projectRoot, "scripts", "verify-release.mjs"),
  "utf8",
);
const nsisScript = await readFile(
  path.join(projectRoot, "scripts", "test-nsis-lifecycle.ps1"),
  "utf8",
);

test(
  "MSI preflight tolerates an uninstall record without DisplayIcon",
  { skip: process.platform !== "win32" },
  () => {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(
          projectRoot,
          "scripts",
          "test-msi-preflight-missing-registry-value.ps1",
        ),
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
      },
    );

    assert.equal(
      result.status,
      0,
      `${result.stdout}\n${result.stderr}`,
    );
    const preflight = JSON.parse(result.stdout);
    assert.ok(preflight.existingInstallationCount >= 1);
    assert.equal(preflight.stateChanged, false);
  },
);

test("MSI 管理员脚本先提供只读预检，再要求显式确认", () => {
  const preflight = elevatedScript.indexOf("if ($Preflight)");
  const confirmation = elevatedScript.indexOf(
    "if (-not $ConfirmLifecycle)",
  );
  const evidenceDirectory = elevatedScript.indexOf(
    "New-Item -ItemType Directory",
  );
  const realInstall = elevatedScript.indexOf(
    "$installExitCode = Invoke-MsiExec",
  );
  assert.ok(preflight > 0);
  assert.ok(confirmation > preflight);
  assert.ok(evidenceDirectory > confirmation);
  assert.ok(realInstall > confirmation);
  assert.match(
    elevatedScript,
    /existing WeatherPoem installation, process, shortcut, or autostart/is,
  );
  assert.match(
    elevatedScript,
    /MSI_ELEVATED_LIFECYCLE\.json/,
  );
});

test("跨重启脚本只观察系统状态，不代替用户改自启或触发重启", () => {
  assert.doesNotMatch(
    autostartScript,
    /\b(?:Set|New|Remove)-ItemProperty\b/i,
  );
  assert.doesNotMatch(
    autostartScript,
    /\b(?:Restart-Computer|Stop-Computer|shutdown\.exe)\b/i,
  );
  assert.doesNotMatch(autostartScript, /\bStop-Process\b/i);
  for (const phase of [
    "PrepareEnable",
    "VerifyEnable",
    "PrepareDisable",
    "VerifyDisable",
  ]) {
    assert.match(autostartScript, new RegExp(phase));
  }
  assert.match(
    autostartScript,
    /autostartStateChangedByScript = \$false/,
  );
  assert.match(
    autostartScript,
    /rebootTriggeredByScript = \$false/,
  );
});

test("人工 Windows 门禁同时要求 MSI 与开机自启两份报告", () => {
  assert.match(
    releaseVerifier,
    /MSI_ELEVATED_LIFECYCLE\.json/,
  );
  assert.match(releaseVerifier, /AUTOSTART_REBOOT\.json/);
  assert.match(
    releaseVerifier,
    /assertMsiElevatedLifecycleEvidence/,
  );
  assert.match(releaseVerifier, /assertAutostartRebootEvidence/);
  assert.match(
    releaseVerifier,
    /productionRequired\s*\|\|\s*process\.argv\.includes\("--manual-windows"\)/,
  );
});

test("NSIS 升级脚本保护既有安装和应用数据后才允许生命周期操作", () => {
  const preflight = upgradeScript.indexOf("if ($Preflight)");
  const confirmation = upgradeScript.indexOf(
    "if (-not $ConfirmLifecycle)",
  );
  const firstInstall = upgradeScript.indexOf(
    "Invoke-CheckedProcess `\n        -FilePath $baselineInstaller",
  );
  assert.ok(preflight > 0);
  assert.ok(confirmation > preflight);
  assert.ok(firstInstall > confirmation);
  assert.match(
    upgradeScript,
    /existingApplicationDataRootCount/,
  );
  assert.match(upgradeScript, /Assert-ExactTestDataRoot/);
  assert.match(
    upgradeScript,
    /controlledMarkerPreservedThroughRollback = \$true/,
  );
  assert.match(
    upgradeScript,
    /NSIS_UPGRADE_ROLLBACK\.json/,
  );
  assert.doesNotMatch(upgradeScript, /\bMove-Item\b/i);
});

test("NSIS and MSI verify installed NOTICE before uninstall", () => {
  const nsisVerify = nsisScript.indexOf(
    'verify-installed-notice.mjs"',
  );
  const nsisUninstall = nsisScript.indexOf(
    "-FilePath $uninstallerPath",
  );
  assert.ok(nsisVerify > 0);
  assert.ok(nsisUninstall > nsisVerify);
  assert.match(nsisScript, /--kind",\s*"nsis"/);
  assert.match(nsisScript, /--install-root",\s*\$installRoot/);
  assert.match(nsisScript, /--artifact",\s*\$installerPath/);
  assert.match(nsisScript, /--output",\s*\$noticeEvidencePath/);

  const msiVerify = elevatedScript.indexOf(
    'verify-installed-notice.mjs"',
  );
  const msiUninstall = elevatedScript.indexOf(
    "$uninstallExitCode = Invoke-MsiExec",
  );
  assert.ok(msiVerify > 0);
  assert.ok(msiUninstall > msiVerify);
  assert.match(elevatedScript, /--kind",\s*"msi"/);
  assert.match(
    elevatedScript,
    /--install-root",\s*\$installLocation/,
  );
  assert.match(elevatedScript, /--artifact",\s*\$msiPath/);
  assert.match(
    elevatedScript,
    /--output",\s*\$noticeEvidencePath/,
  );
});

test("manual and production release verification require installed NOTICE evidence", () => {
  assert.match(releaseVerifier, /INSTALLED_NOTICE\.json/);
  assert.match(
    releaseVerifier,
    /assertInstalledNoticeEvidence/,
  );
  assert.match(releaseVerifier, /collectNoticeSource/);
  const gate = releaseVerifier.indexOf(
    "if (manualWindowsRequired)",
  );
  const evidence = releaseVerifier.indexOf(
    "INSTALLED_NOTICE.json",
  );
  assert.ok(gate > 0);
  assert.ok(evidence > gate);
});
