import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applySharedLicenseSources,
  applyVendoredCargoLicenseSources,
  applyVendoredNpmLicenseSources,
  buildThirdPartyNoticeDraft,
  mergeCanonicalLicenseGroups,
  validateThirdPartyNoticeDraft,
} from "./third-party-notices-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const sha = "A".repeat(64);
const licenseContent =
  "Permission is hereby granted for this fixture.\n";
const licenseSha =
  "A4833E7CB8521810DD28CB58258981F033AB33DD6D778A569C7CEB5D997AB55E";
const inputs = {
  appVersion: "0.2.0",
  inputs: Object.fromEntries(
    [
      "packageJson",
      "packageLock",
      "cargoLock",
      "cargoAudit",
      "tauriConfig",
      "licenseSourceMap",
      "npmLicenseSupplements",
      "cargoLicenseSupplements",
    ].map(
      (key) => [
        key,
        {
          path: `${key}.fixture`,
          sha256: sha,
        },
      ],
    ),
  ),
  noticeBundleConfigured: true,
  supplementalLicenseGroups: [],
  vendoredNpmLicenseSources: [],
  vendoredCargoLicenseSources: [],
  npmPackages: [
    {
      packageId: "npm:node_modules/vue",
      name: "vue",
      version: "3.5.40",
      license: "MIT",
      source: "https://registry.npmjs.org/vue/-/vue-3.5.40.tgz",
      packageRootAvailable: true,
      noticeFiles: [
        {
          fileName: "LICENSE",
          bytes: Buffer.byteLength(licenseContent),
          sha256: licenseSha,
          textReadable: true,
          content: licenseContent,
        },
      ],
    },
  ],
  cargoPackages: [
    {
      packageId: "cargo:tauri@2.11.5",
      name: "tauri",
      version: "2.11.5",
      license: "Apache-2.0 OR MIT",
      source: "https://github.com/tauri-apps/tauri",
      packageRootAvailable: true,
      noticeFiles: [],
    },
  ],
};

test("同仓库同版本同许可的平台子包可复用主包实际文本", () => {
  const result = applySharedLicenseSources(
    [
      {
        packageId: "npm:node_modules/rolldown",
        name: "rolldown",
        version: "1.1.5",
        license: "MIT",
        repository: "https://github.com/rolldown/rolldown",
        noticeFiles: [
          {
            fileName: "LICENSE",
            bytes: Buffer.byteLength(licenseContent),
            sha256: licenseSha,
            textReadable: true,
            content: licenseContent,
            provenance: { kind: "package-root" },
          },
        ],
      },
      {
        packageId:
          "npm:node_modules/@rolldown/binding-win32-x64-msvc",
        name: "@rolldown/binding-win32-x64-msvc",
        version: "1.1.5",
        license: "MIT",
        repository: "",
        noticeFiles: [],
      },
    ],
    {
      schemaVersion: "1.0",
      groups: [
        {
          id: "rolldown-fixture",
          ecosystem: "npm",
          relationship: "same-release-platform-package",
          repository:
            "https://github.com/rolldown/rolldown.git",
          sourcePackageId: "npm:node_modules/rolldown",
          targetPackageIds: [
            "npm:node_modules/@rolldown/binding-win32-x64-msvc",
          ],
        },
      ],
    },
  );
  const target = result.packages[1];
  assert.equal(target.noticeFiles[0].sha256, licenseSha);
  assert.equal(
    target.noticeFiles[0].provenance.kind,
    "shared-package-license",
  );
  assert.equal(result.groups[0].targetPackageIds.length, 1);
});

test("共享许可映射拒绝跨版本或不同许可表达式", () => {
  assert.throws(
    () =>
      applySharedLicenseSources(
        [
          {
            packageId: "npm:source",
            version: "1.0.0",
            license: "MIT",
            repository: "https://github.com/example/repo",
            noticeFiles: [
              {
                fileName: "LICENSE",
                bytes: 1,
                sha256: licenseSha,
                textReadable: true,
                content: licenseContent,
              },
            ],
          },
          {
            packageId: "npm:target",
            version: "2.0.0",
            license: "Apache-2.0",
            noticeFiles: [],
          },
        ],
        {
          schemaVersion: "1.0",
          groups: [
            {
              id: "invalid-fixture",
              ecosystem: "npm",
              relationship: "same-release-platform-package",
              repository: "https://github.com/example/repo",
              sourcePackageId: "npm:source",
              targetPackageIds: ["npm:target"],
            },
          ],
        },
      ),
    /版本、许可或现状不一致/,
  );
});

