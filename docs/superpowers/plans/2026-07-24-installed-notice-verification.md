# Installed NOTICE Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that real NSIS and MSI installations contain a readable byte-for-byte copy of the current third-party NOTICE, bind that proof to the current release artifacts, and require it for manual Windows and production release gates.

**Architecture:** A focused Node.js support module performs deterministic byte, UTF-8, hash, schema, timestamp, and stale-evidence checks. A thin CLI records one real installation at a time into an atomic aggregate report, a separate checker validates the finished report, NSIS/MSI lifecycle scripts invoke the CLI before uninstalling, and `verify-release.mjs` requires the aggregate report only for manual Windows or production verification.

**Tech Stack:** Node.js 22 ESM, `node:test`, PowerShell 5.1-compatible lifecycle scripts, SHA-256, strict `TextDecoder`, JSON evidence, existing WeatherPoem release-state helpers.

## Execution Record

Tasks 1–6 were implemented and verified on 2026-07-24. Task 7 remains pending until the active eight-hour run reaches a passing terminal result.

- The byte verifier, aggregate evidence model, read-only checker, NSIS/MSI lifecycle hooks, release-gate integration, contract tests, and RQT-23 documentation are present.
- Ordinary release verification passed with `35/35` release contracts.
- Both lifecycle scripts parse with zero Windows PowerShell errors.
- `output/WeatherPoem_0.2.0_INSTALLED_NOTICE.json` is intentionally absent before the real post-rebuild NSIS and MSI installations.
- Manual Windows verification currently stops at the earlier missing elevated MSI lifecycle evidence. No installed-NOTICE or legal-approval claim has been made.
- The frozen EXE was not rebuilt, replaced, renamed, or terminated while the eight-hour run remained active.
- A temporary requirements-DOCX preflight succeeded: 1,005 paragraphs, 49 tables, 170 real Heading 1–3 paragraphs, 15 parseable XML parts, zero replacement characters, zero internal citation tokens, and zero accessibility findings. The tested local Windows adapter rendered 73 pages; after two TDD layout fixes, every final page passed full-page visual inspection.

## Global Constraints

- Actual source changes stay under `E:\weatherpoem`; `D:\纯净工作台` remains an isolated control and audit workspace.
- Do not rebuild, replace, rename, or terminate the EXE bound to the active 8-hour run before that run reaches a terminal result.
- The installed relative path is exactly `licenses/THIRD_PARTY_NOTICES.md`.
- Installed NOTICE bytes must exactly match `docs/THIRD_PARTY_NOTICES.md`; no newline or encoding normalization is allowed.
- Accepted installation kinds are exactly `nsis` and `msi`.
- Evidence scope is exactly `installed-notice-byte-verification-only`; it must not claim license completeness or legal approval.
- A timestamp is valid only when it parses as ISO 8601 and is no more than five minutes in the future.
- Plain `npm run release:verify` remains non-elevated; `--manual-windows` and `--production` require installed NOTICE evidence.
- Failed inspection never writes or replaces aggregate evidence.
- The current workspace is not a Git repository. Run all verification steps, but skip commit commands until Git is initialized; never claim a skipped commit exists.

---

## File Map

- Create `scripts/installed-notice-support.mjs`: pure constants, byte inspection, record collection, aggregate merge, and evidence assertion.
- Create `scripts/installed-notice-contract.test.mjs`: behavior tests for missing, empty, malformed, mismatched, partial, complete, stale, and privacy-safe evidence.
- Create `scripts/verify-installed-notice.mjs`: production CLI that inspects one real installation and atomically updates aggregate evidence.
- Create `scripts/installed-notice-check.mjs`: read-only checker for the current aggregate evidence.
- Create `scripts/installed-notice-command-contract.test.mjs`: contract tests for CLI argument boundaries and package scripts.
- Modify `scripts/test-nsis-lifecycle.ps1`: call the CLI after installed launch succeeds and before silent uninstall.
- Modify `scripts/test-msi-elevated-lifecycle.ps1`: call the CLI after repair succeeds and before MSI uninstall.
- Modify `scripts/windows-manual-evidence-contract.test.mjs`: prove both lifecycle integrations and release-gate wiring exist in the correct order.
- Modify `scripts/verify-release.mjs`: validate aggregate installed-NOTICE evidence only when manual Windows evidence is required.
- Modify `package.json`: add `licenses:notices:installed:check` and include its contract tests in release verification commands.
- Modify `docs/CONTENT_ASSET_LICENSES.md`: distinguish configured, installed-byte-verified, and legally approved states.
- Modify `docs/MVP_VERIFICATION.md`: document the exact real-install verification command and remaining legal gaps.
- Modify `review/requirements-traceability.json`: add the new report and commands to RQT-23 without changing its status to passed.

---

### Task 1: Establish the Installed-NOTICE Support API

**Files:**
- Create: `scripts/installed-notice-support.mjs`
- Create: `scripts/installed-notice-contract.test.mjs`

**Interfaces:**
- Produces: `INSTALLED_NOTICE_SCHEMA_VERSION`, `INSTALLED_NOTICE_SCOPE`, `INSTALLED_NOTICE_RELATIVE_PATH`
- Produces: `collectNoticeSource(projectRoot) -> Promise<NoticeSourceWithBytes>`
- Produces: `collectInstalledNoticeRecord({ state, noticeSource, kind, installRoot, now }) -> Promise<InstallerNoticeRecord>`
- Produces: `mergeInstalledNoticeEvidence(existing, { state, noticeSource, record, now }) -> InstalledNoticeEvidence`
- Produces: `assertInstalledNoticeEvidence(report, { state, noticeSource, now }) -> true`
- Consumes: release state shaped like `collectReleaseState()` from `scripts/release-support.mjs`

