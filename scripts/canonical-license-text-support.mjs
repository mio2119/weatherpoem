import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const SPDX_CANONICAL_SOURCE = Object.freeze({
  repository: "https://github.com/spdx/license-list-data",
  releaseTag: "v3.28.0",
  gitCommit: "c4a7237ec8f4654e867546f9f409749300f1bf4c",
  licenseFiles: Object.freeze({
    "Apache-2.0": "text/Apache-2.0.txt",
    "BSD-2-Clause": "text/BSD-2-Clause.txt",
    ISC: "text/ISC.txt",
    MIT: "text/MIT.txt",
    "MPL-2.0": "text/MPL-2.0.txt",
  }),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function sha256Buffer(content) {
  return createHash("sha256")
    .update(content)
    .digest("hex")
    .toUpperCase();
}

function strictUtf8(content, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      content,
    );
  } catch {
    throw new Error(
      `SPDX 规范许可文本不是严格 UTF-8：${label}`,
    );
  }
  assert(
    content.length > 0 && !content.includes(0),
    `SPDX 规范许可文本为空或含 NUL：${label}`,
  );
  return text;
}

function normalizedLicenseTokens(expression) {
  const source = String(expression ?? "");
  assert(
    !/\bAND\b|\bWITH\b|[()]/i.test(source),
    `规范文本策略不支持该许可表达式：${expression}`,
  );
  const tokens = source
    .replaceAll("/", " OR ")
    .split(/\s+OR\s+/i)
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
  assert(
    tokens.length > 0,
    `规范文本策略不支持该许可表达式：${expression}`,
  );
  return tokens;
}

function hasExactSourceIdentity(value) {
  return (
    exactKeys(value, [
      "repository",
      "releaseTag",
      "gitCommit",
      "licenseFiles",
    ]) &&
    value.repository === SPDX_CANONICAL_SOURCE.repository &&
    value.releaseTag === SPDX_CANONICAL_SOURCE.releaseTag &&
    value.gitCommit === SPDX_CANONICAL_SOURCE.gitCommit &&
    exactKeys(
      value.licenseFiles,
      Object.keys(SPDX_CANONICAL_SOURCE.licenseFiles),
    ) &&
    JSON.stringify(value.licenseFiles) ===
      JSON.stringify(SPDX_CANONICAL_SOURCE.licenseFiles)
  );
}

function canonicalSourceUrl(repositoryPath) {
  return (
    "https://api.github.com/repos/spdx/license-list-data/" +
    `contents/${repositoryPath}?ref=${SPDX_CANONICAL_SOURCE.gitCommit}`
  );
}

function hasReadableText(packageInfo) {
  return packageInfo.noticeFiles.some(
    (file) => file.textReadable === true,
  );
}

function hasExactExceptionFields(exception) {
  const common = [
    "ecosystem",
    "packageId",
    "name",
    "version",
    "license",
    "source",
    "licenseIds",
    "reason",
  ];
  if (exception?.ecosystem === "npm") {
    return exactKeys(exception, [...common, "integrity"]);
  }
  if (exception?.ecosystem === "cargo") {
    return exactKeys(exception, [...common, "checksum"]);
  }
  return false;
}

function validatePolicy(policy) {
  assert(
    exactKeys(policy, [
      "schemaVersion",
      "source",
      "exceptions",
    ]) &&
      policy.schemaVersion === "1.0" &&
      hasExactSourceIdentity(policy.source) &&
      Array.isArray(policy.exceptions) &&
      policy.exceptions.every(hasExactExceptionFields),
    "SPDX 规范许可文本策略字段或身份无效",
  );
}

