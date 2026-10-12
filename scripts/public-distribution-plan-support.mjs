import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const PUBLIC_DISTRIBUTION_PLAN =
  "review/public-distribution-rehearsal-plan.json";
export const PUBLIC_DISTRIBUTION_PLAN_SCHEMA = "1.0";

export const DISTRIBUTION_SCENARIOS = [
  {
    id: "DST-01",
    name: "三项正式发布物公开重下",
    expected:
      "独立 Windows 设备从版本化 HTTPS 地址下载 portable、NSIS、MSI，尺寸与 SHA-256 均匹配 production 清单。",
  },
  {
    id: "DST-02",
    name: "哈希不一致",
    expected:
      "任何字节差异都阻止安装和继续发布，进入 P0/P1 处置。",
  },
  {
    id: "DST-03",
    name: "签名、时间戳或证书不受信",
    expected:
      "Authenticode 非 Valid、缺少可信时间戳或证书不在允许列表时拒绝公开。",
  },
  {
    id: "DST-04",
    name: "错误主机、重定向或 TLS 失败",
    expected:
      "最终下载主机必须属于批准清单且 TLS 有效；意外跨域重定向被拒绝。",
  },
  {
    id: "DST-05",
    name: "部分上传或缓存旧清单",
    expected:
      "先上传不可变产物、后原子发布清单；缺失产物或清单/产物版本不一致时不切换 latest。",
  },
  {
    id: "DST-06",
    name: "错误内容在线撤回",
    expected:
      "指定 workId 在线停用，候选排除、当日推荐校正和客户端证据完整。",
  },
  {
    id: "DST-07",
    name: "错误内容离线撤回",
    expected:
      "缓存清单在有效期内阻止回退；恢复联网后接收更高修订并清除受影响缓存。",
  },
  {
    id: "DST-08",
    name: "二进制紧急撤回",
    expected:
      "停止 latest/更新元数据与公开下载，保留证据和公告；已安装客户端继续使用安全本地能力。",
  },
  {
    id: "DST-09",
    name: "前向修复与恢复发布",
    expected:
      "以更高补丁版本恢复稳定能力，重新签名、上传、重下和验证，不静默降级。",
  },
  {
    id: "DST-10",
    name: "审计与通知闭环",
    expected:
      "上传、切换、撤回、CDN 处理、用户通知、恢复和复盘均有具名时间线与不可变证据定位。",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function sha256File(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex")
    .toUpperCase();
}

export function buildPublicDistributionPlan(inputs, generatedAt) {
  return {
    schemaVersion: PUBLIC_DISTRIBUTION_PLAN_SCHEMA,
    planVersion: "1.0",
    product: "WeatherPoem",
    appVersion: inputs.appVersion,
    generatedAt,
    status: "rehearsal-plan-ready-production-artifacts-missing",
    inputs: inputs.hashes,
    baseline: {
      releaseChannel: inputs.releaseChannel,
      releaseTrustLevel: inputs.releaseTrustLevel,
      artifacts: inputs.artifacts,
      allArtifactsSigned: inputs.allArtifactsSigned,
      allDownloadUrlsConfigured:
        inputs.allDownloadUrlsConfigured,
      contentWithdrawalAutomated:
        inputs.contentWithdrawalAutomated,
    },
    entryCriteria: {
      campusPilotGatePassed: false,
      productionArtifactsSigned: false,
      trustedTimestampsPresent: false,
      signerAllowlistApproved: false,
      immutableHttpsHostApproved: false,
      signedUpdaterGatePassed: false,
      releaseAndIncidentOwnersNamed: false,
    },
    hostingDecision: {
      primaryDownloadHost: null,
      backupDownloadHost: null,
      cdnProvider: null,
      immutableVersionPathPattern: null,
      latestPointerPath: null,
      tlsAndRedirectAllowlist: [],
      retentionPolicy: null,
      cachePurgeOwner: null,
    },
    publicationSequence: [
      {
        order: 1,
        action:
          "在受控发布机生成并复核 production 清单、哈希、签名和时间戳。",
      },
      {
        order: 2,
        action:
          "将三项发布物上传到不可变、版本化的暂存路径，保持 latest 与 updater 元数据不变。",
      },
      {
        order: 3,
        action:
          "从独立 Windows 设备重下暂存产物，复验最终主机、TLS、重定向、尺寸、哈希和 Authenticode。",
      },
      {
        order: 4,
        action:
          "完成 NSIS/MSI 安装、启动、数据保留与 signed updater 联合验证。",
      },
      {
        order: 5,
        action:
          "先原子发布版本清单和校验文件，再切换 latest/更新元数据。",
      },
      {
        order: 6,
        action:
          "记录公开后第二次重下证据、可用性检查和发布公告。",
      },
      {
        order: 7,
        action:
          "演练单首内容在线/离线撤回并验证修订防回退。",
      },
      {
        order: 8,
        action:
          "演练二进制撤回：停止 latest/更新元数据、移除下载入口、处理 CDN 缓存并发布通知。",
      },
      {
        order: 9,
        action:
          "以更高补丁版本执行前向修复，重新完成签名、上传、重下和安装。",
      },
      {
        order: 10,
        action:
          "由发布与事故负责人复核时间线、影响、证据和改进项并签署。",
      },
    ],
    testMatrix: DISTRIBUTION_SCENARIOS.map((scenario) => ({
      ...scenario,
      executor: null,
      executedAt: null,
      result: null,
      evidence: [],
    })),
    evidenceContract: {
      requiredArtifactKinds: ["portable", "nsis", "msi"],
      requiredSignatureStatus: "Valid",
      requireTrustedTimestamp: true,
      requireSignerAllowlist: true,
      requireHttps: true,
      requireFinalHostAllowlist: true,
      requireIndependentRedownload: true,
      requireHashMatch: true,
      requireContentWithdrawalRevisionIncrease: true,
      requireBinaryWithdrawalTimeline: true,
      requireNamedExecutorsAndApprovers: true,
    },
    requiredDecisions: [
      {
        id: "public-hosting-and-cdn",
        ownerRole: "发布与后端负责人",
        decision: null,
      },
      {
        id: "binary-withdrawal-authority",
        ownerRole: "组织发布负责人",
        decision: null,
      },
      {
        id: "content-withdrawal-authority",
        ownerRole: "内容负责人",
        decision: null,
      },
      {
        id: "public-notification-channel",
        ownerRole: "用户沟通负责人",
        decision: null,
      },
    ],
    approval: {
      releaseOwner: null,
      incidentOwner: null,
      securityReviewer: null,
      decision: null,
      approvedAt: null,
      evidencePath:
        "review/evidence/RQT-21-public-distribution-rehearsal.json",
    },
    limitations: {
      publicUploadPerformed: false,
      independentRedownloadPerformed: false,
      productionSignaturesVerified: false,
      binaryWithdrawalPerformed: false,
      recoveryReleasePerformed: false,
      namedApprovalCompleted: false,
    },
    gateSatisfied: false,
    result:
      "rehearsal-plan-complete-public-distribution-not-executed",
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[A-F0-9]{64}$/.test(value);
}

export function validatePublicDistributionPlan(plan, inputs) {
  assert(
    plan.schemaVersion === PUBLIC_DISTRIBUTION_PLAN_SCHEMA &&
      plan.planVersion === "1.0" &&
      plan.product === "WeatherPoem" &&
      plan.appVersion === inputs.appVersion &&
      plan.status ===
        "rehearsal-plan-ready-production-artifacts-missing",
    "公开分发演练计划身份或状态无效",
  );
  const generatedAt = Date.parse(plan.generatedAt);
  assert(
    Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 10 * 60 * 1000 &&
      generatedAt >= Date.now() - 31 * 24 * 60 * 60 * 1000,
    "公开分发演练计划时间无效或已过期",
  );
  for (const [key, expected] of Object.entries(inputs.hashes)) {
    const actual = plan.inputs[key];
    assert(
      actual?.path === expected.path &&
        actual.sha256 === expected.sha256 &&
        isSha256(actual.sha256),
      `公开分发计划未绑定当前输入：${key}`,
    );
  }
  assert(
    plan.baseline.releaseChannel === "trial" &&
      plan.baseline.releaseTrustLevel === "unsigned-trial" &&
      JSON.stringify(plan.baseline.artifacts) ===
        JSON.stringify(inputs.artifacts) &&
      plan.baseline.allArtifactsSigned === false &&
      plan.baseline.allDownloadUrlsConfigured === false &&
      plan.baseline.contentWithdrawalAutomated === true,
    "公开分发计划掩盖了当前未签名、无下载地址的真实基线",
  );
  assert(
    Object.values(plan.entryCriteria).every(
      (value) => value === false,
    ) &&
      plan.hostingDecision.primaryDownloadHost === null &&
      plan.hostingDecision.backupDownloadHost === null &&
      plan.hostingDecision.cdnProvider === null &&
      plan.hostingDecision.tlsAndRedirectAllowlist.length === 0,
    "公开分发计划不得虚构 production 前置条件或托管决策",
  );
  assert(
    plan.publicationSequence.length === 10 &&
      plan.publicationSequence.every(
        (item, index) => item.order === index + 1,
      ),
    "公开分发顺序不完整或无效",
  );
  assert(
    JSON.stringify(
      plan.testMatrix.map(({ id, name, expected }) => ({
        id,
        name,
        expected,
      })),
    ) === JSON.stringify(DISTRIBUTION_SCENARIOS) &&
      plan.testMatrix.every(
        (item) =>
          item.executor === null &&
          item.executedAt === null &&
          item.result === null &&
          item.evidence.length === 0,
      ),
    "公开分发正反场景被删减或冒充已执行",
  );
  assert(
    JSON.stringify(
      plan.evidenceContract.requiredArtifactKinds,
    ) === JSON.stringify(["portable", "nsis", "msi"]) &&
      plan.evidenceContract.requiredSignatureStatus === "Valid" &&
      plan.evidenceContract.requireTrustedTimestamp === true &&
      plan.evidenceContract.requireSignerAllowlist === true &&
      plan.evidenceContract.requireHttps === true &&
      plan.evidenceContract.requireIndependentRedownload === true &&
      plan.evidenceContract.requireHashMatch === true,
    "公开分发证据契约缺少签名、HTTPS、独立重下或哈希门禁",
  );
  assert(
    plan.requiredDecisions.length === 4 &&
      plan.requiredDecisions.every(
        (item) => item.decision === null,
      ) &&
      Object.entries(plan.approval)
        .filter(([key]) => key !== "evidencePath")
        .every(([, value]) => value === null) &&
      plan.approval.evidencePath ===
        "review/evidence/RQT-21-public-distribution-rehearsal.json",
    "自动计划不得虚构公开托管、撤回权限或具名批准",
  );
  assert(
    Object.values(plan.limitations).every(
      (value) => value === false,
    ) &&
      plan.gateSatisfied === false &&
      plan.result ===
        "rehearsal-plan-complete-public-distribution-not-executed",
    "计划不得冒充已经公开上传、撤回或恢复",
  );
  return {
    artifactCount: plan.baseline.artifacts.length,
    scenarioCount: plan.testMatrix.length,
    sequenceStepCount: plan.publicationSequence.length,
  };
}