- [ ] **Step 1: Write a failing API-contract test**

Create `scripts/installed-notice-contract.test.mjs` with:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const supportPath = path.join(
  projectRoot,
  "scripts",
  "installed-notice-support.mjs",
);
const supportSource = await readFile(supportPath, "utf8").catch(
  (error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  },
);

test("installed NOTICE support exposes one narrow evidence API", () => {
  for (const name of [
    "INSTALLED_NOTICE_SCHEMA_VERSION",
    "INSTALLED_NOTICE_SCOPE",
    "INSTALLED_NOTICE_RELATIVE_PATH",
    "collectNoticeSource",
    "collectInstalledNoticeRecord",
    "mergeInstalledNoticeEvidence",
    "assertInstalledNoticeEvidence",
  ]) {
    assert.match(supportSource, new RegExp(`export .*${name}`));
  }
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
node --test scripts/installed-notice-contract.test.mjs
```

Expected: one assertion failure because `scripts/installed-notice-support.mjs` does not exist.

- [ ] **Step 3: Add the smallest API skeleton**

Create `scripts/installed-notice-support.mjs` with:

```js
export const INSTALLED_NOTICE_SCHEMA_VERSION = "1.0";
export const INSTALLED_NOTICE_SCOPE =
  "installed-notice-byte-verification-only";
export const INSTALLED_NOTICE_RELATIVE_PATH =
  "licenses/THIRD_PARTY_NOTICES.md";

export async function collectNoticeSource() {
  throw new Error("installed NOTICE support is not implemented");
}

export async function collectInstalledNoticeRecord() {
  throw new Error("installed NOTICE support is not implemented");
}

export function mergeInstalledNoticeEvidence() {
  throw new Error("installed NOTICE support is not implemented");
}

export function assertInstalledNoticeEvidence() {
  throw new Error("installed NOTICE support is not implemented");
}
```

- [ ] **Step 4: Run the API-contract test and verify GREEN**

Run:

```powershell
node --test scripts/installed-notice-contract.test.mjs
```

Expected: `1` test passes.

- [ ] **Step 5: Commit when Git is available**

```powershell
git add scripts/installed-notice-support.mjs scripts/installed-notice-contract.test.mjs
git commit -m "test: define installed notice evidence API"
```

Current environment expectation: `git` reports that `E:\weatherpoem` is not a repository, so record the step as skipped rather than claiming a commit.

---

### Task 2: Implement Byte Inspection and Aggregate Evidence with TDD

**Files:**
- Modify: `scripts/installed-notice-contract.test.mjs`
- Modify: `scripts/installed-notice-support.mjs`

**Interfaces:**
- Consumes: the Task 1 support API
- Produces: deterministic evidence with root keys `schemaVersion`, `scope`, `status`, `appVersion`, `noticeSource`, `installers`, `generatedAt`

- [ ] **Step 1: Replace the source-only test with behavior tests that fail on the skeleton**

Replace `scripts/installed-notice-contract.test.mjs` with:

```js
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  INSTALLED_NOTICE_RELATIVE_PATH,
  assertInstalledNoticeEvidence,
  collectInstalledNoticeRecord,
  collectNoticeSource,
  mergeInstalledNoticeEvidence,
} from "./installed-notice-support.mjs";

function releaseState(root) {
  return {
    product: "WeatherPoem",
    version: "0.2.0",
    artifacts: [
      {
        kind: "nsis",
        relativePath:
          "src-tauri/target/release/bundle/nsis/WeatherPoem_0.2.0_x64-setup.exe",
        absolutePath: path.join(root, "nsis.exe"),
        sha256: "A".repeat(64),
      },
      {
        kind: "msi",
        relativePath:
          "src-tauri/target/release/bundle/msi/WeatherPoem_0.2.0_x64_en-US.msi",
        absolutePath: path.join(root, "weatherpoem.msi"),
        sha256: "B".repeat(64),
      },
    ],
  };
}

async function fixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "weatherpoem-notice-"),
  );
  await mkdir(path.join(root, "docs"), { recursive: true });
  const sourceBytes = Buffer.from(
    "# Third-party notices\nMIT\n",
    "utf8",
  );
  await writeFile(
    path.join(root, "docs", "THIRD_PARTY_NOTICES.md"),
    sourceBytes,
  );
  await writeFile(path.join(root, "nsis.exe"), "nsis");
  await writeFile(path.join(root, "weatherpoem.msi"), "msi");
  return {
    root,
    state: releaseState(root),
    sourceBytes,
    async install(kind, bytes = sourceBytes) {
      const installRoot = path.join(root, `install-${kind}`);
      const installedPath = path.join(
        installRoot,
        ...INSTALLED_NOTICE_RELATIVE_PATH.split("/"),
      );
      await mkdir(path.dirname(installedPath), { recursive: true });
      await writeFile(installedPath, bytes);
      return installRoot;
    },
  };
}

test("missing installed NOTICE is rejected without evidence", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const source = await collectNoticeSource(value.root);
  await assert.rejects(
    collectInstalledNoticeRecord({
      state: value.state,
      noticeSource: source,
      kind: "nsis",
      installRoot: path.join(value.root, "missing"),
      now: new Date("2026-07-24T02:00:00.000Z"),
    }),
    /安装后的第三方 NOTICE 缺失/,
  );
});

test("empty, invalid UTF-8, and changed bytes are rejected", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const source = await collectNoticeSource(value.root);
  for (const [bytes, expected] of [
    [Buffer.alloc(0), /NOTICE 为空/],
    [Buffer.from([0xc3, 0x28]), /不是有效 UTF-8/],
    [Buffer.from("changed", "utf8"), /与源文件字节不一致/],
  ]) {
    const installRoot = await value.install("nsis", bytes);
    await assert.rejects(
      collectInstalledNoticeRecord({
        state: value.state,
        noticeSource: source,
        kind: "nsis",
        installRoot,
        now: new Date("2026-07-24T02:00:00.000Z"),
      }),
      expected,
    );
  }
});

