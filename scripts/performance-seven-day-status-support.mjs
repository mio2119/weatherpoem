import { validateSevenDayPerformance } from "./performance-long-run-support.mjs";

function checkpointEvidence({ launch, checkpoint }) {
  const startedAt = Date.parse(checkpoint?.startedAt);
  const launchStartedAt = Date.parse(launch.startedAt);
  const status = checkpoint?.status;
  const valid =
    checkpoint?.schemaVersion === "1.0" &&
    checkpoint.product === "WeatherPoem" &&
    checkpoint.appVersion === launch.appVersion &&
    checkpoint.mode === "seven-day" &&
    checkpoint.runId === launch.runId &&
    checkpoint.requestedDurationMinutes === 10_080 &&
    checkpoint.sampleIntervalSeconds === 60 &&
    ["starting", "running", "completed", "failed"].includes(status) &&
    Number.isFinite(startedAt) &&
    Number.isFinite(launchStartedAt) &&
    startedAt >= launchStartedAt - 10_000 &&
    Number.isInteger(checkpoint.sampleCount) &&
    checkpoint.sampleCount >= 0 &&
    checkpoint.sampleCount <= 10_081 &&
    (status !== "completed" || checkpoint.sampleCount >= 10_080);

  if (!valid) return null;

  return {
    source: "checkpoint",
    status,
    message:
      typeof checkpoint.message === "string" ? checkpoint.message : "",
    processId: checkpoint.processId,
    sampleCount: checkpoint.sampleCount,
    elapsedSeconds: checkpoint.lastSample?.elapsedSeconds ?? 0,
    startedAt: checkpoint.startedAt,
    updatedAt: checkpoint.updatedAt,
    lastSampleAt: checkpoint.lastSample?.recordedAt ?? null,
  };
}

function formalReportEvidence({ launch, report, expected }) {
  if (!report) return null;
  try {
    validateSevenDayPerformance(report, expected);
  } catch {
    return null;
  }

  const valid =
    report.runId === launch.runId &&
    Date.parse(report.generatedAt) >= Date.parse(launch.startedAt);
  if (!valid) return null;

  return {
    source: "formal-report",
    status: "completed",
    message: typeof report.message === "string" ? report.message : "",
    processId: null,
    sampleCount: report.results.sampleCount,
    elapsedSeconds: report.results.actualDurationSeconds,
    startedAt: launch.startedAt,
    updatedAt: report.generatedAt,
    lastSampleAt: report.results.samples.at(-1).recordedAt,
  };
}

export function selectSevenDayStatusEvidence({
  launch,
  checkpoint,
  report,
  expected,
}) {
  const launchValid =
    launch?.schemaVersion === "1.0" &&
    launch.product === "WeatherPoem" &&
    launch.appVersion === expected.appVersion &&
    /^[a-f0-9]{32}$/i.test(launch.runId) &&
    launch.requestedDurationMinutes === 10_080 &&
    launch.sampleIntervalSeconds === 60 &&
    launch.artifact?.sha256 === expected.exeSha256;
  if (!launchValid) {
    throw new Error("Seven-day checkpoint identity or state is invalid.");
  }

  const checkpointResult = checkpointEvidence({ launch, checkpoint });
  if (checkpointResult?.status === "failed") return checkpointResult;

  const evidence =
    checkpointResult ??
    formalReportEvidence({ launch, report, expected });
  if (!evidence) {
    throw new Error("Seven-day checkpoint identity or state is invalid.");
  }
  return evidence;
}

function protectedEvidenceMatches(expectedItems, currentItems) {
  if (
    !Array.isArray(expectedItems) ||
    !Array.isArray(currentItems) ||
    expectedItems.length !== 3 ||
    currentItems.length !== expectedItems.length
  ) {
    return false;
  }
  const currentByPath = new Map(
    currentItems.map((item) => [item.path, item.sha256]),
  );
  return expectedItems.every(
    (item) => currentByPath.get(item.path) === item.sha256,
  );
}

export function buildSevenDayStatus({
  launch,
  checkpoint,
  report,
  expected,
  currentArtifact,
  currentReleaseManifestSha256,
  currentProtectedEvidence,
  processAlive,
}) {
  if (
    currentArtifact.sha256 !== launch.artifact.sha256 ||
    currentArtifact.sizeBytes !== launch.artifact.sizeBytes
  ) {
    throw new Error(
      "Seven-day launch is no longer bound to the frozen candidate.",
    );
  }
  if (
    currentReleaseManifestSha256 !== launch.releaseManifest?.sha256
  ) {
    throw new Error("Seven-day release manifest changed after launch.");
  }
  if (
    !protectedEvidenceMatches(
      launch.protectedEvidence,
      currentProtectedEvidence,
    )
  ) {
    throw new Error("Protected eight-hour evidence changed after launch.");
  }

  const evidence = selectSevenDayStatusEvidence({
    launch,
    checkpoint,
    report,
    expected,
  });
  const launcherAlive = processAlive(launch.launcherProcessId);
  const appProcessId = Number.isInteger(evidence.processId)
    ? evidence.processId
    : null;
  const appAlive =
    appProcessId === null ? false : processAlive(appProcessId);
  let status = evidence.status;
  let message = evidence.message;
  if (["starting", "running"].includes(status) && !launcherAlive) {
    status = "failed";
    message = "Seven-day run says active but the launcher process exited.";
  } else if (status === "running" && !appAlive) {
    status = "failed";
    message = "Seven-day run says running but the app process exited.";
  }

  const progressPercent = Math.min(
    100,
    (evidence.elapsedSeconds / (10_080 * 60)) * 100,
  );
  return {
    status,
    message,
    source: evidence.source,
    runId: launch.runId,
    artifactSha256: currentArtifact.sha256,
    launcherProcessId: launch.launcherProcessId,
    launcherAlive,
    appProcessId,
    appAlive,
    sampleCount: evidence.sampleCount,
    elapsedSeconds: evidence.elapsedSeconds,
    progressPercent: Number(progressPercent.toFixed(3)),
    startedAt: evidence.startedAt,
    updatedAt: evidence.updatedAt,
    lastSampleAt: evidence.lastSampleAt,
    report:
      status === "completed" ? launch.report : null,
  };
}
