import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { applyCanonicalLicenseSources } from "./canonical-license-text-support.mjs";

export const THIRD_PARTY_NOTICE_INDEX =
  "review/third-party-notice-index.json";
export const THIRD_PARTY_NOTICE_DRAFT =
  "docs/THIRD_PARTY_NOTICES.md";
export const THIRD_PARTY_NOTICE_SCHEMA = "1.2";
export const THIRD_PARTY_NOTICE_TARGET =
  "x86_64-pc-windows-msvc";
const NOTICE_RESOURCE_SOURCE =
  "../docs/THIRD_PARTY_NOTICES.md";
const NOTICE_RESOURCE_TARGET =
  "licenses/THIRD_PARTY_NOTICES.md";

const NOTICE_FILE_PATTERN =
  /^(?:licen[cs]e|copying|notice|unlicense|copyright)(?:$|[._-])/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256Buffer(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .toUpperCase();
}

function normalizeRepository(value) {
  const raw =
    typeof value === "string"
      ? value
      : typeof value?.url === "string"
        ? value.url
        : "";
  return raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\/github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
}

function normalizeLicenseExpression(value) {
  return String(value ?? "")
    .replaceAll("/", " OR ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isPinnedGitHubContentUrl(
  sourceUrl,
  repository,
  gitHead,
) {
  try {
    const source = new URL(sourceUrl);
    const repositoryUrl = new URL(repository);
    return (
      source.origin === "https://api.github.com" &&
      source.pathname
        .toLowerCase()
        .startsWith(
          `/repos${repositoryUrl.pathname}/contents/`.toLowerCase(),
        ) &&
      source.searchParams.get("ref")?.toLowerCase() ===
        gitHead.toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function sha256File(filePath) {
  return sha256Buffer(await readFile(filePath));
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

async function readNoticeFiles(packageRoot) {
  let entries;
  try {
    entries = await readdir(packageRoot, { withFileTypes: true });
  } catch {
    return {
      packageRootAvailable: false,
      files: [],
    };
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !NOTICE_FILE_PATTERN.test(entry.name)) {
      continue;
    }
    const content = await readFile(path.join(packageRoot, entry.name));
    const decoded = content.toString("utf8");
    const textReadable =
      !content.includes(0) && !decoded.includes("\uFFFD");
    files.push({
      fileName: entry.name,
      bytes: content.length,
      sha256: sha256Buffer(content),
      textReadable,
      content: textReadable ? decoded.replace(/\r\n/g, "\n") : null,
      provenance: {
        kind: "package-root",
      },
    });
  }
  files.sort((left, right) =>
    left.fileName.localeCompare(right.fileName),
  );
  return {
    packageRootAvailable: true,
    files,
  };
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
      THIRD_PARTY_NOTICE_TARGET,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `无法离线读取 Cargo NOTICE 来源：${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout);
}

export function applySharedLicenseSources(packages, sourceMap) {
  assert(
    sourceMap?.schemaVersion === "1.0" &&
      Array.isArray(sourceMap.groups),
    "共享许可来源映射身份无效",
  );
  const output = structuredClone(packages);
  const byId = new Map(output.map((item) => [item.packageId, item]));
  const mappedTargets = new Set();
  const groups = [];

  for (const group of sourceMap.groups) {
    assert(
      ["npm", "cargo"].includes(group.ecosystem) &&
        [
          "same-release-platform-package",
          "same-release-workspace-package",
        ].includes(group.relationship) &&
        typeof group.repository === "string" &&
        Array.isArray(group.targetPackageIds) &&
        group.targetPackageIds.length > 0,
      `共享许可来源组无效：${group.id ?? "unknown"}`,
    );
    const source = byId.get(group.sourcePackageId);
    const readableSourceFiles = source?.noticeFiles.filter(
      (file) => file.textReadable && file.content !== null,
    );
    assert(
      source &&
        source.packageId.startsWith(`${group.ecosystem}:`) &&
        normalizeRepository(
          source.repository || source.source,
        ) ===
          normalizeRepository(group.repository) &&
        readableSourceFiles?.length > 0,
      `共享许可来源包不可验证：${group.id}`,
    );
    const targetPackageIds = [...group.targetPackageIds].sort();
    for (const targetPackageId of targetPackageIds) {
      const target = byId.get(targetPackageId);
      assert(
        target &&
          target.packageId.startsWith(`${group.ecosystem}:`) &&
          !mappedTargets.has(targetPackageId) &&
          target.version === source.version &&
          normalizeLicenseExpression(target.license) ===
            normalizeLicenseExpression(source.license) &&
          (!normalizeRepository(
            group.ecosystem === "npm"
              ? target.repository
              : target.repository || target.source,
          ) ||
            normalizeRepository(
              group.ecosystem === "npm"
                ? target.repository
                : target.repository || target.source,
            ) === normalizeRepository(group.repository)) &&
          !target.noticeFiles.some((file) => file.textReadable),
        `共享许可目标与来源版本、许可或现状不一致：${targetPackageId}`,
      );
      mappedTargets.add(targetPackageId);
      target.noticeFiles = readableSourceFiles.map((file) => ({
        ...structuredClone(file),
        provenance: {
          kind: "shared-package-license",
          groupId: group.id,
          sourcePackageId: source.packageId,
          repository: normalizeRepository(group.repository),
          relationship: group.relationship,
        },
      }));
    }
    groups.push({
      id: group.id,
      relationship: group.relationship,
      repository: normalizeRepository(group.repository),
      sourcePackageId: source.packageId,
      sourceVersion: source.version,
      sourceLicense: source.license,
      sourceNoticeSha256: readableSourceFiles
        .map((file) => file.sha256)
        .sort(),
      targetPackageIds,
    });
  }

  return {
    packages: output,
    groups: groups.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}

export async function applyVendoredNpmLicenseSources(
  packages,
  manifest,
  projectRoot,
  readSourceFile = readFile,
) {
  assert(
    ["1.0", "1.1"].includes(manifest?.schemaVersion) &&
      Array.isArray(manifest.entries),
    "npm 许可文本补充清单身份无效",
  );
  const output = structuredClone(packages);
  const byId = new Map(output.map((item) => [item.packageId, item]));
  const applied = [];
  const seen = new Set();
  const allowedRoot = path.resolve(
    projectRoot,
    "third_party",
    "license-texts",
    "npm",
  );
  for (const entry of manifest.entries) {
    const sourceKind =
      entry.sourceKind ?? "npm-registry-archive";
    const target = byId.get(entry.packageId);
    assert(
      target &&
        !seen.has(entry.packageId) &&
        target.name === entry.name &&
        target.version === entry.version &&
        target.license === entry.license &&
        target.source === entry.resolved &&
        target.integrity === entry.integrity &&
        /^[A-F0-9]{128}$/.test(entry.archiveSha512) &&
        Array.isArray(entry.files) &&
        entry.files.length > 0 &&
        [
          "npm-registry-archive",
          "npm-git-commit",
        ].includes(sourceKind) &&
        !target.noticeFiles.some((file) => file.textReadable),
      `npm 许可文本补充项与锁文件或当前覆盖状态不一致：${entry.packageId}`,
    );
    seen.add(entry.packageId);
    const noticeFiles = [];
    if (sourceKind === "npm-git-commit") {
      assert(
        /^https:\/\/registry\.npmjs\.org\//.test(
          entry.registryMetadataUrl,
        ) &&
          /^[A-F0-9]{64}$/.test(
            entry.registryMetadataSha256,
          ) &&
          /^https:\/\/github\.com\/[^/]+\/[^/]+$/i.test(
            entry.repository,
          ) &&
          /^[A-F0-9]{40}$/i.test(entry.gitHead),
        `npm Git 提交许可来源身份无效：${entry.packageId}`,
      );
    }
    for (const file of entry.files) {
      const absolutePath = path.resolve(
        projectRoot,
        ...file.path.split("/"),
      );
      assert(
        absolutePath.startsWith(`${allowedRoot}${path.sep}`) &&
          !file.path.includes("..") &&
          (sourceKind === "npm-registry-archive"
            ? typeof file.archivePath === "string" &&
              file.archivePath.startsWith("package/")
            : typeof file.repositoryPath === "string" &&
              !file.repositoryPath.includes("..") &&
              typeof file.sourceUrl === "string" &&
              isPinnedGitHubContentUrl(
                file.sourceUrl,
                entry.repository,
                entry.gitHead,
              )),
        `npm 许可补充文件路径越界：${entry.packageId}`,
      );
      const content = await readSourceFile(absolutePath);
      const decoded = content.toString("utf8");
      assert(
        content.length === file.bytes &&
          sha256Buffer(content) === file.sha256 &&
          !content.includes(0) &&
          !decoded.includes("\uFFFD"),
        `npm 许可补充文件缺失或哈希不一致：${entry.packageId}`,
      );
      noticeFiles.push({
        fileName: path.posix.basename(
          file.archivePath ?? file.repositoryPath,
        ),
        bytes: content.length,
        sha256: file.sha256,
        textReadable: true,
        content: decoded.replace(/\r\n/g, "\n"),
        provenance: {
          kind:
            sourceKind === "npm-registry-archive"
              ? "verified-npm-archive"
              : "verified-npm-git-commit",
          manifestPath:
            "review/npm-license-text-supplements.json",
          ...(sourceKind === "npm-registry-archive"
            ? { archivePath: file.archivePath }
            : {
                registryMetadataUrl:
                  entry.registryMetadataUrl,
                registryMetadataSha256:
                  entry.registryMetadataSha256,
                repository: entry.repository,
                gitHead: entry.gitHead,
                repositoryPath: file.repositoryPath,
                sourceUrl: file.sourceUrl,
              }),
          resolved: entry.resolved,
          integrity: entry.integrity,
          archiveSha512: entry.archiveSha512,
          vendoredPath: file.path,
        },
      });
    }
    target.noticeFiles = noticeFiles;
    applied.push({
      sourceKind,
      packageId: entry.packageId,
      name: entry.name,
      version: entry.version,
      license: entry.license,
      resolved: entry.resolved,
      integrity: entry.integrity,
      archiveSha512: entry.archiveSha512,
      ...(sourceKind === "npm-git-commit"
        ? {
            registryMetadataUrl:
              entry.registryMetadataUrl,
            registryMetadataSha256:
              entry.registryMetadataSha256,
            repository: entry.repository,
            gitHead: entry.gitHead,
          }
        : {}),
      files: structuredClone(entry.files),
    });
  }
  return {
    packages: output,
    entries: applied.sort((left, right) =>
      left.packageId.localeCompare(right.packageId),
    ),
  };
}

function cargoLockChecksums(lockText) {
  const checksums = new Map();
  for (const block of lockText.split("[[package]]").slice(1)) {
    const readValue = (key) => {
      const match = block.match(
        new RegExp(`^${key} = ("(?:[^"\\\\]|\\\\.)*")$`, "m"),
      );
      return match ? JSON.parse(match[1]) : null;
    };
    const name = readValue("name");
    const version = readValue("version");
    const checksum = readValue("checksum");
    if (name && version && checksum) {
      const key = `${name}@${version}`;
      const normalized = checksum.toUpperCase();
      assert(
        !checksums.has(key) || checksums.get(key) === normalized,
        `Cargo.lock 存在同名同版本但不同校验和：${key}`,
      );
      checksums.set(key, normalized);
    }
  }
  return checksums;
}

