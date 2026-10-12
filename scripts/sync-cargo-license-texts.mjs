import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const reportPath = path.join(
  projectRoot,
  "review",
  "third-party-notice-index.json",
);
const cargoLockPath = path.join(
  projectRoot,
  "src-tauri",
  "Cargo.lock",
);
const supplementPath = path.join(
  projectRoot,
  "review",
  "cargo-license-text-supplements.json",
);
const NOTICE_FILE_PATTERN =
  /^(?:licen[cs]e|copying|notice|unlicense|copyright)(?:$|[._-])/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(buffer, algorithm) {
  return createHash(algorithm)
    .update(buffer)
    .digest("hex")
    .toUpperCase();
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
    const size = Number.parseInt(
      cString(header.subarray(124, 136)).trim() || "0",
      8,
    );
    assert(
      Number.isFinite(size) && size >= 0,
      "crate TAR 长度无效",
    );
    const type = String.fromCharCode(header[156] || 0);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    assert(contentEnd <= archive.length, "crate TAR 被截断");
    const content = archive.subarray(contentStart, contentEnd);
    const name = longName ?? headerName;
    longName = null;
    if (type === "L") {
      longName = cString(content);
    } else if (type === "\0" || type === "0") {
      files.push({ path: name, content });
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

function cargoLockChecksums(lockText) {
  const result = new Map();
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
      result.set(`${name}@${version}`, checksum.toUpperCase());
    }
  }
  return result;
}

function normalizeGitHubRepository(value) {
  const raw = String(value ?? "")
    .replace(/^git\+/, "")
    .replace(/^git:\/\/github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const match = raw.match(
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

function packageDirectoryName(name, version) {
  return `${name.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}@${version}`;
}

async function syncPackage(packageId, packageInfo, checksum) {
  const name = packageInfo.name;
  const version = packageInfo.version;
  const downloadUrl =
    `https://crates.io/api/v1/crates/${encodeURIComponent(name)}/` +
    `${encodeURIComponent(version)}/download`;
  const crate = await fetchBytes(
    downloadUrl,
    `crate ${packageId}`,
    "application/octet-stream",
  );
  const crateSha256 = digest(crate, "sha256");
  assert(
    crateSha256 === checksum,
    `crate 与 Cargo.lock checksum 不一致：${packageId}`,
  );
  const files = tarFiles(gunzipSync(crate));
  const vcsFile = files.find((item) =>
    item.path.endsWith("/.cargo_vcs_info.json"),
  );
  if (!vcsFile) return { entry: null, unresolved: packageId };
  const vcsInfo = JSON.parse(vcsFile.content.toString("utf8"));
  const gitHead = vcsInfo.git?.sha1;
  const github = normalizeGitHubRepository(packageInfo.source);
  if (
    !github ||
    !/^[a-f0-9]{40}$/i.test(gitHead ?? "") ||
    vcsInfo.git?.dirty === true
  ) {
    return { entry: null, unresolved: packageId };
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
  if (candidates.length === 0) {
    return { entry: null, unresolved: packageId };
  }
  const outputDirectory = path.join(
    projectRoot,
    "third_party",
    "license-texts",
    "cargo",
    packageDirectoryName(name, version),
  );
  await mkdir(outputDirectory, { recursive: true });
  const fileEntries = [];
  for (const candidate of candidates) {
    const expectedPrefix =
      `https://api.github.com/repos/${github.owner}/${github.repo}/contents/`;
    const contentUrl = new URL(candidate.url);
    assert(
      candidate.url.startsWith(expectedPrefix) &&
        contentUrl.searchParams.get("ref")?.toLowerCase() ===
          gitHead.toLowerCase(),
      `GitHub 许可文本未锁定到 crate VCS 提交：${packageId}`,
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
    const fileName = path.posix.basename(candidate.path);
    const outputPath = path.join(outputDirectory, fileName);
    await writeFile(outputPath, content);
    fileEntries.push({
      repositoryPath: candidate.path,
      sourceUrl: candidate.url,
      path: path
        .relative(projectRoot, outputPath)
        .split(path.sep)
        .join("/"),
      bytes: content.length,
      sha256: digest(content, "sha256"),
    });
  }
  return {
    entry: {
      sourceKind: "cargo-git-commit",
      packageId,
      name,
      version,
      license: packageInfo.license,
      repository: github.repository,
      downloadUrl,
      lockChecksumSha256: checksum,
      crateSha256,
      vcsInfoArchivePath: vcsFile.path,
      vcsInfoSha256: digest(vcsFile.content, "sha256"),
      gitHead: gitHead.toLowerCase(),
      files: fileEntries.sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
    },
    unresolved: null,
  };
}

const [report, lockText, existing] = await Promise.all([
  readFile(reportPath, "utf8").then(JSON.parse),
  readFile(cargoLockPath, "utf8"),
  readFile(supplementPath, "utf8").then(JSON.parse),
]);
assert(
  existing.schemaVersion === "1.0",
  "Cargo 许可补充清单身份无效",
);
const checksums = cargoLockChecksums(lockText);
const candidateIds = [
  ...new Set([
    ...report.ecosystems.cargo.coverage.missingTextPackageIds,
    ...existing.entries.map((item) => item.packageId),
  ]),
].sort();
const entries = [];
const unresolved = [];
for (const packageId of candidateIds) {
  const packageInfo = report.ecosystems.cargo.packages.find(
    (item) => item.packageId === packageId,
  );
  assert(packageInfo, `NOTICE 报告不存在 Cargo 候选：${packageId}`);
  const checksum = checksums.get(
    `${packageInfo.name}@${packageInfo.version}`,
  );
  assert(checksum, `Cargo.lock 缺少校验和：${packageId}`);
  const result = await syncPackage(
    packageId,
    packageInfo,
    checksum,
  );
  if (result.entry) entries.push(result.entry);
  if (result.unresolved) unresolved.push(result.unresolved);
}
const manifest = {
  schemaVersion: "1.0",
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
      resolvedWithVcsCommitText: entries.length,
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