test("one installer remains partial and current NSIS plus MSI passes", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const source = await collectNoticeSource(value.root);
  const now = new Date("2026-07-24T02:00:00.000Z");
  const nsis = await collectInstalledNoticeRecord({
    state: value.state,
    noticeSource: source,
    kind: "nsis",
    installRoot: await value.install("nsis"),
    now,
  });
  const partial = mergeInstalledNoticeEvidence(null, {
    state: value.state,
    noticeSource: source,
    record: nsis,
    now,
  });
  assert.equal(partial.status, "partial");
  assert.deepEqual(Object.keys(partial.installers), ["nsis"]);
  assert.throws(
    () =>
      assertInstalledNoticeEvidence(partial, {
        state: value.state,
        noticeSource: source,
        now,
      }),
    /NSIS 与 MSI/,
  );

  const msi = await collectInstalledNoticeRecord({
    state: value.state,
    noticeSource: source,
    kind: "msi",
    installRoot: await value.install("msi"),
    now,
  });
  const complete = mergeInstalledNoticeEvidence(partial, {
    state: value.state,
    noticeSource: source,
    record: msi,
    now,
  });
  assert.equal(complete.status, "passed");
  assert.equal(
    assertInstalledNoticeEvidence(complete, {
      state: value.state,
      noticeSource: source,
      now,
    }),
    true,
  );
  assert.doesNotMatch(
    JSON.stringify(complete),
    /weatherpoem-notice-|legalApproved|licenseComplete/,
  );
});

