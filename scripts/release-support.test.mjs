import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertAutostartRebootEvidence,
  assertManifestMatches,
  assertMsiElevatedLifecycleEvidence,
  assertMsiImageEvidence,
  assertNsisUpgradeRollbackEvidence,
  assertNsisLifecycleEvidence,
  assertSingleInstanceEvidence,
  assertWindowPositionEvidence,
  createReleaseManifest,
  parseAllowedThumbprints,
} from "./release-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("Vite emits relative asset URLs for the packaged Tauri protocol", () => {
  const viteConfig = readFileSync(
    path.join(projectRoot, "vite.config.ts"),
    "utf8",
  );
  assert.match(viteConfig, /base:\s*["']\.\/["']/);
});

function artifact(kind, name, status = "NotSigned") {
  return {
    kind,
    name,
    size: 2_000_000,
    sha256: "A".repeat(64),
    signature: {
      status,
      signerSubject: status === "Valid" ? "CN=WeatherPoem" : null,
      signerThumbprint: status === "Valid" ? "B".repeat(40) : null,
      signerNotBefore:
        status === "Valid" ? "2026-01-01T00:00:00.000Z" : null,
      signerNotAfter:
        status === "Valid" ? "2027-01-01T00:00:00.000Z" : null,
      timestampSubject:
        status === "Valid" ? "CN=Timestamp Authority" : null,
      timestampThumbprint:
        status === "Valid" ? "C".repeat(40) : null,
    },
  };
}

function state(channel, status) {
  return {
    product: "WeatherPoem",
    identifier: "cn.weatherpoem.desktop",
    version: "0.2.0",
    channel,
    generatedDate: "2026-07-24",
    artifacts: [
      artifact("portable", "weatherpoem.exe", status),
      artifact("nsis", "WeatherPoem_0.2.0_x64-setup.exe", status),
      artifact("msi", "WeatherPoem_0.2.0_x64_en-US.msi", status),
    ],
  };
}

test("trial 清单明确记录未签名状态且没有下载地址", () => {
  const manifest = createReleaseManifest(
    state("trial", "NotSigned"),
  );
  assert.equal(manifest.trustLevel, "unsigned-trial");
  assert.ok(
    manifest.artifacts.every(
      (item) =>
        item.signature.status === "NotSigned" &&
        item.downloadUrl === null,
    ),
  );
  assertManifestMatches(manifest, manifest);
});

test("未签名试用清单不能通过正式发布门禁", () => {
  const manifest = createReleaseManifest(
    state("trial", "NotSigned"),
  );
  assert.throws(
    () =>
      assertManifestMatches(manifest, manifest, {
        productionRequired: true,
      }),
    /不能通过正式发布门禁/,
  );
});

test("production 要求允许的证书、时间戳和 HTTPS 下载地址", () => {
  const allowed = parseAllowedThumbprints("b".repeat(40));
  const manifest = createReleaseManifest(
    state("production", "Valid"),
    {
      baseUrl: "https://downloads.weatherpoem.example/releases/0.2.0/",
      allowedThumbprints: allowed,
    },
  );
  assert.equal(manifest.trustLevel, "signed-production");
  assert.ok(
    manifest.artifacts.every(
      (item) =>
        item.downloadUrl.startsWith("https://") &&
        item.signature.timestampThumbprint,
    ),
  );
});

test("production 拒绝未允许的证书、缺失时间戳或明文下载地址", () => {
  const production = state("production", "Valid");
  assert.throws(
    () =>
      createReleaseManifest(production, {
        baseUrl: "https://downloads.weatherpoem.example/",
        allowedThumbprints: new Set(),
      }),
    /证书不在允许列表/,
  );
  production.artifacts[0].signature.timestampThumbprint = null;
  assert.throws(
    () =>
      createReleaseManifest(production, {
        baseUrl: "https://downloads.weatherpoem.example/",
        allowedThumbprints: new Set(["B".repeat(40)]),
      }),
    /缺少可信时间戳/,
  );
  assert.throws(
    () =>
      createReleaseManifest(state("production", "Valid"), {
        baseUrl: "http://downloads.weatherpoem.example/",
        allowedThumbprints: new Set(["B".repeat(40)]),
      }),
    /HTTPS/,
  );
});

