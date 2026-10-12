import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const supplementPath = path.join(
  projectRoot,
  "review",
  "npm-license-text-supplements.json",
);
const reportPath = path.join(
  projectRoot,
  "review",
  "third-party-notice-index.json",
);
const packageLockPath = path.join(projectRoot, "package-lock.json");
const NOTICE_FILE_PATTERN =
  /^(?:licen[cs]e|copying|notice|unlicense|copyright)(?:$|[._-])/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(buffer, algorithm, encoding) {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function cString(buffer) {
  const zero = buffer.indexOf(0);
  return buffer
    .subarray(0, zero === -1 ? buffer.length : zero)
    .toString("utf8");
}

function tarFiles(archive) {
  const files = [];
  let offset = 0;
  let longName = null;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const prefix = cString(header.subarray(345, 500));
    const shortName = cString(header.subarray(0, 100));
    const headerName = prefix
      ? `${prefix}/${shortName}`
      : shortName;
    const sizeText = cString(header.subarray(124, 136)).trim();
    const size = Number.parseInt(sizeText || "0", 8);
    assert(Number.isFinite(size) && size >= 0, "npm 压缩包 TAR 长度无效");
    const type = String.fromCharCode(header[156] || 0);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    assert(contentEnd <= archive.length, "npm 压缩包 TAR 被截断");
    const content = archive.subarray(contentStart, contentEnd);
    const name = longName ?? headerName;
    longName = null;
    if (type === "L") {
      longName = cString(content);
    } else if (type === "\0" || type === "0") {
      files.push({ path: name, content });
    }
    offset =
      contentStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

function licenseFilesFromTarball(tarball) {
  const archive = gunzipSync(tarball);
  return tarFiles(archive).filter((item) => {
    const normalized = item.path.replaceAll("\\", "/");
    const relative = normalized.startsWith("package/")
      ? normalized.slice("package/".length)
      : normalized;
    return (
      !relative.includes("/") &&
      NOTICE_FILE_PATTERN.test(relative) &&
      !item.content.includes(0) &&
      !item.content.toString("utf8").includes("\uFFFD")
    );
  });
}

function packageJsonFromTarball(tarball) {
  const archive = gunzipSync(tarball);
  const file = tarFiles(archive).find(
    (item) =>
      item.path.replaceAll("\\", "/") ===
      "package/package.json",
  );
  assert(file, "npm 压缩包缺少 package/package.json");
  return JSON.parse(file.content.toString("utf8"));
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
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
}

function githubRepository(value) {
  const normalized = normalizeRepository(value);
  const match = normalized.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i,
  );
  return match
    ? {
        repository: `https://github.com/${match[1]}/${match[2]}`,
        owner: match[1],
        repo: match[2],
      }
    : null;
}

async function fetchBytes(
  url,
  label,
  accept = "application/vnd.github+json, application/json",
) {
  const response = await fetch(url, {
    headers: {
      accept,
      "user-agent": "WeatherPoem-license-evidence/0.2.0",
      "x-github-api-version": "2022-11-28",
    },
  });
  assert(response.ok, `${label}下载失败：${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function repositoryLicenseFiles(
  packageId,
  metadata,
  packageManifest,
) {
  const metadataUrl =
    `https://registry.npmjs.org/${encodeURIComponent(metadata.name)}/` +
    encodeURIComponent(metadata.version);
  const metadataBytes = await fetchBytes(
    metadataUrl,
    `npm 版本元数据 ${packageId}`,
  );
  const versionMetadata = JSON.parse(metadataBytes.toString("utf8"));
  assert(
    versionMetadata.name === metadata.name &&
      versionMetadata.version === metadata.version &&
      versionMetadata.dist?.tarball === metadata.resolved &&
      versionMetadata.dist?.integrity === metadata.integrity,
    `npm 版本元数据与锁文件不一致：${packageId}`,
  );
  const gitHead = versionMetadata.gitHead;
  const github = githubRepository(
    versionMetadata.repository ?? packageManifest.repository,
  );
  if (!github || !/^[a-f0-9]{40}$/i.test(gitHead ?? "")) {
    return null;
  }
  const contentsUrl =
    `https://api.github.com/repos/${encodeURIComponent(github.owner)}/` +
    `${encodeURIComponent(github.repo)}/contents?ref=${gitHead}`;
  const contentsBytes = await fetchBytes(
    contentsUrl,
    `GitHub 根目录元数据 ${packageId}`,
  );
  const contents = JSON.parse(contentsBytes.toString("utf8"));
  assert(
    Array.isArray(contents),
    `GitHub 根目录元数据格式无效：${packageId}`,
  );
  const candidates = contents
    .filter(
      (item) =>
        item?.type === "file" &&
        typeof item.name === "string" &&
        NOTICE_FILE_PATTERN.test(item.name) &&
        typeof item.url === "string",
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  if (candidates.length === 0) return null;
  const files = [];
  for (const candidate of candidates) {
    const expectedPrefix =
      `https://api.github.com/repos/${github.owner}/${github.repo}/contents/`;
    const contentUrl = new URL(candidate.url);
    assert(
      candidate.url.startsWith(expectedPrefix) &&
        contentUrl.searchParams.get("ref")?.toLowerCase() ===
          gitHead.toLowerCase(),
      `GitHub 许可文本未锁定到 npm gitHead：${packageId}`,
    );
    const content = await fetchBytes(
      candidate.url,
      `GitHub 许可文本 ${packageId}`,
      "application/vnd.github.raw+json",
    );
    const decoded = content.toString("utf8");
    assert(
      !content.includes(0) && !decoded.includes("\uFFFD"),
      `GitHub 许可文本不可读：${packageId}`,
    );
    files.push({
      repositoryPath: candidate.path,
      sourceUrl: candidate.url,
      content,
    });
  }
  return {
    registryMetadataUrl: metadataUrl,
    registryMetadataSha256: digest(
      metadataBytes,
      "sha256",
      "hex",
    ).toUpperCase(),
    repository: github.repository,
    gitHead: gitHead.toLowerCase(),
    files,
  };
}

function packageDirectoryName(name, version) {
  return `${name
    .replace(/^@/, "at-")
    .replaceAll("/", "--")
    .replaceAll(/[^a-zA-Z0-9._-]/g, "-")}@${version}`;
}

async function downloadPackage(packageId, metadata) {
  assert(
    typeof metadata.resolved === "string" &&
      metadata.resolved.startsWith("https://registry.npmjs.org/") &&
      typeof metadata.integrity === "string",
    `npm 包缺少受信任的 resolved/integrity：${packageId}`,
  );
  const response = await fetch(metadata.resolved, {
    headers: {
      "user-agent": "WeatherPoem-license-evidence/0.2.0",
    },
  });
  assert(
    response.ok,
    `npm 许可压缩包下载失败：${packageId} ${response.status}`,
  );
  const tarball = Buffer.from(await response.arrayBuffer());
  const separator = metadata.integrity.indexOf("-");
  const algorithm = metadata.integrity.slice(0, separator);
  const expected = metadata.integrity.slice(separator + 1);
  assert(
    separator > 0 &&
      digest(tarball, algorithm, "base64") === expected,
    `npm 许可压缩包完整性校验失败：${packageId}`,
  );
  const packageManifest = packageJsonFromTarball(tarball);
  const archiveFiles = licenseFilesFromTarball(tarball);
  const repositorySource =
    archiveFiles.length === 0
      ? await repositoryLicenseFiles(
          packageId,
          metadata,
          packageManifest,
        )
      : null;
  if (archiveFiles.length === 0 && !repositorySource) {
    return { entry: null, unresolved: packageId };
  }
  const packageName = metadata.name;
  const outputDirectory = path.join(
    projectRoot,
    "third_party",
    "license-texts",
    "npm",
    packageDirectoryName(packageName, metadata.version),
  );
  await mkdir(outputDirectory, { recursive: true });
  const fileEntries = [];
  const sourceFiles =
    archiveFiles.length > 0
      ? archiveFiles.map((file) => ({
          fileName: path.posix.basename(
            file.path.replaceAll("\\", "/"),
          ),
          archivePath: file.path.replaceAll("\\", "/"),
          repositoryPath: null,
          sourceUrl: null,
          content: file.content,
        }))
      : repositorySource.files.map((file) => ({
          fileName: path.posix.basename(file.repositoryPath),
          archivePath: null,
          repositoryPath: file.repositoryPath,
          sourceUrl: file.sourceUrl,
          content: file.content,
        }));
  for (const file of sourceFiles) {
    const fileName = file.fileName;
    const outputPath = path.join(outputDirectory, fileName);
    await writeFile(outputPath, file.content);
    const relativePath = path
      .relative(projectRoot, outputPath)
      .split(path.sep)
      .join("/");
    fileEntries.push({
      ...(file.archivePath
        ? { archivePath: file.archivePath }
        : {
            repositoryPath: file.repositoryPath,
            sourceUrl: file.sourceUrl,
          }),
      path: relativePath,
      bytes: file.content.length,
      sha256: digest(file.content, "sha256", "hex").toUpperCase(),
    });
  }
  fileEntries.sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  return {
    entry: {
      sourceKind:
        archiveFiles.length > 0
          ? "npm-registry-archive"
          : "npm-git-commit",
      packageId,
      name: packageName,
      version: metadata.version,
      license: metadata.license ?? null,
      resolved: metadata.resolved,
      integrity: metadata.integrity,
      archiveSha512: digest(tarball, "sha512", "hex").toUpperCase(),
      ...(repositorySource
        ? {
            registryMetadataUrl:
              repositorySource.registryMetadataUrl,
            registryMetadataSha256:
              repositorySource.registryMetadataSha256,
            repository: repositorySource.repository,
            gitHead: repositorySource.gitHead,
          }
        : {}),
      files: fileEntries,
    },
    unresolved: null,
  };
}

const [packageLock, report, existing] = await Promise.all([
  readFile(packageLockPath, "utf8").then(JSON.parse),
  readFile(reportPath, "utf8").then(JSON.parse),
  readFile(supplementPath, "utf8").then(JSON.parse),
]);
assert(
  ["1.0", "1.1"].includes(existing.schemaVersion),
  "npm 许可补充清单身份无效",
);
const missingIds = report.ecosystems.npm.coverage.missingTextPackageIds;
const candidateIds = [
  ...new Set([
    ...missingIds,
    ...existing.entries.map((item) => item.packageId),
  ]),
].sort();
const entries = [];
const unresolved = [];
for (const packageId of candidateIds) {
  const packagePath = packageId.replace(/^npm:/, "");
  const metadata = packageLock.packages[packagePath];
  assert(metadata, `npm 锁文件不存在许可候选：${packageId}`);
  const result = await downloadPackage(packageId, {
    ...metadata,
    name:
      metadata.name ??
      packagePath.split("node_modules/").at(-1),
  });
  if (result.entry) entries.push(result.entry);
  if (result.unresolved) unresolved.push(result.unresolved);
}
const manifest = {
  schemaVersion: "1.1",
  generatedAt: new Date().toISOString(),
  entries: entries.sort((left, right) =>
    left.packageId.localeCompare(right.packageId),
  ),
};
await writeFile(
  supplementPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(
  JSON.stringify(
    {
      downloaded: candidateIds.length,
      resolvedWithArchiveText: entries.length,
      unresolved,
      manifest: path
        .relative(projectRoot, supplementPath)
        .split(path.sep)
        .join("/"),
    },
    null,
    2,
  ),
);
