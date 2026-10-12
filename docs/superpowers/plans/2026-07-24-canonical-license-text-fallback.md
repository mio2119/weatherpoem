# Canonical License Text Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicitly reviewed, hash-pinned SPDX canonical-license fallback for the 11 locked dependencies that lack verifiable upstream notice text, while preserving the existing upstream-text gap metrics.

**Architecture:** A review policy binds the exact npm/Cargo package identities to five allowed SPDX identifiers. A focused support module validates policy, downloads only a fixed SPDX release commit during an explicit sync, verifies local bytes offline, and attaches canonical text with a distinct provenance type. The existing NOTICE collector and renderer then report upstream coverage and distribution-readable coverage separately.

**Tech Stack:** Node.js 24 ESM, `node:test`, built-in `fetch`, `TextDecoder` with fatal UTF-8 decoding, SHA-256, JSON manifests, Markdown generation, npm scripts.

## Execution Record

Implemented and verified on 2026-07-24.

- Focused contracts: `40/40` passed across canonical text, NOTICE, license inventory, and readiness.
- Lint: passed with zero warnings.
- Full project check: passed, including `80/80` application tests and the production frontend build.
- Ordinary release verification: passed with `35/35` release contracts.
- Generated NOTICE: schema `1.2`; upstream text gaps remain npm `9` and Rust `2`; distribution text gaps are npm `0` and Rust `0`; `11` reviewed exceptions use five fixed SPDX texts.
- Manual Windows verification remains intentionally blocked by missing real elevated MSI lifecycle evidence. No installer or frozen EXE was rebuilt during the active eight-hour run.
- This record proves the engineering subfeature only. It does not claim legal approval, license compatibility, or installed-byte evidence for the not-yet-rebuilt installers.

## Global Constraints

- Development files stay under `E:\weatherpoem`; `D:\纯净工作台` remains an external control/evidence workbench and receives no source tree.
- Do not rebuild, replace, terminate, or rename the EXE whose SHA-256 is `830FBE885FCCECD24C43A9209085F053CA78687558DE7A3B466A00024AC310A5` while run `9b325c9b23a949d3ad0092c722912ce4` is active.
- SPDX source is exactly repository `https://github.com/spdx/license-list-data`, release `v3.28.0`, commit `c4a7237ec8f4654e867546f9f409749300f1bf4c`.
- Allowed canonical files are exactly `text/Apache-2.0.txt`, `text/BSD-2-Clause.txt`, `text/ISC.txt`, `text/MIT.txt`, and `text/MPL-2.0.txt`.
- Ordinary NOTICE generation and checking must be offline; only `licenses:notices:sync:spdx` may access the network.
- Existing `packagesWithoutReadableNoticeText`, `readableTextCoveragePercent`, and `missingTextPackageIds` keep their upstream-text meaning.
- Canonical text uses provenance kind `verified-spdx-canonical-text`; it must never be reported as npm archive, npm `gitHead`, Cargo VCS, or same-release mapping text.
- A new unreviewed text gap, identity mismatch, unpinned URL, bad UTF-8, missing file, byte mismatch, or hash mismatch is a hard failure.
- No generated field or prose may claim `legalComplete`, `licenseApproved`, `compliant`, legal approval, or license compatibility.
- `E:\weatherpoem\.git` is currently an empty directory rather than a valid repository. Do not initialize it. Replace commit steps with file/hash checkpoints unless the user separately authorizes repository initialization.

---

### Task 1: Lock the exception policy and define the pure canonical-source contract

**Files:**
- Create: `review/canonical-license-text-policy.json`
- Create: `scripts/canonical-license-text-support.mjs`
- Create: `scripts/canonical-license-text-contract.test.mjs`

**Interfaces:**
- Consumes: current package objects with `packageId`, `name`, `version`, `license`, `source`, `integrity`/`checksum`, `packageRootAvailable`, and `noticeFiles`.
- Produces:
  - `SPDX_CANONICAL_SOURCE`
  - `applyCanonicalLicenseSources(packages, ecosystem, policy, manifest, projectRoot, readSourceFile)`
  - return value `{ packages, bindings, groups }`
  - provenance kind `verified-spdx-canonical-text`.

- [ ] **Step 1: Write the happy-path failing tests**

Add imports for the not-yet-created module and test both a simple license and a dual license:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  SPDX_CANONICAL_SOURCE,
  applyCanonicalLicenseSources,
} from "./canonical-license-text-support.mjs";

const sha256 = (character) => character.repeat(64);
const textById = {
  MIT: Buffer.from("MIT fixture\n"),
  "Apache-2.0": Buffer.from("Apache fixture\n"),
};
const manifest = {
  schemaVersion: "1.0",
  source: SPDX_CANONICAL_SOURCE,
  bindings: [],
  files: Object.entries(textById).map(([licenseId, content], index) => ({
    licenseId,
    repositoryPath: `text/${licenseId}.txt`,
    sourceUrl:
      `https://api.github.com/repos/spdx/license-list-data/contents/text/${licenseId}.txt` +
      `?ref=${SPDX_CANONICAL_SOURCE.gitCommit}`,
    path: `third_party/license-texts/spdx/v3.28.0/${licenseId}.txt`,
    bytes: content.length,
    sha256: sha256(index === 0 ? "A" : "B"),
  })),
};