test("精确 npm 发行包许可文本须同时匹配锁文件、整包与文本哈希", async () => {
  const resolved =
    "https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz";
  const integrity = `sha512-${Buffer.from("fixture").toString("base64")}`;
  const result = await applyVendoredNpmLicenseSources(
    [
      {
        packageId: "npm:node_modules/fixture",
        name: "fixture",
        version: "1.0.0",
        license: "MIT",
        source: resolved,
        integrity,
        noticeFiles: [],
      },
    ],
    {
      schemaVersion: "1.0",
      entries: [
        {
          packageId: "npm:node_modules/fixture",
          name: "fixture",
          version: "1.0.0",
          license: "MIT",
          resolved,
          integrity,
          archiveSha512: "B".repeat(128),
          files: [
            {
              archivePath: "package/LICENSE",
              path: "third_party/license-texts/npm/fixture@1.0.0/LICENSE",
              bytes: Buffer.byteLength(licenseContent),
              sha256: licenseSha,
            },
          ],
        },
      ],
    },
    "C:\\fixture",
    async () => Buffer.from(licenseContent),
  );
  assert.equal(result.entries.length, 1);
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.kind,
    "verified-npm-archive",
  );
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.archiveSha512,
    "B".repeat(128),
  );
});

test("npm 发行包补充文本的落库内容被篡改时拒绝生成", async () => {
  const resolved =
    "https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz";
  const integrity = `sha512-${Buffer.from("fixture").toString("base64")}`;
  await assert.rejects(
    () =>
      applyVendoredNpmLicenseSources(
        [
          {
            packageId: "npm:node_modules/fixture",
            name: "fixture",
            version: "1.0.0",
            license: "MIT",
            source: resolved,
            integrity,
            noticeFiles: [],
          },
        ],
        {
          schemaVersion: "1.0",
          entries: [
            {
              packageId: "npm:node_modules/fixture",
              name: "fixture",
              version: "1.0.0",
              license: "MIT",
              resolved,
              integrity,
              archiveSha512: "B".repeat(128),
              files: [
                {
                  archivePath: "package/LICENSE",
                  path: "third_party/license-texts/npm/fixture@1.0.0/LICENSE",
                  bytes: Buffer.byteLength(licenseContent),
                  sha256: licenseSha,
                },
              ],
            },
          ],
        },
        "C:\\fixture",
        async () => Buffer.from("tampered"),
      ),
    /文件缺失或哈希不一致/,
  );
});

test("npm gitHead 锁定的仓库根许可文本可作为发行包缺失时的补充来源", async () => {
  const resolved =
    "https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz";
  const integrity = `sha512-${Buffer.from("fixture").toString("base64")}`;
  const gitHead = "c".repeat(40);
  const result = await applyVendoredNpmLicenseSources(
    [
      {
        packageId: "npm:node_modules/fixture",
        name: "fixture",
        version: "1.0.0",
        license: "MIT",
        source: resolved,
        integrity,
        noticeFiles: [],
      },
    ],
    {
      schemaVersion: "1.1",
      entries: [
        {
          sourceKind: "npm-git-commit",
          packageId: "npm:node_modules/fixture",
          name: "fixture",
          version: "1.0.0",
          license: "MIT",
          resolved,
          integrity,
          archiveSha512: "B".repeat(128),
          registryMetadataUrl:
            "https://registry.npmjs.org/fixture/1.0.0",
          registryMetadataSha256: "D".repeat(64),
          repository: "https://github.com/example/fixture",
          gitHead,
          files: [
            {
              repositoryPath: "LICENSE",
              sourceUrl:
                `https://api.github.com/repos/example/fixture/contents/LICENSE?ref=${gitHead}`,
              path: "third_party/license-texts/npm/fixture@1.0.0/LICENSE",
              bytes: Buffer.byteLength(licenseContent),
              sha256: licenseSha,
            },
          ],
        },
      ],
    },
    "C:\\fixture",
    async () => Buffer.from(licenseContent),
  );
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.kind,
    "verified-npm-git-commit",
  );
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.gitHead,
    gitHead,
  );
});