function validatePolicyAndManifest(policy, manifest) {
  validatePolicy(policy);
  assert(
    exactKeys(manifest, [
      "schemaVersion",
      "generatedAt",
      "source",
      "bindings",
      "files",
    ]) &&
      manifest.schemaVersion === "1.0" &&
      new Date(manifest.generatedAt).toISOString() ===
        manifest.generatedAt &&
      hasExactSourceIdentity(manifest.source) &&
      Array.isArray(manifest.bindings) &&
      Array.isArray(manifest.files) &&
      JSON.stringify(manifest.bindings) ===
        JSON.stringify(policy.exceptions),
    "SPDX 规范许可文本同步证据字段或身份无效",
  );
  const expectedLicenseIds = Object.keys(
    SPDX_CANONICAL_SOURCE.licenseFiles,
  ).sort();
  const actualLicenseIds = manifest.files
    .map((file) => file.licenseId)
    .sort();
  assert(
    JSON.stringify(actualLicenseIds) ===
      JSON.stringify(expectedLicenseIds) &&
      manifest.files.every((file) =>
        exactKeys(file, [
          "licenseId",
          "repositoryPath",
          "sourceUrl",
          "path",
          "bytes",
          "sha256",
        ]),
      ),
    "SPDX 规范许可文件集合含未知、重复或缺失项",
  );
}

export async function applyCanonicalLicenseSources(
  packages,
  ecosystem,
  policy,
  manifest,
  projectRoot,
  readSourceFile = readFile,
) {
  validatePolicyAndManifest(policy, manifest);
  const exceptions = policy.exceptions
    .filter((entry) => entry.ecosystem === ecosystem)
    .sort((left, right) =>
      left.packageId.localeCompare(right.packageId),
    );
  const missingPackageIds = packages
    .filter((packageInfo) => !hasReadableText(packageInfo))
    .map((packageInfo) => packageInfo.packageId)
    .sort();
  assert(
    JSON.stringify(
      exceptions.map((entry) => entry.packageId),
    ) === JSON.stringify(missingPackageIds),
    `SPDX 规范许可策略未恰好覆盖当前 ${ecosystem} 文本缺口`,
  );
  const originalById = new Map(
    packages.map((packageInfo) => [
      packageInfo.packageId,
      packageInfo,
    ]),
  );
  const output = structuredClone(packages);
  const outputById = new Map(
    output.map((packageInfo) => [
      packageInfo.packageId,
      packageInfo,
    ]),
  );
  const filesByLicenseId = new Map(
    manifest.files.map((file) => [file.licenseId, file]),
  );
  const allowedRoot = path.resolve(
    projectRoot,
    "third_party",
    "license-texts",
    "spdx",
    SPDX_CANONICAL_SOURCE.releaseTag,
  );
  const groupsByLicenseId = new Map();

  for (const exception of exceptions) {
    const current = originalById.get(exception.packageId);
    assert(
      current &&
        current.name === exception.name &&
        current.version === exception.version &&
        current.license === exception.license &&
        current.source === exception.source &&
        (ecosystem === "npm"
          ? current.integrity === exception.integrity
          : current.checksum === exception.checksum) &&
        exception.reason ===
          "upstream-readable-text-unavailable",
      `SPDX 规范许可例外与当前依赖身份不一致：${exception.packageId}`,
    );
    assert(
      JSON.stringify([...exception.licenseIds].sort()) ===
        JSON.stringify(
          normalizedLicenseTokens(exception.license),
        ),
      `SPDX 规范许可标识与表达式不一致：${exception.packageId}`,
    );
    const target = outputById.get(exception.packageId);
    for (const licenseId of exception.licenseIds) {
      const file = filesByLicenseId.get(licenseId);
      const repositoryPath =
        SPDX_CANONICAL_SOURCE.licenseFiles[licenseId];
      assert(
        repositoryPath &&
          file?.repositoryPath === repositoryPath &&
          file.sourceUrl ===
            canonicalSourceUrl(repositoryPath),
        `SPDX 规范许可来源未固定到允许提交：${licenseId}`,
      );
      const absolutePath = path.resolve(
        projectRoot,
        ...file.path.split("/"),
      );
      const expectedPath =
        `third_party/license-texts/spdx/` +
        `${SPDX_CANONICAL_SOURCE.releaseTag}/${licenseId}.txt`;
      const relativeFromAllowedRoot = path.relative(
        allowedRoot,
        absolutePath,
      );
      assert(
        file.path === expectedPath &&
          relativeFromAllowedRoot === `${licenseId}.txt` &&
          !path.isAbsolute(relativeFromAllowedRoot),
        `SPDX 规范许可落盘路径越界：${licenseId}`,
      );
      const content = await readSourceFile(absolutePath);
      const decoded = strictUtf8(content, licenseId);
      assert(
        content.length === file.bytes &&
          sha256Buffer(content) === file.sha256 &&
          /^[A-F0-9]{64}$/.test(file.sha256),
        `SPDX 规范许可文本字节或哈希不一致：${licenseId}`,
      );
      target.noticeFiles.push({
        fileName: path.posix.basename(file.repositoryPath),
        bytes: content.length,
        sha256: file.sha256,
        textReadable: true,
        content: decoded.replace(/\r\n/g, "\n"),
        provenance: {
          kind: "verified-spdx-canonical-text",
          licenseId,
          manifestPath:
            "review/canonical-license-text-supplements.json",
          repository: SPDX_CANONICAL_SOURCE.repository,
          releaseTag: SPDX_CANONICAL_SOURCE.releaseTag,
          gitCommit: SPDX_CANONICAL_SOURCE.gitCommit,
          repositoryPath: file.repositoryPath,
          sourceUrl: file.sourceUrl,
          vendoredPath: file.path,
        },
      });
      const group = groupsByLicenseId.get(licenseId) ?? {
        licenseId,
        repository: SPDX_CANONICAL_SOURCE.repository,
        releaseTag: SPDX_CANONICAL_SOURCE.releaseTag,
        gitCommit: SPDX_CANONICAL_SOURCE.gitCommit,
        repositoryPath: file.repositoryPath,
        sourceUrl: file.sourceUrl,
        sha256: file.sha256,
        packageIds: [],
      };
      group.packageIds.push(exception.packageId);
      groupsByLicenseId.set(licenseId, group);
    }
  }

  return {
    packages: output,
    bindings: structuredClone(exceptions),
    groups: [...groupsByLicenseId.values()]
      .map((group) => ({
        ...group,
        packageIds: group.packageIds.sort(),
      }))
      .sort((left, right) =>
        left.licenseId.localeCompare(right.licenseId),
      ),
  };
}

