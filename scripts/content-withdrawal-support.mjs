export const REQUIRED_WITHDRAWAL_CHECKS = [
  "remoteManifestAccepted",
  "requestContainsVersionsOnly",
  "cacheWritten",
  "offlineCacheRetained",
  "lowerRevisionRejected",
  "sameRevisionConflictRejected",
  "withdrawnWorkExcluded",
  "currentWorkShowsCorrection",
];

export function assertContentWithdrawalDrillReport(
  report,
  context,
) {
  if (
    report?.schemaVersion !== "1.0" ||
    report?.product !== "WeatherPoem" ||
    report?.version !== context.version ||
    report?.contentVersion !== context.contentVersion ||
    report?.scope !== "automated-content-withdrawal-simulation" ||
    report?.result !== "automated-passed"
  ) {
    throw new Error("内容撤回演练报告的版本、范围或结果无效");
  }
  const drilledAt = Date.parse(report.drilledAt);
  if (
    !Number.isFinite(drilledAt) ||
    drilledAt > context.now + 5 * 60 * 1000 ||
    context.now - drilledAt > 30 * 24 * 60 * 60 * 1000
  ) {
    throw new Error("内容撤回演练报告已过期或时间无效");
  }
  if (
    report?.catalog?.workCount !== context.catalogCount ||
    report?.catalog?.sha256 !== context.catalogSha256 ||
    report?.implementation?.serviceSha256 !==
      context.serviceSha256 ||
    report?.implementation?.schemaSha256 !== context.schemaSha256
  ) {
    throw new Error("内容撤回演练报告未绑定当前目录或实现");
  }
  if (
    typeof report?.sample?.workId !== "string" ||
    !context.knownWorkIds.has(report.sample.workId) ||
    report?.sample?.beforeCount !== context.catalogCount ||
    report?.sample?.afterCount !== context.catalogCount - 1
  ) {
    throw new Error("内容撤回演练样本或候选数量无效");
  }
  if (
    REQUIRED_WITHDRAWAL_CHECKS.some(
      (name) => report?.checks?.[name] !== "passed",
    )
  ) {
    throw new Error("内容撤回演练缺少必需的通过项");
  }
  if (
    report?.limitations?.signedManifestVerified !== false ||
    report?.limitations?.productionGatewayTested !== false ||
    report?.limitations?.liveClientDrill !== false ||
    report?.limitations?.namedOperatorSignoff !== false
  ) {
    throw new Error("内容撤回演练没有保留人工与生产范围限制");
  }
  return true;
}
