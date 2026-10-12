import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const RELEASE_SCHEMA_VERSION = "1.0";
export const TRIAL_NOTICE =
  "未签名 M1 试用包，仅用于受控内部测试；不得冒充正式公开发行版。";

function cargoVersion(source) {
  const packageBlock = source.match(
    /\[package\]([\s\S]*?)(?:\n\[|$)/,
  );
  const version = packageBlock?.[1].match(
    /^\s*version\s*=\s*"([^"]+)"/m,
  )?.[1];
  if (!version) throw new Error("无法读取 src-tauri/Cargo.toml 版本号");
  return version;
}

function checksumEntries(source) {
  return new Map(
    source
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-F0-9]{64})\s{2}(.+)$/))
      .filter(Boolean)
      .map((match) => [match[2], match[1]]),
  );
}

function generatedDate(source) {
  const value = source.match(
    /^Generated:\s*(\d{4}-\d{2}-\d{2})\s+Asia\/Shanghai$/m,
  )?.[1];
  if (!value) throw new Error("SHA-256 清单缺少 Asia/Shanghai 生成日期");
  return value;
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256")
    .update(bytes)
    .digest("hex")
    .toUpperCase();
}

function normalizeThumbprint(value) {
  return String(value ?? "")
    .replaceAll(/\s/g, "")
    .toUpperCase();
}

export function parseAllowedThumbprints(value) {
  const items = String(value ?? "")
    .split(",")
    .map(normalizeThumbprint)
    .filter(Boolean);
  if (
    items.some((item) => !/^[A-F0-9]{40,128}$/.test(item)) ||
    new Set(items).size !== items.length
  ) {
    throw new Error("允许的签名证书指纹格式无效或重复");
  }
  return new Set(items);
}

async function inspectAuthenticode(projectRoot, filePath) {
  const scriptPath = path.join(
    projectRoot,
    "scripts",
    "inspect-authenticode.ps1",
  );
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-Path",
      filePath,
    ],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  const value = JSON.parse(stdout.trim());
  return {
    status: value.status,
    signerSubject: value.signerSubject,
    signerThumbprint: normalizeThumbprint(value.signerThumbprint) || null,
    signerNotBefore: value.signerNotBefore,
    signerNotAfter: value.signerNotAfter,
    timestampSubject: value.timestampSubject,
    timestampThumbprint:
      normalizeThumbprint(value.timestampThumbprint) || null,
  };
}

async function inspectFileVersion(projectRoot, filePath) {
  const scriptPath = path.join(
    projectRoot,
    "scripts",
    "inspect-file-version.ps1",
  );
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-Path",
      filePath,
    ],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(stdout.trim());
}

function dottedVersionParts(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value ?? "")) {
    throw new Error(`无效三段版本号：${value ?? "<missing>"}`);
  }
  return value.split(".").map(Number);
}