test("canonical fallback preserves an upstream gap and adds distribution text", async () => {
  const packages = [{
    packageId: "npm:node_modules/fixture",
    name: "fixture",
    version: "1.0.0",
    license: "MIT",
    source: "https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz",
    integrity: "sha512-fixture",
    packageRootAvailable: true,
    noticeFiles: [],
  }];
  const policy = {
    schemaVersion: "1.0",
    source: SPDX_CANONICAL_SOURCE,
    exceptions: [{
      ecosystem: "npm",
      packageId: packages[0].packageId,
      name: "fixture",
      version: "1.0.0",
      license: "MIT",
      source: packages[0].source,
      integrity: packages[0].integrity,
      licenseIds: ["MIT"],
      reason: "upstream-readable-text-unavailable",
    }],
  };
  manifest.bindings = structuredClone(policy.exceptions);
  const result = await applyCanonicalLicenseSources(
    packages,
    "npm",
    policy,
    manifest,
    "C:\\fixture",
    async (filePath) => {
      assert.match(filePath, /MIT\.txt$/);
      return textById.MIT;
    },
    () => sha256("A"),
  );
  assert.equal(result.packages[0].noticeFiles.length, 1);
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.kind,
    "verified-spdx-canonical-text",
  );
  assert.deepEqual(result.groups[0].packageIds, [packages[0].packageId]);
});

test("dual-license fallback retains both OR choices", async () => {
  const packages = [{
    packageId: "cargo:fixture@1.0.0",
    name: "fixture",
    version: "1.0.0",
    license: "MIT OR Apache-2.0",
    source: "https://github.com/example/fixture",
    checksum: sha256("C"),
    packageRootAvailable: true,
    noticeFiles: [],
  }];
  const policy = {
    schemaVersion: "1.0",
    source: SPDX_CANONICAL_SOURCE,
    exceptions: [{
      ecosystem: "cargo",
      packageId: packages[0].packageId,
      name: "fixture",
      version: "1.0.0",
      license: "MIT OR Apache-2.0",
      source: packages[0].source,
      checksum: packages[0].checksum,
      licenseIds: ["Apache-2.0", "MIT"],
      reason: "upstream-readable-text-unavailable",
    }],
  };
  manifest.bindings = structuredClone(policy.exceptions);
  const digestByName = new Map([
    ["Apache-2.0.txt", sha256("B")],
    ["MIT.txt", sha256("A")],
  ]);
  const result = await applyCanonicalLicenseSources(
    packages,
    "cargo",
    policy,
    manifest,
    "C:\\fixture",
    async (filePath) =>
      textById[filePath.endsWith("MIT.txt") ? "MIT" : "Apache-2.0"],
    (content, filePath) => digestByName.get(filePath.split(/[\\/]/).at(-1)),
  );
  assert.deepEqual(
    result.packages[0].noticeFiles.map(
      (file) => file.provenance.licenseId,
    ),
    ["Apache-2.0", "MIT"],
  );
});
```

- [ ] **Step 2: Run the tests and observe the intended red state**

Run:

```powershell
node --test scripts/canonical-license-text-contract.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `canonical-license-text-support.mjs`.

- [ ] **Step 3: Create the exact review policy**

Create `review/canonical-license-text-policy.json` with source identity:

```json
{
  "schemaVersion": "1.0",
  "source": {
    "repository": "https://github.com/spdx/license-list-data",
    "releaseTag": "v3.28.0",
    "gitCommit": "c4a7237ec8f4654e867546f9f409749300f1bf4c",
    "licenseFiles": {
      "Apache-2.0": "text/Apache-2.0.txt",
      "BSD-2-Clause": "text/BSD-2-Clause.txt",
      "ISC": "text/ISC.txt",
      "MIT": "text/MIT.txt",
      "MPL-2.0": "text/MPL-2.0.txt"
    }
  },
  "exceptions": []
}
```

Populate `exceptions` with exactly these 11 reviewed identities; each entry also has `"reason": "upstream-readable-text-unavailable"`:

| ecosystem | packageId | version | license | licenseIds |
| --- | --- | --- | --- | --- |
| npm | `npm:node_modules/@humanfs/types` | `0.15.0` | `Apache-2.0` | `["Apache-2.0"]` |
| npm | `npm:node_modules/@tybys/wasm-util` | `0.10.3` | `MIT` | `["MIT"]` |
| npm | `npm:node_modules/boolbase` | `1.0.0` | `ISC` | `["ISC"]` |
| npm | `npm:node_modules/eastasianwidth` | `0.2.0` | `MIT` | `["MIT"]` |
| npm | `npm:node_modules/esrecurse` | `4.3.0` | `BSD-2-Clause` | `["BSD-2-Clause"]` |
| npm | `npm:node_modules/imurmurhash` | `0.1.4` | `MIT` | `["MIT"]` |
| npm | `npm:node_modules/keyv` | `4.5.4` | `MIT` | `["MIT"]` |
| npm | `npm:node_modules/natural-compare` | `1.4.0` | `MIT` | `["MIT"]` |
| npm | `npm:node_modules/stackback` | `0.0.2` | `MIT` | `["MIT"]` |
| cargo | `cargo:crc-catalog@2.5.0` | `2.5.0` | `MIT OR Apache-2.0` | `["Apache-2.0","MIT"]` |
| cargo | `cargo:selectors@0.36.1` | `0.36.1` | `MPL-2.0` | `["MPL-2.0"]` |

For npm entries copy the exact `name`, `source`, and `integrity` values from the current `review/third-party-notice-index.json`; for Cargo copy the exact `name`, `source`, and uppercase `checksum`. The implementation must reject any difference from the current package object, so these values are data, not comments.

- [ ] **Step 4: Implement the minimal pure validator and attachment logic**

Create `scripts/canonical-license-text-support.mjs` with these public constants and function behavior:

```js
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

function sha256(buffer) {
  return createHash("sha256")
    .update(buffer)
    .digest("hex")
    .toUpperCase();
}

function strictUtf8(buffer, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error(`SPDX 规范许可文本不是严格 UTF-8：${label}`);
  }
  assert(buffer.length > 0 && !buffer.includes(0), `SPDX 规范许可文本为空或含 NUL：${label}`);
  return text;
}

function normalizedTokens(expression) {
  const normalized = String(expression ?? "")
    .replaceAll("/", " OR ")
    .split(/\s+OR\s+/i)
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
  assert(
    normalized.length > 0 &&
      !String(expression).match(/\bAND\b|\bWITH\b|[()]/i),
    `规范文本策略不支持该许可表达式：${expression}`,
  );
  return normalized;
}

function sourceIdentityMatches(value) {
  return JSON.stringify(value) === JSON.stringify(SPDX_CANONICAL_SOURCE);
}

export async function applyCanonicalLicenseSources(
  packages,
  ecosystem,
  policy,
  manifest,
  projectRoot,
  readSourceFile = readFile,
  digest = (content) => sha256(content),
) {
  assert(
    policy?.schemaVersion === "1.0" &&
      manifest?.schemaVersion === "1.0" &&
      sourceIdentityMatches(policy.source) &&
      sourceIdentityMatches(manifest.source) &&
      JSON.stringify(manifest.bindings) === JSON.stringify(policy.exceptions),
    "SPDX 规范许可文本策略或同步证据身份无效",
  );
  const scoped = policy.exceptions
    .filter((entry) => entry.ecosystem === ecosystem)
    .sort((left, right) => left.packageId.localeCompare(right.packageId));
  const missing = packages
    .filter((item) => !item.noticeFiles.some((file) => file.textReadable))
    .map((item) => item.packageId)
    .sort();
  assert(
    JSON.stringify(scoped.map((entry) => entry.packageId)) ===
      JSON.stringify(missing),
    `SPDX 规范许可策略未恰好覆盖当前 ${ecosystem} 文本缺口`,
  );
  const byId = new Map(packages.map((item) => [item.packageId, item]));
  const filesById = new Map(manifest.files.map((file) => [file.licenseId, file]));
  assert(filesById.size === manifest.files.length, "SPDX 规范许可文件存在重复标识");
  const output = structuredClone(packages);
  const outputById = new Map(output.map((item) => [item.packageId, item]));
  const groups = new Map();
  const allowedRoot = path.resolve(
    projectRoot,
    "third_party",
    "license-texts",
    "spdx",
    SPDX_CANONICAL_SOURCE.releaseTag,
  );
  for (const entry of scoped) {
    const current = byId.get(entry.packageId);
    assert(
      current &&
        current.name === entry.name &&
        current.version === entry.version &&
        current.license === entry.license &&
        current.source === entry.source &&
        (ecosystem === "npm"
          ? current.integrity === entry.integrity
          : current.checksum === entry.checksum) &&
        entry.reason === "upstream-readable-text-unavailable",
      `SPDX 规范许可例外与当前依赖身份不一致：${entry.packageId}`,
    );
    assert(
      JSON.stringify([...entry.licenseIds].sort()) ===
        JSON.stringify(normalizedTokens(entry.license)),
      `SPDX 规范许可标识与表达式不一致：${entry.packageId}`,
    );
    const target = outputById.get(entry.packageId);
    for (const licenseId of entry.licenseIds) {
      const file = filesById.get(licenseId);
      const expectedRepositoryPath =
        SPDX_CANONICAL_SOURCE.licenseFiles[licenseId];
      assert(
        expectedRepositoryPath &&
          file?.repositoryPath === expectedRepositoryPath &&
          file.sourceUrl ===
            `${SPDX_CANONICAL_SOURCE.repository.replace("github.com", "api.github.com/repos")}` +
              `/contents/${expectedRepositoryPath}?ref=${SPDX_CANONICAL_SOURCE.gitCommit}`,
        `SPDX 规范许可来源未固定到允许提交：${licenseId}`,
      );
      const absolutePath = path.resolve(projectRoot, ...file.path.split("/"));
      assert(
        absolutePath.startsWith(`${allowedRoot}${path.sep}`) &&
          !file.path.includes(".."),
        `SPDX 规范许可落盘路径越界：${licenseId}`,
      );
      const content = await readSourceFile(absolutePath);
      const decoded = strictUtf8(content, licenseId);
      assert(
        content.length === file.bytes &&
          digest(content, absolutePath) === file.sha256 &&
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
          manifestPath: "review/canonical-license-text-supplements.json",
          repository: SPDX_CANONICAL_SOURCE.repository,
          releaseTag: SPDX_CANONICAL_SOURCE.releaseTag,
          gitCommit: SPDX_CANONICAL_SOURCE.gitCommit,
          repositoryPath: file.repositoryPath,
          sourceUrl: file.sourceUrl,
          vendoredPath: file.path,
        },
      });
      const group = groups.get(licenseId) ?? {
        licenseId,
        repository: SPDX_CANONICAL_SOURCE.repository,
        releaseTag: SPDX_CANONICAL_SOURCE.releaseTag,
        gitCommit: SPDX_CANONICAL_SOURCE.gitCommit,
        repositoryPath: file.repositoryPath,
        sourceUrl: file.sourceUrl,
        sha256: file.sha256,
        packageIds: [],
      };
      group.packageIds.push(entry.packageId);
      groups.set(licenseId, group);
    }
  }
  return {
    packages: output,
    bindings: structuredClone(scoped),
    groups: [...groups.values()]
      .map((group) => ({ ...group, packageIds: group.packageIds.sort() }))
      .sort((left, right) => left.licenseId.localeCompare(right.licenseId)),
  };
}
```

The real implementation may factor repeated assertions into private helpers, but the exported names, fixed identity, failure semantics, and returned fields above are mandatory.

- [ ] **Step 5: Run the focused tests and observe green**

Run:

```powershell
node --test scripts/canonical-license-text-contract.test.mjs
```

