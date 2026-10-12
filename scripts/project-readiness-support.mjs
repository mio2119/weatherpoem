const PROOF_TYPES = new Set([
  "automatic",
  "manual",
  "external",
  "hybrid",
  "document",
]);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertRelativeRepositoryPath(value, label) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").includes("..")
  ) {
    throw new Error(`${label} 必须是仓库内的正斜杠相对路径`);
  }
}

function assertGate(gate, allowedStatuses, availablePaths) {
  if (!/^RQT-\d{2}$/.test(gate?.id ?? "")) {
    throw new Error(`无效需求门禁编号：${gate?.id ?? "<missing>"}`);
  }
  if (
    !gate.title ||
    !gate.ownerRole ||
    !gate.exitCriterion ||
    !PROOF_TYPES.has(gate.proofType) ||
    !allowedStatuses.has(gate.currentStatus)
  ) {
    throw new Error(`${gate.id} 缺少标题、责任角色、退出条件或有效状态`);
  }
  if (!gate.requirementRefs?.length) {
    throw new Error(`${gate.id} 必须指向至少一条需求来源`);
  }
  for (const reference of gate.requirementRefs) {
    const sourcePath = String(reference).split("#", 1)[0];
    assertRelativeRepositoryPath(sourcePath, `${gate.id} requirementRef`);
    if (!availablePaths.has(sourcePath)) {
      throw new Error(`${gate.id} 引用的需求来源不存在：${sourcePath}`);
    }
  }
  if (!gate.evidence?.length) {
    throw new Error(`${gate.id} 必须列出预期证据`);
  }
  for (const evidencePath of gate.evidence) {
    assertRelativeRepositoryPath(evidencePath, `${gate.id} evidence`);
  }
  if (!Array.isArray(gate.verificationCommands)) {
    throw new Error(`${gate.id} verificationCommands 必须是数组`);
  }
  if (
    gate.currentStatus === "passed" &&
    ["automatic", "hybrid"].includes(gate.proofType) &&
    gate.verificationCommands.length === 0
  ) {
    throw new Error(`${gate.id} 自动通过项缺少复验命令`);
  }
  if (gate.currentStatus === "passed") {
    if (gate.issue || gate.nextAction) {
      throw new Error(`${gate.id} 已通过项不能同时保留未解决问题`);
    }
    const missing = gate.evidence.filter(
      (evidencePath) => !availablePaths.has(evidencePath),
    );
    if (missing.length) {
      throw new Error(
        `${gate.id} 标记 passed，但证据缺失：${missing.join(", ")}`,
      );
    }
  } else if (!gate.issue || !gate.nextAction) {
    throw new Error(`${gate.id} 未通过项必须说明问题和下一步`);
  }
}

function isPlaceholder(value) {
  return /^(?:todo|tbd|pending|n\/a|name|待定|未填写|暂无)$/i.test(
    String(value ?? "").trim(),
  );
}

function assertIsoTime(value, label) {
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    timestamp > Date.now() + 5 * 60 * 1000
  ) {
    throw new Error(`${label} 必须是有效且不晚于当前时间的 ISO 时间`);
  }
}

function assertEvidenceLocator(locator, label, availablePaths) {
  if (typeof locator !== "string" || !locator.trim()) {
    throw new Error(`${label} 缺少证据定位`);
  }
  if (/^https:\/\//i.test(locator)) {
    const url = new URL(locator);
    if (url.username || url.password) {
      throw new Error(`${label} 的 HTTPS 定位不能包含凭据`);
    }
    return;
  }
  assertRelativeRepositoryPath(locator, label);
  if (!availablePaths.has(locator)) {
    throw new Error(`${label} 指向的仓库证据不存在：${locator}`);
  }
}