function compareDottedVersions(left, right) {
  const leftParts = dottedVersionParts(left);
  const rightParts = dottedVersionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

export async function collectNsisBaseline(
  projectRoot,
  baselineVersion,
  currentVersion,
) {
  if (
    compareDottedVersions(baselineVersion, currentVersion) >= 0
  ) {
    throw new Error("NSIS 升级基线版本必须低于当前版本");
  }
  const name = `WeatherPoem_${baselineVersion}_x64-setup.exe`;
  const absolutePath = path.join(
    projectRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "nsis",
    name,
  );
  const metadata = await stat(absolutePath);
  if (!metadata.isFile() || metadata.size < 1_000_000) {
    throw new Error("NSIS 升级基线安装包缺失或尺寸异常");
  }
  const checksumPath = path.join(
    projectRoot,
    "output",
    `WeatherPoem_${baselineVersion}_SHA256.txt`,
  );
  const expected = checksumEntries(
    await readFile(checksumPath, "utf8"),
  ).get(name);
  const actual = await sha256(absolutePath);
  if (!expected || expected !== actual) {
    throw new Error("NSIS 升级基线与其 SHA-256 清单不一致");
  }
  const versionInfo = await inspectFileVersion(
    projectRoot,
    absolutePath,
  );
  if (
    versionInfo.productName !== "WeatherPoem" ||
    versionInfo.productVersion !== baselineVersion
  ) {
    throw new Error("NSIS 升级基线的产品或文件版本不一致");
  }
  return {
    version: baselineVersion,
    name,
    absolutePath,
    size: metadata.size,
    sha256: actual,
    signature: await inspectAuthenticode(
      projectRoot,
      absolutePath,
    ),
  };
}

export async function collectReleaseState(projectRoot) {
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  );
  const tauriConfig = JSON.parse(
    await readFile(
      path.join(projectRoot, "src-tauri", "tauri.conf.json"),
      "utf8",
    ),
  );
  const cargoToml = await readFile(
    path.join(projectRoot, "src-tauri", "Cargo.toml"),
    "utf8",
  );
  const versions = {
    package: packageJson.version,
    tauri: tauriConfig.version,
    cargo: cargoVersion(cargoToml),
  };
  if (new Set(Object.values(versions)).size !== 1) {
    throw new Error(`发布版本号不一致：${JSON.stringify(versions)}`);
  }
  const channel = packageJson.weatherPoem?.releaseChannel;
  if (!["trial", "production"].includes(channel)) {
    throw new Error(
      "package.json weatherPoem.releaseChannel 必须是 trial 或 production",
    );
  }

  const version = versions.package;
  const definitions = [
    {
      kind: "portable",
      name: "weatherpoem.exe",
      relativePath: "src-tauri/target/release/weatherpoem.exe",
    },
    {
      kind: "nsis",
      name: `WeatherPoem_${version}_x64-setup.exe`,
      relativePath:
        `src-tauri/target/release/bundle/nsis/` +
        `WeatherPoem_${version}_x64-setup.exe`,
    },
    {
      kind: "msi",
      name: `WeatherPoem_${version}_x64_en-US.msi`,
      relativePath:
        `src-tauri/target/release/bundle/msi/` +
        `WeatherPoem_${version}_x64_en-US.msi`,
    },
  ];
  const checksumPath = path.join(
    projectRoot,
    "output",
    `WeatherPoem_${version}_SHA256.txt`,
  );
  const checksumSource = await readFile(checksumPath, "utf8");
  const expectedChecksums = checksumEntries(checksumSource);

  const artifacts = await Promise.all(
    definitions.map(async (definition) => {
      const absolutePath = path.join(
        projectRoot,
        definition.relativePath,
      );
      const metadata = await stat(absolutePath);
      if (!metadata.isFile() || metadata.size < 1_000_000) {
        throw new Error(
          `发布物缺失或尺寸异常：${definition.relativePath}`,
        );
      }
      const hash = await sha256(absolutePath);
      const expected = expectedChecksums.get(definition.name);
      if (!expected) {
        throw new Error(`校验和清单缺少：${definition.name}`);
      }
      if (hash !== expected) {
        throw new Error(
          `SHA-256 不一致：${definition.name}\n期望 ${expected}\n实际 ${hash}`,
        );
      }
      return {
        ...definition,
        absolutePath,
        size: metadata.size,
        sha256: hash,
        signature: await inspectAuthenticode(
          projectRoot,
          absolutePath,
        ),
      };
    }),
  );

  if (expectedChecksums.size !== artifacts.length) {
    throw new Error("SHA-256 清单包含未识别或重复的发布物");
  }

  return {
    product: tauriConfig.productName,
    identifier: tauriConfig.identifier,
    version,
    channel,
    generatedDate: generatedDate(checksumSource),
    artifacts,
  };
}

function productionUrl(baseUrl, name) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("正式发布下载基地址必须是无内嵌凭据的 HTTPS URL");
  }
  const pathname = base.pathname.endsWith("/")
    ? base.pathname
    : `${base.pathname}/`;
  base.pathname = `${pathname}${encodeURIComponent(name)}`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

function manifestArtifact(artifact, channel, baseUrl) {
  return {
    kind: artifact.kind,
    name: artifact.name,
    size: artifact.size,
    sha256: artifact.sha256,
    downloadUrl:
      channel === "production"
        ? productionUrl(baseUrl, artifact.name)
        : null,
    signature: artifact.signature,
  };
}