export async function applyVendoredCargoLicenseSources(
  packages,
  manifest,
  projectRoot,
  readSourceFile = readFile,
) {
  assert(
    manifest?.schemaVersion === "1.0" &&
      Array.isArray(manifest.entries),
    "Cargo 许可文本补充清单身份无效",
  );
  const output = structuredClone(packages);
  const byId = new Map(output.map((item) => [item.packageId, item]));
  const allowedRoot = path.resolve(
    projectRoot,
    "third_party",
    "license-texts",
    "cargo",
  );
  const seen = new Set();
  const applied = [];
  for (const entry of manifest.entries) {
    const target = byId.get(entry.packageId);
    assert(
      target &&
        !seen.has(entry.packageId) &&
        entry.sourceKind === "cargo-git-commit" &&
        target.name === entry.name &&
        target.version === entry.version &&
        normalizeLicenseExpression(target.license) ===
          normalizeLicenseExpression(entry.license) &&
        normalizeRepository(target.source) ===
          normalizeRepository(entry.repository) &&
        target.checksum === entry.lockChecksumSha256 &&
        entry.crateSha256 === entry.lockChecksumSha256 &&
        /^[A-F0-9]{64}$/.test(entry.lockChecksumSha256) &&
        /^[A-F0-9]{64}$/.test(entry.vcsInfoSha256) &&
        /^[A-F0-9]{40}$/i.test(entry.gitHead) &&
        typeof entry.downloadUrl === "string" &&
        /^https:\/\/crates\.io\/api\/v1\/crates\//.test(
          entry.downloadUrl,
        ) &&
        typeof entry.vcsInfoArchivePath === "string" &&
        entry.vcsInfoArchivePath.endsWith(
          "/.cargo_vcs_info.json",
        ) &&
        Array.isArray(entry.files) &&
        entry.files.length > 0 &&
        !target.noticeFiles.some((file) => file.textReadable),
      `Cargo 许可文本补充项与锁文件、仓库或当前覆盖状态不一致：${entry.packageId}`,
    );
    seen.add(entry.packageId);
    const noticeFiles = [];
    for (const file of entry.files) {
      const absolutePath = path.resolve(
        projectRoot,
        ...file.path.split("/"),
      );
      assert(
        absolutePath.startsWith(`${allowedRoot}${path.sep}`) &&
          !file.path.includes("..") &&
          typeof file.repositoryPath === "string" &&
          !file.repositoryPath.includes("..") &&
          typeof file.sourceUrl === "string" &&
          isPinnedGitHubContentUrl(
            file.sourceUrl,
            entry.repository,
            entry.gitHead,
          ),
        `Cargo 许可补充文件路径或来源越界：${entry.packageId}`,
      );
      const content = await readSourceFile(absolutePath);
      const decoded = content.toString("utf8");
      assert(
        content.length === file.bytes &&
          sha256Buffer(content) === file.sha256 &&
          !content.includes(0) &&
          !decoded.includes("\uFFFD"),
        `Cargo 许可补充文件缺失或哈希不一致：${entry.packageId}`,
      );
      noticeFiles.push({
        fileName: path.posix.basename(file.repositoryPath),
        bytes: content.length,
        sha256: file.sha256,
        textReadable: true,
        content: decoded.replace(/\r\n/g, "\n"),
        provenance: {
          kind: "verified-cargo-git-commit",
          manifestPath:
            "review/cargo-license-text-supplements.json",
          downloadUrl: entry.downloadUrl,
          lockChecksumSha256: entry.lockChecksumSha256,
          crateSha256: entry.crateSha256,
          vcsInfoArchivePath: entry.vcsInfoArchivePath,
          vcsInfoSha256: entry.vcsInfoSha256,
          repository: entry.repository,
          gitHead: entry.gitHead,
          repositoryPath: file.repositoryPath,
          sourceUrl: file.sourceUrl,
          vendoredPath: file.path,
        },
      });
    }
    target.noticeFiles = noticeFiles;
    applied.push(structuredClone(entry));
  }
  return {
    packages: output,
    entries: applied.sort((left, right) =>
      left.packageId.localeCompare(right.packageId),
    ),
  };
}