test("stale artifact, source, version, schema, or future time is rejected", async (t) => {
  const value = await fixture();
  t.after(() => rm(value.root, { recursive: true, force: true }));
  const source = await collectNoticeSource(value.root);
  const now = new Date("2026-07-24T02:00:00.000Z");
  let report = null;
  for (const kind of ["nsis", "msi"]) {
    const record = await collectInstalledNoticeRecord({
      state: value.state,
      noticeSource: source,
      kind,
      installRoot: await value.install(kind),
      now,
    });
    report = mergeInstalledNoticeEvidence(report, {
      state: value.state,
      noticeSource: source,
      record,
      now,
    });
  }

  for (const mutate of [
    (copy) => {
      copy.schemaVersion = "0.9";
    },
    (copy) => {
      copy.appVersion = "0.1.0";
    },
    (copy) => {
      copy.noticeSource.sha256 = "C".repeat(64);
    },
    (copy) => {
      copy.noticeSource.absolutePath =
        "C:\\Users\\student\\weatherpoem\\docs";
    },
    (copy) => {
      copy.installers.nsis.artifact.sha256 = "D".repeat(64);
    },
    (copy) => {
      const nsis = copy.installers.nsis;
      copy.installers.nsis = copy.installers.msi;
      copy.installers.msi = nsis;
    },
    (copy) => {
      copy.installers.nsis.installRoot =
        "C:\\Users\\student\\AppData\\Local\\WeatherPoem";
    },
    (copy) => {
      copy.installers.nsis.legalApproved = true;
    },
    (copy) => {
      copy.generatedAt = "July 24, 2026 02:00:00 GMT";
    },
    (copy) => {
      copy.generatedAt = "2026-07-24T02:06:00.000Z";
    },
  ]) {
    const copy = structuredClone(report);
    mutate(copy);
    assert.throws(
      () =>
        assertInstalledNoticeEvidence(copy, {
          state: value.state,
          noticeSource: source,
          now,
        }),
      /安装后 NOTICE 证据/,
    );
  }
});
```

- [ ] **Step 2: Run behavior tests and verify RED**

Run:

```powershell
node --test scripts/installed-notice-contract.test.mjs
```

Expected: tests fail with `installed NOTICE support is not implemented`.

- [ ] **Step 3: Implement deterministic validation and aggregation**

Replace `scripts/installed-notice-support.mjs` with:

```js
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
    !Number.isFinite(timestamp) ||
    typeof value !== "string" ||
    !ISO_8601_TIMESTAMP.test(value) ||
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
  if (!artifact || !/^[A-F0-9]{64}$/.test(artifact.sha256 ?? "")) {
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
    exactKeys(
      record.installedNotice,
      INSTALLED_NOTICE_KEYS,
    ) &&
    record.artifact?.relativePath === artifact.relativePath &&
    record.artifact?.sha256 === artifact.sha256 &&
    record.installedNotice?.relativePath ===
      INSTALLED_NOTICE_RELATIVE_PATH &&
    record.installedNotice?.sha256 === noticeSource.sha256 &&
    record.installedNotice?.byteLength === noticeSource.byteLength &&
    record.installedNotice?.utf8Readable === true &&
    record.installedNotice?.exactByteMatch === true
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
    report.noticeSource?.relativePath !== SOURCE_RELATIVE_PATH ||
    report.noticeSource?.sha256 !== noticeSource.sha256 ||
    report.noticeSource?.byteLength !== noticeSource.byteLength
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
```

- [ ] **Step 4: Run support tests and verify GREEN**

Run:

```powershell
node --test scripts/installed-notice-contract.test.mjs
```

Expected: all four behavior tests pass with no warnings.

- [ ] **Step 5: Run formatting and lint checks for the new module**

Run:

```powershell
npm.cmd run lint
```

Expected: exit code `0`, no ESLint warnings.

- [ ] **Step 6: Commit when Git is available**

```powershell
git add scripts/installed-notice-support.mjs scripts/installed-notice-contract.test.mjs
git commit -m "feat: validate installed third-party notice bytes"
```

Current environment expectation: skip honestly because the workspace is not a Git repository.

---

### Task 3: Add Atomic Recording and a Read-Only Checker

**Files:**
- Create: `scripts/verify-installed-notice.mjs`
- Create: `scripts/installed-notice-check.mjs`
- Create: `scripts/installed-notice-command-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 2 support API and `collectReleaseState(projectRoot)`
- Produces: `output/WeatherPoem_<version>_INSTALLED_NOTICE.json`
- Produces: `npm run licenses:notices:installed:check`

- [ ] **Step 1: Write a failing command-contract test**

Create `scripts/installed-notice-command-contract.test.mjs` with:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const read = (relativePath) =>
  readFile(path.join(projectRoot, relativePath), "utf8").catch(
    (error) => {
      if (error?.code === "ENOENT") return "";
      throw error;
    },
  );
const recorder = await read("scripts/verify-installed-notice.mjs");
const checker = await read("scripts/installed-notice-check.mjs");
const packageJson = JSON.parse(await read("package.json"));

test("recorder accepts explicit kind, install root, artifact, and output", () => {
  assert.match(recorder, /--kind/);
  assert.match(recorder, /--install-root/);
  assert.match(recorder, /--artifact/);
  assert.match(recorder, /--output/);
  assert.match(recorder, /collectReleaseState/);
  assert.match(recorder, /mergeInstalledNoticeEvidence/);
  assert.match(recorder, /rename/);
  assert.doesNotMatch(recorder, /legalApproved|licenseComplete/);
});

test("read-only checker binds evidence to the current release", () => {
  assert.match(checker, /collectReleaseState/);
  assert.match(checker, /assertInstalledNoticeEvidence/);
  assert.doesNotMatch(checker, /\bwriteFile\b|\brename\b/);
});

test("recorder completes inspection and merge before atomic replacement", () => {
  const inspection = recorder.indexOf(
    "const record = await collectInstalledNoticeRecord",
  );
  const merge = recorder.indexOf(
    "const report = mergeInstalledNoticeEvidence",
  );
  const write = recorder.indexOf("await writeFile");
  const replace = recorder.indexOf("await rename");
  assert.ok(inspection > 0);
  assert.ok(merge > inspection);
  assert.ok(write > merge);
  assert.ok(replace > write);
});

test("package exposes a dedicated installed NOTICE gate", () => {
  assert.equal(
    packageJson.scripts["licenses:notices:installed:check"],
    "node scripts/installed-notice-check.mjs && node --test scripts/installed-notice-contract.test.mjs scripts/installed-notice-command-contract.test.mjs",
  );
});
```

- [ ] **Step 2: Run the command-contract test and verify RED**

Run:

```powershell
node --test scripts/installed-notice-command-contract.test.mjs
```

Expected: assertions fail because the recorder, checker, and package script do not exist.

- [ ] **Step 3: Add the real-install recorder**

Create `scripts/verify-installed-notice.mjs` with:

```js
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectInstalledNoticeRecord,
  collectNoticeSource,
  mergeInstalledNoticeEvidence,
} from "./installed-notice-support.mjs";
import { collectReleaseState } from "./release-support.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`缺少参数 ${name}`);
  }
  return process.argv[index + 1];
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const kind = argument("--kind");
const installRoot = path.resolve(argument("--install-root"));
const artifactPath = path.resolve(argument("--artifact"));
const requestedEvidencePath = path.resolve(argument("--output"));
const state = await collectReleaseState(projectRoot);
const expectedArtifact = state.artifacts.find(
  (item) => item.kind === kind,
);
if (
  !expectedArtifact ||
  path.resolve(expectedArtifact.absolutePath) !== artifactPath
) {
  throw new Error(`传入的 ${kind} 发布物不是当前发布物`);
}
const noticeSource = await collectNoticeSource(projectRoot);
const evidencePath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_INSTALLED_NOTICE.json`,
);
if (requestedEvidencePath !== evidencePath) {
  throw new Error("安装后 NOTICE 证据输出路径不是当前版本的标准路径");
}
const record = await collectInstalledNoticeRecord({
  state,
  noticeSource,
  kind,
  installRoot,
});
let existing = null;
try {
  existing = JSON.parse(
    (await readFile(evidencePath, "utf8")).replace(/^\uFEFF/, ""),
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const report = mergeInstalledNoticeEvidence(existing, {
  state,
  noticeSource,
  record,
});
const temporaryPath =
  `${evidencePath}.${process.pid}.${Date.now()}.tmp`;
await writeFile(
  temporaryPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await rename(temporaryPath, evidencePath);
console.log(
  `${kind.toUpperCase()} 安装后的第三方 NOTICE 已验证；聚合状态：${report.status}`,
);
```

- [ ] **Step 4: Add the read-only checker**

Create `scripts/installed-notice-check.mjs` with:

