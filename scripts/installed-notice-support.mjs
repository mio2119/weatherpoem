import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const INSTALLED_NOTICE_SCHEMA_VERSION = "1.0";
export const INSTALLED_NOTICE_SCOPE =
  "installed-notice-byte-verification-only";
export const INSTALLED_NOTICE_RELATIVE_PATH =
  "licenses/THIRD_PARTY_NOTICES.md";

const SOURCE_RELATIVE_PATH = "docs/THIRD_PARTY_NOTICES.md";
const KINDS = ["nsis", "msi"];
const ISO_8601_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ROOT_KEYS = [
  "appVersion",
  "generatedAt",
  "installers",
  "noticeSource",
  "schemaVersion",
  "scope",
  "status",
].sort();
const INSTALLER_KEYS = [...KINDS].sort();
const RECORD_KEYS = [
  "artifact",
  "installedNotice",
  "kind",
  "verifiedAt",
].sort();
const ARTIFACT_KEYS = ["relativePath", "sha256"];
const NOTICE_SOURCE_KEYS = [
  "byteLength",
  "relativePath",
  "sha256",
];
const INSTALLED_NOTICE_KEYS = [
  "byteLength",
  "exactByteMatch",
  "relativePath",
  "sha256",
  "utf8Readable",
].sort();

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify(expected)
  );
}

function sha256(bytes) {
  return createHash("sha256")
    .update(bytes)
    .digest("hex")
    .toUpperCase();
}

