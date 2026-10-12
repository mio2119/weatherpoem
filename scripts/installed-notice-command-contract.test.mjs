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
const requirementsSource = await read(
  "docs/WeatherPoem_产品设计工作稿.md",
);
const licenseGuide = await read("docs/CONTENT_ASSET_LICENSES.md");
const mvpVerification = await read("docs/MVP_VERIFICATION.md");
const packageJson = JSON.parse(await read("package.json"));

test("recorder accepts explicit kind, install root, artifact, and output", () => {
  assert.match(recorder, /--kind/);
  assert.match(recorder, /--install-root/);
  assert.match(recorder, /--artifact/);
  assert.match(recorder, /--output/);
  assert.match(recorder, /collectReleaseState/);
  assert.match(recorder, /expectedArtifact/);
  assert.match(recorder, /requestedEvidencePath/);
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
    assert.match(
      packageJson.scripts[name],
      /installed-notice-command-contract\.test\.mjs/,
    );
  }
});

test("delivery documents distinguish installed-byte proof from legal approval", () => {
  assert.match(requirementsSource, /安装后字节校验器/);
  assert.match(
    requirementsSource,
    /人工 Windows 与 production 门禁必须要求该证据/,
  );
  for (const label of [
    "已配置",
    "安装字节已验证",
    "法律许可已批准",
  ]) {
    assert.match(licenseGuide, new RegExp(label));
  }
  assert.match(
    mvpVerification,
    /WeatherPoem_0\.2\.0_INSTALLED_NOTICE\.json/,
  );
  assert.match(
    mvpVerification,
    /机器证据也不代表许可证完整或具名法务批准/,
  );
});