export function mergeCanonicalLicenseGroups(groups) {
  const merged = new Map();
  for (const group of groups) {
    const existing = merged.get(group.licenseId);
    if (!existing) {
      merged.set(group.licenseId, {
        ...structuredClone(group),
        packageIds: [...group.packageIds],
      });
      continue;
    }
    const identityFields = [
      "repository",
      "releaseTag",
      "gitCommit",
      "repositoryPath",
      "sourceUrl",
      "sha256",
    ];
    assert(
      identityFields.every(
        (field) => existing[field] === group[field],
      ),
      `SPDX 规范许可分组来源不一致：${group.licenseId}`,
    );
    existing.packageIds.push(...group.packageIds);
  }
  return [...merged.values()]
    .map((group) => ({
      ...group,
      packageIds: [...new Set(group.packageIds)].sort(),
    }))
    .sort((left, right) =>
      left.licenseId.localeCompare(right.licenseId),
    );
}

export async function collectThirdPartyNoticeInputs(
  projectRoot,
  { skipCanonicalCargo = false } = {},
) {
  const readJson = async (relativePath) =>
    JSON.parse(
      await readFile(path.join(projectRoot, relativePath), "utf8"),
    );
  const [
    packageJson,
    packageLock,
    cargoAudit,
    tauriConfig,
    licenseSourceMap,
    npmLicenseSupplements,
    cargoLicenseSupplements,
    canonicalLicensePolicy,
    canonicalLicenseSupplements,
    cargoLockText,
  ] =
    await Promise.all([
      readJson("package.json"),
      readJson("package-lock.json"),
      readJson("output/WeatherPoem_0.2.0_CARGO_AUDIT.json"),
      readJson("src-tauri/tauri.conf.json"),
      readJson("review/third-party-license-source-map.json"),
      readJson("review/npm-license-text-supplements.json"),
      readJson("review/cargo-license-text-supplements.json"),
      readJson("review/canonical-license-text-policy.json"),
      readJson("review/canonical-license-text-supplements.json"),
      readFile(
        path.join(projectRoot, "src-tauri", "Cargo.lock"),
        "utf8",
      ),
    ]);

  const npmPackages = [];
  for (const [packagePath, metadata] of Object.entries(
    packageLock.packages,
  )) {
    if (packagePath === "") continue;
    const notice = await readNoticeFiles(
      path.join(projectRoot, ...packagePath.split("/")),
    );
    let packageManifest = null;
    try {
      packageManifest = await readJson(
        `${packagePath.replaceAll("\\", "/")}/package.json`,
      );
    } catch {
      // 非当前平台的可选包不会安装到 node_modules。
    }
    npmPackages.push({
      packageId: `npm:${packagePath}`,
      name: npmPackageName(packagePath, metadata),
      version: metadata.version,
      license: metadata.license ?? null,
      source: metadata.resolved ?? null,
      integrity: metadata.integrity ?? null,
      repository: normalizeRepository(packageManifest?.repository),
      packageRootAvailable: notice.packageRootAvailable,
      noticeFiles: notice.files,
    });
  }
  npmPackages.sort((left, right) =>
    left.packageId.localeCompare(right.packageId),
  );
  const sharedNpm = applySharedLicenseSources(
    npmPackages,
    {
      ...licenseSourceMap,
      groups: licenseSourceMap.groups.filter(
        (group) => group.ecosystem === "npm",
      ),
    },
  );
  const vendoredNpm = await applyVendoredNpmLicenseSources(
    sharedNpm.packages,
    npmLicenseSupplements,
    projectRoot,
  );
  const canonicalNpm = await applyCanonicalLicenseSources(
    vendoredNpm.packages,
    "npm",
    canonicalLicensePolicy,
    canonicalLicenseSupplements,
    projectRoot,
  );

  const cargoMetadata = runCargoMetadata(projectRoot);
  const lockedCargoChecksums =
    cargoLockChecksums(cargoLockText);
  const targetKeys = new Set(
    cargoAudit.targetResolution.packages.map(
      (item) => `${item.name}@${item.version}`,
    ),
  );
  const cargoPackages = [];
  for (const metadata of cargoMetadata.packages) {
    if (
      metadata.name === packageJson.name ||
      !targetKeys.has(`${metadata.name}@${metadata.version}`)
    ) {
      continue;
    }
    const notice = await readNoticeFiles(
      path.dirname(metadata.manifest_path),
    );
    cargoPackages.push({
      packageId: `cargo:${metadata.name}@${metadata.version}`,
      name: metadata.name,
      version: metadata.version,
      license: metadata.license ?? null,
      source: metadata.repository ?? metadata.source ?? null,
      checksum:
        lockedCargoChecksums.get(
          `${metadata.name}@${metadata.version}`,
        ) ?? null,
      packageRootAvailable: notice.packageRootAvailable,
      noticeFiles: notice.files,
    });
  }
  cargoPackages.sort((left, right) =>
    left.packageId.localeCompare(right.packageId),
  );
  const sharedCargo = applySharedLicenseSources(
    cargoPackages,
    {
      ...licenseSourceMap,
      groups: licenseSourceMap.groups.filter(
        (group) => group.ecosystem === "cargo",
      ),
    },
  );
  const vendoredCargo =
    await applyVendoredCargoLicenseSources(
      sharedCargo.packages,
      cargoLicenseSupplements,
      projectRoot,
    );
  const canonicalCargo = skipCanonicalCargo
    ? { packages: vendoredCargo.packages, bindings: [], groups: [] }
    : await applyCanonicalLicenseSources(
      vendoredCargo.packages,
      "cargo",
      canonicalLicensePolicy,
      canonicalLicenseSupplements,
      projectRoot,
    );

  const inputFiles = {
    packageJson: "package.json",
    packageLock: "package-lock.json",
    cargoLock: "src-tauri/Cargo.lock",
    cargoAudit: "output/WeatherPoem_0.2.0_CARGO_AUDIT.json",
    tauriConfig: "src-tauri/tauri.conf.json",
    licenseSourceMap:
      "review/third-party-license-source-map.json",
    npmLicenseSupplements:
      "review/npm-license-text-supplements.json",
    cargoLicenseSupplements:
      "review/cargo-license-text-supplements.json",
    canonicalLicensePolicy:
      "review/canonical-license-text-policy.json",
    canonicalLicenseSupplements:
      "review/canonical-license-text-supplements.json",
  };
  const inputs = {};
  for (const [key, relativePath] of Object.entries(inputFiles)) {
    inputs[key] = {
      path: relativePath,
      sha256: await sha256File(
        path.join(projectRoot, ...relativePath.split("/")),
      ),
    };
  }

  return {
    appVersion: packageJson.version,
    inputs,
    npmPackages: canonicalNpm.packages,
    cargoPackages: canonicalCargo.packages,
    supplementalLicenseGroups: [
      ...sharedNpm.groups,
      ...sharedCargo.groups,
    ].sort((left, right) => left.id.localeCompare(right.id)),
    vendoredNpmLicenseSources: vendoredNpm.entries,
    vendoredCargoLicenseSources: vendoredCargo.entries,
    canonicalLicenseBindings: [
      ...canonicalNpm.bindings,
      ...canonicalCargo.bindings,
    ].sort((left, right) =>
      left.packageId.localeCompare(right.packageId),
    ),
    canonicalLicenseGroups: mergeCanonicalLicenseGroups([
      ...canonicalNpm.groups,
      ...canonicalCargo.groups,
    ]),
    noticeBundleConfigured:
      tauriConfig.bundle?.resources?.[
        NOTICE_RESOURCE_SOURCE
      ] === NOTICE_RESOURCE_TARGET,
  };
}

