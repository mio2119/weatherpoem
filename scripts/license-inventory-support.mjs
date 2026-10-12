import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";

export const LICENSE_INVENTORY_PATH =
  "review/content-asset-license-inventory.json";
export const LICENSE_INVENTORY_SCHEMA = "1.1";
export const WINDOWS_TARGET = "x86_64-pc-windows-msvc";
const OPEN_METEO_LICENSE_URL =
  "https://open-meteo.com/en/license";
const NOTICE_RESOURCE_SOURCE =
  "../docs/THIRD_PARTY_NOTICES.md";
const NOTICE_RESOURCE_TARGET =
  "licenses/THIRD_PARTY_NOTICES.md";

const PROJECT_LICENSE_CANDIDATES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "COPYING",
  "COPYING.md",
  "NOTICE",
  "NOTICE.md",
];

const FONT_EXTENSIONS = new Set([
  ".eot",
  ".otf",
  ".ttc",
  ".ttf",
  ".woff",
  ".woff2",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex")
    .toUpperCase();
}

function normalizeRelative(projectRoot, absolutePath) {
  return path
    .relative(projectRoot, absolutePath)
    .split(path.sep)
    .join("/");
}

async function listFiles(rootPath) {
  if (!(await exists(rootPath))) return [];
  const output = [];
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await listFiles(absolute)));
    } else if (entry.isFile()) {
      output.push(absolute);
    }
  }
  return output;
}

function npmPackageName(packagePath, metadata) {
  if (typeof metadata.name === "string" && metadata.name.trim()) {
    return metadata.name;
  }
  const segments = packagePath.split("/");
  const nodeModulesIndex = segments.lastIndexOf("node_modules");
  const packageSegments = segments.slice(nodeModulesIndex + 1);
  return packageSegments[0]?.startsWith("@")
    ? `${packageSegments[0]}/${packageSegments[1]}`
    : packageSegments[0];
}