```js
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInstalledNoticeEvidence,
  collectNoticeSource,
} from "./installed-notice-support.mjs";
import { collectReleaseState } from "./release-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const state = await collectReleaseState(projectRoot);
const noticeSource = await collectNoticeSource(projectRoot);
const evidencePath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_INSTALLED_NOTICE.json`,
);
const report = JSON.parse(
  (await readFile(evidencePath, "utf8")).replace(/^\uFEFF/, ""),
);
assertInstalledNoticeEvidence(report, {
  state,
  noticeSource,
});
console.log(
  `安装后 NOTICE 证据有效：WeatherPoem ${state.version}，NSIS 与 MSI 均与当前 NOTICE 字节一致`,
);
```

- [ ] **Step 5: Add the package script**

Insert into `package.json` immediately after `licenses:notices:check`:

```json
"licenses:notices:installed:check": "node scripts/installed-notice-check.mjs && node --test scripts/installed-notice-contract.test.mjs scripts/installed-notice-command-contract.test.mjs",
```

- [ ] **Step 6: Run command-contract tests and verify GREEN**

Run:

```powershell
node --test scripts/installed-notice-contract.test.mjs scripts/installed-notice-command-contract.test.mjs
```

Expected: all installed-NOTICE tests pass.

- [ ] **Step 7: Prove the checker remains honestly red before real installs**

Run:

```powershell
npm.cmd run licenses:notices:installed:check
```

Expected before NSIS/MSI lifecycle execution: non-zero exit because `WeatherPoem_0.2.0_INSTALLED_NOTICE.json` is missing or incomplete. Do not create synthetic passing evidence.

- [ ] **Step 8: Commit when Git is available**

```powershell
git add package.json scripts/verify-installed-notice.mjs scripts/installed-notice-check.mjs scripts/installed-notice-command-contract.test.mjs
git commit -m "feat: record and check installed notice evidence"
```

Current environment expectation: skip honestly because the workspace is not a Git repository.

---

### Task 4: Wire Real NSIS and MSI Lifecycle Tests

**Files:**
- Modify: `scripts/windows-manual-evidence-contract.test.mjs`
- Modify: `scripts/test-nsis-lifecycle.ps1`
- Modify: `scripts/test-msi-elevated-lifecycle.ps1`

**Interfaces:**
- Consumes: `node scripts/verify-installed-notice.mjs --kind <kind> --install-root <absolute path> --artifact <absolute path> --output <absolute path>`
- Produces: NSIS and MSI entries in the aggregate installed-NOTICE evidence

- [ ] **Step 1: Add failing lifecycle-order assertions**

Append to `scripts/windows-manual-evidence-contract.test.mjs`:

```js
const nsisScript = await readFile(
  path.join(projectRoot, "scripts", "test-nsis-lifecycle.ps1"),
  "utf8",
);

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
    '$uninstallExitCode = Invoke-MsiExec',
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
```

- [ ] **Step 2: Run the Windows contract test and verify RED**

Run:

```powershell
node --test scripts/windows-manual-evidence-contract.test.mjs
```

Expected: the new test fails because neither lifecycle script invokes the recorder.

- [ ] **Step 3: Insert NSIS recorder invocation before uninstall**

In `scripts/test-nsis-lifecycle.ps1`, immediately after `$appProcess = $null` following the installed launch check and before the first `Invoke-CheckedProcess` that runs `$uninstallerPath`, insert:

```powershell
    $noticeVerifier = Join-Path `
        $projectRoot `
        "scripts\verify-installed-notice.mjs"
    $noticeEvidencePath = [IO.Path]::GetFullPath(
        (
            Join-Path `
                $projectRoot `
                "output\WeatherPoem_${version}_INSTALLED_NOTICE.json"
        )
    )
    $noticeArguments = @(
        $noticeVerifier,
        "--kind",
        "nsis",
        "--install-root",
        $installRoot,
        "--artifact",
        $installerPath,
        "--output",
        $noticeEvidencePath
    )
    & node $noticeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Installed NSIS NOTICE verification failed"
    }
```

- [ ] **Step 4: Insert MSI recorder invocation after repair and before uninstall**

In `scripts/test-msi-elevated-lifecycle.ps1`, immediately after the `MSI repair did not restore the same installed executable` guard and before `$uninstallExitCode = Invoke-MsiExec`, insert:

```powershell
    $noticeVerifier = Join-Path `
        $projectRoot `
        "scripts\verify-installed-notice.mjs"
    $noticeEvidencePath = [IO.Path]::GetFullPath(
        (
            Join-Path `
                $projectRoot `
                "output\WeatherPoem_${version}_INSTALLED_NOTICE.json"
        )
    )
    $noticeArguments = @(
        $noticeVerifier,
        "--kind",
        "msi",
        "--install-root",
        $installLocation,
        "--artifact",
        $msiPath,
        "--output",
        $noticeEvidencePath
    )
    & node $noticeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Installed MSI NOTICE verification failed"
    }
```

- [ ] **Step 5: Run lifecycle contract tests and verify GREEN**

Run:

```powershell
node --test scripts/windows-manual-evidence-contract.test.mjs scripts/installed-notice-command-contract.test.mjs
```

Expected: all lifecycle and command contract tests pass.

- [ ] **Step 6: Run PowerShell syntax validation without installing**

Run:

```powershell
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path 'scripts\test-nsis-lifecycle.ps1'),
    [ref]$null,
    [ref]$errors
)
if ($errors.Count -gt 0) { $errors | Format-List; exit 1 }
[void][System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path 'scripts\test-msi-elevated-lifecycle.ps1'),
    [ref]$null,
    [ref]$errors
)
if ($errors.Count -gt 0) { $errors | Format-List; exit 1 }
```

Expected: exit code `0`, no parser errors, and no installer is launched.

- [ ] **Step 7: Commit when Git is available**

```powershell
git add scripts/test-nsis-lifecycle.ps1 scripts/test-msi-elevated-lifecycle.ps1 scripts/windows-manual-evidence-contract.test.mjs
git commit -m "test: verify notice in real Windows installations"
```

Current environment expectation: skip honestly because the workspace is not a Git repository.

---

### Task 5: Enforce Evidence in Manual and Production Release Gates

**Files:**
- Modify: `scripts/windows-manual-evidence-contract.test.mjs`
- Modify: `scripts/verify-release.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: aggregate evidence and Task 2 assertion API
- Produces: direct enforcement for `node scripts/verify-release.mjs --manual-windows` and `--production`

