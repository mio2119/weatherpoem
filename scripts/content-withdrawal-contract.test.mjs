import assert from "node:assert/strict";
import test from "node:test";
import { assertContentWithdrawalDrillReport } from "./content-withdrawal-support.mjs";

const NOW = Date.parse("2026-07-24T00:00:00+08:00");
const CONTEXT = {
  version: "0.2.0",
  contentVersion: "2026.07.1",
  catalogCount: 120,
  knownWorkIds: new Set(["work-a"]),
  catalogSha256: "A".repeat(64),
  serviceSha256: "B".repeat(64),
  schemaSha256: "C".repeat(64),
  now: NOW,
};

function validReport() {
  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    version: "0.2.0",
    contentVersion: "2026.07.1",
    drilledAt: "2026-07-23T23:00:00+08:00",
    scope: "automated-content-withdrawal-simulation",
    catalog: {
      workCount: 120,
      sha256: "A".repeat(64),
    },
    implementation: {
      serviceSha256: "B".repeat(64),
      schemaSha256: "C".repeat(64),
    },
    sample: {
      workId: "work-a",
      beforeCount: 120,
      afterCount: 119,
    },
    checks: {
      remoteManifestAccepted: "passed",
      requestContainsVersionsOnly: "passed",
      cacheWritten: "passed",
      offlineCacheRetained: "passed",
      lowerRevisionRejected: "passed",
      sameRevisionConflictRejected: "passed",
      withdrawnWorkExcluded: "passed",
      currentWorkShowsCorrection: "passed",
    },
    limitations: {
      signedManifestVerified: false,
      productionGatewayTested: false,
      liveClientDrill: false,
      namedOperatorSignoff: false,
    },
    result: "automated-passed",
  };
}

test("自动撤回演练必须绑定当前目录、实现和完整检查", () => {
  assert.equal(
    assertContentWithdrawalDrillReport(
      validReport(),
      CONTEXT,
    ),
    true,
  );
});

test("自动演练不能冒充生产网关或具名人工演练", () => {
  for (const field of [
    "productionGatewayTested",
    "liveClientDrill",
    "namedOperatorSignoff",
    "signedManifestVerified",
  ]) {
    const report = validReport();
    report.limitations[field] = true;
    assert.throws(() =>
      assertContentWithdrawalDrillReport(report, CONTEXT),
    );
  }
});

test("旧目录、缺少缓存防回退或错误候选数量都会被拒绝", () => {
  const oldCatalog = validReport();
  oldCatalog.catalog.sha256 = "D".repeat(64);
  assert.throws(() =>
    assertContentWithdrawalDrillReport(oldCatalog, CONTEXT),
  );

  const missingCheck = validReport();
  missingCheck.checks.lowerRevisionRejected = "failed";
  assert.throws(() =>
    assertContentWithdrawalDrillReport(missingCheck, CONTEXT),
  );

  const wrongCount = validReport();
  wrongCount.sample.afterCount = 120;
  assert.throws(() =>
    assertContentWithdrawalDrillReport(wrongCount, CONTEXT),
  );
});