export async function syncCanonicalLicenseTexts({
  projectRoot,
  policy,
  fetchBytes,
  makeDirectory = mkdir,
  writeSourceFile = writeFile,
  now = () => new Date(),
}) {
  validatePolicy(policy);
  const outputDirectory = path.join(
    projectRoot,
    "third_party",
    "license-texts",
    "spdx",
    SPDX_CANONICAL_SOURCE.releaseTag,
  );
  await makeDirectory(outputDirectory, { recursive: true });
  const files = [];
  for (const [licenseId, repositoryPath] of Object.entries(
    SPDX_CANONICAL_SOURCE.licenseFiles,
  )) {
    const sourceUrl = canonicalSourceUrl(repositoryPath);
    const content = await fetchBytes(sourceUrl, licenseId);
    strictUtf8(content, licenseId);
    const outputPath = path.join(
      outputDirectory,
      `${licenseId}.txt`,
    );
    await writeSourceFile(outputPath, content);
    files.push({
      licenseId,
      repositoryPath,
      sourceUrl,
      path: path
        .relative(projectRoot, outputPath)
        .split(path.sep)
        .join("/"),
      bytes: content.length,
      sha256: sha256Buffer(content),
    });
  }
  return {
    schemaVersion: "1.0",
    generatedAt: now().toISOString(),
    source: structuredClone(SPDX_CANONICAL_SOURCE),
    bindings: structuredClone(policy.exceptions),
    files: files.sort((left, right) =>
      left.licenseId.localeCompare(right.licenseId),
    ),
  };
}
