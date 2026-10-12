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

test("stale, private, elevated-scope, or future evidence is rejected", async (t) => {
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