export function createReleaseManifest(
  state,
  { baseUrl, allowedThumbprints = new Set() } = {},
) {
  const production = state.channel === "production";
  if (production) {
    if (!baseUrl) throw new Error("正式发布清单缺少 HTTPS 下载基地址");
    for (const artifact of state.artifacts) {
      if (artifact.signature.status !== "Valid") {
        throw new Error(`正式发布物签名无效：${artifact.name}`);
      }
      if (!artifact.signature.timestampThumbprint) {
        throw new Error(`正式发布物缺少可信时间戳：${artifact.name}`);
      }
      if (
        !allowedThumbprints.has(
          normalizeThumbprint(
            artifact.signature.signerThumbprint,
          ),
        )
      ) {
        throw new Error(`正式发布物签名证书不在允许列表：${artifact.name}`);
      }
    }
  } else {
    for (const artifact of state.artifacts) {
      if (artifact.signature.status !== "NotSigned") {
        throw new Error(
          `trial 渠道必须明确保持未签名状态，检测到：${artifact.name} ${artifact.signature.status}`,
        );
      }
    }
  }

  return {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    product: state.product,
    identifier: state.identifier,
    version: state.version,
    channel: state.channel,
    generatedDate: state.generatedDate,
    trustLevel: production
      ? "signed-production"
      : "unsigned-trial",
    notice: production
      ? "已通过项目允许的 Authenticode 证书和时间戳门禁。"
      : TRIAL_NOTICE,
    artifacts: state.artifacts.map((artifact) =>
      manifestArtifact(artifact, state.channel, baseUrl),
    ),
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertManifestMatches(
  actual,
  expected,
  { productionRequired = false } = {},
) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      "发布清单与当前版本、哈希、尺寸或 Authenticode 状态不一致",
    );
  }
  if (productionRequired && actual.channel !== "production") {
    throw new Error(
      "当前是 unsigned-trial 试用渠道，不能通过正式发布门禁",
    );
  }
  return true;
}

export function assertNsisLifecycleEvidence(report, state) {
  const nsisArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "nsis",
  );
  if (!nsisArtifact) {
    throw new Error("发布状态中缺少 NSIS 安装包");
  }
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== state.product ||
    report?.version !== state.version ||
    report?.result !== "passed"
  ) {
    throw new Error("NSIS 生命周期证据的版本、产品或结果无效");
  }
  if (
    report?.installer?.sha256 !== nsisArtifact.sha256 ||
    report?.installer?.authenticodeStatus !==
      nsisArtifact.signature.status
  ) {
    throw new Error(
      "NSIS 生命周期证据与当前安装包哈希或签名状态不一致",
    );
  }
  const testedAt = Date.parse(report.testedAt);
  if (
    !Number.isFinite(testedAt) ||
    testedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error("NSIS 生命周期证据的执行时间无效");
  }
  const requiredPasses = [
    "silentInstall",
    "uninstallRegistration",
    "installedLaunch",
    "silentUninstall",
    "installDirectoryRemoved",
    "uninstallRegistrationRemoved",
    "shortcutResidue",
    "autostartResidue",
  ];
  if (
    requiredPasses.some(
      (name) => report?.checks?.[name] !== "passed",
    ) ||
    report?.checks?.installedExecutableCount !== 1 ||
    report?.checks?.uninstallExecutableCount !== 1 ||
    report?.checks?.installedLaunchSeconds < 6
  ) {
    throw new Error("NSIS 生命周期证据缺少必需的通过项");
  }
  if (
    report?.isolation?.existingInstallationProtected !== true ||
    report?.isolation?.applicationDataDeleted !== false
  ) {
    throw new Error("NSIS 生命周期证据没有遵守环境与用户数据保护边界");
  }
  return true;
}

