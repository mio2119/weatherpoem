function checkpointEvidence({ launch, checkpoint }) {
  const valid =
    checkpoint?.schemaVersion === "1.0" &&
    checkpoint.product === "WeatherPoem" &&
    checkpoint.appVersion === "0.2.0" &&
    checkpoint.mode === "eight-hour" &&
    checkpoint.requestedDurationMinutes === 480 &&
    checkpoint.sampleIntervalSeconds === 60 &&
    ["starting", "running", "completed"].includes(checkpoint.status) &&
    Date.parse(checkpoint.startedAt) >= Date.parse(launch.startedAt) - 10_000 &&
    Number.isInteger(checkpoint.sampleCount) &&
    checkpoint.sampleCount >= 0 &&
    checkpoint.sampleCount <= 481 &&
    (checkpoint.status !== "completed" || checkpoint.sampleCount >= 480);

  if (!valid) return null;

  return {
    source: "checkpoint",
    status: checkpoint.status,
    processId: checkpoint.processId,
    sampleCount: checkpoint.sampleCount,
    elapsedSeconds: checkpoint.lastSample?.elapsedSeconds ?? 0,
    startedAt: checkpoint.startedAt,
    updatedAt: checkpoint.updatedAt,
  };
}

function formalReportEvidence({ launch, report, exeSha256 }) {
  const valid =
    report?.schemaVersion === "1.0" &&
    report.product === "WeatherPoem" &&
    report.appVersion === "0.2.0" &&
    report.testKind === "performance-eight-hour" &&
    report.artifact?.sha256 === exeSha256 &&
    report.configuration?.mode === "eight-hour" &&
    report.configuration.requestedDurationMinutes === 480 &&
    report.configuration.sampleIntervalSeconds === 60 &&
    report.result === "automated-eight-hour-passed" &&
    Number.isInteger(report.results?.sampleCount) &&
    report.results.sampleCount >= 480 &&
    report.results.actualDurationSeconds >= 480 * 60 &&
    Date.parse(report.generatedAt) >= Date.parse(launch.startedAt);

  if (!valid) return null;

  return {
    source: "formal-report",
    status: "completed",
    processId: null,
    sampleCount: report.results.sampleCount,
    elapsedSeconds: report.results.actualDurationSeconds,
    startedAt: launch.startedAt,
    updatedAt: report.generatedAt,
  };
}

export function selectEightHourStatusEvidence({
  launch,
  checkpoint,
  report,
  exeSha256,
}) {
  const evidence =
    checkpointEvidence({ launch, checkpoint }) ??
    formalReportEvidence({ launch, report, exeSha256 });

  if (!evidence) {
    throw new Error("Eight-hour checkpoint identity or state is invalid.");
  }

  return evidence;
}