test("Cargo.lock 校验和与 crate VCS 提交共同锁定仓库许可文本", async () => {
  const gitHead = "c".repeat(40);
  const result = await applyVendoredCargoLicenseSources(
    [
      {
        packageId: "cargo:fixture@1.0.0",
        name: "fixture",
        version: "1.0.0",
        license: "MIT",
        source: "https://github.com/example/fixture",
        checksum: "A".repeat(64),
        noticeFiles: [],
      },
    ],
    {
      schemaVersion: "1.0",
      entries: [
        {
          sourceKind: "cargo-git-commit",
          packageId: "cargo:fixture@1.0.0",
          name: "fixture",
          version: "1.0.0",
          license: "MIT",
          repository: "https://github.com/example/fixture",
          downloadUrl:
            "https://crates.io/api/v1/crates/fixture/1.0.0/download",
          lockChecksumSha256: "A".repeat(64),
          crateSha256: "A".repeat(64),
          vcsInfoArchivePath:
            "fixture-1.0.0/.cargo_vcs_info.json",
          vcsInfoSha256: "D".repeat(64),
          gitHead,
          files: [
            {
              repositoryPath: "LICENSE",
              sourceUrl:
                `https://api.github.com/repos/example/fixture/contents/LICENSE?ref=${gitHead}`,
              path: "third_party/license-texts/cargo/fixture@1.0.0/LICENSE",
              bytes: Buffer.byteLength(licenseContent),
              sha256: licenseSha,
            },
          ],
        },
      ],
    },
    "C:\\fixture",
    async () => Buffer.from(licenseContent),
  );
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.kind,
    "verified-cargo-git-commit",
  );
  assert.equal(
    result.packages[0].noticeFiles[0].provenance.lockChecksumSha256,
    "A".repeat(64),
  );
});

