import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const CODE_SIGNING_PLAN =
  "review/windows-code-signing-plan.json";
export const CODE_SIGNING_PLAN_SCHEMA = "1.0";

export const CODE_SIGNING_SCENARIOS = [
  {
    id: "SIG-01",
    name: "三项发布物签名有效",
    expected:
      "portable、NSIS、MSI 均由批准主体签名，Get-AuthenticodeSignature 返回 Valid。",
  },
  {
    id: "SIG-02",
    name: "可信时间戳完整",
    expected:
      "三项发布物均有批准的时间戳链，签名时间在证书有效期内。",
  },
  {
    id: "SIG-03",
    name: "错误签名主体或指纹",
    expected:
      "签名虽为 Valid 但不在允许列表时 production 门禁拒绝。",
  },
  {
    id: "SIG-04",
    name: "签名后字节被修改",
    expected:
      "Authenticode 或哈希校验失败，阻止上传和安装。",
  },
  {
    id: "SIG-05",
    name: "一项发布物未签名",
    expected:
      "任一 portable、NSIS、MSI 为 NotSigned 时整体 production 门禁失败。",
  },
  {
    id: "SIG-06",
    name: "过期、吊销或链不受信",
    expected:
      "签名状态、证书链或吊销检查异常时停止发布并升级到安全负责人。",
  },
  {
    id: "SIG-07",
    name: "签名后清单生成顺序",
    expected:
      "只对最终签名字节计算尺寸和 SHA-256，production 清单与实际文件完全一致。",
  },
  {
    id: "SIG-08",
    name: "密钥不可导出与最小权限",
    expected:
      "构建任务只能请求签名，不能读取或导出私钥；普通开发机和工作台没有密钥。",
  },
  {
    id: "SIG-09",
    name: "证书续期与允许列表切换",
    expected:
      "旧证书仍有效期间先批准新证书并完成双指纹过渡，不接受未知主体。",
  },
  {
    id: "SIG-10",
    name: "签名服务不可用",
    expected:
      "构建可失败但不能退化为未签名公开包；保留内部 trial 与 production 渠道隔离。",
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

export function buildCodeSigningPlan(inputs, generatedAt) {
  return {
    schemaVersion: CODE_SIGNING_PLAN_SCHEMA,
    planVersion: "1.0",
    product: "WeatherPoem",
    appVersion: inputs.appVersion,
    generatedAt,
    status: "acquisition-and-signing-plan-ready-not-approved",
    inputs: inputs.hashes,
    baseline: {
      releaseChannel: inputs.releaseChannel,
      releaseTrustLevel: inputs.releaseTrustLevel,
      artifacts: inputs.artifacts,
      allNotSigned: inputs.allNotSigned,
      signingConfigPresent: inputs.signingConfigPresent,
      productionDownloadUrlsPresent:
        inputs.productionDownloadUrlsPresent,
    },
    organizationDecisions: {
      legalPublisherName: null,
      certificateOrSigningService: null,
      certificateType: null,
      signerSubjectAllowlist: [],
      signerThumbprintAllowlist: [],
      timestampAuthority: null,
      rfc3161TimestampRequired: true,
      keyCustodyOwner: null,
      releaseRunnerOwner: null,
      securityReviewer: null,
      renewalLeadDays: null,
      revocationAuthority: null,
      budgetApproved: false,
    },
    keyAndRunnerControls: {
      privateKeyInRepositoryAllowed: false,
      privateKeyInClientAllowed: false,
      privateKeyInWorkbenchAllowed: false,
      privateKeyExportAllowed: false,
      ordinaryDeveloperCanSignProduction: false,
      approvedRunnerRequired: true,
      multiPartyReleaseApprovalRequired: true,
      signingAuditLogRequired: true,
      secretRedactionRequired: true,
    },
    proposedTauriConfiguration: {
      method: null,
      certificateThumbprint: null,
      timestampUrl: null,
      tsp: true,
      signCommand: null,
      note:
        "只有选定组织签名能力后才写入真实非秘密配置；密钥材料永不写入 tauri.conf.json。",
    },
    releaseSequence: [
      {
        order: 1,
        action:
          "在受控 Windows 发布机从批准源码、锁文件和版本构建未签名暂存物。",
      },
      {
        order: 2,
        action:
          "对主 EXE 及最终 portable、NSIS、MSI 执行组织签名和可信时间戳。",
      },
      {
        order: 3,
        action:
          "用 Windows 原生工具复核状态、主体、指纹、证书有效期和时间戳。",
      },
      {
        order: 4,
        action:
          "对最终签名字节计算尺寸与 SHA-256，生成 production 清单。",
      },
      {
        order: 5,
        action:
          "运行 release:verify:production，任何一项失败都不得上传。",
      },
      {
        order: 6,
        action:
          "进入公开分发演练，从独立 HTTPS 地址重下并再次验证。",
      },
    ],
    testMatrix: CODE_SIGNING_SCENARIOS.map((scenario) => ({
      ...scenario,
      executor: null,
      executedAt: null,
      result: null,
      evidence: [],
    })),
    procurementChecklist: [
      {
        id: "publisher-identity",
        ownerRole: "项目发起人",
        completed: false,
      },
      {
        id: "certificate-or-service-selection",
        ownerRole: "组织发布负责人",
        completed: false,
      },
      {
        id: "budget-and-contract",
        ownerRole: "预算与法务负责人",
        completed: false,
      },
      {
        id: "key-custody-and-recovery",
        ownerRole: "安全负责人",
        completed: false,
      },
      {
        id: "runner-and-audit-log",
        ownerRole: "发布工程负责人",
        completed: false,
      },
      {
        id: "renewal-and-revocation-runbook",
        ownerRole: "安全与运维负责人",
        completed: false,
      },
    ],
    approval: {
      projectSponsor: null,
      releaseOwner: null,
      securityOwner: null,
      legalReviewer: null,
      decision: null,
      approvedAt: null,
      evidencePath:
        "review/evidence/RQT-19-code-signing-approval.json",
    },
    limitations: {
      publisherIdentityApproved: false,
      certificateAcquired: false,
      signingRunnerConfigured: false,
      artifactsSigned: false,
      timestampVerified: false,
      scenariosExecuted: false,
      namedApprovalCompleted: false,
    },
    gateSatisfied: false,
    result:
      "signing-plan-complete-production-signing-not-performed",
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[A-F0-9]{64}$/.test(value);
}

export function validateCodeSigningPlan(plan, inputs) {
  assert(
    plan.schemaVersion === CODE_SIGNING_PLAN_SCHEMA &&
      plan.planVersion === "1.0" &&
      plan.product === "WeatherPoem" &&
      plan.appVersion === inputs.appVersion &&
      plan.status ===
        "acquisition-and-signing-plan-ready-not-approved",
    "Windows 代码签名计划身份或状态无效",
  );
  const generatedAt = Date.parse(plan.generatedAt);
  assert(
    Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 10 * 60 * 1000 &&
      generatedAt >= Date.now() - 31 * 24 * 60 * 60 * 1000,
    "Windows 代码签名计划时间无效或已过期",
  );
  for (const [key, expected] of Object.entries(inputs.hashes)) {
    const actual = plan.inputs[key];
    assert(
      actual?.path === expected.path &&
        actual.sha256 === expected.sha256 &&
        isSha256(actual.sha256),
      `代码签名计划未绑定当前输入：${key}`,
    );
  }
  assert(
    plan.baseline.releaseChannel === "trial" &&
      plan.baseline.releaseTrustLevel === "unsigned-trial" &&
      JSON.stringify(plan.baseline.artifacts) ===
        JSON.stringify(inputs.artifacts) &&
      plan.baseline.allNotSigned === true &&
      plan.baseline.signingConfigPresent === false &&
      plan.baseline.productionDownloadUrlsPresent === false,
    "代码签名计划掩盖了当前未签名基线",
  );
  assert(
    plan.organizationDecisions.legalPublisherName === null &&
      plan.organizationDecisions
        .certificateOrSigningService === null &&
      plan.organizationDecisions.certificateType === null &&
      plan.organizationDecisions.signerSubjectAllowlist.length ===
        0 &&
      plan.organizationDecisions.signerThumbprintAllowlist
        .length === 0 &&
      plan.organizationDecisions.timestampAuthority === null &&
      plan.organizationDecisions.budgetApproved === false,
    "代码签名计划不得虚构发布主体、证书、时间戳或预算",
  );
  assert(
    plan.keyAndRunnerControls.privateKeyInRepositoryAllowed ===
        false &&
      plan.keyAndRunnerControls.privateKeyInClientAllowed === false &&
      plan.keyAndRunnerControls.privateKeyInWorkbenchAllowed ===
        false &&
      plan.keyAndRunnerControls.privateKeyExportAllowed === false &&
      plan.keyAndRunnerControls.ordinaryDeveloperCanSignProduction ===
        false &&
      plan.keyAndRunnerControls.approvedRunnerRequired === true,
    "代码签名密钥或发布机边界不安全",
  );
  assert(
    plan.proposedTauriConfiguration.method === null &&
      plan.proposedTauriConfiguration.certificateThumbprint ===
        null &&
      plan.proposedTauriConfiguration.timestampUrl === null &&
      plan.proposedTauriConfiguration.tsp === true &&
      plan.proposedTauriConfiguration.signCommand === null,
    "尚未选型时不得写入虚构签名配置",
  );
  assert(
    plan.releaseSequence.length === 6 &&
      plan.releaseSequence.every(
        (item, index) => item.order === index + 1,
      ),
    "代码签名发布顺序不完整",
  );
  assert(
    JSON.stringify(
      plan.testMatrix.map(({ id, name, expected }) => ({
        id,
        name,
        expected,
      })),
    ) === JSON.stringify(CODE_SIGNING_SCENARIOS) &&
      plan.testMatrix.every(
        (item) =>
          item.executor === null &&
          item.executedAt === null &&
          item.result === null &&
          item.evidence.length === 0,
      ),
    "代码签名场景被删减或冒充已执行",
  );
  assert(
    plan.procurementChecklist.length === 6 &&
      plan.procurementChecklist.every(
        (item) => item.completed === false,
      ) &&
      Object.entries(plan.approval)
        .filter(([key]) => key !== "evidencePath")
        .every(([, value]) => value === null) &&
      plan.approval.evidencePath ===
        "review/evidence/RQT-19-code-signing-approval.json",
    "代码签名采购或具名批准不得由自动计划伪造",
  );
  assert(
    Object.values(plan.limitations).every(
      (value) => value === false,
    ) &&
      plan.gateSatisfied === false &&
      plan.result ===
        "signing-plan-complete-production-signing-not-performed",
    "计划不得冒充签名、时间戳或 RQT-19 已通过",
  );
  return {
    artifactCount: plan.baseline.artifacts.length,
    scenarioCount: plan.testMatrix.length,
    procurementItemCount: plan.procurementChecklist.length,
  };
}
