import { readFile } from "node:fs/promises";
import path from "node:path";
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
  collectNsisBaseline,
  collectReleaseState,
  createReleaseManifest,
  parseAllowedThumbprints,
} from "./release-support.mjs";
import {
  assertInstalledNoticeEvidence,
  collectNoticeSource,
} from "./installed-notice-support.mjs";

async function readEvidence(filePath, label) {
  try {
    return JSON.parse(
      (await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""),
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `${label}缺失：请先按文档完成真实设备测试并生成 ${path.basename(filePath)}`,
      );
    }
    throw error;
  }
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const productionRequired = process.argv.includes("--production");
const manualWindowsRequired =
  productionRequired || process.argv.includes("--manual-windows");
const upgradeRequired =
  productionRequired || process.argv.includes("--upgrade");
const state = await collectReleaseState(projectRoot);
const allowedThumbprints = parseAllowedThumbprints(
  process.env.WEATHERPOEM_ALLOWED_SIGNER_THUMBPRINTS,
);
const expected = createReleaseManifest(state, {
  baseUrl: process.env.WEATHERPOEM_RELEASE_BASE_URL,
  allowedThumbprints,
});
const manifestPath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_RELEASE.json`,
);
const actual = JSON.parse(await readFile(manifestPath, "utf8"));
const lifecyclePath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_NSIS_LIFECYCLE.json`,
);
const lifecycleReport = JSON.parse(
  (await readFile(lifecyclePath, "utf8")).replace(/^\uFEFF/, ""),
);
const msiImagePath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_MSI_IMAGE.json`,
);
const msiImageReport = JSON.parse(
  (await readFile(msiImagePath, "utf8")).replace(/^\uFEFF/, ""),
);
const singleInstancePath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_SINGLE_INSTANCE.json`,
);
const singleInstanceReport = JSON.parse(
  (await readFile(singleInstancePath, "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);
const windowPositionPath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_WINDOW_POSITION.json`,
);
const windowPositionReport = JSON.parse(
  (await readFile(windowPositionPath, "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);

assertManifestMatches(actual, expected, { productionRequired });
assertNsisLifecycleEvidence(lifecycleReport, state);
assertMsiImageEvidence(msiImageReport, state);
assertSingleInstanceEvidence(singleInstanceReport, state);
assertWindowPositionEvidence(windowPositionReport, state);

const manualEvidenceMessages = [];
if (manualWindowsRequired) {
  const msiElevatedPath = path.join(
    projectRoot,
    "output",
    `WeatherPoem_${state.version}_MSI_ELEVATED_LIFECYCLE.json`,
  );
  const autostartRebootPath = path.join(
    projectRoot,
    "output",
    `WeatherPoem_${state.version}_AUTOSTART_REBOOT.json`,
  );
  const msiElevatedReport = await readEvidence(
    msiElevatedPath,
    "管理员 MSI 生命周期证据",
  );
  const autostartRebootReport = await readEvidence(
    autostartRebootPath,
    "开机自启重启证据",
  );
  const installedNoticePath = path.join(
    projectRoot,
    "output",
    `WeatherPoem_${state.version}_INSTALLED_NOTICE.json`,
  );
  const installedNoticeReport = await readEvidence(
    installedNoticePath,
    "NSIS/MSI 安装后 NOTICE 证据",
  );
  const noticeSource = await collectNoticeSource(projectRoot);
  assertMsiElevatedLifecycleEvidence(msiElevatedReport, state);
  assertAutostartRebootEvidence(autostartRebootReport, state);
  assertInstalledNoticeEvidence(installedNoticeReport, {
    state,
    noticeSource,
  });
  manualEvidenceMessages.push(
    "管理员 MSI 安装、修复、卸载证据与当前安装包一致",
    "开机自启启用/禁用的两次真实重启证据与当前 EXE 一致",
    "NSIS 与 MSI 安装后的第三方 NOTICE 与当前源文件字节一致",
  );
}
if (upgradeRequired) {
  const upgradePath = path.join(
    projectRoot,
    "output",
    `WeatherPoem_${state.version}_NSIS_UPGRADE_ROLLBACK.json`,
  );
  const upgradeReport = await readEvidence(
    upgradePath,
    "NSIS 升级回滚证据",
  );
  const baseline = await collectNsisBaseline(
    projectRoot,
    upgradeReport?.baseline?.version,
    state.version,
  );
  assertNsisUpgradeRollbackEvidence(
    upgradeReport,
    state,
    baseline,
  );
  manualEvidenceMessages.push(
    "NSIS 基线升级、手动回滚和用户数据标记证据与当前安装包一致",
  );
}

console.log(
  [
    `WeatherPoem ${state.version} 发布门禁通过`,
    `渠道：${actual.channel}`,
    `可信级别：${actual.trustLevel}`,
    `发布物：${actual.artifacts.length} 个`,
    "版本、尺寸、SHA-256、Authenticode 状态与发布清单一致",
    "NSIS 安装、启动、卸载证据与当前安装包哈希一致",
    "MSI administrative image 证据与当前安装包哈希一致",
    "关闭到托盘与第二实例唤醒证据与当前 EXE 哈希一致",
    "当前逻辑显示区的右下角定位证据与当前 EXE 哈希一致",
    ...manualEvidenceMessages,
  ].join("；"),
);
