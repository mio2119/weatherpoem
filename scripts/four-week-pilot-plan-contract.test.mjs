import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFourWeekPilotPlan,
  validateFourWeekPilotPlan,
} from "./four-week-pilot-plan-support.mjs";

const sha = "A".repeat(64);
const inputs = {
  appVersion: "0.2.0",
  contentVersion: "2026.07.1",
  ruleVersion: "rules-2026.07-v1",
  portableSha256: sha,
  campusPilotStatus: "not-ready",
  passedGateCount: 7,
  requiredGateCount: 18,
  blockingGateIds: ["RQT-08", "RQT-09"],
  hashes: Object.fromEntries(
    [
      "packageJson",
      "contentCatalog",
      "readiness",
      "pilotPlan",
      "pilotImplementation",
      "scopeFreeze",
      "releaseManifest",
    ].map((key) => [
      key,
      {
        path: `${key}.fixture`,
        sha256: sha,
      },
    ]),
  ),
};

test("执行包保留九项指标、入口阻断与未招募边界", () => {
  const plan = buildFourWeekPilotPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  const result = validateFourWeekPilotPlan(plan, inputs);
  assert.equal(result.metricCount, 9);
  assert.equal(result.blockingGateCount, 2);
  assert.equal(plan.gateSatisfied, false);
});

test("改变成功阈值或掩盖崩溃会话缺口会被拒绝", () => {
  const plan = buildFourWeekPilotPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  plan.successMetrics.find(
    (item) => item.id === "MET-01",
  ).threshold = 90;
  plan.knownMeasurementGap.resolved = true;
  assert.throws(
    () => validateFourWeekPilotPlan(plan, inputs),
    /指标|缺口/,
  );
});

test("自动执行包不能虚构参与者、日期或 Go/No-Go", () => {
  const plan = buildFourWeekPilotPlan(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  plan.cohort.actualParticipantCount = 30;
  plan.cohort.recruitmentStarted = true;
  plan.execution.pilotOwner = "虚构负责人";
  plan.limitations.fourWeeksCompleted = true;
  plan.gateSatisfied = true;
  assert.throws(
    () => validateFourWeekPilotPlan(plan, inputs),
    /未招募状态/,
  );
});
