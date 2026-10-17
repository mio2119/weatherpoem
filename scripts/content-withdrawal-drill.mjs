import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { assertContentWithdrawalDrillReport } from "./content-withdrawal-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const catalogPath = path.join(
  projectRoot,
  "server",
  "reason-catalog.json",
);
const servicePath = path.join(
  projectRoot,
  "src",
  "services",
  "content-control.ts",
);
const schemaPath = path.join(
  projectRoot,
  "server",
  "content-withdrawal.schema.json",
);
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const baselineReportPath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${packageJson.version}_CONTENT_WITHDRAWAL_DRILL.json`,
);
const reportName = process.argv.find((arg) => arg.startsWith("--report="))
  ?.slice("--report=".length);
if (reportName && !/^T08_[A-Za-z0-9_-]+\.json$/.test(reportName)) {
  throw new Error("--report requires a T08_*.json filename");
}
const reportPath = reportName
  ? path.join(projectRoot, "review", "redesign", "evidence", reportName)
  : baselineReportPath;
const checkOnly = process.argv.includes("--check");
if (!checkOnly && reportName && existsSync(reportPath)) {
  throw new Error(`Refusing to overwrite a redesign evidence report: ${reportPath}`);
}

async function sha256(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex")
    .toUpperCase();
}

async function context(now = Date.now()) {
  return {
    version: packageJson.version,
    contentVersion: catalog.contentVersion,
    catalogCount: catalog.works.length,
    knownWorkIds: new Set(catalog.works.map((work) => work.id)),
    catalogSha256: await sha256(catalogPath),
    serviceSha256: await sha256(servicePath),
    schemaSha256: await sha256(schemaPath),
    now,
  };
}

if (checkOnly) {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assertContentWithdrawalDrillReport(
    report,
    await context(),
  );
  console.log(
    `内容撤回自动演练报告有效：${path.relative(projectRoot, reportPath)}；生产网关与具名演练仍未完成。`,
  );
  process.exit(0);
}

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

const vite = await createServer({
  root: projectRoot,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const {
    CONTENT_WITHDRAWAL_CACHE_KEY,
    fetchContentWithdrawals,
    filterWithdrawnWorks,
    shouldShowContentCorrection,
  } = await vite.ssrLoadModule("/src/services/content-control.ts");
  const now = Date.now();
  const currentContext = await context(now);
  const sample = catalog.works[0];
  if (!sample) throw new Error("内容目录为空，无法执行撤回演练");
  const revision = 41;
  const manifest = {
    schemaVersion: "1.0",
    contentVersion: catalog.contentVersion,
    revision,
    issuedAt: new Date(now - 60_000).toISOString(),
    suspendRecommendations: false,
    withdrawnWorkIds: [sample.id],
  };
  const storage = new MemoryStorage();
  let requestContainsVersionsOnly = false;
  const online = await fetchContentWithdrawals(
    currentContext.knownWorkIds,
    catalog.contentVersion,
    packageJson.version,
    {
      endpoint: "https://content.example/v1/withdrawals",
      releaseChannel: "production",
      now,
      storage,
      fetcher: async (input) => {
        const url = new URL(String(input));
        requestContainsVersionsOnly =
          [...url.searchParams.keys()].sort().join(",") ===
            "appVersion,contentVersion" &&
          url.searchParams.get("appVersion") === packageJson.version &&
          url.searchParams.get("contentVersion") ===
            catalog.contentVersion;
        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  );
  const offline = await fetchContentWithdrawals(
    currentContext.knownWorkIds,
    catalog.contentVersion,
    packageJson.version,
    {
      endpoint: "https://content.example/v1/withdrawals",
      releaseChannel: "production",
      now,
      storage,
      fetcher: async () => {
        throw new Error("simulated offline");
      },
    },
  );
  const lowerRevision = await fetchContentWithdrawals(
    currentContext.knownWorkIds,
    catalog.contentVersion,
    packageJson.version,
    {
      endpoint: "https://content.example/v1/withdrawals",
      releaseChannel: "production",
      now,
      storage,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            ...manifest,
            revision: revision - 1,
            withdrawnWorkIds: [],
          }),
          { status: 200 },
        ),
    },
  );
  const sameRevisionConflict = await fetchContentWithdrawals(
    currentContext.knownWorkIds,
    catalog.contentVersion,
    packageJson.version,
    {
      endpoint: "https://content.example/v1/withdrawals",
      releaseChannel: "production",
      now,
      storage,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            ...manifest,
            withdrawnWorkIds: [],
          }),
          { status: 200 },
        ),
    },
  );
  const available = filterWithdrawnWorks(
    catalog.works,
    online.withdrawnWorkIds,
  );
  const report = {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    version: packageJson.version,
    contentVersion: catalog.contentVersion,
    drilledAt: new Date(now).toISOString(),
    scope: "automated-content-withdrawal-simulation",
    catalog: {
      workCount: catalog.works.length,
      sha256: currentContext.catalogSha256,
    },
    implementation: {
      serviceSha256: currentContext.serviceSha256,
      schemaSha256: currentContext.schemaSha256,
    },
    sample: {
      workId: sample.id,
      beforeCount: catalog.works.length,
      afterCount: available.length,
      revision,
    },
    checks: {
      remoteManifestAccepted:
        online.source === "remote" &&
        online.withdrawnWorkIds.includes(sample.id)
          ? "passed"
          : "failed",
      requestContainsVersionsOnly: requestContainsVersionsOnly
        ? "passed"
        : "failed",
      cacheWritten: storage.getItem(CONTENT_WITHDRAWAL_CACHE_KEY)
        ? "passed"
        : "failed",
      offlineCacheRetained:
        offline.source === "cache" &&
        offline.withdrawnWorkIds.includes(sample.id)
          ? "passed"
          : "failed",
      lowerRevisionRejected:
        lowerRevision.manifest?.revision === revision &&
        lowerRevision.withdrawnWorkIds.includes(sample.id)
          ? "passed"
          : "failed",
      sameRevisionConflictRejected:
        sameRevisionConflict.manifest?.revision === revision &&
        sameRevisionConflict.withdrawnWorkIds.includes(sample.id)
          ? "passed"
          : "failed",
      withdrawnWorkExcluded: available.some(
        (work) => work.id === sample.id,
      )
        ? "failed"
        : "passed",
      currentWorkShowsCorrection: shouldShowContentCorrection(
        sample.id,
        online.withdrawnWorkIds,
      )
        ? "passed"
        : "failed",
    },
    limitations: {
      signedManifestVerified: false,
      productionGatewayTested: false,
      liveClientDrill: false,
      namedOperatorSignoff: false,
    },
    result: "automated-passed",
  };
  assertContentWithdrawalDrillReport(
    report,
    currentContext,
  );
  await writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `内容撤回自动演练通过：${sample.id} 已从 ${catalog.works.length} 首候选中排除，离线缓存与防回退检查通过；报告：${reportPath}`,
  );
} finally {
  await vite.close();
}