function strictUtf8(bytes, label) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label}不是有效 UTF-8`);
  }
}

function isoNow(now) {
  const value = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(value.getTime())) {
    throw new Error("安装后 NOTICE 证据时间无效");
  }
  return value.toISOString();
}

function assertTime(value, now) {
  const timestamp = Date.parse(value);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (
    typeof value !== "string" ||
    !ISO_8601_TIMESTAMP.test(value) ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(current) ||
    timestamp > current + 5 * 60 * 1000
  ) {
    throw new Error("安装后 NOTICE 证据时间无效");
  }
}

function artifactFor(state, kind) {
  const artifact = state?.artifacts?.find(
    (item) => item.kind === kind,
  );
  if (
    !artifact ||
    typeof artifact.relativePath !== "string" ||
    path.isAbsolute(artifact.relativePath) ||
    !/^[A-F0-9]{64}$/.test(artifact.sha256 ?? "")
  ) {
    throw new Error(`安装后 NOTICE 证据缺少当前 ${kind} 发布物`);
  }
  return artifact;
}

export async function collectNoticeSource(projectRoot) {
  const absolutePath = path.join(
    projectRoot,
    ...SOURCE_RELATIVE_PATH.split("/"),
  );
  const bytes = await readFile(absolutePath);
  if (bytes.length === 0) {
    throw new Error("源第三方 NOTICE 为空");
  }
  strictUtf8(bytes, "源第三方 NOTICE ");
  return {
    relativePath: SOURCE_RELATIVE_PATH,
    sha256: sha256(bytes),
    byteLength: bytes.length,
    bytes,
  };
}

export async function collectInstalledNoticeRecord({
  state,
  noticeSource,
  kind,
  installRoot,
  now = new Date(),
}) {
  if (!KINDS.includes(kind)) {
    throw new Error(`不支持的安装器类型：${kind}`);
  }
  const artifact = artifactFor(state, kind);
  const installedPath = path.join(
    path.resolve(installRoot),
    ...INSTALLED_NOTICE_RELATIVE_PATH.split("/"),
  );
  let bytes;
  try {
    bytes = await readFile(installedPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("安装后的第三方 NOTICE 缺失");
    }
    throw error;
  }
  if (bytes.length === 0) {
    throw new Error("安装后的第三方 NOTICE 为空");
  }
  strictUtf8(bytes, "安装后的第三方 NOTICE ");
  const installedHash = sha256(bytes);
  if (
    installedHash !== noticeSource.sha256 ||
    !bytes.equals(noticeSource.bytes)
  ) {
    throw new Error("安装后的第三方 NOTICE 与源文件字节不一致");
  }
  return {
    kind,
    artifact: {
      relativePath: artifact.relativePath,
      sha256: artifact.sha256,
    },
    installedNotice: {
      relativePath: INSTALLED_NOTICE_RELATIVE_PATH,
      sha256: installedHash,
      byteLength: bytes.length,
      utf8Readable: true,
      exactByteMatch: true,
    },
    verifiedAt: isoNow(now),
  };
}

function currentRecord(
  record,
  state,
  noticeSource,
  expectedKind = record?.kind,
) {
  if (
    !record ||
    !KINDS.includes(expectedKind) ||
    record.kind !== expectedKind
  ) {
    return false;
  }
  const artifact = artifactFor(state, expectedKind);
  return (
    exactKeys(record, RECORD_KEYS) &&
    exactKeys(record.artifact, ARTIFACT_KEYS) &&
    exactKeys(record.installedNotice, INSTALLED_NOTICE_KEYS) &&
    record.artifact.relativePath === artifact.relativePath &&
    record.artifact.sha256 === artifact.sha256 &&
    record.installedNotice.relativePath ===
      INSTALLED_NOTICE_RELATIVE_PATH &&
    record.installedNotice.sha256 === noticeSource.sha256 &&
    record.installedNotice.byteLength === noticeSource.byteLength &&
    record.installedNotice.utf8Readable === true &&
    record.installedNotice.exactByteMatch === true
  );
}

export function mergeInstalledNoticeEvidence(
  existing,
  { state, noticeSource, record, now = new Date() },
) {
  if (!currentRecord(record, state, noticeSource)) {
    throw new Error("不能合并无效的安装后 NOTICE 记录");
  }
  const sameIdentity =
    existing?.schemaVersion === INSTALLED_NOTICE_SCHEMA_VERSION &&
    existing?.scope === INSTALLED_NOTICE_SCOPE &&
    existing?.appVersion === state.version &&
    existing?.noticeSource?.sha256 === noticeSource.sha256 &&
    existing?.noticeSource?.byteLength === noticeSource.byteLength;
  const installers = {};
  if (sameIdentity) {
    for (const kind of KINDS) {
      const previous = existing.installers?.[kind];
      if (currentRecord(previous, state, noticeSource, kind)) {
        installers[kind] = previous;
      }
    }
  }
  installers[record.kind] = record;
  const complete = KINDS.every((kind) => installers[kind]);
  return {
    schemaVersion: INSTALLED_NOTICE_SCHEMA_VERSION,
    scope: INSTALLED_NOTICE_SCOPE,
    status: complete ? "passed" : "partial",
    appVersion: state.version,
    noticeSource: {
      relativePath: noticeSource.relativePath,
      sha256: noticeSource.sha256,
      byteLength: noticeSource.byteLength,
    },
    installers,
    generatedAt: isoNow(now),
  };
}

export function assertInstalledNoticeEvidence(
  report,
  { state, noticeSource, now = new Date() },
) {
  const rootKeys = Object.keys(report ?? {}).sort();
  if (
    JSON.stringify(rootKeys) !== JSON.stringify(ROOT_KEYS) ||
    report.schemaVersion !== INSTALLED_NOTICE_SCHEMA_VERSION ||
    report.scope !== INSTALLED_NOTICE_SCOPE ||
    report.appVersion !== state.version ||
    !exactKeys(report.noticeSource, NOTICE_SOURCE_KEYS) ||
    report.noticeSource.relativePath !== SOURCE_RELATIVE_PATH ||
    report.noticeSource.sha256 !== noticeSource.sha256 ||
    report.noticeSource.byteLength !== noticeSource.byteLength
  ) {
    throw new Error("安装后 NOTICE 证据身份、范围或源文件无效");
  }
  assertTime(report.generatedAt, now);
  if (!exactKeys(report.installers, INSTALLER_KEYS)) {
    throw new Error("安装后 NOTICE 证据必须同时覆盖 NSIS 与 MSI");
  }
  if (report.status !== "passed") {
    throw new Error("安装后 NOTICE 证据身份、范围或源文件无效");
  }
  for (const kind of KINDS) {
    const record = report.installers[kind];
    if (!currentRecord(record, state, noticeSource, kind)) {
      throw new Error(`安装后 NOTICE 证据与当前 ${kind} 发布物不一致`);
    }
    assertTime(record.verifiedAt, now);
  }
  const serialized = JSON.stringify(report);
  if (/legalApproved|licenseComplete/i.test(serialized)) {
    throw new Error("安装后 NOTICE 证据越过了字节验证范围");
  }
  return true;
}