test("证书指纹列表拒绝重复和非十六进制值", () => {
  assert.throws(
    () => parseAllowedThumbprints("not-a-thumbprint"),
    /格式无效/,
  );
  assert.throws(
    () =>
      parseAllowedThumbprints(
        `${"A".repeat(40)},${"a".repeat(40)}`,
      ),
    /重复/,
  );
});

function lifecycleEvidence(releaseState) {
  const nsis = releaseState.artifacts.find(
    (item) => item.kind === "nsis",
  );
  return {
    schemaVersion: "1.0",
    product: releaseState.product,
    version: releaseState.version,
    testedAt: "2026-07-23T18:00:00.000Z",
    installer: {
      sha256: nsis.sha256,
      authenticodeStatus: nsis.signature.status,
    },
    isolation: {
      existingInstallationProtected: true,
      applicationDataDeleted: false,
    },
    checks: {
      silentInstall: "passed",
      installedExecutableCount: 1,
      uninstallExecutableCount: 1,
      uninstallRegistration: "passed",
      installedLaunchSeconds: 6,
      installedLaunch: "passed",
      silentUninstall: "passed",
      installDirectoryRemoved: "passed",
      uninstallRegistrationRemoved: "passed",
      shortcutResidue: "passed",
      autostartResidue: "passed",
    },
    result: "passed",
  };
}

test("NSIS 生命周期证据必须绑定当前安装包且保护现有环境", () => {
  const releaseState = state("trial", "NotSigned");
  const report = lifecycleEvidence(releaseState);
  assert.equal(
    assertNsisLifecycleEvidence(report, releaseState),
    true,
  );

  report.installer.sha256 = "D".repeat(64);
  assert.throws(
    () => assertNsisLifecycleEvidence(report, releaseState),
    /哈希或签名状态不一致/,
  );
});

test("NSIS 生命周期证据拒绝短时冒烟、残留或删除用户数据", () => {
  const releaseState = state("trial", "NotSigned");
  const report = lifecycleEvidence(releaseState);
  report.checks.installedLaunchSeconds = 2;
  assert.throws(
    () => assertNsisLifecycleEvidence(report, releaseState),
    /缺少必需的通过项/,
  );

  report.checks.installedLaunchSeconds = 6;
  report.isolation.applicationDataDeleted = true;
  assert.throws(
    () => assertNsisLifecycleEvidence(report, releaseState),
    /用户数据保护边界/,
  );
});

function msiImageEvidence(releaseState) {
  const msi = releaseState.artifacts.find(
    (item) => item.kind === "msi",
  );
  return {
    schemaVersion: "1.0",
    product: releaseState.product,
    version: releaseState.version,
    testedAt: "2026-07-23T18:00:00.000Z",
    scope: "administrative-image-extraction",
    limitations: {
      realInstallTested: false,
      repairTested: false,
      uninstallTested: false,
      reason: "Requires approved elevation.",
    },
    package: {
      sha256: msi.sha256,
      authenticodeStatus: msi.signature.status,
      wixInstallScope: "perMachine",
    },
    isolation: {
      existingInstallationProtected: true,
      temporaryExtractRootRemoved: true,
      applicationDataDeleted: false,
    },
    checks: {
      administrativeImage: "passed",
      msiexecExitCode: 0,
      payloadExecutableCount: 1,
      payloadExecutableSha256: "E".repeat(64),
      payloadLaunchSeconds: 6,
      payloadLaunch: "passed",
      installRegistrationResidue: "passed",
      shortcutResidue: "passed",
      autostartResidue: "passed",
      extractionCleanup: "passed",
    },
    result: "passed",
  };
}

test("MSI image 证据必须绑定当前包并保留真实安装限制", () => {
  const releaseState = state("trial", "NotSigned");
  const report = msiImageEvidence(releaseState);
  assert.equal(assertMsiImageEvidence(report, releaseState), true);

  report.limitations.realInstallTested = true;
  assert.throws(
    () => assertMsiImageEvidence(report, releaseState),
    /必须明确保留管理员安装测试限制/,
  );
});

