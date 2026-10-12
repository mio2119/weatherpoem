import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  SPDX_CANONICAL_SOURCE,
  applyCanonicalLicenseSources,
  syncCanonicalLicenseTexts,
} from "./canonical-license-text-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function sha256(content) {
  return createHash("sha256")
    .update(content)
    .digest("hex")
    .toUpperCase();
}

function canonicalContents() {
  return {
    "Apache-2.0": Buffer.from("Apache fixture\n", "utf8"),
    "BSD-2-Clause": Buffer.from("BSD fixture\n", "utf8"),
    ISC: Buffer.from("ISC fixture\n", "utf8"),
    MIT: Buffer.from("MIT fixture\n", "utf8"),
    "MPL-2.0": Buffer.from("MPL fixture\n", "utf8"),
  };
}

function sourceUrl(repositoryPath) {
  return (
    "https://api.github.com/repos/spdx/license-list-data/contents/" +
    `${repositoryPath}?ref=${SPDX_CANONICAL_SOURCE.gitCommit}`
  );
}

function canonicalFile(licenseId, content) {
  const repositoryPath = `text/${licenseId}.txt`;
  return {
    licenseId,
    repositoryPath,
    sourceUrl: sourceUrl(repositoryPath),
    path:
      "third_party/license-texts/spdx/v3.28.0/" +
      `${licenseId}.txt`,
    bytes: content.length,
    sha256: sha256(content),
  };
}

function manifestFor(policy, contentByLicenseId) {
  return {
    schemaVersion: "1.0",
    generatedAt: "2026-07-24T00:00:00.000Z",
    source: structuredClone(SPDX_CANONICAL_SOURCE),
    bindings: structuredClone(policy.exceptions),
    files: Object.entries(contentByLicenseId)
      .map(([licenseId, content]) =>
        canonicalFile(licenseId, content),
      )
      .sort((left, right) =>
        left.licenseId.localeCompare(right.licenseId),
      ),
  };
}

function sourceReader(contentByLicenseId) {
  return async (filePath) => {
    const licenseId = path.basename(filePath, ".txt");
    const content = contentByLicenseId[licenseId];
    assert.ok(content, `unexpected canonical file: ${filePath}`);
    return content;
  };
}

test("规范文本补充保留上游缺口身份并附加独立来源", async () => {
  const contentByLicenseId = canonicalContents();
  const packages = [
    {
      packageId: "npm:node_modules/fixture",
      name: "fixture",
      version: "1.0.0",
      license: "MIT",
      source:
        "https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz",
      integrity: "sha512-fixture",
      packageRootAvailable: true,
      noticeFiles: [],
    },
  ];
  const policy = {
    schemaVersion: "1.0",
    source: structuredClone(SPDX_CANONICAL_SOURCE),
    exceptions: [
      {
        ecosystem: "npm",
        packageId: packages[0].packageId,
        name: packages[0].name,
        version: packages[0].version,
        license: packages[0].license,
        source: packages[0].source,
        integrity: packages[0].integrity,
        licenseIds: ["MIT"],
        reason: "upstream-readable-text-unavailable",
      },
    ],
  };
  const result = await applyCanonicalLicenseSources(
    packages,
    "npm",
    policy,
    manifestFor(policy, contentByLicenseId),
    "C:\\fixture",
    sourceReader(contentByLicenseId),
  );

  assert.equal(result.packages[0].noticeFiles.length, 1);
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.kind,
    "verified-spdx-canonical-text",
  );
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.licenseId,
    "MIT",
  );
  assert.deepEqual(result.bindings, policy.exceptions);
  assert.deepEqual(result.groups[0].packageIds, [
    packages[0].packageId,
  ]);
});

test("复合 OR 许可同时保留两份规范文本而不替项目选边", async () => {
  const contentByLicenseId = canonicalContents();
  const packages = [
    {
      packageId: "cargo:fixture@1.0.0",
      name: "fixture",
      version: "1.0.0",
      license: "MIT OR Apache-2.0",
      source: "https://github.com/example/fixture",
      checksum: "C".repeat(64),
      packageRootAvailable: true,
      noticeFiles: [],
    },
  ];
  const policy = {
    schemaVersion: "1.0",
    source: structuredClone(SPDX_CANONICAL_SOURCE),
    exceptions: [
      {
        ecosystem: "cargo",
        packageId: packages[0].packageId,
        name: packages[0].name,
        version: packages[0].version,
        license: packages[0].license,
        source: packages[0].source,
        checksum: packages[0].checksum,
        licenseIds: ["Apache-2.0", "MIT"],
        reason: "upstream-readable-text-unavailable",
      },
    ],
  };
  const result = await applyCanonicalLicenseSources(
    packages,
    "cargo",
    policy,
    manifestFor(policy, contentByLicenseId),
    "C:\\fixture",
    sourceReader(contentByLicenseId),
  );

  assert.equal(result.packages[0].license, "MIT OR Apache-2.0");
  assert.deepEqual(
    result.packages[0].noticeFiles.map(
      (file) => file.provenance.licenseId,
    ),
    ["Apache-2.0", "MIT"],
  );
  assert.deepEqual(
    result.groups.map((group) => group.licenseId),
    ["Apache-2.0", "MIT"],
  );
});