- [ ] **Step 1: Add failing release-boundary assertions**

Append to `scripts/windows-manual-evidence-contract.test.mjs`:

```js
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
```

Extend `scripts/installed-notice-command-contract.test.mjs` with:

```js
test("release commands run installed NOTICE contract tests", () => {
  for (const name of [
    "release:manifest:check",
    "release:verify",
    "release:verify:manual-windows",
    "release:verify:upgrade",
    "release:verify:production",
  ]) {
    assert.match(
      packageJson.scripts[name],
      /installed-notice-contract\.test\.mjs/,
    );
  }
});
```

- [ ] **Step 2: Run release-boundary tests and verify RED**

Run:

```powershell
node --test scripts/windows-manual-evidence-contract.test.mjs scripts/installed-notice-command-contract.test.mjs
```

Expected: failures because `verify-release.mjs` and release commands do not include installed-NOTICE validation.

- [ ] **Step 3: Import installed-NOTICE helpers into the release verifier**

Add to `scripts/verify-release.mjs` after the existing release-support import:

```js
import {
  assertInstalledNoticeEvidence,
  collectNoticeSource,
} from "./installed-notice-support.mjs";
```

- [ ] **Step 4: Require current aggregate evidence inside the manual Windows block**

Inside `if (manualWindowsRequired)`, after the MSI elevated and autostart reports are read and before their assertion calls, add:

```js
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
```

After `assertAutostartRebootEvidence(autostartRebootReport, state);`, add:

```js
  assertInstalledNoticeEvidence(installedNoticeReport, {
    state,
    noticeSource,
  });
```

Append to `manualEvidenceMessages.push`:

```js
    "NSIS 与 MSI 安装后的第三方 NOTICE 与当前源文件字节一致",
```

- [ ] **Step 5: Add installed-NOTICE tests to every release command**

In `package.json`, add
`scripts/installed-notice-contract.test.mjs scripts/installed-notice-command-contract.test.mjs`
to the `node --test` list of:

- `release:manifest:check`
- `release:verify`
- `release:verify:manual-windows`
- `release:verify:upgrade`
- `release:verify:production`

The resulting `release:verify` value must be:

```json
"release:verify": "node scripts/generate-release-manifest.mjs --check && node --test scripts/release-support.test.mjs scripts/windows-manual-evidence-contract.test.mjs scripts/installed-notice-contract.test.mjs scripts/installed-notice-command-contract.test.mjs && node scripts/verify-release.mjs",
```

Apply the same inserted test filenames to the other four release commands while preserving their existing final flags.

- [ ] **Step 6: Run release contract tests and verify GREEN**

Run:

```powershell
node --test scripts/release-support.test.mjs scripts/windows-manual-evidence-contract.test.mjs scripts/installed-notice-contract.test.mjs scripts/installed-notice-command-contract.test.mjs
```

Expected: all release and installed-NOTICE contract tests pass.

- [ ] **Step 7: Prove plain release verification still works without installed evidence**

Run:

```powershell
npm.cmd run release:verify
```

Expected: exit code `0`; the unsigned internal-trial release verification succeeds without requiring administrator MSI evidence.

- [ ] **Step 8: Prove manual verification rejects missing evidence**

Run:

```powershell
npm.cmd run release:verify:manual-windows
```

Expected before real NSIS/MSI runs: non-zero exit with a message that
`WeatherPoem_0.2.0_INSTALLED_NOTICE.json` is missing or incomplete. Existing independent manual gates may also remain missing; do not synthesize them.

- [ ] **Step 9: Commit when Git is available**

```powershell
git add package.json scripts/verify-release.mjs scripts/windows-manual-evidence-contract.test.mjs scripts/installed-notice-command-contract.test.mjs
git commit -m "feat: gate Windows releases on installed notice evidence"
```

Current environment expectation: skip honestly because the workspace is not a Git repository.

---

### Task 6: Document the New Evidence Without Overstating Readiness

**Files:**
- Modify: `docs/CONTENT_ASSET_LICENSES.md`
- Modify: `docs/MVP_VERIFICATION.md`
- Modify: `review/requirements-traceability.json`
- Test: `scripts/project-readiness-contract.test.mjs`

**Interfaces:**
- Consumes: new report path and package commands
- Produces: accurate RQT-23 evidence inventory and next action

- [ ] **Step 1: Add a failing readiness evidence assertion**

Append this standalone test to `scripts/project-readiness-contract.test.mjs`:

```js
test("RQT-23 registers installed NOTICE evidence without claiming legal approval", () => {
  const gate = plan.gates.find((item) => item.id === "RQT-23");
  assert.ok(
    gate.evidence.includes(
      "output/WeatherPoem_0.2.0_INSTALLED_NOTICE.json",
    ),
  );
  assert.ok(
    gate.verificationCommands.includes(
      "npm run licenses:notices:installed:check",
    ),
  );
  assert.equal(gate.currentStatus, "partial");
});
```

- [ ] **Step 2: Run the readiness test and verify RED**

Run:

```powershell
node --test scripts/project-readiness-contract.test.mjs
```

Expected: RQT-23 assertion fails because the new evidence path and command are not registered.

- [ ] **Step 3: Update RQT-23 without changing its status**

In `review/requirements-traceability.json`, add to RQT-23 `evidence`:

```json
"scripts/installed-notice-support.mjs",
"scripts/verify-installed-notice.mjs",
"scripts/installed-notice-check.mjs",
"scripts/installed-notice-contract.test.mjs",
"scripts/installed-notice-command-contract.test.mjs",
"output/WeatherPoem_0.2.0_INSTALLED_NOTICE.json"
```