test("MSI image 证据拒绝旧包、未清理目录或短时启动", () => {
  const releaseState = state("trial", "NotSigned");
  const report = msiImageEvidence(releaseState);
  report.package.sha256 = "F".repeat(64);
  assert.throws(
    () => assertMsiImageEvidence(report, releaseState),
    /哈希、签名或安装范围不一致/,
  );

  report.package.sha256 = releaseState.artifacts.find(
    (item) => item.kind === "msi",
  ).sha256;
  report.isolation.temporaryExtractRootRemoved = false;
  assert.throws(
    () => assertMsiImageEvidence(report, releaseState),
    /用户数据保护边界/,
  );
});

function msiElevatedEvidence(releaseState) {
  const msi = releaseState.artifacts.find(
    (item) => item.kind === "msi",
  );
  const portable = releaseState.artifacts.find(
    (item) => item.kind === "portable",
  );
  return {
    schemaVersion: "1.0",
    product: releaseState.product,
    version: releaseState.version,
    testedAt: "2026-07-23T18:00:00.000Z",
    scope: "elevated-per-machine-install-repair-uninstall",
    administrator: true,
    package: {
      sha256: msi.sha256,
      authenticodeStatus: msi.signature.status,
      wixInstallScope: "perMachine",
    },
    installedExecutable: {
      path: "C:\\Program Files\\WeatherPoem\\weatherpoem.exe",
      sha256: portable.sha256,
      authenticodeStatus: portable.signature.status,
    },
    installation: {
      productCode: "{AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE}",
      installLocation: "C:\\Program Files\\WeatherPoem",
      logFiles: [
        "E:\\weatherpoem\\output\\install.log",
        "E:\\weatherpoem\\output\\repair.log",
        "E:\\weatherpoem\\output\\uninstall.log",
      ],
    },
    isolation: {
      existingInstallationProtected: true,
      explicitLifecycleConfirmation: true,
      cleanupAttempted: true,
      applicationDataDeleted: false,
      preexistingApplicationDataPreserved: true,
    },
    checks: {
      elevatedSession: "passed",
      perMachineInstall: "passed",
      installExitCode: 0,
      uninstallRegistration: "passed",
      installedExecutableCount: 1,
      installedLaunchSeconds: 6,
      installedLaunch: "passed",
      repair: "passed",
      repairExitCode: 0,
      repairedExecutableHash: "passed",
      uninstall: "passed",
      uninstallExitCode: 0,
      installDirectoryRemoved: "passed",
      uninstallRegistrationRemoved: "passed",
      shortcutResidue: "passed",
      autostartResidue: "passed",
      processResidue: "passed",
    },
    result: "passed",
  };
}

test("管理员 MSI 证据绑定当前安装包并覆盖安装修复卸载", () => {
  const releaseState = state("trial", "NotSigned");
  const report = msiElevatedEvidence(releaseState);
  assert.equal(
    assertMsiElevatedLifecycleEvidence(report, releaseState),
    true,
  );

  report.checks.repair = "failed";
  assert.throws(
    () =>
      assertMsiElevatedLifecycleEvidence(report, releaseState),
    /缺少必需的安装、修复或卸载通过项/,
  );
});

test("管理员 MSI 证据拒绝旧程序、未确认或未保护数据", () => {
  const releaseState = state("trial", "NotSigned");
  const report = msiElevatedEvidence(releaseState);
  report.installedExecutable.sha256 = "F".repeat(64);
  assert.throws(
    () =>
      assertMsiElevatedLifecycleEvidence(report, releaseState),
    /已安装程序与当前 EXE 不一致/,
  );

  report.installedExecutable.sha256 = releaseState.artifacts.find(
    (item) => item.kind === "portable",
  ).sha256;
  report.isolation.explicitLifecycleConfirmation = false;
  assert.throws(
    () =>
      assertMsiElevatedLifecycleEvidence(report, releaseState),
    /用户数据保护边界/,
  );
});