function assertNamedSignoff(
  gate,
  plan,
  signoff,
  availablePaths,
) {
  if (
    signoff?.schemaVersion !== "1.0" ||
    signoff?.gateId !== gate.id ||
    signoff?.result !== "passed" ||
    signoff?.appVersion !== plan.appVersion ||
    signoff?.contentVersion !== plan.contentVersion
  ) {
    throw new Error(`${gate.id} 的具名证据未绑定当前门禁或版本`);
  }
  assertIsoTime(signoff.executedAt, `${gate.id} executedAt`);
  if (!Array.isArray(signoff.executors) || !signoff.executors.length) {
    throw new Error(`${gate.id} 的具名证据缺少执行人`);
  }
  for (const [index, executor] of signoff.executors.entries()) {
    if (
      String(executor?.name ?? "").trim().length < 2 ||
      String(executor?.role ?? "").trim().length < 2 ||
      isPlaceholder(executor.name) ||
      isPlaceholder(executor.role)
    ) {
      throw new Error(`${gate.id} 第 ${index + 1} 个执行人无效`);
    }
  }
  if (
    String(signoff?.approval?.name ?? "").trim().length < 2 ||
    String(signoff?.approval?.role ?? "").trim().length < 2 ||
    isPlaceholder(signoff?.approval?.name) ||
    isPlaceholder(signoff?.approval?.role)
  ) {
    throw new Error(`${gate.id} 的具名证据缺少有效批准人`);
  }
  assertIsoTime(
    signoff.approval.approvedAt,
    `${gate.id} approval.approvedAt`,
  );
  if (
    !Array.isArray(signoff.evidenceItems) ||
    !signoff.evidenceItems.length
  ) {
    throw new Error(`${gate.id} 的具名证据缺少证据项目`);
  }
  for (const [index, item] of signoff.evidenceItems.entries()) {
    if (
      String(item?.description ?? "").trim().length < 5 ||
      isPlaceholder(item?.description)
    ) {
      throw new Error(`${gate.id} 第 ${index + 1} 个证据说明无效`);
    }
    assertIsoTime(
      item.checkedAt,
      `${gate.id} evidenceItems[${index}].checkedAt`,
    );
    assertEvidenceLocator(
      item.locator,
      `${gate.id} evidenceItems[${index}].locator`,
      availablePaths,
    );
  }
  if (!Array.isArray(signoff.limitations)) {
    throw new Error(`${gate.id} limitations 必须显式提供数组`);
  }
}

function assertMilestoneHierarchy(plan, gateIds) {
  const milestoneIds = new Set();
  const milestoneMap = new Map();
  for (const milestone of plan.milestones ?? []) {
    if (
      !/^[a-z][a-z0-9-]+$/.test(milestone?.id ?? "") ||
      milestoneIds.has(milestone.id) ||
      !milestone.name ||
      typeof milestone.expectedCurrentReady !== "boolean" ||
      !milestone.requiredGateIds?.length
    ) {
      throw new Error("里程碑编号、名称、预期状态或必需门禁无效");
    }
    milestoneIds.add(milestone.id);
    milestoneMap.set(milestone.id, milestone);
    const localIds = new Set();
    for (const gateId of milestone.requiredGateIds) {
      if (!gateIds.has(gateId) || localIds.has(gateId)) {
        throw new Error(`${milestone.id} 引用了未知或重复门禁 ${gateId}`);
      }
      localIds.add(gateId);
    }
  }
  for (const required of [
    "internal-trial",
    "campus-pilot",
    "public-release",
  ]) {
    if (!milestoneMap.has(required)) {
      throw new Error(`缺少必需里程碑 ${required}`);
    }
  }
  const internal = new Set(
    milestoneMap.get("internal-trial").requiredGateIds,
  );
  const pilot = new Set(
    milestoneMap.get("campus-pilot").requiredGateIds,
  );
  const publicRelease = new Set(
    milestoneMap.get("public-release").requiredGateIds,
  );
  if ([...internal].some((id) => !pilot.has(id))) {
    throw new Error("校园试点门禁必须完整包含内部试用门禁");
  }
  if ([...pilot].some((id) => !publicRelease.has(id))) {
    throw new Error("公开发布门禁必须完整包含校园试点门禁");
  }
  if (
    publicRelease.size !== gateIds.size ||
    [...gateIds].some((id) => !publicRelease.has(id))
  ) {
    throw new Error("公开发布里程碑必须包含追踪表中的全部门禁");
  }
}