function npmFallbackFixture() {
  const contentByLicenseId = canonicalContents();
  const packages = [
    {
      packageId: "npm:node_modules/fixture",
      name: "fixture",
      version: "1.0.0",
      license: "MIT",
      source:
        "https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz",
      integrity: "sha512-fixture",
      packageRootAvailable: true,
      noticeFiles: [],
    },
  ];
  const policy = {
    schemaVersion: "1.0",
    source: structuredClone(SPDX_CANONICAL_SOURCE),
    exceptions: [
      {
        ecosystem: "npm",
        packageId: packages[0].packageId,
        name: packages[0].name,
        version: packages[0].version,
        license: packages[0].license,
        source: packages[0].source,
        integrity: packages[0].integrity,
        licenseIds: ["MIT"],
        reason: "upstream-readable-text-unavailable",
      },
    ],
  };
  return {
    contentByLicenseId,
    packages,
    policy,
    manifest: manifestFor(policy, contentByLicenseId),
  };
}

async function applyNpmFixture(fixture, reader) {
  return applyCanonicalLicenseSources(
    fixture.packages,
    "npm",
    fixture.policy,
    fixture.manifest,
    "C:\\fixture",
    reader ?? sourceReader(fixture.contentByLicenseId),
  );
}

const rejectionCases = [
  {
    name: "规范补充拒绝策略中的额外法律完成字段",
    mutate(fixture) {
      fixture.policy.legalApproved = true;
    },
    pattern: /字段|身份无效/,
  },
  {
    name: "规范补充拒绝没有恰好对应当前上游缺口的策略",
    mutate(fixture) {
      fixture.packages[0].noticeFiles.push({
        fileName: "LICENSE",
        bytes: 1,
        sha256: "D".repeat(64),
        textReadable: true,
        content: "x",
      });
    },
    pattern: /未恰好覆盖/,
  },
  {
    name: "规范补充拒绝被交换的依赖版本身份",
    mutate(fixture) {
      fixture.policy.exceptions[0].version = "2.0.0";
      fixture.manifest.bindings =
        structuredClone(fixture.policy.exceptions);
    },
    pattern: /依赖身份不一致/,
  },
  {
    name: "规范补充拒绝不完整的许可表达式映射",
    mutate(fixture) {
      fixture.policy.exceptions[0].licenseIds = [];
      fixture.manifest.bindings =
        structuredClone(fixture.policy.exceptions);
    },
    pattern: /标识与表达式不一致/,
  },
  {
    name: "规范补充拒绝没有固定完整提交的来源 URL",
    mutate(fixture) {
      fixture.manifest.files.find(
        (file) => file.licenseId === "MIT",
      ).sourceUrl =
        "https://api.github.com/repos/spdx/license-list-data/contents/text/MIT.txt?ref=main";
    },
    pattern: /来源未固定/,
  },
  {
    name: "规范补充拒绝越出允许目录的落盘路径",
    mutate(fixture) {
      fixture.manifest.files.find(
        (file) => file.licenseId === "MIT",
      ).path = "../outside/MIT.txt";
    },
    pattern: /路径越界/,
  },
  {
    name: "规范补充拒绝本地文本字节或哈希篡改",
    mutate(fixture) {
      fixture.manifest.files.find(
        (file) => file.licenseId === "MIT",
      ).sha256 = "E".repeat(64);
    },
    pattern: /字节或哈希不一致/,
  },
  {
    name: "规范补充拒绝无效 UTF-8 文本",
    mutate() {},
    reader: async () => Buffer.from([0xff]),
    pattern: /严格 UTF-8/,
  },
  {
    name: "规范补充拒绝证据清单中的未知额外许可",
    mutate(fixture) {
      fixture.manifest.files.push({
        licenseId: "GPL-3.0-only",
        repositoryPath: "text/GPL-3.0-only.txt",
        sourceUrl: sourceUrl("text/GPL-3.0-only.txt"),
        path:
          "third_party/license-texts/spdx/v3.28.0/" +
          "GPL-3.0-only.txt",
        bytes: 1,
        sha256: "F".repeat(64),
      });
    },
    pattern: /未知|文件集合/,
  },
];