function nsisUpgradeEvidence(releaseState, baseline) {
  const nsis = releaseState.artifacts.find(
    (item) => item.kind === "nsis",
  );
  const portable = releaseState.artifacts.find(
    (item) => item.kind === "portable",
  );
  return {
    schemaVersion: "1.0",
    product: releaseState.product,
    version: releaseState.version,
    testedAt: "2026-07-23T18:00:00.000Z",
    scope: "nsis-in-place-upgrade-manual-rollback",
    baseline: {
      version: baseline.version,
      installerName: baseline.name,
      installerSha256: baseline.sha256,
      authenticodeStatus: baseline.signature.status,
      installedPayloadSha256: "E".repeat(64),
    },
    target: {
      version: releaseState.version,
      installerName: nsis.name,
      installerSha256: nsis.sha256,
      authenticodeStatus: nsis.signature.status,
      installedPayloadSha256: portable.sha256,
      installedPayloadAuthenticodeStatus:
        portable.signature.status,
    },
    isolation: {
      explicitLifecycleConfirmation: true,
      existingInstallationProtected: true,
      applicationDataAbsentBefore: true,
      preexistingApplicationDataDeleted: false,
      controlledMarkerPreservedThroughRollback: true,
      controlledTestDataRemoved: true,
      temporaryInstallRootRemoved: true,
    },
    limitations: {
      automaticUpdaterTested: false,
      msiUpgradeTested: false,
      rollbackMethod: "baseline-nsis-reinstall",
      contentWithdrawalTested: false,
    },
    checks: {
      baselineInstall: "passed",
      baselineRegistration: "passed",
      baselineLaunchSeconds: 6,
      baselineLaunch: "passed",
      targetInPlaceUpgrade: "passed",
      targetRegistration: "passed",
      targetPayloadMatchesRelease: "passed",
      targetLaunchSeconds: 6,
      targetLaunch: "passed",
      userDataMarkerAfterUpgrade: "passed",
      baselineManualRollback: "passed",
      rollbackRegistration: "passed",
      rollbackPayloadRestored: "passed",
      rollbackLaunchSeconds: 6,
      rollbackLaunch: "passed",
      userDataMarkerAfterRollback: "passed",
      finalUninstall: "passed",
      installDirectoryRemoved: "passed",
      uninstallRegistrationRemoved: "passed",
      shortcutResidue: "passed",
      autostartResidue: "passed",
      processResidue: "passed",
      controlledTestDataCleanup: "passed",
    },
    result: "passed",
  };
}

function baselineArtifact() {
  return {
    version: "0.1.0",
    name: "WeatherPoem_0.1.0_x64-setup.exe",
    sha256: "D".repeat(64),
    signature: { status: "NotSigned" },
  };
}

test("NSIS 升级证据绑定低版本基线、当前包和用户数据标记", () => {
  const releaseState = state("trial", "NotSigned");
  const baseline = baselineArtifact();
  const report = nsisUpgradeEvidence(releaseState, baseline);
  assert.equal(
    assertNsisUpgradeRollbackEvidence(
      report,
      releaseState,
      baseline,
    ),
    true,
  );

  report.checks.userDataMarkerAfterRollback = "failed";
  assert.throws(
    () =>
      assertNsisUpgradeRollbackEvidence(
        report,
        releaseState,
        baseline,
      ),
    /缺少必需的通过项/,
  );
});

test("NSIS 升级证据拒绝同版本基线、旧目标包或虚构自动更新", () => {
  const releaseState = state("trial", "NotSigned");
  const baseline = baselineArtifact();
  const report = nsisUpgradeEvidence(releaseState, baseline);
  report.baseline.version = releaseState.version;
  assert.throws(
    () =>
      assertNsisUpgradeRollbackEvidence(
        report,
        releaseState,
        baseline,
      ),
    /基线包或基线版本不一致/,
  );

  report.baseline.version = baseline.version;
  report.target.installerSha256 = "F".repeat(64);
  assert.throws(
    () =>
      assertNsisUpgradeRollbackEvidence(
        report,
        releaseState,
        baseline,
      ),
    /当前安装包或 EXE 不一致/,
  );

  report.target.installerSha256 = releaseState.artifacts.find(
    (item) => item.kind === "nsis",
  ).sha256;
  report.limitations.automaticUpdaterTested = true;
  assert.throws(
    () =>
      assertNsisUpgradeRollbackEvidence(
        report,
        releaseState,
        baseline,
      ),
    /测试范围限制/,
  );
});