Add to RQT-23 `verificationCommands`:

```json
"npm run licenses:notices:installed:check"
```

Keep `currentStatus` as `partial`. Update `issue` to say the installation-byte verifier is implemented but real post-rebuild NSIS/MSI evidence, eleven missing upstream texts, project license selection, service-tier review, and named legal approval remain open.

- [ ] **Step 4: Update the two operator-facing documents**

Add this exact state distinction to both `docs/CONTENT_ASSET_LICENSES.md` and `docs/MVP_VERIFICATION.md`:

```markdown
安装包 NOTICE 分为三层证据：

1. `configured`：Tauri 资源映射和固定打开命令存在；
2. `installed-byte-verified`：真实 NSIS 与 MSI 安装后的 NOTICE 可按 UTF-8
   读取，且 SHA-256 与当前源文件完全一致；
3. `legally-approved`：剩余文本缺口、复合许可义务、项目发布许可和服务档位已由
   具名责任人复核批准。

机器校验只能关闭第二层，不能自动获得第三层结论。
```

Add the command:

```powershell
npm.cmd run licenses:notices:installed:check
```

- [ ] **Step 5: Regenerate readiness outputs and verify GREEN**

Run:

```powershell
npm.cmd run requirements:generate
node --test scripts/project-readiness-contract.test.mjs
```

Expected: readiness test passes; RQT-23 remains `partial`; no campus or public gate is falsely promoted.

- [ ] **Step 6: Run the complete non-rebuild check set**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
node --test scripts/installed-notice-contract.test.mjs scripts/installed-notice-command-contract.test.mjs scripts/windows-manual-evidence-contract.test.mjs scripts/release-support.test.mjs scripts/project-readiness-contract.test.mjs
npm.cmd run licenses:check
npm.cmd run requirements:check
```

Expected: every command exits `0`. Do not run `tauri build` while the active 8-hour candidate is still bound to the test.

- [ ] **Step 7: Commit when Git is available**

```powershell
git add docs/CONTENT_ASSET_LICENSES.md docs/MVP_VERIFICATION.md review/requirements-traceability.json output/WeatherPoem_0.2.0_READINESS.json scripts/project-readiness-contract.test.mjs
git commit -m "docs: register installed notice release evidence"
```

Current environment expectation: skip honestly because the workspace is not a Git repository.

---

### Task 7: Execute the Real Post-Long-Run Verification

**Files:**
- Verify: `output/WeatherPoem_0.2.0_PERFORMANCE_8H.json`
- Generate: `output/WeatherPoem_0.2.0_INSTALLED_NOTICE.json`
- Regenerate: release artifacts, checksums, manifest, readiness JSON, and formal requirement DOCX

**Interfaces:**
- Consumes: a terminal passing 8-hour result and Tasks 1-6
- Produces: current real NSIS/MSI installed-NOTICE evidence

- [ ] **Step 1: Wait for a terminal 8-hour state**

Run:

```powershell
npm.cmd run performance:eight-hour:status
```

Expected before proceeding: `status` is no longer `running`, `progressPercent` is `100`, both final report and checkpoint exist, and the artifact SHA-256 remains
`830FBE885FCCECD24C43A9209085F053CA78687558DE7A3B466A00024AC310A5`.

- [ ] **Step 2: Execute the formal 8-hour verdict**

Run:

```powershell
npm.cmd run performance:eight-hour:check
```

Expected: exit code `0`, 480-minute duration and required sample count pass. If it fails, preserve the report and diagnose before rebuilding.

The sampler writes the terminal checkpoint before its `finally` block closes
the tested app and launcher. Before rebuilding, wait for that cleanup without
terminating either process yourself:

```powershell
$terminalStatus = $null
for ($attempt = 1; $attempt -le 30; $attempt++) {
    $terminalStatus = (
        & node "scripts\performance-eight-hour-status.mjs" |
        Out-String |
        ConvertFrom-Json
    )
    if (
        -not $terminalStatus.launcherAlive -and
        -not $terminalStatus.appAlive
    ) {
        break
    }
    Start-Sleep -Seconds 1
}
if (
    $null -eq $terminalStatus -or
    $terminalStatus.launcherAlive -or
    $terminalStatus.appAlive
) {
    throw "Eight-hour processes are still alive; do not rebuild."
}
```

Expected: both process flags are `false`. If either remains alive, stop and
diagnose; do not force-kill a process merely to advance the plan.

- [ ] **Step 3: Rebuild only after the long-run verdict**

Run:

```powershell
npm.cmd run licenses:generate
npm.cmd run licenses:notices:generate
npm.cmd run check
npm.cmd run tauri:build
npm.cmd run licenses:check
npm.cmd run release:checksums
npm.cmd run release:manifest
```

Expected: all commands exit `0`; portable EXE, NSIS, MSI, checksum list, and
release manifest share version `0.2.0`. The post-build license check proves
that the build did not silently change `Cargo.lock` or another NOTICE input.
If it reports stale inputs, stop before generating release evidence, refresh
the license inventory and NOTICE, rebuild again, and repeat this step.

The eight-hour report is artifact-bound. Re-run its checker against the
rebuilt portable EXE before treating the rebuilt release as the tested
candidate:

```powershell
Get-FileHash -Algorithm SHA256 `
  "src-tauri\target\release\weatherpoem.exe"
npm.cmd run performance:eight-hour:check
```

There are exactly two valid branches:

1. If the rebuilt EXE retains SHA-256
   `830FBE885FCCECD24C43A9209085F053CA78687558DE7A3B466A00024AC310A5`,
   the checker exits `0` and Task 4 may begin.