function prepareEcosystem(packages, textIdsBySha) {
  return packages.map((item) => ({
    packageId: item.packageId,
    name: item.name,
    version: item.version,
    license: item.license,
    source: item.source,
    integrity: item.integrity ?? null,
    checksum: item.checksum ?? null,
    repository: item.repository ?? null,
    packageRootAvailable: item.packageRootAvailable,
    noticeFiles: item.noticeFiles.map((file) => ({
      fileName: file.fileName,
      bytes: file.bytes,
      sha256: file.sha256,
      textReadable: file.textReadable,
      textId: file.textReadable
        ? textIdsBySha.get(file.sha256)
        : null,
      provenance: file.provenance ?? null,
    })),
  }));
}

function coverageFor(packages) {
  const isReadable = (file) =>
    file.textReadable === true && Boolean(file.textId);
  const isCanonical = (file) =>
    file.provenance?.kind ===
    "verified-spdx-canonical-text";
  const withReadableText = packages.filter((item) =>
    item.noticeFiles.some(
      (file) => isReadable(file) && !isCanonical(file),
    ),
  );
  const withoutReadableText = packages.filter(
    (item) =>
      !item.noticeFiles.some(
        (file) => isReadable(file) && !isCanonical(file),
      ),
  );
  const withDistributionText = packages.filter((item) =>
    item.noticeFiles.some(isReadable),
  );
  const withoutDistributionText = packages.filter(
    (item) => !item.noticeFiles.some(isReadable),
  );
  const canonicalFallbacks = packages.filter((item) =>
    item.noticeFiles.some(
      (file) => isReadable(file) && isCanonical(file),
    ),
  );
  const unavailableRoots = packages.filter(
    (item) => !item.packageRootAvailable,
  );
  const coveragePercent = (count) =>
    packages.length === 0
      ? 0
      : Number(
          ((count / packages.length) * 100).toFixed(3),
        );
  return {
    packageCount: packages.length,
    licenseMetadataCount: packages.filter((item) => item.license)
      .length,
    packagesWithReadableNoticeText: withReadableText.length,
    packagesWithoutReadableNoticeText: withoutReadableText.length,
    unavailablePackageRootCount: unavailableRoots.length,
    readableTextCoveragePercent: coveragePercent(
      withReadableText.length,
    ),
    missingTextPackageIds: withoutReadableText.map(
      (item) => item.packageId,
    ),
    packagesWithDistributionLicenseText:
      withDistributionText.length,
    packagesWithoutDistributionLicenseText:
      withoutDistributionText.length,
    distributionLicenseTextCoveragePercent: coveragePercent(
      withDistributionText.length,
    ),
    missingDistributionLicenseTextPackageIds:
      withoutDistributionText.map((item) => item.packageId),
    canonicalFallbackPackageCount: canonicalFallbacks.length,
  };
}