export function assertMsiImageEvidence(report, state) {
  const msiArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "msi",
  );
  if (!msiArtifact) {
    throw new Error("发布状态中缺少 MSI 安装包");
  }
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== state.product ||
    report?.version !== state.version ||
    report?.scope !== "administrative-image-extraction" ||
    report?.result !== "passed"
  ) {
    throw new Error("MSI image 证据的版本、产品、范围或结果无效");
  }
  if (
    report?.package?.sha256 !== msiArtifact.sha256 ||
    report?.package?.authenticodeStatus !==
      msiArtifact.signature.status ||
    report?.package?.wixInstallScope !== "perMachine"
  ) {
    throw new Error(
      "MSI image 证据与当前安装包哈希、签名或安装范围不一致",
    );
  }
  const testedAt = Date.parse(report.testedAt);
  if (
    !Number.isFinite(testedAt) ||
    testedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error("MSI image 证据的执行时间无效");
  }
  if (
    report?.limitations?.realInstallTested !== false ||
    report?.limitations?.repairTested !== false ||
    report?.limitations?.uninstallTested !== false ||
    !report?.limitations?.reason
  ) {
    throw new Error("MSI image 证据必须明确保留管理员安装测试限制");
  }
  const requiredPasses = [
    "administrativeImage",
    "payloadLaunch",
    "installRegistrationResidue",
    "shortcutResidue",
    "autostartResidue",
    "extractionCleanup",
  ];
  if (
    requiredPasses.some(
      (name) => report?.checks?.[name] !== "passed",
    ) ||
    ![0, 3010].includes(report?.checks?.msiexecExitCode) ||
    report?.checks?.payloadExecutableCount !== 1 ||
    report?.checks?.payloadLaunchSeconds < 6 ||
    !/^[A-F0-9]{64}$/.test(
      report?.checks?.payloadExecutableSha256 ?? "",
    )
  ) {
    throw new Error("MSI image 证据缺少必需的通过项");
  }
  if (
    report?.isolation?.existingInstallationProtected !== true ||
    report?.isolation?.temporaryExtractRootRemoved !== true ||
    report?.isolation?.applicationDataDeleted !== false
  ) {
    throw new Error("MSI image 证据没有遵守环境与用户数据保护边界");
  }
  return true;
}

export function assertMsiElevatedLifecycleEvidence(report, state) {
  const msiArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "msi",
  );
  const portableArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "portable",
  );
  if (!msiArtifact || !portableArtifact) {
    throw new Error("发布状态中缺少 MSI 安装包或便携 EXE");
  }
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== state.product ||
    report?.version !== state.version ||
    report?.scope !==
      "elevated-per-machine-install-repair-uninstall" ||
    report?.result !== "passed"
  ) {
    throw new Error(
      "管理员 MSI 生命周期证据的版本、产品、范围或结果无效",
    );
  }
  if (
    report?.package?.sha256 !== msiArtifact.sha256 ||
    report?.package?.authenticodeStatus !==
      msiArtifact.signature.status ||
    report?.package?.wixInstallScope !== "perMachine"
  ) {
    throw new Error(
      "管理员 MSI 生命周期证据与当前安装包哈希、签名或范围不一致",
    );
  }
  if (
    report?.installedExecutable?.sha256 !==
      portableArtifact.sha256 ||
    report?.installedExecutable?.authenticodeStatus !==
      portableArtifact.signature.status ||
    !path.win32.isAbsolute(report?.installedExecutable?.path ?? "")
  ) {
    throw new Error(
      "管理员 MSI 生命周期证据的已安装程序与当前 EXE 不一致",
    );
  }
  const testedAt = Date.parse(report.testedAt);
  if (
    !Number.isFinite(testedAt) ||
    testedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error("管理员 MSI 生命周期证据的执行时间无效");
  }
  if (
    report?.administrator !== true ||
    !/^\{[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}\}$/.test(
      report?.installation?.productCode ?? "",
    ) ||
    !path.win32.isAbsolute(
      report?.installation?.installLocation ?? "",
    ) ||
    report?.installation?.logFiles?.length !== 3 ||
    report.installation.logFiles.some(
      (logPath) => !path.win32.isAbsolute(logPath),
    )
  ) {
    throw new Error(
      "管理员 MSI 生命周期证据缺少提升权限、产品代码或日志",
    );
  }
  const requiredPasses = [
    "elevatedSession",
    "perMachineInstall",
    "uninstallRegistration",
    "installedLaunch",
    "repair",
    "repairedExecutableHash",
    "uninstall",
    "installDirectoryRemoved",
    "uninstallRegistrationRemoved",
    "shortcutResidue",
    "autostartResidue",
    "processResidue",
  ];
  if (
    requiredPasses.some(
      (name) => report?.checks?.[name] !== "passed",
    ) ||
    report?.checks?.installExitCode !== 0 ||
    report?.checks?.repairExitCode !== 0 ||
    report?.checks?.uninstallExitCode !== 0 ||
    report?.checks?.installedExecutableCount !== 1 ||
    report?.checks?.installedLaunchSeconds < 6
  ) {
    throw new Error(
      "管理员 MSI 生命周期证据缺少必需的安装、修复或卸载通过项",
    );
  }
  if (
    report?.isolation?.existingInstallationProtected !== true ||
    report?.isolation?.explicitLifecycleConfirmation !== true ||
    report?.isolation?.cleanupAttempted !== true ||
    report?.isolation?.applicationDataDeleted !== false ||
    report?.isolation?.preexistingApplicationDataPreserved !== true
  ) {
    throw new Error(
      "管理员 MSI 生命周期证据没有遵守环境与用户数据保护边界",
    );
  }
  return true;
}