Expected: both happy-path tests PASS.

- [ ] **Step 6: Add negative contract tests before strengthening implementation**

Add separate tests that mutate one field at a time and use `assert.rejects` for:

```js
const mutations = [
  ["version", "2.0.0", /依赖身份不一致/],
  ["license", "Apache-2.0", /依赖身份不一致|标识与表达式不一致/],
  ["source", "https://example.invalid/package.tgz", /依赖身份不一致/],
  ["integrity", "sha512-swapped", /依赖身份不一致/],
];
```

Also add tests for:

```js
manifest.files[0].sourceUrl =
  "https://api.github.com/repos/spdx/license-list-data/contents/text/MIT.txt?ref=main";
// Expected rejection: /来源未固定/

manifest.files[0].path = "../outside/MIT.txt";
// Expected rejection: /路径越界/

policy.exceptions[0].licenseIds = [];
// Expected rejection: /标识与表达式不一致/

packages[0].noticeFiles = [{
  fileName: "LICENSE",
  bytes: 1,
  sha256: sha256("D"),
  textReadable: true,
  content: "x",
}];
// Expected rejection: /未恰好覆盖/
```

Run the test after each case, first observe the intended failure if the assertion is not yet enforced, then add only the missing assertion and rerun to green.

- [ ] **Step 7: Record the task checkpoint**

Run:

```powershell
Get-FileHash -Algorithm SHA256 `
  review/canonical-license-text-policy.json, `
  scripts/canonical-license-text-support.mjs, `
  scripts/canonical-license-text-contract.test.mjs
```

Expected: three hashes are printed; no Git commit is attempted.

---

### Task 2: Add an explicit, testable SPDX sync command

**Files:**
- Modify: `scripts/canonical-license-text-support.mjs`
- Modify: `scripts/canonical-license-text-contract.test.mjs`
- Create: `scripts/sync-spdx-license-texts.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `review/canonical-license-text-policy.json`.
- Produces:
  - `syncCanonicalLicenseTexts({ projectRoot, policy, fetchBytes, makeDirectory, writeSourceFile, now })`
  - `review/canonical-license-text-supplements.json`
  - five files under `third_party/license-texts/spdx/v3.28.0/`.

- [ ] **Step 1: Write a failing sync test with injected I/O**

Add:

```js
import { syncCanonicalLicenseTexts } from "./canonical-license-text-support.mjs";

test("sync downloads only the five fixed SPDX paths and records hashes", async () => {
  const writes = new Map();
  const requested = [];
  const policy = {
    schemaVersion: "1.0",
    source: SPDX_CANONICAL_SOURCE,
    exceptions: [],
  };
  const result = await syncCanonicalLicenseTexts({
    projectRoot: "C:\\fixture",
    policy,
    fetchBytes: async (url) => {
      requested.push(url);
      return Buffer.from(`${path.basename(new URL(url).pathname)}\n`);
    },
    makeDirectory: async () => {},
    writeSourceFile: async (filePath, content) => {
      writes.set(filePath, Buffer.from(content));
    },
    now: () => new Date("2026-07-24T00:00:00.000Z"),
  });
  assert.equal(requested.length, 5);
  assert.ok(requested.every(
    (url) => url.endsWith(`ref=${SPDX_CANONICAL_SOURCE.gitCommit}`),
  ));
  assert.equal(result.files.length, 5);
  assert.deepEqual(result.bindings, []);
  assert.equal(result.generatedAt, "2026-07-24T00:00:00.000Z");
});
```

- [ ] **Step 2: Run and observe red**

Run:

```powershell
node --test scripts/canonical-license-text-contract.test.mjs
```

Expected: FAIL because `syncCanonicalLicenseTexts` is not exported.

- [ ] **Step 3: Implement the injected sync function**

Add this behavior to `scripts/canonical-license-text-support.mjs`:

```js
export async function syncCanonicalLicenseTexts({
  projectRoot,
  policy,
  fetchBytes,
  makeDirectory = mkdir,
  writeSourceFile = writeFile,
  now = () => new Date(),
}) {
  assert(
    policy?.schemaVersion === "1.0" &&
      sourceIdentityMatches(policy.source) &&
      Array.isArray(policy.exceptions),
    "SPDX 规范许可策略身份无效",
  );
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
    const sourceUrl =
      `https://api.github.com/repos/spdx/license-list-data/contents/${repositoryPath}` +
      `?ref=${SPDX_CANONICAL_SOURCE.gitCommit}`;
    const content = await fetchBytes(sourceUrl, licenseId);
    strictUtf8(content, licenseId);
    const outputPath = path.join(outputDirectory, `${licenseId}.txt`);
    await writeSourceFile(outputPath, content);
    files.push({
      licenseId,
      repositoryPath,
      sourceUrl,
      path: path.relative(projectRoot, outputPath).split(path.sep).join("/"),
      bytes: content.length,
      sha256: sha256(content),
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
```

- [ ] **Step 4: Create the offline-safe CLI wrapper**

Create `scripts/sync-spdx-license-texts.mjs`:

```js
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncCanonicalLicenseTexts } from "./canonical-license-text-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const policyPath = path.join(
  projectRoot,
  "review",
  "canonical-license-text-policy.json",
);
const manifestPath = path.join(
  projectRoot,
  "review",
  "canonical-license-text-supplements.json",
);
const policy = JSON.parse(await readFile(policyPath, "utf8"));
const fetchBytes = async (url, licenseId) => {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github.raw+json",
      "user-agent": "WeatherPoem-license-evidence/0.2.0",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`SPDX ${licenseId} 下载失败：${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};
const manifest = await syncCanonicalLicenseTexts({
  projectRoot,
  policy,
  fetchBytes,
});
await writeFile(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  source: `${manifest.source.releaseTag}@${manifest.source.gitCommit}`,
  licenseTextCount: manifest.files.length,
  reviewedExceptionCount: manifest.bindings.length,
  manifest: "review/canonical-license-text-supplements.json",
}, null, 2));
```

- [ ] **Step 5: Add the explicit npm script**

Insert after `licenses:notices:sync:cargo`:

```json
"licenses:notices:sync:spdx": "node scripts/sync-spdx-license-texts.mjs",
```

Do not add this command to ordinary `licenses:notices:generate`, `licenses:notices:check`, `licenses:check`, or `check`.

- [ ] **Step 6: Add and run sync failure tests**

Use injected `fetchBytes` cases:

```js
await assert.rejects(
  () => syncCanonicalLicenseTexts({
    projectRoot: "C:\\fixture",
    policy,
    fetchBytes: async () => Buffer.from([0xff]),
    makeDirectory: async () => {},
    writeSourceFile: async () => {},
  }),
  /严格 UTF-8/,
);
```

Also assert empty content and NUL content fail. Run:

```powershell
node --test scripts/canonical-license-text-contract.test.mjs
```

Expected: all canonical contract tests PASS without network access.

- [ ] **Step 7: Record the task checkpoint**

Run:

```powershell
Get-FileHash -Algorithm SHA256 `
  scripts/canonical-license-text-support.mjs, `
  scripts/canonical-license-text-contract.test.mjs, `
  scripts/sync-spdx-license-texts.mjs, `
  package.json
```

---

### Task 3: Integrate canonical sources into collection and preserve two coverage meanings

**Files:**
- Modify: `scripts/third-party-notices-support.mjs`
- Modify: `scripts/third-party-notices-contract.test.mjs`

**Interfaces:**
- Consumes: `applyCanonicalLicenseSources` from Task 1 plus the policy and supplement manifests.
- Produces:
  - `canonicalLicenseBindings`
  - `canonicalLicenseGroups`
  - coverage fields `packagesWithoutDistributionLicenseText`, `distributionLicenseTextCoveragePercent`, `missingDistributionLicenseTextPackageIds`, `canonicalFallbackPackageCount`
  - report field `completeDistributionLicenseTextCoverage`.

- [ ] **Step 1: Extend the fixture and write the failing coverage test**

Add `canonicalLicensePolicy` and `canonicalLicenseSupplements` to the fixture input hash list and add empty canonical arrays:

```js
canonicalLicenseBindings: [],
canonicalLicenseGroups: [],
```

Create a fixture package containing one canonical file:

```js
const canonicalFile = {
  fileName: "MIT.txt",
  bytes: Buffer.byteLength(licenseContent),
  sha256: licenseSha,
  textReadable: true,
  content: licenseContent,
  provenance: {
    kind: "verified-spdx-canonical-text",
    licenseId: "MIT",
    releaseTag: "v3.28.0",
    gitCommit: "c4a7237ec8f4654e867546f9f409749300f1bf4c",
  },
};
```

Assert:

```js
assert.equal(
  report.ecosystems.cargo.coverage.packagesWithoutReadableNoticeText,
  1,
);
assert.equal(
  report.ecosystems.cargo.coverage.packagesWithoutDistributionLicenseText,
  0,
);
assert.equal(
  report.ecosystems.cargo.coverage.distributionLicenseTextCoveragePercent,
  100,
);
assert.equal(
  report.ecosystems.cargo.coverage.canonicalFallbackPackageCount,
  1,
);
assert.equal(report.completeReadableTextCoverage, false);
assert.equal(report.completeDistributionLicenseTextCoverage, true);
```

- [ ] **Step 2: Run and observe red**

Run:

```powershell
node --test scripts/third-party-notices-contract.test.mjs
```

Expected: FAIL because the distribution coverage fields do not exist.

- [ ] **Step 3: Add the two-layer coverage calculation**

Change `coverageFor` so the old fields exclude canonical files and the new fields include them:

```js
function coverageFor(packages) {
  const isReadable = (file) => file.textReadable && file.textId;
  const isCanonical = (file) =>
    file.provenance?.kind === "verified-spdx-canonical-text";
  const withUpstreamText = packages.filter((item) =>
    item.noticeFiles.some((file) => isReadable(file) && !isCanonical(file)),
  );
  const withoutUpstreamText = packages.filter((item) =>
    !item.noticeFiles.some((file) => isReadable(file) && !isCanonical(file)),
  );
  const withDistributionText = packages.filter((item) =>
    item.noticeFiles.some(isReadable),
  );
  const withoutDistributionText = packages.filter((item) =>
    !item.noticeFiles.some(isReadable),
  );
  const canonicalFallbacks = packages.filter((item) =>
    item.noticeFiles.some((file) => isReadable(file) && isCanonical(file)),
  );
  const percent = (count) =>
    packages.length === 0
      ? 0
      : Number(((count / packages.length) * 100).toFixed(3));
  return {
    packageCount: packages.length,
    licenseMetadataCount: packages.filter((item) => item.license).length,
    packagesWithReadableNoticeText: withUpstreamText.length,
    packagesWithoutReadableNoticeText: withoutUpstreamText.length,
    unavailablePackageRootCount:
      packages.filter((item) => !item.packageRootAvailable).length,
    readableTextCoveragePercent: percent(withUpstreamText.length),
    missingTextPackageIds: withoutUpstreamText.map((item) => item.packageId),
    packagesWithDistributionLicenseText: withDistributionText.length,
    packagesWithoutDistributionLicenseText: withoutDistributionText.length,
    distributionLicenseTextCoveragePercent:
      percent(withDistributionText.length),
    missingDistributionLicenseTextPackageIds:
      withoutDistributionText.map((item) => item.packageId),
    canonicalFallbackPackageCount: canonicalFallbacks.length,
  };
}
```

- [ ] **Step 4: Integrate policy and manifest collection**

Import `applyCanonicalLicenseSources`. Extend the `Promise.all` read set with:

```js
readJson("review/canonical-license-text-policy.json"),
readJson("review/canonical-license-text-supplements.json"),
```

After the existing npm and Cargo vendored-source passes:

```js
const canonicalNpm = await applyCanonicalLicenseSources(
  vendoredNpm.packages,
  "npm",
  canonicalLicensePolicy,
  canonicalLicenseSupplements,
  projectRoot,
);
const canonicalCargo = await applyCanonicalLicenseSources(
  vendoredCargo.packages,
  "cargo",
  canonicalLicensePolicy,
  canonicalLicenseSupplements,
  projectRoot,
);
```

Return `canonicalNpm.packages` and `canonicalCargo.packages`; combine bindings and groups deterministically. Add both JSON files to `inputFiles` so their SHA-256 values are part of the report identity.

- [ ] **Step 5: Extend report identity and status**

Set:

```js
const completeDistributionLicenseTextCoverage =
  npmCoverage.packagesWithoutDistributionLicenseText === 0 &&
  cargoCoverage.packagesWithoutDistributionLicenseText === 0;
```

Bump:

```js
export const THIRD_PARTY_NOTICE_SCHEMA = "1.2";
```

Add report fields:

```js
canonicalLicenseBindings: inputs.canonicalLicenseBindings ?? [],
canonicalLicenseGroups: inputs.canonicalLicenseGroups ?? [],
completeDistributionLicenseTextCoverage,
```

Use status:

```js
status: completeReadableTextCoverage
  ? "draft-generated-complete-upstream-text-coverage-awaiting-review"
  : completeDistributionLicenseTextCoverage
    ? "draft-generated-complete-distribution-text-with-upstream-gaps-awaiting-review"
    : "draft-generated-with-distribution-text-gaps-awaiting-review",
```

Add limitation:

```js
verifiedSpdxCanonicalFallbackTexts: true,
```

Do not change `gateSatisfied: false`, approval nulls, or the public-distribution result.

- [ ] **Step 6: Extend validation and summary**

Compare `canonicalLicenseBindings`, `canonicalLicenseGroups`, and `completeDistributionLicenseTextCoverage` with a freshly rebuilt expected report. Return:

```js
npmDistributionMissingTextCount:
  report.ecosystems.npm.coverage.packagesWithoutDistributionLicenseText,
cargoDistributionMissingTextCount:
  report.ecosystems.cargo.coverage.packagesWithoutDistributionLicenseText,
canonicalFallbackPackageCount:
  report.ecosystems.npm.coverage.canonicalFallbackPackageCount +
  report.ecosystems.cargo.coverage.canonicalFallbackPackageCount,
```

Add a tamper test that changes distribution coverage from `1` to `0` and expects `/覆盖率/`.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
node --test `
  scripts/canonical-license-text-contract.test.mjs `
  scripts/third-party-notices-contract.test.mjs
```

Expected: all focused tests PASS.

---

### Task 4: Render canonical fallback transparently in NOTICE

**Files:**
- Modify: `scripts/third-party-notices-support.mjs`
- Modify: `scripts/third-party-notices-contract.test.mjs`
- Modify: `scripts/generate-third-party-notices.mjs`
- Modify: `scripts/third-party-notices-check.mjs`

**Interfaces:**
- Consumes: Task 3 report fields.
- Produces: a Markdown summary with separate upstream/distribution columns and one canonical-source section grouped by SPDX identifier.

- [ ] **Step 1: Write failing Markdown assertions**

Create a report fixture with one canonical MIT fallback and assert:

```js
assert.match(markdown, /上游可读文本覆盖/);
assert.match(markdown, /分发可读许可覆盖/);
assert.match(markdown, /SPDX 规范许可文本补充/);
assert.match(
  markdown,
  /上游发布包未提供可验证的可读许可全文/,
);
assert.match(markdown, /verified-spdx-canonical-text|规范文本补充/);
assert.doesNotMatch(
  markdown,
  /legalComplete|licenseApproved|法律批准已完成|许可兼容性已确认/,
);
```

For a dual-license fixture assert both `Apache-2.0` and `MIT` group headings exist and the original `MIT OR Apache-2.0` remains in the package table.

- [ ] **Step 2: Run and observe red**

Run:

```powershell
node --test scripts/third-party-notices-contract.test.mjs
```

Expected: FAIL because the new summary labels and canonical section are absent.

- [ ] **Step 3: Render two coverage columns**

Change the summary table to include:

```md
| 生态 | 包数量 | 有许可元数据 | 上游可读文本 | 上游缺口 | 上游覆盖率 | 分发可读许可 | 分发缺口 | 分发覆盖率 | 规范补充包 |
```

Each ecosystem row must use the old upstream fields for the upstream columns and the new distribution fields for the distribution columns.

- [ ] **Step 4: Render canonical groups before package tables**

For each `report.canonicalLicenseGroups` entry, render:

```md
## SPDX 规范许可文本补充

> 以下包的锁定上游发布物没有提供可验证的可读许可全文。本节由分发侧补充
> SPDX v3.28.0 固定提交中的规范文本；这不是上游随包文件，也不代表许可兼容性或法律批准。

### SPDX {licenseId}

- 适用包：`{packageIds...}`
- 固定提交：`c4a7237ec8f4654e867546f9f409749300f1bf4c`
- 上游路径：`{repositoryPath}`
- SHA-256：`{sha256}`
```

The full text remains in the deduplicated text-artifact section; the group section links to the matching `textId` rather than duplicating the body a second time.

- [ ] **Step 5: Label package-table provenance**

In `appendPackageTable`, detect canonical provenance separately and append:

```js
const canonicalIds = item.noticeFiles
  .filter((file) =>
    file.provenance?.kind === "verified-spdx-canonical-text",
  )
  .map((file) => file.provenance.licenseId);
```

Render `SPDX 规范补充：MIT` (or the sorted joined identifiers) rather than treating those files as local/upstream text.

- [ ] **Step 6: Update command summaries**

Both generate/check commands must print upstream and distribution missing counts:

```js
`上游文本缺口 npm ${summary.npmMissingTextCount} / Rust ${summary.cargoMissingTextCount}；` +
`分发文本缺口 npm ${summary.npmDistributionMissingTextCount} / Rust ${summary.cargoDistributionMissingTextCount}；` +
`规范补充包 ${summary.canonicalFallbackPackageCount}。`
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
node --test `
  scripts/canonical-license-text-contract.test.mjs `
  scripts/third-party-notices-contract.test.mjs
```

Expected: all tests PASS and Markdown assertions confirm the distinction.

---

### Task 5: Synchronize the real fixed SPDX texts and regenerate NOTICE evidence

**Files:**
- Create: `review/canonical-license-text-supplements.json`
- Create:
  - `third_party/license-texts/spdx/v3.28.0/Apache-2.0.txt`
  - `third_party/license-texts/spdx/v3.28.0/BSD-2-Clause.txt`
  - `third_party/license-texts/spdx/v3.28.0/ISC.txt`
  - `third_party/license-texts/spdx/v3.28.0/MIT.txt`
  - `third_party/license-texts/spdx/v3.28.0/MPL-2.0.txt`
- Regenerate: `review/third-party-notice-index.json`
- Regenerate: `docs/THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: fixed policy and the explicit network sync command.
- Produces: real offline SPDX evidence and a schema `1.2` NOTICE index.

- [ ] **Step 1: Run the explicit network sync**

Run:

```powershell
npm.cmd run licenses:notices:sync:spdx
```

Expected JSON:

```json
{
  "source": "v3.28.0@c4a7237ec8f4654e867546f9f409749300f1bf4c",
  "licenseTextCount": 5,
  "reviewedExceptionCount": 11,
  "manifest": "review/canonical-license-text-supplements.json"
}
```

If the sandbox denies network access, rerun the same command with explicit escalation; do not use an unpinned mirror.

- [ ] **Step 2: Generate the NOTICE index and Markdown**

Run:

```powershell
npm.cmd run licenses:notices:generate
```

Expected:

- upstream gaps remain npm `9`, Rust `2`;
- distribution gaps become npm `0`, Rust `0`;
- canonical fallback package count is `11`;
- five SPDX groups are present;
- status is `draft-generated-complete-distribution-text-with-upstream-gaps-awaiting-review`.

- [ ] **Step 3: Assert real generated metrics**

Run:

```powershell
$report = Get-Content -LiteralPath `
  'review\third-party-notice-index.json' -Raw -Encoding UTF8 |
  ConvertFrom-Json
[pscustomobject]@{
  schema = $report.schemaVersion
  npmUpstreamMissing =
    $report.ecosystems.npm.coverage.packagesWithoutReadableNoticeText
  cargoUpstreamMissing =
    $report.ecosystems.cargo.coverage.packagesWithoutReadableNoticeText
  npmDistributionMissing =
    $report.ecosystems.npm.coverage.packagesWithoutDistributionLicenseText
  cargoDistributionMissing =
    $report.ecosystems.cargo.coverage.packagesWithoutDistributionLicenseText
  canonicalFallbacks =
    $report.ecosystems.npm.coverage.canonicalFallbackPackageCount +
    $report.ecosystems.cargo.coverage.canonicalFallbackPackageCount
  distributionComplete = $report.completeDistributionLicenseTextCoverage
  legalGate = $report.gateSatisfied
} | ConvertTo-Json
```

Expected values: `1.2`, `9`, `2`, `0`, `0`, `11`, `true`, `false`.

- [ ] **Step 4: Run the offline NOTICE check**

Run:

```powershell
npm.cmd run licenses:notices:check
```

Expected: the generated index and Markdown validate without any network request.

- [ ] **Step 5: Perform a controlled tamper probe**

Copy one canonical text to a temporary file under the OS temporary directory, modify only the project copy with `apply_patch`, and run the check expecting a hash failure. Restore the exact bytes from the temporary copy using a non-transforming binary copy only after verifying both resolved paths are inside the intended temporary directory and `E:\weatherpoem\third_party\license-texts\spdx\v3.28.0`. Rerun the check and expect PASS.

Do not use this probe while a file cannot be restored byte-for-byte. Record before/after SHA-256 and require equality.

---

### Task 6: Update RQT-23 documentation without converting engineering coverage into legal approval

**Files:**
- Modify: `review/third-party-license-source-map.json`
- Modify: `docs/CONTENT_ASSET_LICENSES.md`
- Modify: `docs/MVP_VERIFICATION.md`
- Modify: `docs/WeatherPoem_产品设计工作稿.md`
- Regenerate: `review/content-asset-license-inventory.json`
- Regenerate: `review/requirements-traceability.json`
- Regenerate: `output/WeatherPoem_0.2.0_READINESS.json`
- Refresh package-hash-bound planning artifacts affected by the new npm script.

**Interfaces:**
- Consumes: verified generated metrics from Task 5.
- Produces: consistent RQT-23 wording and current hash-bound evidence.

- [ ] **Step 1: Update the source-map purpose**

Keep the existing same-release mapping rule strict, but change its purpose text to state that it does not use SPDX templates; canonical fallback is governed separately by:

```text
review/canonical-license-text-policy.json
review/canonical-license-text-supplements.json
```

- [ ] **Step 2: Update the three user-facing documents**

Replace the old “296 texts, 259/268 npm, 284/286 Rust, remaining 9+2” wording with both layers:

```text
上游可验证文本仍覆盖 259/268 个 npm 包和 284/286 个 Windows Rust 包，
9 + 2 个上游缺口如实保留；分发 NOTICE 通过 SPDX v3.28.0 固定提交的
五份规范文本补充覆盖这 11 个受控例外，因此分发可读许可文本覆盖达到
268/268 与 286/286。规范补充不冒充上游随包文件，也不代表许可兼容性或法务批准。
```

Keep RQT-23 `partial`. Keep the remaining blockers:

- project root has no selected publication license;
- license compatibility/obligation review is not complete;
- named legal review is not complete;
- real rebuilt NSIS/MSI installed NOTICE evidence is not yet complete until the long run ends and rebuild is performed.

- [ ] **Step 3: Update traceability contract expectations first**

In `scripts/project-readiness-contract.test.mjs`, require RQT-23 evidence to include:

```text
review/canonical-license-text-policy.json
review/canonical-license-text-supplements.json
```

Require the RQT-23 narrative to distinguish upstream and distribution coverage. Run:

```powershell
node --test scripts/project-readiness-contract.test.mjs
```

Expected: FAIL until the readiness generator or evidence map is updated.

- [ ] **Step 4: Update readiness evidence mapping and regenerate**

Modify the RQT-23 evidence list in the readiness source/generator, then run:

```powershell
npm.cmd run licenses:generate
npm.cmd run pilot:four-week:generate
npm.cmd run updater:plan:generate
npm.cmd run distribution:plan:generate
npm.cmd run signing:plan:generate
npm.cmd run requirements:generate
```

Expected: all generated files bind the current `package.json` hash and current NOTICE inputs.

- [ ] **Step 5: Run documentation and readiness checks**

Run:

```powershell
npm.cmd run licenses:check
npm.cmd run requirements:check
rg -n "9 \\+ 2|259/268|284/286|268/268|286/286|SPDX v3\\.28\\.0|RQT-23" `
  docs/CONTENT_ASSET_LICENSES.md `
  docs/MVP_VERIFICATION.md `
  docs/WeatherPoem_产品设计工作稿.md
```

Expected: both coverage layers are present and RQT-23 remains partial.

---

### Task 7: Run final engineering verification for this subfeature

**Files:**
- Verify all files touched in Tasks 1–6.
- Do not rebuild Tauri installers during an active eight-hour run.

**Interfaces:**
- Consumes: completed implementation and regenerated evidence.
- Produces: targeted and full verification evidence; no legal or installer claim.

- [ ] **Step 1: Run focused license tests**

Run:

```powershell
node --test `
  scripts/canonical-license-text-contract.test.mjs `
  scripts/third-party-notices-contract.test.mjs `
  scripts/license-inventory-contract.test.mjs `
  scripts/project-readiness-contract.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: exit code `0`, no warnings.

- [ ] **Step 3: Run the complete project check**

Run:

```powershell
npm.cmd run check
```

Expected: exit code `0`. This may rebuild frontend `dist`, but must not invoke `tauri build` or replace the running EXE.

- [ ] **Step 4: Run ordinary release verification**

Run:

```powershell
npm.cmd run release:verify
```

Expected: exit code `0`; ordinary verification remains non-elevated and does not require installed NOTICE evidence.

- [ ] **Step 5: Confirm the expected manual gate remains honest**

Run:

```powershell
npm.cmd run release:verify:manual-windows
```

Expected before the post-long-run rebuild/install lifecycle: nonzero exit due missing current NSIS/MSI installed NOTICE evidence, not due canonical-source validation.

- [ ] **Step 6: Recheck the eight-hour run without modifying it**

Run:

```powershell
npm.cmd run performance:eight-hour:status
```

If status is `running`, stop this subfeature at the verified code/data state and leave installer rebuild pending. If status is `completed`, immediately run:

```powershell
npm.cmd run performance:eight-hour:check
```

Only a passing formal check permits the separate installer rebuild and installed-NOTICE verification plan to continue.

- [ ] **Step 7: Record a final file/hash checkpoint**

Run:

```powershell
Get-FileHash -Algorithm SHA256 `
  review/canonical-license-text-policy.json, `
  review/canonical-license-text-supplements.json, `
  review/third-party-notice-index.json, `
  docs/THIRD_PARTY_NOTICES.md, `
  scripts/canonical-license-text-support.mjs, `
  scripts/canonical-license-text-contract.test.mjs, `
  scripts/sync-spdx-license-texts.mjs, `
  scripts/third-party-notices-support.mjs, `
  scripts/third-party-notices-contract.test.mjs
```

Expected: nine SHA-256 records are available for review; no Git commit is attempted.

---

## Plan Completion Boundary

This plan completes only the engineering subfeature “distribution NOTICE has readable canonical text for the 11 reviewed upstream-text gaps.” It does not:

- claim that the upstream package archives carried those texts;
- choose between alternatives in `MIT OR Apache-2.0`;
- decide license compatibility or obligations;
- select WeatherPoem’s own publication license;
- replace named legal review;
- prove that an old installer already contains the regenerated NOTICE;
- authorize rebuilding while the frozen eight-hour candidate is running.

After this plan passes, continue the existing post-long-run sequence: formal eight-hour verdict, rebuild from the exact new source state, NSIS and elevated MSI lifecycle verification, installed NOTICE byte evidence, refreshed final DOCX, and the full requirement-by-requirement completion audit.