function singleInstanceEvidence(releaseState) {
  const portable = releaseState.artifacts.find(
    (item) => item.kind === "portable",
  );
  return {
    schemaVersion: "1.0",
    product: releaseState.product,
    version: releaseState.version,
    testedAt: "2026-07-23T18:00:00.000Z",
    executable: {
      sha256: portable.sha256,
      authenticodeStatus: portable.signature.status,
    },
    checks: {
      primaryWindowVisible: "passed",
      closeRequestHidesToTray: "passed",
      primaryRemainsRunningAfterClose: "passed",
      secondaryExited: "passed",
      secondaryExitCode: 0,
      singleProcessAfterSecondary: "passed",
      secondaryRevealsPrimary: "passed",
    },
    result: "passed",
  };
}

test("单实例证据必须绑定当前 EXE 并覆盖托盘唤醒闭环", () => {
  const releaseState = state("trial", "NotSigned");
  const report = singleInstanceEvidence(releaseState);
  assert.equal(
    assertSingleInstanceEvidence(report, releaseState),
    true,
  );

  report.checks.secondaryRevealsPrimary = "failed";
  assert.throws(
    () => assertSingleInstanceEvidence(report, releaseState),
    /缺少必需的通过项/,
  );
});

test("单实例证据拒绝旧 EXE 或非零第二实例退出码", () => {
  const releaseState = state("trial", "NotSigned");
  const report = singleInstanceEvidence(releaseState);
  report.executable.sha256 = "0".repeat(64);
  assert.throws(
    () => assertSingleInstanceEvidence(report, releaseState),
    /哈希或签名状态不一致/,
  );

  report.executable.sha256 = releaseState.artifacts.find(
    (item) => item.kind === "portable",
  ).sha256;
  report.checks.secondaryExitCode = 1;
  assert.throws(
    () => assertSingleInstanceEvidence(report, releaseState),
    /缺少必需的通过项/,
  );
});

function autostartRebootEvidence(releaseState) {
  const portable = releaseState.artifacts.find(
    (item) => item.kind === "portable",
  );
  return {
    schemaVersion: "1.0",
    product: releaseState.product,
    version: releaseState.version,
    testedAt: "2026-07-23T18:00:00.000Z",
    scope: "real-os-restart-enable-disable",
    testId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    machine: {
      bindingSha256: "B".repeat(64),
      userBindingSha256: "C".repeat(64),
    },
    executable: {
      name: "weatherpoem.exe",
      pathSha256: "D".repeat(64),
      sha256: portable.sha256,
      authenticodeStatus: portable.signature.status,
    },
    enabledPhase: {
      bootBefore: "2026-07-23T14:00:00.000Z",
      bootAfter: "2026-07-23T15:00:00.000Z",
      autostart: {
        registrationValueSha256: "E".repeat(64),
        targetExecutableObserved: true,
        autostartArgumentObserved: true,
      },
      process: {
        executablePathSha256: "D".repeat(64),
        commandLineSha256: "F".repeat(64),
        autostartArgumentObserved: true,
        startedAt: "2026-07-23T15:00:05.000Z",
      },
      checks: {
        autostartRegistration: "passed",
        restartOccurred: "passed",
        processStartedAfterRestart: "passed",
        processPath: "passed",
        autostartArgument: "passed",
      },
    },
    disabledPhase: {
      bootBefore: "2026-07-23T15:00:00.000Z",
      bootAfter: "2026-07-23T16:00:00.000Z",
      observationSeconds: 10,
      checks: {
        autostartRegistrationAbsent: "passed",
        restartOccurred: "passed",
        processRemainedAbsent: "passed",
      },
    },
    isolation: {
      autostartStateChangedByScript: false,
      rebootTriggeredByScript: false,
      applicationDataDeleted: false,
    },
    checks: {
      enabledRegistration: "passed",
      restartAfterEnable: "passed",
      launchAfterEnabledRestart: "passed",
      launchCommandContainsAutostart: "passed",
      sameInstalledExecutable: "passed",
      disabledRegistration: "passed",
      restartAfterDisable: "passed",
      noLaunchAfterDisabledRestart: "passed",
    },
    result: "passed",
  };
}