export function assertNsisUpgradeRollbackEvidence(
  report,
  state,
  baselineArtifact,
) {
  const nsisArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "nsis",
  );
  const portableArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "portable",
  );
  if (!nsisArtifact || !portableArtifact) {
    throw new Error("发布状态中缺少 NSIS 安装包或便携 EXE");
  }
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== state.product ||
    report?.version !== state.version ||
    report?.scope !== "nsis-in-place-upgrade-manual-rollback" ||
    report?.result !== "passed"
  ) {
    throw new Error("NSIS 升级回滚证据的版本、产品、范围或结果无效");
  }
  if (
    compareDottedVersions(
      report?.baseline?.version,
      state.version,
    ) >= 0 ||
    baselineArtifact?.version !== report.baseline.version ||
    report.baseline.installerName !== baselineArtifact.name ||
    report.baseline.installerSha256 !== baselineArtifact.sha256 ||
    report.baseline.authenticodeStatus !==
      baselineArtifact.signature.status ||
    !/^[A-F0-9]{64}$/.test(
      report.baseline.installedPayloadSha256 ?? "",
    )
  ) {
    throw new Error("NSIS 升级回滚证据与基线包或基线版本不一致");
  }
  if (
    report?.target?.version !== state.version ||
    report?.target?.installerName !== nsisArtifact.name ||
    report?.target?.installerSha256 !== nsisArtifact.sha256 ||
    report?.target?.authenticodeStatus !==
      nsisArtifact.signature.status ||
    report?.target?.installedPayloadSha256 !==
      portableArtifact.sha256 ||
    report?.target?.installedPayloadAuthenticodeStatus !==
      portableArtifact.signature.status
  ) {
    throw new Error("NSIS 升级回滚证据与当前安装包或 EXE 不一致");
  }
  const testedAt = Date.parse(report.testedAt);
  if (
    !Number.isFinite(testedAt) ||
    testedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error("NSIS 升级回滚证据的执行时间无效");
  }
  if (
    report?.limitations?.automaticUpdaterTested !== false ||
    report?.limitations?.msiUpgradeTested !== false ||
    report?.limitations?.rollbackMethod !==
      "baseline-nsis-reinstall" ||
    report?.limitations?.contentWithdrawalTested !== false
  ) {
    throw new Error("NSIS 升级回滚证据没有诚实保留测试范围限制");
  }
  const requiredPasses = [
    "baselineInstall",
    "baselineRegistration",
    "baselineLaunch",
    "targetInPlaceUpgrade",
    "targetRegistration",
    "targetPayloadMatchesRelease",
    "targetLaunch",
    "userDataMarkerAfterUpgrade",
    "baselineManualRollback",
    "rollbackRegistration",
    "rollbackPayloadRestored",
    "rollbackLaunch",
    "userDataMarkerAfterRollback",
    "finalUninstall",
    "installDirectoryRemoved",
    "uninstallRegistrationRemoved",
    "shortcutResidue",
    "autostartResidue",
    "processResidue",
    "controlledTestDataCleanup",
  ];
  if (
    requiredPasses.some(
      (name) => report?.checks?.[name] !== "passed",
    ) ||
    report?.checks?.baselineLaunchSeconds < 6 ||
    report?.checks?.targetLaunchSeconds < 6 ||
    report?.checks?.rollbackLaunchSeconds < 6
  ) {
    throw new Error("NSIS 升级回滚证据缺少必需的通过项");
  }
  if (
    report?.isolation?.explicitLifecycleConfirmation !== true ||
    report?.isolation?.existingInstallationProtected !== true ||
    report?.isolation?.applicationDataAbsentBefore !== true ||
    report?.isolation?.preexistingApplicationDataDeleted !==
      false ||
    report?.isolation?.controlledMarkerPreservedThroughRollback !==
      true ||
    report?.isolation?.controlledTestDataRemoved !== true ||
    report?.isolation?.temporaryInstallRootRemoved !== true
  ) {
    throw new Error("NSIS 升级回滚证据没有遵守用户数据保护边界");
  }
  return true;
}