function markdownEscape(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function appendPackageTable(lines, title, ecosystem) {
  lines.push(`## ${title}`, "");
  lines.push(
    "| 包 | 版本 | 许可表达式 | 可追溯许可/NOTICE 文本 | 来源 |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const item of ecosystem.packages) {
    const textIds = [
      ...new Set(
        item.noticeFiles
          .map((file) => file.textId)
          .filter(Boolean),
      ),
    ];
    const sharedSources = [
      ...new Set(
        item.noticeFiles
          .filter(
            (file) =>
              file.provenance?.kind ===
              "shared-package-license",
          )
          .map((file) => file.provenance.sourcePackageId),
      ),
    ];
    const verifiedExternalSources = [
      ...new Set(
        item.noticeFiles
          .filter(
            (file) =>
              file.provenance?.kind ===
                "verified-npm-archive" ||
              file.provenance?.kind ===
                "verified-npm-git-commit",
          )
          .map((file) => file.provenance.kind),
      ),
    ];
    const verifiedCargoSources = item.noticeFiles.some(
      (file) =>
        file.provenance?.kind ===
        "verified-cargo-git-commit",
    );
    const canonicalLicenseIds = [
      ...new Set(
        item.noticeFiles
          .filter(
            (file) =>
              file.provenance?.kind ===
              "verified-spdx-canonical-text",
          )
          .map((file) => file.provenance.licenseId),
      ),
    ].sort();
    const noticeCell = textIds.length
      ? `${textIds.join(", ")}${
          sharedSources.length
            ? `（同版平台包共享自 ${sharedSources.join("、")}）`
            : ""
        }${
          verifiedExternalSources.includes(
            "verified-npm-archive",
          )
            ? "（来自完整性校验通过的 npm 原始发行包）"
            : ""
        }${
          verifiedExternalSources.includes(
            "verified-npm-git-commit",
          )
            ? "（来自 npm gitHead 锁定的上游仓库许可文件）"
            : ""
        }${
          verifiedCargoSources
            ? "（来自 crate VCS 提交锁定的上游仓库许可文件）"
            : ""
        }${
          canonicalLicenseIds.length
            ? `（规范文本补充：${canonicalLicenseIds.join("、")}）`
            : ""
        }`
      : "尚无可追溯文本";
    lines.push(
      `| ${markdownEscape(item.name)} | ${markdownEscape(item.version)} | ` +
        `${markdownEscape(item.license)} | ${markdownEscape(noticeCell)} | ` +
        `${markdownEscape(item.source)} |`,
    );
  }
  lines.push("");
}

function buildMarkdown(report, textArtifacts) {
  const lines = [
    "# WeatherPoem 第三方许可与 NOTICE 草案",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 适用版本：WeatherPoem ${report.appVersion}`,
    `- Windows 目标：${report.target}`,
    "",
    "> 这是从当前锁文件与本机已安装依赖自动生成的审阅草案，不构成法律意见，",
    "> 也不代表已满足每个许可证的分发、源代码提供或署名义务。",
    "",
    "## 覆盖摘要",
    "",
    "| 生态 | 包数量 | 有许可元数据 | 上游可读文本 | 上游缺口 | 上游可读文本覆盖 | 分发可读许可 | 分发缺口 | 分发可读许可覆盖 | 规范补充包 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| npm | ${report.ecosystems.npm.coverage.packageCount} | ${report.ecosystems.npm.coverage.licenseMetadataCount} | ${report.ecosystems.npm.coverage.packagesWithReadableNoticeText} | ${report.ecosystems.npm.coverage.packagesWithoutReadableNoticeText} | ${report.ecosystems.npm.coverage.readableTextCoveragePercent}% | ${report.ecosystems.npm.coverage.packagesWithDistributionLicenseText} | ${report.ecosystems.npm.coverage.packagesWithoutDistributionLicenseText} | ${report.ecosystems.npm.coverage.distributionLicenseTextCoveragePercent}% | ${report.ecosystems.npm.coverage.canonicalFallbackPackageCount} |`,
    `| Windows Rust | ${report.ecosystems.cargo.coverage.packageCount} | ${report.ecosystems.cargo.coverage.licenseMetadataCount} | ${report.ecosystems.cargo.coverage.packagesWithReadableNoticeText} | ${report.ecosystems.cargo.coverage.packagesWithoutReadableNoticeText} | ${report.ecosystems.cargo.coverage.readableTextCoveragePercent}% | ${report.ecosystems.cargo.coverage.packagesWithDistributionLicenseText} | ${report.ecosystems.cargo.coverage.packagesWithoutDistributionLicenseText} | ${report.ecosystems.cargo.coverage.distributionLicenseTextCoveragePercent}% | ${report.ecosystems.cargo.coverage.canonicalFallbackPackageCount} |`,
    "",
    `共去重得到 ${textArtifacts.length} 份可读许可/NOTICE 文本。`,
    report.draft.bundleConfigured
      ? "Tauri 已配置在下一次构建时把本文件放入安装包的 licenses 目录；当前候选是否实际包含仍须重建后验证。"
      : "Tauri 尚未配置把本文件放入安装包。",
    report.completeReadableTextCoverage
      ? "所有锁定包均已绑定至少一份上游可读且可追溯的许可/NOTICE 文本。"
      : report.completeDistributionLicenseTextCoverage
        ? "分发 NOTICE 已为全部锁定包提供可读许可文本，但仍保留上游发布物未携带可验证文本的缺口；规范补充不代表许可兼容性或法律批准。"
        : "分发 NOTICE 仍有包没有可追溯的许可文本；发布负责人必须补齐并复核。",
    "",
    "输入锁定：",
    "",
    ...Object.values(report.inputs).map(
      (item) => `- \`${item.path}\`：\`${item.sha256}\``,
    ),
    "",
  ];
  if (report.supplementalLicenseGroups.length > 0) {
    lines.push(
      "## 同版同仓库包许可映射",
      "",
      "以下映射只在目标包与来源包属于同一仓库、版本和许可表达式完全一致时生效；",
      "它复用来源包实际携带的文本，不以通用 SPDX 模板替代上游文件。",
      "",
      "| 映射 | 关系 | 上游仓库 | 文本来源包 | 目标包数量 | 文本 SHA-256 |",
      "| --- | --- | --- | --- | ---: | --- |",
    );
    for (const group of report.supplementalLicenseGroups) {
      lines.push(
        `| ${markdownEscape(group.id)} | ${markdownEscape(group.relationship)} | ` +
          `${markdownEscape(group.repository)} | ` +
          `${markdownEscape(group.sourcePackageId)} | ${group.targetPackageIds.length} | ` +
          `${group.sourceNoticeSha256.map((item) => `\`${item}\``).join("、")} |`,
      );
    }
    lines.push("");
  }
  if (report.vendoredNpmLicenseSources.length > 0) {
    lines.push(
      "## 已核验 npm 许可文本来源",
      "",
      "同步过程先用 lockfile integrity 校验精确 npm 发行包。若发行包携带许可文件，则直接取包内文本；",
      "若未携带，则只接受 npm 版本元数据所给 gitHead 对应的 GitHub 仓库根目录许可文件。",
      "生成器会重新校验整包、版本元数据、提交、来源路径、落库路径和文本哈希。",
      "",
      "| 包 | 方法 | 来源地址 | 来源锁定 | 上游文件 | 文本 SHA-256 |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const entry of report.vendoredNpmLicenseSources) {
      for (const file of entry.files) {
        const fromArchive =
          entry.sourceKind === "npm-registry-archive";
        lines.push(
          `| ${markdownEscape(entry.packageId)} | ` +
            `${fromArchive ? "npm 原始发行包" : "npm gitHead 对应仓库"} | ` +
            `${markdownEscape(fromArchive ? entry.resolved : entry.repository)} | ` +
            `${
              fromArchive
                ? `整包 SHA-512 \`${entry.archiveSha512}\``
                : `gitHead \`${entry.gitHead}\`；版本元数据 SHA-256 \`${entry.registryMetadataSha256}\``
            } | ` +
            `${markdownEscape(file.archivePath ?? file.repositoryPath)} | ` +
            `\`${file.sha256}\` |`,
        );
      }
    }
    lines.push("");
  }
  if (report.vendoredCargoLicenseSources.length > 0) {
    lines.push(
      "## 已核验 Cargo 仓库许可文本来源",
      "",
      "以下文本先以 Cargo.lock checksum 校验精确 crate 发行包，再读取包内 `.cargo_vcs_info.json` 的提交号，",
      "最后从该 GitHub 提交的仓库根目录取得许可文件。生成器会复核全部锁定字段与落库文本哈希。",
      "",
      "| 包 | 上游仓库 | crate SHA-256 | git 提交 | `.cargo_vcs_info.json` SHA-256 | 上游文件 | 文本 SHA-256 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const entry of report.vendoredCargoLicenseSources) {
      for (const file of entry.files) {
        lines.push(
          `| ${markdownEscape(entry.packageId)} | ${markdownEscape(entry.repository)} | ` +
            `\`${entry.crateSha256}\` | \`${entry.gitHead}\` | ` +
            `\`${entry.vcsInfoSha256}\` | ${markdownEscape(file.repositoryPath)} | ` +
            `\`${file.sha256}\` |`,
        );
      }
    }
    lines.push("");
  }
  if (report.canonicalLicenseGroups.length > 0) {
    lines.push(
      "## SPDX 规范许可文本补充",
      "",
      "> 以下包的上游发布包未提供可验证的可读许可全文。本节由分发侧补充",
      "> SPDX v3.28.0 固定提交中的规范文本；这不是上游随包文件，也不代表许可兼容性或法律批准。",
      "",
    );
    for (const group of report.canonicalLicenseGroups) {
      const artifact = textArtifacts.find(
        (item) => item.sha256 === group.sha256,
      );
      assert(
        artifact,
        `SPDX 规范许可分组缺少文本索引：${group.licenseId}`,
      );
      lines.push(
        `### SPDX ${group.licenseId}`,
        "",
        `- 适用包：${group.packageIds.map((item) => `\`${item}\``).join("、")}`,
        `- SPDX 发布：\`${group.releaseTag}\``,
        `- 固定提交：\`${group.gitCommit}\``,
        `- 上游路径：\`${group.repositoryPath}\``,
        `- SHA-256：\`${group.sha256}\``,
        `- 文本索引：\`${artifact.textId}\``,
        "",
      );
    }
  }
  appendPackageTable(lines, "npm 包", report.ecosystems.npm);
  appendPackageTable(
    lines,
    "Windows Rust 包",
    report.ecosystems.cargo,
  );
  lines.push(
    "## 去重许可与 NOTICE 文本",
    "",
    "同一份文本只收录一次；每节列出引用该文本的包。上游文本保持依赖包或固定上游提交中的内容，",
    "规范补充保持固定 SPDX 提交中的内容；两类文本都仅统一换行符用于生成此 Markdown 草案。",
    "",
  );
  for (const artifact of textArtifacts) {
    lines.push(
      `### ${artifact.textId}`,
      "",
      `SHA-256：\`${artifact.sha256}\`<br>`,
      `字节数：${artifact.bytes}<br>`,
      `文件名：${artifact.fileNames.map((item) => `\`${item}\``).join("、")}<br>`,
      `引用包：${artifact.packageIds.map((item) => `\`${item}\``).join("、")}`,
      "",
      "````text",
      artifact.content.replace(/\s+$/u, ""),
      "````",
      "",
    );
  }
  lines.push(
    "## 发布前人工复核",
    "",
    "- 为没有本地可读文本的包补齐上游许可文件；",
    "- 确认复合许可表达式选择、NOTICE、署名、源码提供和修改声明义务；",
    "- 将最终文件纳入安装包，并验证安装后可访问；",
    "- 由具名发布负责人和法务复核人签署 RQT-23 证据。",
    "",
  );
  return `${lines.join("\n")}\n`;
}

export function buildThirdPartyNoticeDraft(inputs, generatedAt) {
  const textBySha = new Map();
  for (const item of [
    ...inputs.npmPackages,
    ...inputs.cargoPackages,
  ]) {
    for (const file of item.noticeFiles) {
      if (!file.textReadable || file.content === null) continue;
      const existing = textBySha.get(file.sha256) ?? {
        sha256: file.sha256,
        bytes: file.bytes,
        content: file.content,
        fileNames: new Set(),
        packageIds: new Set(),
      };
      existing.fileNames.add(file.fileName);
      existing.packageIds.add(item.packageId);
      textBySha.set(file.sha256, existing);
    }
  }
  const textArtifacts = [...textBySha.values()]
    .sort((left, right) => left.sha256.localeCompare(right.sha256))
    .map((item, index) => ({
      textId: `TXT-${String(index + 1).padStart(3, "0")}`,
      sha256: item.sha256,
      bytes: item.bytes,
      fileNames: [...item.fileNames].sort((left, right) =>
        left.localeCompare(right),
      ),
      packageIds: [...item.packageIds].sort((left, right) =>
        left.localeCompare(right),
      ),
      content: item.content,
    }));
  const textIdsBySha = new Map(
    textArtifacts.map((item) => [item.sha256, item.textId]),
  );
  const npmPackages = prepareEcosystem(
    inputs.npmPackages,
    textIdsBySha,
  );
  const cargoPackages = prepareEcosystem(
    inputs.cargoPackages,
    textIdsBySha,
  );
  const npmCoverage = coverageFor(npmPackages);
  const cargoCoverage = coverageFor(cargoPackages);
  const completeReadableTextCoverage =
    npmCoverage.packagesWithoutReadableNoticeText === 0 &&
    cargoCoverage.packagesWithoutReadableNoticeText === 0;
  const completeDistributionLicenseTextCoverage =
    npmCoverage.packagesWithoutDistributionLicenseText === 0 &&
    cargoCoverage.packagesWithoutDistributionLicenseText === 0;
  const report = {
    schemaVersion: THIRD_PARTY_NOTICE_SCHEMA,
    product: "WeatherPoem",
    appVersion: inputs.appVersion,
    generatedAt,
    status: completeReadableTextCoverage
      ? "draft-generated-complete-upstream-text-coverage-awaiting-review"
      : completeDistributionLicenseTextCoverage
        ? "draft-generated-complete-distribution-text-with-upstream-gaps-awaiting-review"
        : "draft-generated-with-distribution-text-gaps-awaiting-review",
    target: THIRD_PARTY_NOTICE_TARGET,
    inputs: inputs.inputs,
    supplementalLicenseGroups:
      inputs.supplementalLicenseGroups ?? [],
    vendoredNpmLicenseSources:
      inputs.vendoredNpmLicenseSources ?? [],
    vendoredCargoLicenseSources:
      inputs.vendoredCargoLicenseSources ?? [],
    canonicalLicenseBindings:
      inputs.canonicalLicenseBindings ?? [],
    canonicalLicenseGroups:
      inputs.canonicalLicenseGroups ?? [],
    ecosystems: {
      npm: {
        coverage: npmCoverage,
        packages: npmPackages,
      },
      cargo: {
        coverage: cargoCoverage,
        packages: cargoPackages,
      },
    },
    textArtifacts: textArtifacts.map((item) => ({
      textId: item.textId,
      sha256: item.sha256,
      bytes: item.bytes,
      fileNames: item.fileNames,
      packageIds: item.packageIds,
    })),
    completeReadableTextCoverage,
    completeDistributionLicenseTextCoverage,
    draft: {
      path: THIRD_PARTY_NOTICE_DRAFT,
      sha256: null,
      generated: true,
      bundleConfigured: inputs.noticeBundleConfigured,
      bundledIntoCurrentInstaller: false,
      legalReviewCompleted: false,
    },
    approval: {
      releaseOwner: null,
      legalReviewer: null,
      decision: null,
      approvedAt: null,
      evidencePath:
        "review/evidence/RQT-23-content-asset-licenses.json",
    },
    limitations: {
      localPackageFilesOnly: true,
      sharedSourceMapValidated: true,
      verifiedNpmArchiveTexts: true,
      verifiedNpmGitHeadTexts: true,
      verifiedCargoGitHeadTexts: true,
      verifiedSpdxCanonicalFallbackTexts: true,
      metadataIsNotCompatibilityOpinion: true,
      licenseObligationsNotInterpreted: true,
      namedReviewCompleted: false,
    },
    gateSatisfied: false,
    result:
      "notice-draft-generated-public-distribution-not-cleared",
  };
  const markdown = buildMarkdown(report, textArtifacts);
  report.draft.sha256 = sha256Buffer(Buffer.from(markdown, "utf8"));
  return {
    report,
    markdown,
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[A-F0-9]{64}$/.test(value);
}

export function validateThirdPartyNoticeDraft(
  report,
  markdown,
  inputs,
) {
  assert(
    report.schemaVersion === THIRD_PARTY_NOTICE_SCHEMA &&
      report.product === "WeatherPoem" &&
      report.appVersion === inputs.appVersion &&
      report.target === THIRD_PARTY_NOTICE_TARGET,
    "第三方 NOTICE 草案身份或目标无效",
  );
  const generatedAt = Date.parse(report.generatedAt);
  assert(
    Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 10 * 60 * 1000 &&
      generatedAt >= Date.now() - 31 * 24 * 60 * 60 * 1000,
    "第三方 NOTICE 草案时间无效或已过期",
  );
  for (const [key, expected] of Object.entries(inputs.inputs)) {
    const actual = report.inputs[key];
    assert(
      actual?.path === expected.path &&
        actual.sha256 === expected.sha256 &&
        isSha256(actual.sha256),
      `第三方 NOTICE 草案未绑定当前输入：${key}`,
    );
  }
  const expected = buildThirdPartyNoticeDraft(
    inputs,
    report.generatedAt,
  );
  assert(
    JSON.stringify(report.supplementalLicenseGroups) ===
      JSON.stringify(expected.report.supplementalLicenseGroups),
    "第三方 NOTICE 共享许可来源映射与当前依赖不一致",
  );
  assert(
    JSON.stringify(report.vendoredNpmLicenseSources) ===
      JSON.stringify(expected.report.vendoredNpmLicenseSources),
    "第三方 NOTICE 已核验 npm 发行包来源与当前清单不一致",
  );
  assert(
    JSON.stringify(report.vendoredCargoLicenseSources) ===
      JSON.stringify(expected.report.vendoredCargoLicenseSources),
    "第三方 NOTICE 已核验 Cargo 仓库来源与当前清单不一致",
  );
  assert(
    JSON.stringify(report.canonicalLicenseBindings) ===
      JSON.stringify(expected.report.canonicalLicenseBindings) &&
      JSON.stringify(report.canonicalLicenseGroups) ===
        JSON.stringify(expected.report.canonicalLicenseGroups),
    "第三方 NOTICE SPDX 规范许可补充与当前策略不一致",
  );
  assert(
    JSON.stringify(report.ecosystems) ===
      JSON.stringify(expected.report.ecosystems),
    "第三方 NOTICE 包清单或本地文本覆盖率与当前依赖不一致",
  );
  assert(
    JSON.stringify(report.textArtifacts) ===
      JSON.stringify(expected.report.textArtifacts),
    "第三方 NOTICE 去重文本索引与当前依赖不一致",
  );
  assert(
    markdown === expected.markdown &&
      report.draft.path === THIRD_PARTY_NOTICE_DRAFT &&
      report.draft.sha256 === sha256Buffer(Buffer.from(markdown)) &&
      isSha256(report.draft.sha256) &&
      report.draft.generated === true,
    "第三方 NOTICE Markdown 草案缺失、过期或被修改",
  );
  assert(
    report.completeReadableTextCoverage ===
        expected.report.completeReadableTextCoverage &&
      report.completeDistributionLicenseTextCoverage ===
        expected.report.completeDistributionLicenseTextCoverage &&
      report.status === expected.report.status,
    "第三方 NOTICE 文本缺口状态被掩盖",
  );
  assert(
    report.draft.bundleConfigured ===
        inputs.noticeBundleConfigured &&
      report.draft.bundleConfigured === true &&
      report.draft.bundledIntoCurrentInstaller === false &&
      report.draft.legalReviewCompleted === false &&
      Object.entries(report.approval)
        .filter(([key]) => key !== "evidencePath")
        .every(([, value]) => value === null) &&
      report.approval.evidencePath ===
        "review/evidence/RQT-23-content-asset-licenses.json" &&
      report.limitations.sharedSourceMapValidated === true &&
      report.limitations.verifiedNpmArchiveTexts === true &&
      report.limitations.verifiedNpmGitHeadTexts === true &&
      report.limitations.verifiedCargoGitHeadTexts === true &&
      report.limitations
        .verifiedSpdxCanonicalFallbackTexts === true &&
      report.limitations.namedReviewCompleted === false &&
      report.gateSatisfied === false &&
      report.result ===
        "notice-draft-generated-public-distribution-not-cleared",
    "自动 NOTICE 草案不得冒充已装入安装包或具名法务批准",
  );
  return {
    npmPackageCount:
      report.ecosystems.npm.coverage.packageCount,
    cargoPackageCount:
      report.ecosystems.cargo.coverage.packageCount,
    npmMissingTextCount:
      report.ecosystems.npm.coverage
        .packagesWithoutReadableNoticeText,
    cargoMissingTextCount:
      report.ecosystems.cargo.coverage
        .packagesWithoutReadableNoticeText,
    npmDistributionMissingTextCount:
      report.ecosystems.npm.coverage
        .packagesWithoutDistributionLicenseText,
    cargoDistributionMissingTextCount:
      report.ecosystems.cargo.coverage
        .packagesWithoutDistributionLicenseText,
    canonicalFallbackPackageCount:
      report.ecosystems.npm.coverage
        .canonicalFallbackPackageCount +
      report.ecosystems.cargo.coverage
        .canonicalFallbackPackageCount,
    uniqueTextCount: report.textArtifacts.length,
    bundleConfigured: report.draft.bundleConfigured,
  };
}