function assertDynamicTruth(plan, context, availablePaths) {
  const byId = new Map(plan.gates.map((gate) => [gate.id, gate]));
  if (
    byId.get("RQT-05")?.currentStatus === "passed" &&
    (
      context.contentCatalog.workCount < 120 ||
      context.contentCatalog.contentVersion !== plan.contentVersion
    )
  ) {
    throw new Error("RQT-05 与当前内容数量或版本不一致");
  }
  const release = context.releaseManifest;
  if (
    byId.get("RQT-07")?.currentStatus === "passed" &&
    (
      release.version !== plan.appVersion ||
      release.channel !== "trial" ||
      release.trustLevel !== "unsigned-trial" ||
      release.artifacts?.length !== 3
    )
  ) {
    throw new Error("RQT-07 不能把非当前 unsigned-trial 冒充内部试用证据");
  }
  const deviceCases = context.deviceMatrix.requiredCases ?? [];
  if (
    byId.get("RQT-10")?.currentStatus === "passed" &&
    (
      deviceCases.length < 9 ||
      deviceCases.some((item) => item.result !== "passed")
    )
  ) {
    throw new Error("RQT-10 不能在真实设备矩阵未全通过时标记 passed");
  }
  if (
    byId.get("RQT-11")?.currentStatus === "passed" &&
    (
      !availablePaths.has(
        `output/WeatherPoem_${plan.appVersion}_MSI_ELEVATED_LIFECYCLE.json`,
      ) ||
      !availablePaths.has(
        `output/WeatherPoem_${plan.appVersion}_AUTOSTART_REBOOT.json`,
      )
    )
  ) {
    throw new Error("RQT-11 缺少管理员 MSI 或真实重启自启证据");
  }
  if (byId.get("RQT-19")?.currentStatus === "passed") {
    const signed =
      release.channel === "production" &&
      release.trustLevel === "signed-production" &&
      release.artifacts?.length === 3 &&
      release.artifacts.every(
        (artifact) =>
          artifact.signature?.status === "Valid" &&
          artifact.signature?.timestampThumbprint &&
          artifact.downloadUrl?.startsWith("https://"),
      );
    if (!signed) {
      throw new Error("RQT-19 不能把未签名或无时间戳试用包标记 passed");
    }
  }
}

export function validateTraceability(plan, context, availablePaths) {
  if (
    plan?.schemaVersion !== "1.0" ||
    plan?.product !== "WeatherPoem" ||
    plan?.appVersion !== context.packageVersion ||
    plan?.appVersion !== context.releaseManifest.version ||
    plan?.appVersion !== context.deviceMatrix.appVersion ||
    plan?.contentVersion !== context.contentCatalog.contentVersion ||
    !/^\d{4}-\d{2}-\d{2}$/.test(plan?.updatedAt ?? "")
  ) {
    throw new Error("需求追踪表与当前产品、应用版本或内容版本不一致");
  }
  const allowedStatuses = new Set(
    plan.statusPolicy?.allowedStatuses ?? [],
  );
  if (
    allowedStatuses.size !== 5 ||
    !["passed", "partial", "pending", "blocked", "failed"].every(
      (status) => allowedStatuses.has(status),
    ) ||
    !plan.statusPolicy?.externalEvidenceRule
  ) {
    throw new Error("需求追踪表缺少完整状态策略");
  }
  if (!Array.isArray(plan.gates) || plan.gates.length < 20) {
    throw new Error("需求追踪表门禁数量不足，可能遗漏发布或试点范围");
  }
  const gateIds = new Set();
  for (const gate of plan.gates) {
    if (gateIds.has(gate.id)) {
      throw new Error(`重复需求门禁 ${gate.id}`);
    }
    gateIds.add(gate.id);
    assertGate(gate, allowedStatuses, availablePaths);
    if (gate.currentStatus === "passed") {
      const signoffPaths = gate.evidence.filter((evidencePath) =>
        evidencePath.startsWith("review/evidence/"),
      );
      for (const signoffPath of signoffPaths) {
        const signoff = context.signoffs.get(signoffPath);
        if (!signoff) {
          throw new Error(`${gate.id} 缺少可解析的具名证据 ${signoffPath}`);
        }
        assertNamedSignoff(
          gate,
          plan,
          signoff,
          availablePaths,
        );
      }
    }
  }
  assertMilestoneHierarchy(plan, gateIds);
  assertDynamicTruth(plan, context, availablePaths);
  return true;
}