export function assertSingleInstanceEvidence(report, state) {
  const portableArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "portable",
  );
  if (!portableArtifact) {
    throw new Error("发布状态中缺少便携 EXE");
  }
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== state.product ||
    report?.version !== state.version ||
    report?.result !== "passed"
  ) {
    throw new Error("单实例证据的版本、产品或结果无效");
  }
  if (
    report?.executable?.sha256 !== portableArtifact.sha256 ||
    report?.executable?.authenticodeStatus !==
      portableArtifact.signature.status
  ) {
    throw new Error(
      "单实例证据与当前便携 EXE 哈希或签名状态不一致",
    );
  }
  const testedAt = Date.parse(report.testedAt);
  if (
    !Number.isFinite(testedAt) ||
    testedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error("单实例证据的执行时间无效");
  }
  const requiredPasses = [
    "primaryWindowVisible",
    "closeRequestHidesToTray",
    "primaryRemainsRunningAfterClose",
    "secondaryExited",
    "singleProcessAfterSecondary",
    "secondaryRevealsPrimary",
  ];
  if (
    requiredPasses.some(
      (name) => report?.checks?.[name] !== "passed",
    ) ||
    report?.checks?.secondaryExitCode !== 0
  ) {
    throw new Error("单实例证据缺少必需的通过项");
  }
  return true;
}

export function assertAutostartRebootEvidence(report, state) {
  const portableArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "portable",
  );
  if (!portableArtifact) {
    throw new Error("发布状态中缺少便携 EXE");
  }
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== state.product ||
    report?.version !== state.version ||
    report?.scope !== "real-os-restart-enable-disable" ||
    report?.result !== "passed"
  ) {
    throw new Error(
      "开机自启动重启证据的版本、产品、范围或结果无效",
    );
  }
  if (
    report?.executable?.sha256 !== portableArtifact.sha256 ||
    report?.executable?.authenticodeStatus !==
      portableArtifact.signature.status ||
    report?.executable?.name !== "weatherpoem.exe" ||
    !/^[A-F0-9]{64}$/.test(
      report?.executable?.pathSha256 ?? "",
    )
  ) {
    throw new Error(
      "开机自启动重启证据与当前 EXE 哈希、签名或路径绑定不一致",
    );
  }
  const testedAt = Date.parse(report.testedAt);
  if (
    !Number.isFinite(testedAt) ||
    testedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error("开机自启动重启证据的执行时间无效");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      report?.testId ?? "",
    ) ||
    !/^[A-F0-9]{64}$/.test(
      report?.machine?.bindingSha256 ?? "",
    ) ||
    !/^[A-F0-9]{64}$/.test(
      report?.machine?.userBindingSha256 ?? "",
    )
  ) {
    throw new Error(
      "开机自启动重启证据缺少有效的测试、机器或用户身份",
    );
  }
  const enabledBefore = Date.parse(
    report?.enabledPhase?.bootBefore,
  );
  const enabledAfter = Date.parse(
    report?.enabledPhase?.bootAfter,
  );
  const enabledProcessAt = Date.parse(
    report?.enabledPhase?.process?.startedAt,
  );
  const disabledBefore = Date.parse(
    report?.disabledPhase?.bootBefore,
  );
  const disabledAfter = Date.parse(
    report?.disabledPhase?.bootAfter,
  );
  if (
    ![
      enabledBefore,
      enabledAfter,
      enabledProcessAt,
      disabledBefore,
      disabledAfter,
    ].every(Number.isFinite) ||
    enabledAfter <= enabledBefore ||
    enabledProcessAt < enabledAfter ||
    disabledAfter <= disabledBefore ||
    report?.disabledPhase?.observationSeconds < 5
  ) {
    throw new Error(
      "开机自启动重启证据没有证明两次真实重启与启动时序",
    );
  }
  if (
    report?.enabledPhase?.process?.executablePathSha256 !==
      report.executable.pathSha256 ||
    !/^[A-F0-9]{64}$/.test(
      report?.enabledPhase?.process?.commandLineSha256 ?? "",
    ) ||
    report?.enabledPhase?.process?.autostartArgumentObserved !==
      true ||
    report?.enabledPhase?.autostart?.targetExecutableObserved !==
      true ||
    report?.enabledPhase?.autostart?.autostartArgumentObserved !==
      true ||
    !/^[A-F0-9]{64}$/.test(
      report?.enabledPhase?.autostart?.registrationValueSha256 ??
        "",
    )
  ) {
    throw new Error(
      "开机自启动重启证据没有证明同一程序以 --autostart 启动",
    );
  }
  const requiredPasses = [
    "enabledRegistration",
    "restartAfterEnable",
    "launchAfterEnabledRestart",
    "launchCommandContainsAutostart",
    "sameInstalledExecutable",
    "disabledRegistration",
    "restartAfterDisable",
    "noLaunchAfterDisabledRestart",
  ];
  if (
    requiredPasses.some(
      (name) => report?.checks?.[name] !== "passed",
    ) ||
    report?.enabledPhase?.checks?.autostartRegistration !==
      "passed" ||
    report?.enabledPhase?.checks?.restartOccurred !== "passed" ||
    report?.enabledPhase?.checks?.processStartedAfterRestart !==
      "passed" ||
    report?.disabledPhase?.checks?.autostartRegistrationAbsent !==
      "passed" ||
    report?.disabledPhase?.checks?.restartOccurred !== "passed" ||
    report?.disabledPhase?.checks?.processRemainedAbsent !==
      "passed"
  ) {
    throw new Error(
      "开机自启动重启证据缺少必需的启用或禁用通过项",
    );
  }
  if (
    report?.isolation?.autostartStateChangedByScript !== false ||
    report?.isolation?.rebootTriggeredByScript !== false ||
    report?.isolation?.applicationDataDeleted !== false
  ) {
    throw new Error(
      "开机自启动重启证据没有遵守只读观察与数据保护边界",
    );
  }
  return true;
}

