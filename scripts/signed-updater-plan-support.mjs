import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const SIGNED_UPDATER_PLAN =
  "review/signed-updater-plan.json";
export const SIGNED_UPDATER_PLAN_SCHEMA = "1.0";

export const UPDATER_TEST_SCENARIOS = [
  {
    id: "UPD-01",
    name: "当前已是最新版",
    expected:
      "端点返回无更新语义，客户端不下载、不重启且不改变用户数据。",
  },
  {
    id: "UPD-02",
    name: "有效签名的升级",
    expected:
      "Windows x86_64 正确下载、验签、安装更高版本并保留设置、收藏和反馈。",
  },
  {
    id: "UPD-03",
    name: "更新包字节损坏",
    expected:
      "签名校验失败，拒绝安装，当前版本继续可用。",
  },
  {
    id: "UPD-04",
    name: "签名字段被篡改",
    expected:
      "签名校验失败，拒绝安装且记录脱敏错误。",
  },
  {
    id: "UPD-05",
    name: "错误私钥签名",
    expected:
      "固化公钥无法验证，拒绝安装。",
  },
  {
    id: "UPD-06",
    name: "离线、超时和 TLS 失败",
    expected:
      "不破坏启动与本地诗笺；可稍后重试，不进入循环提示。",
  },
  {
    id: "UPD-07",
    name: "主端点非 2XX 后备用端点",
    expected:
      "只按官方端点回退语义尝试备用 HTTPS 地址，并记录实际命中端点。",
  },
  {
    id: "UPD-08",
    name: "降级版本元数据",
    expected:
      "默认拒绝低于当前版本的更新，不以降级覆盖用户安装。",
  },
  {
    id: "UPD-09",
    name: "前向修复回滚",
    expected:
      "用更高补丁版本恢复已知稳定行为，不伪造版本号执行静默降级。",
  },
  {
    id: "UPD-10",
    name: "元数据平台或架构不匹配",
    expected:
      "Windows x86_64 客户端不下载其他平台/架构产物。",
  },
  {
    id: "UPD-11",
    name: "安装权限与被占用文件",
    expected:
      "passive 模式给出可理解进度；权限不足或文件占用时安全失败并保留旧版。",
  },
  {
    id: "UPD-12",
    name: "公钥轮换桥接版本",
    expected:
      "先由旧私钥签署嵌入新公钥的桥接版本；未安装桥接版本的客户端仍有明确支持策略。",
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

export function buildSignedUpdaterPlan(inputs, generatedAt) {
  return {
    schemaVersion: SIGNED_UPDATER_PLAN_SCHEMA,
    planVersion: "1.0",
    product: "WeatherPoem",
    appVersion: inputs.appVersion,
    generatedAt,
    status: "implementation-plan-ready-not-enabled",
    inputs: inputs.hashes,
    baseline: {
      releaseChannel: inputs.releaseChannel,
      releaseTrustLevel: inputs.releaseTrustLevel,
      portableSha256: inputs.portableSha256,
      updaterCargoDependencyPresent:
        inputs.updaterCargoDependencyPresent,
      updaterPluginInitialized: inputs.updaterPluginInitialized,
      updaterConfigPresent: inputs.updaterConfigPresent,
      updaterArtifactsEnabled: inputs.updaterArtifactsEnabled,
      endpointConfigured: inputs.endpointConfigured,
      publicKeyConfigured: inputs.publicKeyConfigured,
    },
    officialConstraints: {
      createUpdaterArtifacts: true,
      v1CompatibilityRequired: false,
      publicKeyMustBeLiteralNotPath: true,
      productionEndpointsRequireTls: true,
      insecureTransportAllowed: false,
      supportedEndpointVariables: [
        "{{current_version}}",
        "{{target}}",
        "{{arch}}",
      ],
      windowsInstallMode: "passive",
      privateKeyEnvironmentVariables: [
        "TAURI_SIGNING_PRIVATE_KEY",
        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
      ],
      sources: {
        updater:
          "https://v2.tauri.app/plugin/updater/",
        cli: "https://v2.tauri.app/reference/cli/#signer",
        windowsCodeSigning:
          "https://v2.tauri.app/distribute/sign/windows/",
      },
    },
    proposedConfiguration: {
      cargoDependency: "tauri-plugin-updater@2",
      frontendDependency: "@tauri-apps/plugin-updater@2",
      createUpdaterArtifacts: true,
      publicKey: null,
      endpoints: [],
      dangerousInsecureTransportProtocol: false,
      windowsInstallMode: "passive",
      endpointHostAllowlist: [],
      clientCheckPolicy:
        "manual-settings-check-plus-low-frequency-background-check",
      automaticInstallWithoutUserConsent: false,
    },
    keyManagement: {
      generator: "tauri-cli-signer",
      publicKeyLocation: "src-tauri/tauri.conf.json",
      privateKeyRepositoryAllowed: false,
      privateKeyClientAllowed: false,
      privateKeyStorageDecision: null,
      keyCustodian: null,
      recoveryCustodian: null,
      signingRunnerDecision: null,
      rotationStrategy:
        "old-key-signed-bridge-release-embeds-new-public-key",
      revocationAndCompromiseRunbookApproved: false,
    },
    endpointContract: {
      baseUrl: null,
      transport: "https-only",
      allowedVariables: [
        "{{current_version}}",
        "{{target}}",
        "{{arch}}",
      ],
      responseFields: [
        "version",
        "notes",
        "pub_date",
        "platforms.<target-arch>.signature",
        "platforms.<target-arch>.url",
      ],
      artifactUrlRequiresHttps: true,
      artifactHashPublishedSeparately: true,
      downgradeAllowed: false,
      stagedRolloutPolicy: null,
      availabilityOwner: null,
    },
    releasePipeline: [
      {
        order: 1,
        action:
          "在受控 Windows 发布机从已复核源码和锁文件构建。",
      },
      {
        order: 2,
        action:
          "由机密存储注入 updater 私钥环境变量；日志和构建产物不得包含私钥。",
      },
      {
        order: 3,
        action:
          "生成 createUpdaterArtifacts=true 的更新产物与 .sig，并验证固化公钥。",
      },
      {
        order: 4,
        action:
          "对 Windows 可执行文件和安装包完成独立 Authenticode 与可信时间戳签名。",
      },
      {
        order: 5,
        action:
          "生成 production 清单、哈希和更新元数据，在上传前运行全部正反场景。",
      },
      {
        order: 6,
        action:
          "先上传不可变版本化产物，再原子切换更新元数据；保留前一稳定版用于前向修复。",
      },
      {
        order: 7,
        action:
          "从公开 HTTPS 地址重下并复验 updater 签名、Authenticode、哈希与安装。",
      },
    ],
    testMatrix: UPDATER_TEST_SCENARIOS.map((scenario) => ({
      ...scenario,
      executor: null,
      executedAt: null,
      result: null,
      evidence: [],
    })),
    requiredDecisions: [
      {
        id: "updater-key-custody",
        ownerRole: "组织发布负责人",
        decision: null,
      },
      {
        id: "updater-endpoint-and-hostname",
        ownerRole: "发布与后端负责人",
        decision: null,
      },
      {
        id: "updater-rollout-and-forward-rollback",
        ownerRole: "产品与发布负责人",
        decision: null,
      },
      {
        id: "updater-incident-and-key-compromise",
        ownerRole: "安全负责人",
        decision: null,
      },
    ],
    approval: {
      releaseOwner: null,
      backendOwner: null,
      securityOwner: null,
      decision: null,
      approvedAt: null,
      evidencePath:
        "review/evidence/RQT-20-signed-updater.json",
    },
    limitations: {
      pluginIntegrated: false,
      keysGenerated: false,
      endpointDeployed: false,
      signedArtifactsGenerated: false,
      scenariosExecuted: false,
      namedApprovalCompleted: false,
    },
    gateSatisfied: false,
    result:
      "implementation-plan-complete-signed-updater-not-implemented",
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[A-F0-9]{64}$/.test(value);
}

export function validateSignedUpdaterPlan(plan, inputs) {
  assert(
    plan.schemaVersion === SIGNED_UPDATER_PLAN_SCHEMA &&
      plan.planVersion === "1.0" &&
      plan.product === "WeatherPoem" &&
      plan.appVersion === inputs.appVersion &&
      plan.status === "implementation-plan-ready-not-enabled",
    "签名更新计划身份或状态无效",
  );
  const generatedAt = Date.parse(plan.generatedAt);
  assert(
    Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 10 * 60 * 1000 &&
      generatedAt >= Date.now() - 31 * 24 * 60 * 60 * 1000,
    "签名更新计划时间无效或已过期",
  );
  for (const [key, expected] of Object.entries(inputs.hashes)) {
    const actual = plan.inputs[key];
    assert(
      actual?.path === expected.path &&
        actual.sha256 === expected.sha256 &&
        isSha256(actual.sha256),
      `签名更新计划未绑定当前输入：${key}`,
    );
  }
  assert(
    plan.baseline.releaseChannel === "trial" &&
      plan.baseline.releaseTrustLevel === "unsigned-trial" &&
      plan.baseline.portableSha256 === inputs.portableSha256 &&
      isSha256(plan.baseline.portableSha256) &&
      [
        "updaterCargoDependencyPresent",
        "updaterPluginInitialized",
        "updaterConfigPresent",
        "updaterArtifactsEnabled",
        "endpointConfigured",
        "publicKeyConfigured",
      ].every(
        (key) =>
          plan.baseline[key] === inputs[key] &&
          plan.baseline[key] === false,
      ),
    "计划没有如实记录当前 updater 尚未集成的基线",
  );
  assert(
    plan.officialConstraints.createUpdaterArtifacts === true &&
      plan.officialConstraints.v1CompatibilityRequired === false &&
      plan.officialConstraints.publicKeyMustBeLiteralNotPath ===
        true &&
      plan.officialConstraints.productionEndpointsRequireTls ===
        true &&
      plan.officialConstraints.insecureTransportAllowed === false &&
      plan.officialConstraints.windowsInstallMode === "passive" &&
      Object.values(plan.officialConstraints.sources).every(
        (source) =>
          typeof source === "string" &&
          source.startsWith("https://v2.tauri.app/"),
      ),
    "计划与当前 Tauri v2 官方更新约束不一致",
  );
  assert(
    plan.proposedConfiguration.createUpdaterArtifacts === true &&
      plan.proposedConfiguration.publicKey === null &&
      plan.proposedConfiguration.endpoints.length === 0 &&
      plan.proposedConfiguration
        .dangerousInsecureTransportProtocol === false &&
      plan.proposedConfiguration.windowsInstallMode === "passive" &&
      plan.proposedConfiguration
        .automaticInstallWithoutUserConsent === false,
    "计划不得虚构公钥、端点或静默安装授权",
  );
  assert(
    plan.keyManagement.privateKeyRepositoryAllowed === false &&
      plan.keyManagement.privateKeyClientAllowed === false &&
      plan.keyManagement.privateKeyStorageDecision === null &&
      plan.keyManagement.keyCustodian === null &&
      plan.keyManagement.recoveryCustodian === null &&
      plan.keyManagement.rotationStrategy ===
        "old-key-signed-bridge-release-embeds-new-public-key",
    "更新私钥边界或轮换策略不安全",
  );
  assert(
    plan.endpointContract.baseUrl === null &&
      plan.endpointContract.transport === "https-only" &&
      plan.endpointContract.downgradeAllowed === false &&
      plan.endpointContract.availabilityOwner === null,
    "更新端点或降级策略被未经授权地启用",
  );
  assert(
    plan.releasePipeline.length === 7 &&
      plan.releasePipeline.every(
        (item, index) => item.order === index + 1,
      ),
    "更新发布流水线不完整或顺序无效",
  );
  assert(
    JSON.stringify(
      plan.testMatrix.map(({ id, name, expected }) => ({
        id,
        name,
        expected,
      })),
    ) === JSON.stringify(UPDATER_TEST_SCENARIOS) &&
      plan.testMatrix.every(
        (item) =>
          item.executor === null &&
          item.executedAt === null &&
          item.result === null &&
          Array.isArray(item.evidence) &&
          item.evidence.length === 0,
      ),
    "更新正反场景矩阵被删减或冒充已执行",
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
        "review/evidence/RQT-20-signed-updater.json",
    "自动计划不得虚构组织决策或具名批准",
  );
  assert(
    Object.values(plan.limitations).every(
      (value) => value === false,
    ) &&
      plan.gateSatisfied === false &&
      plan.result ===
        "implementation-plan-complete-signed-updater-not-implemented",
    "计划不得冒充 updater 已实现或 RQT-20 已通过",
  );
  return {
    scenarioCount: plan.testMatrix.length,
    decisionCount: plan.requiredDecisions.length,
  };
}