2. If the rebuilt EXE hash changes, the old report is historical evidence
   only and the checker must reject it as stale. Preserve that report under a
   hash-qualified filename, start a new formal eight-hour run on the rebuilt
   EXE, and repeat Steps 1–3 without rebuilding again:

```powershell
Copy-Item -LiteralPath `
  "output\WeatherPoem_0.2.0_PERFORMANCE_8H.json" `
  -Destination `
  "output\WeatherPoem_0.2.0_PERFORMANCE_8H_830FBE885FCCECD24C43A9209085F053CA78687558DE7A3B466A00024AC310A5.json"
npm.cmd run performance:eight-hour:start
```

Do not execute the NSIS or MSI lifecycle while the replacement eight-hour run
is active. Task 4 begins only when
`npm.cmd run performance:eight-hour:check` passes against the current rebuilt
EXE and both sampler processes have exited.

- [ ] **Step 4: Execute the real NSIS lifecycle**

Run:

```powershell
npm.cmd run release:test:nsis
```

Expected: NSIS installation, installed launch, NOTICE verification, silent uninstall, and residue checks pass; aggregate evidence status is `partial` until MSI is tested.

- [ ] **Step 5: Execute the administrator MSI lifecycle only with explicit elevation approval**

First run the read-only preflight:

```powershell
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/test-msi-elevated-lifecycle.ps1 -Preflight
```

After the user approves the actual administrator lifecycle, run:

```powershell
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/test-msi-elevated-lifecycle.ps1 -ConfirmLifecycle
```

Expected: install, launch, NOTICE verification, repair, uninstall, and residue checks pass; aggregate evidence status becomes `passed`.

- [ ] **Step 6: Verify installed evidence and release gates**

Run:

```powershell
npm.cmd run licenses:notices:installed:check
npm.cmd run release:verify
npm.cmd run release:verify:manual-windows
```

Expected: installed-NOTICE and plain release checks pass. Manual Windows verification passes only if its independent MSI and autostart-reboot evidence are also complete.

- [ ] **Step 7: Refresh final artifacts without overstating external gates**

Run:

```powershell
npm.cmd run scope:freeze:generate
npm.cmd run uat:plan:generate
npm.cmd run updater:plan:generate
npm.cmd run distribution:plan:generate
npm.cmd run signing:plan:generate
npm.cmd run requirements:generate
npm.cmd run pilot:four-week:generate
npm.cmd run check
npm.cmd run performance:eight-hour:check
npm.cmd run release:verify
npm.cmd run requirements:check
```

Expected: every command exits `0`. Regeneration order is significant:
release checksums and manifest were created in Step 3; the scope-freeze,
UAT, updater, distribution, and signing plans are refreshed next against that
manifest; readiness is then generated; the four-week plan is generated last
because it binds both the readiness report and release manifest. License and
NOTICE inputs were refreshed before the build and rechecked after it in
Step 3. The final checks must reject any old candidate hash rather than
silently accepting a stale plan.

Regenerate and audit the formal requirement DOCX with the bundled document
runtime:

```powershell
$workspacePython = "C:\Users\zzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$documentsSkill = "C:\Users\zzh\.codex\plugins\cache\openai-primary-runtime\documents\26.715.12143\skills\documents"
$outputDocx = Join-Path `
    (Get-Location) `
    "output\WeatherPoem_项目需求与落地实施方案_v3.0.docx"
$qaDirectory = Join-Path `
    (Get-Location) `
    (
        "tmp\docx-v3-final-" +
        [DateTime]::UtcNow.ToString("yyyyMMddHHmmss")
    )

& $workspacePython `
    "tools\build_requirements_doc.py" `
    --markdown "docs\WeatherPoem_产品设计工作稿.md" `
    --output $outputDocx
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $workspacePython `
    "tools\render_docx_windows.py" `
    $outputDocx `
    --output_dir $qaDirectory `
    --emit_pdf
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $workspacePython `
    (Join-Path $documentsSkill "scripts\style_lint.py") `
    $outputDocx `
    --json (Join-Path $qaDirectory "style-lint.json")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $workspacePython `
    (Join-Path $documentsSkill "scripts\a11y_audit.py") `
    $outputDocx `
    --out_json (Join-Path $qaDirectory "a11y.json")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$renderedPages = @(
    Get-ChildItem `
        -LiteralPath $qaDirectory `
        -Filter "page-*.png" |
        Sort-Object Name
)
if ($renderedPages.Count -eq 0) {
    throw "Formal requirement DOCX produced no rendered pages"
}
Write-Output ("Rendered pages: " + $renderedPages.Count)
```

After the command succeeds, inspect every `page-*.png` at 100% zoom with
`view_image`; do not spot-check. If any page has clipping, overlap, missing
glyphs, broken tables, awkward page breaks, or header/footer drift, fix the
builder or source Markdown, use a fresh QA directory, rerender, and repeat the
full-page review. Deliver only the DOCX. RQT-23 remains `partial` until upstream
text gaps, project license choice, service-tier decision, and named legal
approval are complete.

- [ ] **Step 8: Re-run the isolated control-workbench verification**

Only after the release evidence, readiness outputs, and formal requirement
DOCX above are current, run the registered `weatherpoem-verify` task from
`D:\纯净工作台` against `E:\weatherpoem`. Do not copy source into the
workbench.

```powershell
Set-Location -LiteralPath "D:\纯净工作台"
.\cw.ps1 run task weatherpoem-verify
```

Expected: the registered project task passes against the refreshed source and
artifacts, then writes a new log under
`D:\纯净工作台\.workbench\artifacts\task-runs`.

- [ ] **Step 9: Commit when Git is available**

```powershell
git add output review docs scripts package.json
git commit -m "test: verify notice in current Windows release artifacts"
```

Current environment expectation: skip honestly because the workspace is not a Git repository.