export function assertWindowPositionEvidence(report, state) {
  const portableArtifact = state.artifacts.find(
    (artifact) => artifact.kind === "portable",
  );
  if (!portableArtifact) {
    throw new Error("发布状态中缺少便携 EXE");
  }
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== state.product ||
    report?.version !== state.version ||
    report?.result !== "passed"
  ) {
    throw new Error("窗口定位证据的版本、产品或结果无效");
  }
  if (
    report?.executable?.sha256 !== portableArtifact.sha256 ||
    report?.executable?.authenticodeStatus !==
      portableArtifact.signature.status
  ) {
    throw new Error(
      "窗口定位证据与当前便携 EXE 哈希或签名状态不一致",
    );
  }
  const testedAt = Date.parse(report.testedAt);
  if (
    !Number.isFinite(testedAt) ||
    testedAt > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error("窗口定位证据的执行时间无效");
  }
  const display = report?.displayObservation;
  if (
    !Number.isInteger(display?.logicalDisplayCount) ||
    display.logicalDisplayCount < 1 ||
    !Number.isInteger(display?.physicalMonitorProbeCount) ||
    display.physicalMonitorProbeCount < 1 ||
    display?.logicalScreens?.length !== display.logicalDisplayCount ||
    display?.windowDpi < 96
  ) {
    throw new Error("窗口定位证据的显示环境无效");
  }
  if (
    display.extendedDesktopTested !==
    (display.logicalDisplayCount > 1)
  ) {
    throw new Error("窗口定位证据错误声明了扩展桌面覆盖");
  }
  const expectedMargin = Math.round(
    (22 * display.windowDpi) / 96,
  );
  const position = report.position;
  if (
    position?.expectedMargin !== expectedMargin ||
    position?.tolerance < 0 ||
    Math.abs(
      position.actualRightGap - position.expectedMargin,
    ) > position.tolerance ||
    Math.abs(
      position.actualBottomGap - position.expectedMargin,
    ) > position.tolerance
  ) {
    throw new Error("窗口定位证据的右下角边距不合格");
  }
  const requiredPasses = [
    "currentMonitorDetected",
    "bottomRightMargin",
    "insideWorkingArea",
    "closeRequestHidesToTray",
    "processRemainsAfterClose",
  ];
  if (
    requiredPasses.some(
      (name) => report?.checks?.[name] !== "passed",
    )
  ) {
    throw new Error("窗口定位证据缺少必需的通过项");
  }
  if (
    display.logicalDisplayCount === 1 &&
    report?.limitations?.extendedDesktopCrossMonitor !==
      "not-available-one-logical-display"
  ) {
    throw new Error("窗口定位证据没有诚实记录跨显示器限制");
  }
  return true;
}

export function serializeReleaseManifest(value) {
  return stableJson(value);
}