test("草案如实保留本地许可文本缺口与人工边界", () => {
  const { report, markdown } = buildThirdPartyNoticeDraft(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  const summary = validateThirdPartyNoticeDraft(
    report,
    markdown,
    inputs,
  );
  assert.equal(summary.npmMissingTextCount, 0);
  assert.equal(summary.cargoMissingTextCount, 1);
  assert.equal(summary.bundleConfigured, true);
  assert.equal(report.gateSatisfied, false);
});

test("篡改包覆盖率或删除文本会被拒绝", () => {
  const { report, markdown } = buildThirdPartyNoticeDraft(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  report.ecosystems.cargo.coverage
    .packagesWithoutReadableNoticeText = 0;
  assert.throws(
    () =>
      validateThirdPartyNoticeDraft(report, markdown, inputs),
    /覆盖率/,
  );
});

test("自动草案不能冒充当前安装包已包含或具名法务批准", () => {
  const { report, markdown } = buildThirdPartyNoticeDraft(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  report.draft.bundledIntoCurrentInstaller = true;
  report.approval.legalReviewer = "虚构批准人";
  report.gateSatisfied = true;
  assert.throws(
    () =>
      validateThirdPartyNoticeDraft(report, markdown, inputs),
    /不得冒充/,
  );
});

test("规范文本只关闭分发缺口而不掩盖上游文本缺口", () => {
  const canonicalInputs = structuredClone(inputs);
  canonicalInputs.canonicalLicenseBindings = [
    {
      ecosystem: "cargo",
      packageId: "cargo:tauri@2.11.5",
      name: "tauri",
      version: "2.11.5",
      license: "Apache-2.0 OR MIT",
      source: "https://github.com/tauri-apps/tauri",
      checksum: "C".repeat(64),
      licenseIds: ["Apache-2.0", "MIT"],
      reason: "upstream-readable-text-unavailable",
    },
  ];
  canonicalInputs.canonicalLicenseGroups = [
    {
      licenseId: "MIT",
      repository:
        "https://github.com/spdx/license-list-data",
      releaseTag: "v3.28.0",
      gitCommit:
        "c4a7237ec8f4654e867546f9f409749300f1bf4c",
      repositoryPath: "text/MIT.txt",
      sourceUrl:
        "https://api.github.com/repos/spdx/license-list-data/contents/text/MIT.txt?ref=c4a7237ec8f4654e867546f9f409749300f1bf4c",
      sha256: licenseSha,
      packageIds: ["cargo:tauri@2.11.5"],
    },
  ];
  canonicalInputs.cargoPackages[0].noticeFiles = [
    {
      fileName: "MIT.txt",
      bytes: Buffer.byteLength(licenseContent),
      sha256: licenseSha,
      textReadable: true,
      content: licenseContent,
      provenance: {
        kind: "verified-spdx-canonical-text",
        licenseId: "MIT",
        releaseTag: "v3.28.0",
        gitCommit:
          "c4a7237ec8f4654e867546f9f409749300f1bf4c",
      },
    },
  ];

  const { report, markdown } = buildThirdPartyNoticeDraft(
    canonicalInputs,
    new Date().toISOString(),
  );

  assert.equal(
    report.ecosystems.cargo.coverage
      .packagesWithoutReadableNoticeText,
    1,
  );
  assert.equal(
    report.ecosystems.cargo.coverage
      .packagesWithoutDistributionLicenseText,
    0,
  );
  assert.equal(
    report.ecosystems.cargo.coverage
      .distributionLicenseTextCoveragePercent,
    100,
  );
  assert.equal(
    report.ecosystems.cargo.coverage
      .canonicalFallbackPackageCount,
    1,
  );
  assert.equal(report.completeReadableTextCoverage, false);
  assert.equal(
    report.completeDistributionLicenseTextCoverage,
    true,
  );
  assert.equal(
    report.status,
    "draft-generated-complete-distribution-text-with-upstream-gaps-awaiting-review",
  );
  assert.match(markdown, /上游可读文本覆盖/);
  assert.match(markdown, /分发可读许可覆盖/);
  assert.match(markdown, /SPDX 规范许可文本补充/);
  assert.match(
    markdown,
    /上游发布包未提供可验证的可读许可全文/,
  );
  assert.match(markdown, /规范文本补充：MIT/);
  assert.doesNotMatch(
    markdown,
    /legalComplete|licenseApproved|法律批准已完成|许可兼容性已确认/,
  );
});

test("跨 npm 与 Cargo 的同一 SPDX 文本合并为一个确定性分组", () => {
  const shared = {
    licenseId: "MIT",
    repository: "https://github.com/spdx/license-list-data",
    releaseTag: "v3.28.0",
    gitCommit:
      "c4a7237ec8f4654e867546f9f409749300f1bf4c",
    repositoryPath: "text/MIT.txt",
    sourceUrl:
      "https://api.github.com/repos/spdx/license-list-data/contents/text/MIT.txt?ref=c4a7237ec8f4654e867546f9f409749300f1bf4c",
    sha256: licenseSha,
  };
  const groups = mergeCanonicalLicenseGroups([
    {
      ...shared,
      packageIds: ["npm:node_modules/example"],
    },
    {
      ...shared,
      packageIds: ["cargo:example@1.0.0"],
    },
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].packageIds, [
    "cargo:example@1.0.0",
    "npm:node_modules/example",
  ]);
});

test("真实 NOTICE 收集器把策略、同步清单和两个生态共同纳入输入身份", async () => {
  const source = await readFile(
    path.join(
      projectRoot,
      "scripts",
      "third-party-notices-support.mjs",
    ),
    "utf8",
  );

  assert.match(
    source,
    /from "\.\/canonical-license-text-support\.mjs"/,
  );
  assert.match(
    source,
    /readJson\("review\/canonical-license-text-policy\.json"\)/,
  );
  assert.match(
    source,
    /readJson\("review\/canonical-license-text-supplements\.json"\)/,
  );
  assert.match(
    source,
    /applyCanonicalLicenseSources\(\s*vendoredNpm\.packages,\s*"npm"/,
  );
  assert.match(
    source,
    /applyCanonicalLicenseSources\(\s*vendoredCargo\.packages,\s*"cargo"/,
  );
  assert.match(source, /canonicalLicenseBindings:/);
  assert.match(source, /canonicalLicenseGroups:/);
  assert.match(
    source,
    /canonicalLicensePolicy:\s*"review\/canonical-license-text-policy\.json"/,
  );
  assert.match(
    source,
    /canonicalLicenseSupplements:\s*"review\/canonical-license-text-supplements\.json"/,
  );
});

test("NOTICE 生成与检查摘要同时报告上游和分发缺口", async () => {
  const commandSources = await Promise.all(
    [
      "generate-third-party-notices.mjs",
      "third-party-notices-check.mjs",
    ].map((fileName) =>
      readFile(
        path.join(projectRoot, "scripts", fileName),
        "utf8",
      ),
    ),
  );
  for (const source of commandSources) {
    assert.match(source, /npmDistributionMissingTextCount/);
    assert.match(source, /cargoDistributionMissingTextCount/);
    assert.match(source, /canonicalFallbackPackageCount/);
    assert.match(source, /上游文本缺口/);
    assert.match(source, /分发文本缺口/);
    assert.doesNotMatch(
      source,
      /legalComplete|licenseApproved/,
    );
  }
});