test("开机自启证据绑定当前程序并证明启停各经历一次重启", () => {
  const releaseState = state("trial", "NotSigned");
  const report = autostartRebootEvidence(releaseState);
  assert.equal(
    assertAutostartRebootEvidence(report, releaseState),
    true,
  );

  report.enabledPhase.bootAfter =
    report.enabledPhase.bootBefore;
  assert.throws(
    () => assertAutostartRebootEvidence(report, releaseState),
    /没有证明两次真实重启与启动时序/,
  );
});

test("开机自启证据拒绝手动启动或脚本篡改系统状态", () => {
  const releaseState = state("trial", "NotSigned");
  const report = autostartRebootEvidence(releaseState);
  report.enabledPhase.process.autostartArgumentObserved = false;
  assert.throws(
    () => assertAutostartRebootEvidence(report, releaseState),
    /没有证明同一程序以 --autostart 启动/,
  );

  report.enabledPhase.process.autostartArgumentObserved = true;
  report.isolation.rebootTriggeredByScript = true;
  assert.throws(
    () => assertAutostartRebootEvidence(report, releaseState),
    /只读观察与数据保护边界/,
  );
});

function windowPositionEvidence(releaseState) {
  const portable = releaseState.artifacts.find(
    (item) => item.kind === "portable",
  );
  return {
    schemaVersion: "1.0",
    product: releaseState.product,
    version: releaseState.version,
    testedAt: "2026-07-23T18:00:00.000Z",
    executable: {
      sha256: portable.sha256,
      authenticodeStatus: portable.signature.status,
    },
    displayObservation: {
      physicalMonitorProbeCount: 2,
      logicalDisplayCount: 1,
      extendedDesktopTested: false,
      logicalScreens: [{ deviceName: "DISPLAY1" }],
      windowDpi: 96,
    },
    position: {
      expectedMargin: 22,
      tolerance: 4,
      actualRightGap: 22,
      actualBottomGap: 22,
    },
    checks: {
      currentMonitorDetected: "passed",
      bottomRightMargin: "passed",
      insideWorkingArea: "passed",
      closeRequestHidesToTray: "passed",
      processRemainsAfterClose: "passed",
    },
    limitations: {
      extendedDesktopCrossMonitor:
        "not-available-one-logical-display",
      systemScaleMatrix: "not-tested",
    },
    result: "passed",
  };
}

test("窗口定位证据绑定当前 EXE 并验证 DPI 边距", () => {
  const releaseState = state("trial", "NotSigned");
  const report = windowPositionEvidence(releaseState);
  assert.equal(
    assertWindowPositionEvidence(report, releaseState),
    true,
  );

  report.position.actualBottomGap = 40;
  assert.throws(
    () => assertWindowPositionEvidence(report, releaseState),
    /右下角边距不合格/,
  );
});

test("窗口定位证据不能把单逻辑显示区冒充扩展桌面", () => {
  const releaseState = state("trial", "NotSigned");
  const report = windowPositionEvidence(releaseState);
  report.displayObservation.extendedDesktopTested = true;
  assert.throws(
    () => assertWindowPositionEvidence(report, releaseState),
    /错误声明了扩展桌面覆盖/,
  );

  report.displayObservation.extendedDesktopTested = false;
  report.limitations.extendedDesktopCrossMonitor = "passed";
  assert.throws(
    () => assertWindowPositionEvidence(report, releaseState),
    /没有诚实记录跨显示器限制/,
  );
});
