import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildProjectReadiness,
  validateTraceability,
} from "./project-readiness-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readJson = async (relativePath) =>
  JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
const plan = await readJson("review/requirements-traceability.json");
const packageJson = await readJson("package.json");
const contentCatalog = await readJson(
  "review/content-review-catalog.json",
);
const deviceMatrix = await readJson("review/device-matrix-plan.json");
const releaseManifest = await readJson(
  `output/WeatherPoem_${packageJson.version}_RELEASE.json`,
);
const context = {
  packageVersion: packageJson.version,
  contentCatalog,
  deviceMatrix,
  releaseManifest,
  signoffs: new Map(),
};
const referencedPaths = new Set();
for (const gate of plan.gates) {
  gate.evidence.forEach((value) => referencedPaths.add(value));
  gate.requirementRefs.forEach((value) =>
    referencedPaths.add(value.split("#", 1)[0]),
  );
}
const availablePaths = new Set();
await Promise.all(
  [...referencedPaths].map(async (relativePath) => {
    try {
      if (
        (
          await stat(path.join(projectRoot, relativePath))
        ).isFile()
      ) {
        availablePaths.add(relativePath);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("当前报告只能声明内部试用就绪，试点和公开发布保持未就绪", () => {
  const report = buildProjectReadiness(
    plan,
    context,
    availablePaths,
  );
  assert.equal(report.overallStatus, "internal-trial-ready-only");
  assert.equal(
    report.milestones.find((item) => item.id === "internal-trial")
      .status,
    "ready",
  );
  assert.equal(
    report.milestones.find((item) => item.id === "campus-pilot")
      .status,
    "not-ready",
  );
  assert.equal(
    report.milestones.find((item) => item.id === "public-release")
      .status,
    "not-ready",
  );
  assert.equal(report.observations.content.workCount, 120);
  assert.equal(report.observations.deviceMatrix.passedCaseCount, 0);
  assert.equal(
    report.observations.manualWindowsEvidence
      .msiElevatedLifecycle,
    false,
  );
});

test("人工门禁不能在证据文件缺失时冒充通过", () => {
  const changed = clone(plan);
  const gate = changed.gates.find((item) => item.id === "RQT-11");
  gate.currentStatus = "passed";
  gate.issue = "";
  gate.nextAction = "";
  assert.throws(
    () => validateTraceability(changed, context, availablePaths),
    /标记 passed，但证据缺失/,
  );
});

test("设备矩阵未全通过时不能把兼容性门禁改为通过", () => {
  const changed = clone(plan);
  const gate = changed.gates.find((item) => item.id === "RQT-10");
  gate.currentStatus = "passed";
  gate.issue = "";
  gate.nextAction = "";
  assert.throws(
    () => validateTraceability(changed, context, availablePaths),
    /真实设备矩阵未全通过/,
  );
});

test("未签名试用清单不能冒充正式签名发布", () => {
  const changed = clone(plan);
  const gate = changed.gates.find((item) => item.id === "RQT-19");
  gate.currentStatus = "passed";
  gate.issue = "";
  gate.nextAction = "";
  const pretendEvidence = new Set([
    ...availablePaths,
    "review/evidence/RQT-19-code-signing-approval.json",
  ]);
  const changedContext = {
    ...context,
    signoffs: new Map([
      [
        "review/evidence/RQT-19-code-signing-approval.json",
        {
          schemaVersion: "1.0",
          gateId: "RQT-19",
          result: "passed",
          appVersion: "0.2.0",
          contentVersion: "2026.07.1",
          executedAt: "2026-07-23T16:00:00.000Z",
          executors: [
            { name: "发布测试员", role: "组织发布负责人" },
          ],
          evidenceItems: [
            {
              description: "受控发布系统中的签名任务与验证摘要",
              locator: "https://evidence.example/release/0.2.0",
              checkedAt: "2026-07-23T16:00:00.000Z",
            },
          ],
          approval: {
            name: "安全批准人",
            role: "组织安全负责人",
            approvedAt: "2026-07-23T17:00:00.000Z",
          },
          limitations: [],
        },
      ],
    ]),
  };
  assert.throws(
    () =>
      validateTraceability(
        changed,
        changedContext,
        pretendEvidence,
      ),
    /未签名或无时间戳试用包/,
  );
});

test("公开发布里程碑不能遗漏任何追踪门禁", () => {
  const changed = clone(plan);
  changed.milestones
    .find((item) => item.id === "public-release")
    .requiredGateIds.pop();
  assert.throws(
    () => validateTraceability(changed, context, availablePaths),
    /必须包含追踪表中的全部门禁/,
  );
});

test("外部通过项拒绝匿名、占位或无定位的签署文件", () => {
  const changed = clone(plan);
  const gate = changed.gates.find((item) => item.id === "RQT-09");
  gate.currentStatus = "passed";
  gate.issue = "";
  gate.nextAction = "";
  const evidencePath = "review/evidence/RQT-09-warning-production.json";
  const changedPaths = new Set([...availablePaths, evidencePath]);
  const changedContext = {
    ...context,
    signoffs: new Map([
      [
        evidencePath,
        {
          schemaVersion: "1.0",
          gateId: "RQT-09",
          result: "passed",
          appVersion: "0.2.0",
          contentVersion: "2026.07.1",
          executedAt: "2026-07-23T16:00:00.000Z",
          executors: [{ name: "TBD", role: "负责人" }],
          evidenceItems: [],
          approval: {
            name: "待定",
            role: "批准人",
            approvedAt: "2026-07-23T17:00:00.000Z",
          },
          limitations: [],
        },
      ],
    ]),
  };
  assert.throws(
    () =>
      validateTraceability(
        changed,
        changedContext,
        changedPaths,
      ),
    /执行人无效/,
  );
});

test("RQT-23 registers installed NOTICE evidence without claiming legal approval", () => {
  const gate = plan.gates.find((item) => item.id === "RQT-23");
  assert.ok(
    gate.evidence.includes(
      "review/canonical-license-text-policy.json",
    ),
  );
  assert.ok(
    gate.evidence.includes(
      "review/canonical-license-text-supplements.json",
    ),
  );
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
  assert.match(
    gate.issue,
    /上游.*259\/268.*284\/286/,
  );
  assert.match(
    gate.issue,
    /分发.*268\/268.*286\/286/,
  );
  assert.doesNotMatch(
    gate.nextAction,
    /补齐或由法务具名处置剩余 11 个包的许可文本缺口/,
  );
  assert.equal(gate.currentStatus, "partial");
});

test("RQT-13 records the completed eight-hour gate without claiming the full performance gate", () => {
  const gate = plan.gates.find((item) => item.id === "RQT-13");
  assert.match(gate.issue, /八小时.*正式门禁.*通过/);
  assert.doesNotMatch(
    `${gate.issue}\n${gate.nextAction}`,
    /监控正式八小时采样|运行中不能记为通过/,
  );
  assert.match(gate.nextAction, /七天.*休眠唤醒/);
  assert.equal(gate.currentStatus, "partial");
});

test("RQT-23 distinguishes verified NSIS NOTICE bytes from the pending elevated MSI gate", () => {
  const gate = plan.gates.find((item) => item.id === "RQT-23");
  assert.match(gate.issue, /NSIS.*NOTICE.*逐字节.*通过/);
  assert.match(gate.issue, /MSI.*管理员.*待完成/);
  assert.doesNotMatch(
    `${gate.issue}\n${gate.nextAction}`,
    /当前长测候选尚未重建|聚合证据文件尚未生成|八小时长测完成并通过正式判定后重建候选/,
  );
  assert.match(gate.nextAction, /管理员 MSI.*真实安装/);
  assert.equal(gate.currentStatus, "partial");
});