export function buildProjectReadiness(plan, context, availablePaths) {
  validateTraceability(plan, context, availablePaths);
  const gateById = new Map(plan.gates.map((gate) => [gate.id, gate]));
  const gates = plan.gates.map((gate) => {
    const evidenceAvailability = gate.evidence.map((evidencePath) => ({
      path: evidencePath,
      exists: availablePaths.has(evidencePath),
    }));
    return {
      id: gate.id,
      title: gate.title,
      proofType: gate.proofType,
      status: gate.currentStatus,
      ownerRole: gate.ownerRole,
      exitCriterion: gate.exitCriterion,
      evidenceAvailability,
      verificationCommands: gate.verificationCommands,
      issue: gate.issue,
      nextAction: gate.nextAction,
    };
  });
  const milestones = plan.milestones.map((milestone) => {
    const required = milestone.requiredGateIds.map((gateId) =>
      gateById.get(gateId),
    );
    const blockers = required
      .filter((gate) => gate.currentStatus !== "passed")
      .map((gate) => ({
        id: gate.id,
        title: gate.title,
        status: gate.currentStatus,
        ownerRole: gate.ownerRole,
        nextAction: gate.nextAction,
      }));
    const ready = blockers.length === 0;
    if (ready !== milestone.expectedCurrentReady) {
      throw new Error(
        `${milestone.id} 的实际就绪状态与追踪表预期不一致`,
      );
    }
    return {
      id: milestone.id,
      name: milestone.name,
      status: ready ? "ready" : "not-ready",
      passedGateCount: required.length - blockers.length,
      requiredGateCount: required.length,
      blockingGates: blockers,
    };
  });
  const milestoneMap = new Map(
    milestones.map((milestone) => [milestone.id, milestone]),
  );
  const overallStatus =
    milestoneMap.get("public-release").status === "ready"
      ? "public-release-ready"
      : milestoneMap.get("campus-pilot").status === "ready"
        ? "campus-pilot-ready"
        : milestoneMap.get("internal-trial").status === "ready"
          ? "internal-trial-ready-only"
          : "not-ready";
  const statusCounts = Object.fromEntries(
    [...plan.statusPolicy.allowedStatuses].map((status) => [
      status,
      gates.filter((gate) => gate.status === status).length,
    ]),
  );
  const deviceCases = context.deviceMatrix.requiredCases ?? [];
  return {
    schemaVersion: "1.0",
    product: plan.product,
    appVersion: plan.appVersion,
    contentVersion: plan.contentVersion,
    asOf: plan.updatedAt,
    overallStatus,
    claimBoundary:
      "本报告只按逐项证据声明当前范围；内部试用就绪不等于校园试点或公开发布就绪。",
    observations: {
      content: {
        workCount: context.contentCatalog.workCount,
        contentVersion: context.contentCatalog.contentVersion,
      },
      release: {
        channel: context.releaseManifest.channel,
        trustLevel: context.releaseManifest.trustLevel,
        artifactCount: context.releaseManifest.artifacts.length,
      },
      deviceMatrix: {
        passedCaseCount: deviceCases.filter(
          (item) => item.result === "passed",
        ).length,
        requiredCaseCount: deviceCases.length,
        currentMachineResult:
          context.deviceMatrix.currentMachineObservation.result,
      },
      manualWindowsEvidence: {
        msiElevatedLifecycle: availablePaths.has(
          `output/WeatherPoem_${plan.appVersion}_MSI_ELEVATED_LIFECYCLE.json`,
        ),
        autostartReboot: availablePaths.has(
          `output/WeatherPoem_${plan.appVersion}_AUTOSTART_REBOOT.json`,
        ),
      },
    },
    statusCounts,
    milestones,
    gates,
  };
}

export function serializeProjectReadiness(value) {
  return stableJson(value);
}

export function assertProjectReadinessMatches(actual, expected) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error("项目就绪报告与当前追踪表、版本或证据可用性不一致");
  }
  return true;
}