function summarizeLicenses(packages) {
  const counts = new Map();
  for (const item of packages) {
    counts.set(item.license, (counts.get(item.license) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([expression, packageCount]) => ({
      expression,
      packageCount,
    }))
    .sort((left, right) =>
      left.expression.localeCompare(right.expression),
    );
}

function runCargoMetadata(projectRoot) {
  const result = spawnSync(
    "cargo",
    [
      "metadata",
      "--manifest-path",
      path.join(projectRoot, "src-tauri", "Cargo.toml"),
      "--format-version",
      "1",
      "--locked",
      "--offline",
      "--filter-platform",
      WINDOWS_TARGET,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `无法离线读取 Cargo 许可元数据：${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout);
}

function countPopulated(items, field) {
  return items.filter((item) => {
    const value = item[field];
    return Array.isArray(value)
      ? value.length > 0
      : typeof value === "string" && value.trim().length > 0;
  }).length;
}

export async function collectLicenseInventoryInputs(projectRoot) {
  const readJson = async (relativePath) =>
    JSON.parse(
      await readFile(path.join(projectRoot, relativePath), "utf8"),
    );
  const [
    packageJson,
    packageLock,
    cargoAudit,
    contentCatalog,
    tauriConfig,
    capability,
    settingsPanelSource,
    desktopServiceSource,
    rustShellSource,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readJson("output/WeatherPoem_0.2.0_CARGO_AUDIT.json"),
    readJson("review/content-review-catalog.json"),
    readJson("src-tauri/tauri.conf.json"),
    readJson("src-tauri/capabilities/default.json"),
    readFile(
      path.join(projectRoot, "src/components/SettingsPanel.vue"),
      "utf8",
    ),
    readFile(
      path.join(projectRoot, "src/services/desktop.ts"),
      "utf8",
    ),
    readFile(
      path.join(projectRoot, "src-tauri/src/lib.rs"),
      "utf8",
    ),
  ]);

  const npmPackages = Object.entries(packageLock.packages)
    .filter(([packagePath]) => packagePath !== "")
    .map(([packagePath, metadata]) => ({
      name: npmPackageName(packagePath, metadata),
      version: metadata.version,
      license: metadata.license ?? null,
      resolved: metadata.resolved ?? null,
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.version.localeCompare(right.version),
    );

  const cargoMetadata = runCargoMetadata(projectRoot);
  const targetKeys = new Set(
    cargoAudit.targetResolution.packages.map(
      (item) => `${item.name}@${item.version}`,
    ),
  );
  const cargoPackages = cargoMetadata.packages
    .filter(
      (item) =>
        item.name !== packageJson.name &&
        targetKeys.has(`${item.name}@${item.version}`),
    )
    .map((item) => ({
      name: item.name,
      version: item.version,
      license: item.license ?? null,
      source: item.source ?? null,
      repository: item.repository ?? null,
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.version.localeCompare(right.version),
    );

  const projectLicenseFiles = [];
  for (const relativePath of PROJECT_LICENSE_CANDIDATES) {
    const absolute = path.join(projectRoot, relativePath);
    if (await exists(absolute)) projectLicenseFiles.push(relativePath);
  }

  const fontFiles = [];
  for (const relativeRoot of ["src", "public", "src-tauri/icons"]) {
    const absoluteRoot = path.join(projectRoot, relativeRoot);
    for (const absolutePath of await listFiles(absoluteRoot)) {
      if (FONT_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
        fontFiles.push(normalizeRelative(projectRoot, absolutePath));
      }
    }
  }
  fontFiles.sort();

  const iconFiles = [];
  for (const absolutePath of await listFiles(
    path.join(projectRoot, "src-tauri", "icons"),
  )) {
    const fileStat = await stat(absolutePath);
    iconFiles.push({
      path: normalizeRelative(projectRoot, absolutePath),
      bytes: fileStat.size,
      sha256: await sha256File(absolutePath),
    });
  }
  iconFiles.sort((left, right) => left.path.localeCompare(right.path));

  const works = contentCatalog.works;
  const sourceNames = [...new Set(works.map((item) => item.sourceName))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const annotationCount = works.reduce(
    (sum, item) => sum + (item.annotations?.length ?? 0),
    0,
  );

  const hashedInputs = {};
  for (const [key, relativePath] of Object.entries({
    packageJson: "package.json",
    packageLock: "package-lock.json",
    cargoLock: "src-tauri/Cargo.lock",
    cargoAudit:
      "output/WeatherPoem_0.2.0_CARGO_AUDIT.json",
    contentCatalog: "review/content-review-catalog.json",
    iconSource: "src-tauri/icons/app-icon.svg",
    iconPng: "src-tauri/icons/icon.png",
    iconIco: "src-tauri/icons/icon.ico",
    inlineIcons: "src/components/IconSymbol.vue",
    styles: "src/styles.css",
    settingsPanel: "src/components/SettingsPanel.vue",
    desktopService: "src/services/desktop.ts",
    tauriConfig: "src-tauri/tauri.conf.json",
    capability: "src-tauri/capabilities/default.json",
    rustShell: "src-tauri/src/lib.rs",
  })) {
    hashedInputs[key] = {
      path: relativePath,
      sha256: await sha256File(path.join(projectRoot, relativePath)),
    };
  }

  return {
    packageJson,
    packageLock,
    cargoAudit,
    contentCatalog,
    npmPackages,
    cargoPackages,
    projectLicenseFiles,
    fontFiles,
    iconFiles,
    sourceNames,
    contentCounts: {
      workCount: works.length,
      sourceNamePopulated: countPopulated(works, "sourceName"),
      oneLineSummaryPopulated: countPopulated(
        works,
        "oneLineSummary",
      ),
      culturalBackgroundPopulated: countPopulated(
        works,
        "culturalBackground",
      ),
      contemporaryConnectionPopulated: countPopulated(
        works,
        "contemporaryConnection",
      ),
      annotationCount,
    },
    implementationChecks: {
      openMeteoAttribution:
        settingsPanelSource.includes("Open-Meteo") &&
        settingsPanelSource.includes("CC BY 4.0") &&
        settingsPanelSource.includes(
          "把天气代码映射为中文情境",
        ) &&
        settingsPanelSource.includes("不改写接口返回的温度") &&
        desktopServiceSource.includes(OPEN_METEO_LICENSE_URL) &&
        capability.permissions.some(
          (item) =>
            typeof item === "object" &&
            item.identifier === "opener:allow-open-url" &&
            item.allow?.some(
              (entry) => entry.url === OPEN_METEO_LICENSE_URL,
            ),
        ),
      noticeBundleConfigured:
        tauriConfig.bundle?.resources?.[
          NOTICE_RESOURCE_SOURCE
        ] === NOTICE_RESOURCE_TARGET &&
        rustShellSource.includes(
          '.join("THIRD_PARTY_NOTICES.md")',
        ) &&
        rustShellSource.includes(
          "fn open_third_party_notices",
        ),
    },
    hashedInputs,
  };
}

export function buildLicenseInventory(inputs, generatedAt) {
  const npmMissing = inputs.npmPackages.filter((item) => !item.license);
  const cargoMissing = inputs.cargoPackages.filter(
    (item) => !item.license,
  );
  return {
    schemaVersion: LICENSE_INVENTORY_SCHEMA,
    product: "WeatherPoem",
    appVersion: inputs.packageJson.version,
    contentVersion: inputs.contentCatalog.contentVersion,
    generatedAt,
    status: "inventory-ready-awaiting-legal-review",
    scope: {
      target: WINDOWS_TARGET,
      distributionDecision: "public-release-not-cleared",
      legalConclusionProvided: false,
      note: "本台账只固化来源、许可表达式和待决事项，不构成法律意见或授权。",
    },
    inputs: inputs.hashedInputs,
    projectCode: {
      packageName: inputs.packageJson.name,
      packagePrivate: inputs.packageJson.private === true,
      declaredLicense: inputs.packageJson.license ?? null,
      rootLicenseFiles: inputs.projectLicenseFiles,
      publicDistributionCleared: false,
      requiredAction:
        "由项目权利主体确认代码与文档权属，选择发布许可并提交根目录 LICENSE/NOTICE。",
    },
    classicalContent: {
      workCount: inputs.contentCounts.workCount,
      sourceNamePopulated:
        inputs.contentCounts.sourceNamePopulated,
      distinctSourceNames: inputs.sourceNames,
      underlyingAncientWorksCandidatePublicDomain: true,
      editionOrTranscriptionRightsVerified: false,
      expertTextualReviewCompleted: false,
      withdrawalMechanism:
        "使用现有内容撤回清单按 workId 停用并清除缓存。",
      publicDistributionCleared: false,
      requiredAction:
        "逐首绑定可追溯的权威点校底本、页码或无版权限制数字源，并由内容专家和法务复核具体转录版本。",
    },
    modernEditorialContent: {
      oneLineSummaryCount:
        inputs.contentCounts.oneLineSummaryPopulated,
      culturalBackgroundCount:
        inputs.contentCounts.culturalBackgroundPopulated,
      contemporaryConnectionCount:
        inputs.contentCounts.contemporaryConnectionPopulated,
      annotationCount: inputs.contentCounts.annotationCount,
      origin: "project-authored-candidate",
      namedOwnerConfirmed: false,
      thirdPartyMaterialExcludedByReview: false,
      publicDistributionCleared: false,
      requiredAction:
        "确认撰写者/委托关系与权利归属，检查是否改写第三方现代译注，并由内容与法务责任人签署。",
    },
    visualAssets: {
      appIcon: {
        sourcePath: "src-tauri/icons/app-icon.svg",
        generatedVariantCount: inputs.iconFiles.length - 1,
        files: inputs.iconFiles,
        origin: "repository-authored-candidate",
        namedOwnerConfirmed: false,
        publicDistributionCleared: false,
      },
      inlineUiAssets: {
        paths: [
          "src/components/IconSymbol.vue",
          "src/styles.css",
        ],
        externalImageDependencyDetected: false,
        origin: "code-native-candidate",
        namedOwnerConfirmed: false,
        publicDistributionCleared: false,
      },
      requiredAction:
        "由设计/项目权利主体确认图标和内联图形为原创或已获许可，并记录生成与交付链。",
    },
    fonts: {
      bundledFontFileCount: inputs.fontFiles.length,
      bundledFontFiles: inputs.fontFiles,
      cssStrategy:
        "system-font-fallback-only",
      referencedFamilies: [
        "Source Han Sans SC",
        "Microsoft YaHei UI",
        "PingFang SC",
        "Songti SC",
        "STSong",
        "Noto Serif SC",
        "FZKai-Z03",
        "KaiTi",
      ],
      redistributionRequiredForCurrentBuild: false,
      publicDistributionClearedForCurrentBuild:
        inputs.fontFiles.length === 0,
      requiredAction:
        "保持不打包字体；若未来内嵌字体，必须先登记具体文件、版本、许可文本与再分发范围。",
    },
    externalServices: [
      {
        id: "open-meteo",
        usage: "runtime-weather-forecast",
        enabledInCurrentClient: true,
        sourceUrl: "https://open-meteo.com/en/license",
        pricingUrl: "https://open-meteo.com/en/pricing",
        dataLicense: "CC BY 4.0",
        attributionRequired: true,
        attributionImplemented:
          inputs.implementationChecks.openMeteoAttribution,
        attributionLocation: "settings/version-and-trust",
        modificationsDisclosed:
          inputs.implementationChecks.openMeteoAttribution,
        serviceTierApproved: false,
        clientSecretBundled: false,
        publicDistributionCleared: false,
        requiredAction:
          "保留设置页的 Open-Meteo/CC BY 4.0 署名与转换说明；由项目负责人按非商业/商业用途确认服务档位。",
      },
      {
        id: "official-warning-gateway",
        usage: "optional-official-weather-warning",
        enabledInCurrentScope: false,
        providerSelected: false,
        dataLicenseConfirmed: false,
        publicDistributionCleared: false,
        requiredAction:
          "启用前选择合法数据提供方，取得授权，部署 HTTPS 网关并完成撤销链路。",
      },
      {
        id: "openai-api",
        usage: "optional-recommendation-reason-enhancement",
        enabledInCurrentScope: false,
        governingTermsUrl:
          "https://openai.com/policies/services-agreement/",
        organizationAgreementConfirmed: false,
        budgetApproved: false,
        publicDistributionCleared: false,
        requiredAction:
          "如启用，由组织确认适用条款、数据处理、密钥托管和预算；当前范围继续使用本地规则理由。",
      },
    ],
    thirdPartyDependencies: {
      npm: {
        scope: "locked-development-and-production-packages",
        packageCount: inputs.npmPackages.length,
        missingLicenseMetadataCount: npmMissing.length,
        licenseSummary: summarizeLicenses(inputs.npmPackages),
        packages: inputs.npmPackages,
      },
      cargo: {
        scope: `windows-target-normal-and-build:${WINDOWS_TARGET}`,
        packageCount: inputs.cargoPackages.length,
        missingLicenseMetadataCount: cargoMissing.length,
        licenseSummary: summarizeLicenses(inputs.cargoPackages),
        packages: inputs.cargoPackages,
      },
      noticeBundleConfigured:
        inputs.implementationChecks.noticeBundleConfigured,
      noticeBundleGenerated: false,
      noticeIncludedInCurrentInstaller: false,
      compatibilityReviewCompleted: false,
      publicDistributionCleared: false,
      requiredAction:
        "已配置下次构建把 NOTICE 作为固定资源随包提供；须补齐缺失文本，重建后验证安装包可访问，并由法务复核许可证兼容性和署名义务。",
    },
    blockingItems: [
      "project-root-license",
      "poetry-edition-provenance",
      "modern-editorial-ownership",
      "icon-ownership",
      "open-meteo-service-tier",
      "third-party-notice-text-gaps",
      "third-party-notice-installer-verification",
      "official-warning-license-if-enabled",
      "openai-terms-if-enabled",
      "named-legal-signoff",
    ],
    approval: {
      contentOwner: null,
      designOwner: null,
      dataServiceOwner: null,
      legalReviewer: null,
      decision: null,
      approvedAt: null,
      evidencePath:
        "review/evidence/RQT-23-content-asset-licenses.json",
    },
    limitations: {
      metadataPresenceIsNotLicenseCompatibilityReview: true,
      publicDomainWorkIsNotEditionClearance: true,
      disabledServiceIsNotFutureAuthorization: true,
      namedLegalReviewCompleted: false,
    },
    gateSatisfied: false,
    result: "automated-inventory-complete-human-clearance-pending",
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[A-F0-9]{64}$/.test(value);
}

export function validateLicenseInventory(inventory, inputs) {
  assert(
    inventory.schemaVersion === LICENSE_INVENTORY_SCHEMA &&
      inventory.product === "WeatherPoem" &&
      inventory.appVersion === inputs.packageJson.version &&
      inventory.contentVersion ===
        inputs.contentCatalog.contentVersion,
    "许可台账身份或版本无效",
  );
  assert(
    inventory.status ===
        "inventory-ready-awaiting-legal-review" &&
      inventory.scope.target === WINDOWS_TARGET &&
      inventory.scope.distributionDecision ===
        "public-release-not-cleared" &&
      inventory.scope.legalConclusionProvided === false,
    "许可台账不得冒充公开发布授权或法律结论",
  );
  const generatedAt = Date.parse(inventory.generatedAt);
  assert(
    Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 10 * 60 * 1000 &&
      generatedAt >= Date.now() - 31 * 24 * 60 * 60 * 1000,
    "许可台账生成时间无效或已过期",
  );
  for (const [key, expected] of Object.entries(inputs.hashedInputs)) {
    const actual = inventory.inputs[key];
    assert(
      actual?.path === expected.path &&
        actual.sha256 === expected.sha256 &&
        isSha256(actual.sha256),
      `许可台账未绑定当前输入：${key}`,
    );
  }
  assert(
    inventory.projectCode.declaredLicense === null &&
      inventory.projectCode.rootLicenseFiles.length === 0 &&
      inventory.projectCode.publicDistributionCleared === false,
    "项目自身 LICENSE 缺口被掩盖",
  );
  assert(
    inventory.classicalContent.workCount ===
        inputs.contentCounts.workCount &&
      inventory.classicalContent.sourceNamePopulated ===
        inputs.contentCounts.workCount &&
      inventory.classicalContent
        .underlyingAncientWorksCandidatePublicDomain === true &&
      inventory.classicalContent.editionOrTranscriptionRightsVerified ===
        false &&
      inventory.classicalContent.publicDistributionCleared === false,
    "古诗公版候选被错误等同为具体底本已获许可",
  );
  assert(
    inventory.modernEditorialContent.oneLineSummaryCount ===
        inputs.contentCounts.workCount &&
      inventory.modernEditorialContent.culturalBackgroundCount ===
        inputs.contentCounts.workCount &&
      inventory.modernEditorialContent
        .contemporaryConnectionCount === inputs.contentCounts.workCount &&
      inventory.modernEditorialContent.annotationCount ===
        inputs.contentCounts.annotationCount &&
      inventory.modernEditorialContent.namedOwnerConfirmed === false &&
      inventory.modernEditorialContent.publicDistributionCleared ===
        false,
    "现代解释数量或权属待确认状态不准确",
  );
  assert(
    JSON.stringify(inventory.visualAssets.appIcon.files) ===
        JSON.stringify(inputs.iconFiles) &&
      inventory.visualAssets.appIcon.namedOwnerConfirmed === false &&
      inventory.visualAssets.appIcon.publicDistributionCleared ===
        false &&
      inventory.visualAssets.inlineUiAssets
        .externalImageDependencyDetected === false,
    "图标资产清单、哈希或待确认状态不准确",
  );
  assert(
    inventory.fonts.bundledFontFileCount ===
        inputs.fontFiles.length &&
      JSON.stringify(inventory.fonts.bundledFontFiles) ===
        JSON.stringify(inputs.fontFiles) &&
      inventory.fonts.redistributionRequiredForCurrentBuild === false &&
      inventory.fonts.publicDistributionClearedForCurrentBuild ===
        (inputs.fontFiles.length === 0),
    "字体打包状态不准确",
  );
  const openMeteo = inventory.externalServices.find(
    (item) => item.id === "open-meteo",
  );
  assert(
    openMeteo?.sourceUrl ===
        "https://open-meteo.com/en/license" &&
      openMeteo.pricingUrl ===
        "https://open-meteo.com/en/pricing" &&
      openMeteo.dataLicense === "CC BY 4.0" &&
      openMeteo.attributionRequired === true &&
      openMeteo.attributionImplemented ===
        inputs.implementationChecks.openMeteoAttribution &&
      openMeteo.attributionImplemented === true &&
      openMeteo.modificationsDisclosed === true &&
      openMeteo.attributionLocation ===
        "settings/version-and-trust" &&
      openMeteo.serviceTierApproved === false &&
      openMeteo.publicDistributionCleared === false,
    "Open-Meteo 的署名、服务档位或公开分发缺口被掩盖",
  );
  const openAi = inventory.externalServices.find(
    (item) => item.id === "openai-api",
  );
  assert(
    openAi?.enabledInCurrentScope === false &&
      openAi.governingTermsUrl ===
        "https://openai.com/policies/services-agreement/" &&
      openAi.organizationAgreementConfirmed === false &&
      openAi.publicDistributionCleared === false,
    "可选 OpenAI 服务被错误视为当前已授权",
  );
  assert(
    inventory.thirdPartyDependencies.npm.packageCount ===
        inputs.npmPackages.length &&
      inventory.thirdPartyDependencies.npm
        .missingLicenseMetadataCount === 0 &&
      JSON.stringify(
        inventory.thirdPartyDependencies.npm.packages,
      ) === JSON.stringify(inputs.npmPackages) &&
      inventory.thirdPartyDependencies.cargo.packageCount ===
        inputs.cargoPackages.length &&
      inventory.thirdPartyDependencies.cargo
        .missingLicenseMetadataCount === 0 &&
      JSON.stringify(
        inventory.thirdPartyDependencies.cargo.packages,
      ) === JSON.stringify(inputs.cargoPackages) &&
      inventory.thirdPartyDependencies.noticeBundleConfigured ===
        inputs.implementationChecks.noticeBundleConfigured &&
      inventory.thirdPartyDependencies.noticeBundleConfigured ===
        true &&
      inventory.thirdPartyDependencies.noticeBundleGenerated ===
        false &&
      inventory.thirdPartyDependencies
        .noticeIncludedInCurrentInstaller === false &&
      inventory.thirdPartyDependencies.compatibilityReviewCompleted ===
        false,
    "第三方依赖许可元数据与当前锁文件或待复核状态不一致",
  );
  assert(
    inventory.blockingItems.length >= 10 &&
      inventory.blockingItems.includes("named-legal-signoff") &&
      Object.entries(inventory.approval)
        .filter(([key]) => key !== "evidencePath")
        .every(([, value]) => value === null) &&
      inventory.approval.evidencePath ===
        "review/evidence/RQT-23-content-asset-licenses.json" &&
      inventory.limitations.namedLegalReviewCompleted === false &&
      inventory.gateSatisfied === false &&
      inventory.result ===
        "automated-inventory-complete-human-clearance-pending",
    "机器生成台账不得伪造具名法务批准",
  );
  return {
    npmPackageCount: inputs.npmPackages.length,
    cargoPackageCount: inputs.cargoPackages.length,
    workCount: inputs.contentCounts.workCount,
    iconFileCount: inputs.iconFiles.length,
  };
}