for (const rejectionCase of rejectionCases) {
  test(rejectionCase.name, async () => {
    const fixture = npmFallbackFixture();
    rejectionCase.mutate(fixture);
    await assert.rejects(
      () => applyNpmFixture(fixture, rejectionCase.reader),
      rejectionCase.pattern,
    );
  });
}

test("同步只请求固定提交中的五份 SPDX 文本并生成可复验清单", async () => {
  const contentByLicenseId = canonicalContents();
  const policy = {
    schemaVersion: "1.0",
    source: structuredClone(SPDX_CANONICAL_SOURCE),
    exceptions: [],
  };
  const requested = [];
  const written = new Map();
  const manifest = await syncCanonicalLicenseTexts({
    projectRoot: "C:\\fixture",
    policy,
    fetchBytes: async (url) => {
      requested.push(url);
      const licenseId = path.posix.basename(
        new URL(url).pathname,
        ".txt",
      );
      return contentByLicenseId[licenseId];
    },
    makeDirectory: async () => {},
    writeSourceFile: async (filePath, content) => {
      written.set(filePath, Buffer.from(content));
    },
    now: () => new Date("2026-07-24T00:00:00.000Z"),
  });

  assert.equal(requested.length, 5);
  assert.ok(
    requested.every((url) =>
      url.endsWith(
        `?ref=${SPDX_CANONICAL_SOURCE.gitCommit}`,
      ),
    ),
  );
  assert.equal(written.size, 5);
  assert.equal(manifest.files.length, 5);
  assert.deepEqual(manifest.bindings, []);
  assert.equal(
    manifest.generatedAt,
    "2026-07-24T00:00:00.000Z",
  );
  assert.deepEqual(
    manifest.files.map((file) => file.licenseId),
    ["Apache-2.0", "BSD-2-Clause", "ISC", "MIT", "MPL-2.0"],
  );
  for (const file of manifest.files) {
    const content = contentByLicenseId[file.licenseId];
    assert.equal(file.bytes, content.length);
    assert.equal(file.sha256, sha256(content));
    assert.equal(
      file.repositoryPath,
      `text/${file.licenseId}.txt`,
    );
    assert.equal(
      file.path,
      `third_party/license-texts/spdx/v3.28.0/${file.licenseId}.txt`,
    );
  }
});

for (const invalidSyncCase of [
  {
    name: "同步拒绝含额外完成声明的策略",
    mutatePolicy(policy) {
      policy.licenseComplete = true;
    },
    content: Buffer.from("valid\n", "utf8"),
    pattern: /策略字段|身份无效/,
  },
  {
    name: "同步拒绝无效 UTF-8 的规范文本",
    mutatePolicy() {},
    content: Buffer.from([0xff]),
    pattern: /严格 UTF-8/,
  },
  {
    name: "同步拒绝空规范文本",
    mutatePolicy() {},
    content: Buffer.alloc(0),
    pattern: /为空或含 NUL/,
  },
  {
    name: "同步拒绝含 NUL 的规范文本",
    mutatePolicy() {},
    content: Buffer.from([0x41, 0x00, 0x42]),
    pattern: /为空或含 NUL/,
  },
]) {
  test(invalidSyncCase.name, async () => {
    const policy = {
      schemaVersion: "1.0",
      source: structuredClone(SPDX_CANONICAL_SOURCE),
      exceptions: [],
    };
    invalidSyncCase.mutatePolicy(policy);
    let writes = 0;
    await assert.rejects(
      () =>
        syncCanonicalLicenseTexts({
          projectRoot: "C:\\fixture",
          policy,
          fetchBytes: async () => invalidSyncCase.content,
          makeDirectory: async () => {},
          writeSourceFile: async () => {
            writes += 1;
          },
        }),
      invalidSyncCase.pattern,
    );
    assert.equal(writes, 0);
  });
}

test("SPDX 同步只能通过独立命令显式联网", async () => {
  const packageJson = JSON.parse(
    await readFile(
      path.join(projectRoot, "package.json"),
      "utf8",
    ),
  );
  const commandSource = await readFile(
    path.join(projectRoot, "scripts", "sync-spdx-license-texts.mjs"),
    "utf8",
  );

  assert.equal(
    packageJson.scripts["licenses:notices:sync:spdx"],
    "node scripts/sync-spdx-license-texts.mjs",
  );
  assert.doesNotMatch(
    packageJson.scripts["licenses:notices:generate"],
    /sync:spdx|sync-spdx/,
  );
  assert.doesNotMatch(
    packageJson.scripts["licenses:notices:check"],
    /sync:spdx|sync-spdx/,
  );
  assert.match(
    commandSource,
    /application\/vnd\.github\.raw\+json/,
  );
  assert.match(
    commandSource,
    /review["']?,\s*["']canonical-license-text-supplements\.json/,
  );
  assert.doesNotMatch(
    commandSource,
    /legalApproved|licenseComplete/,
  );
});
