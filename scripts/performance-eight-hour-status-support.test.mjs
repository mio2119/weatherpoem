import assert from "node:assert/strict";
import test from "node:test";

import { selectEightHourStatusEvidence } from "./performance-eight-hour-status-support.mjs";

const launch = {
  schemaVersion: "1.0",
  product: "WeatherPoem",
  appVersion: "0.2.0",
  requestedDurationMinutes: 480,
  sampleIntervalSeconds: 60,
  startedAt: "2026-07-24T08:45:24.130Z",
  artifact: { sha256: "CURRENT" },
};

const completedReport = {
  schemaVersion: "1.0",
  product: "WeatherPoem",
  appVersion: "0.2.0",
  generatedAt: "2026-07-24T16:45:41.356Z",
  testKind: "performance-eight-hour",
  artifact: { sha256: "CURRENT" },
  configuration: {
    mode: "eight-hour",
    requestedDurationMinutes: 480,
    sampleIntervalSeconds: 60,
  },
  results: {
    actualDurationSeconds: 28811.85,
    sampleCount: 480,
  },
  result: "automated-eight-hour-passed",
};

test("uses the formal report after a rehearsal overwrites the shared checkpoint", () => {
  const rehearsalCheckpoint = {
    mode: "rehearsal",
    status: "completed",
    requestedDurationMinutes: 2,
  };

  const evidence = selectEightHourStatusEvidence({
    launch,
    checkpoint: rehearsalCheckpoint,
    report: completedReport,
    exeSha256: "CURRENT",
  });

  assert.equal(evidence.source, "formal-report");
  assert.equal(evidence.status, "completed");
  assert.equal(evidence.sampleCount, 480);
});

test("does not accept a formal report from before the current launch", () => {
  const staleReport = {
    ...completedReport,
    generatedAt: "2026-07-24T08:40:00.000Z",
  };

  assert.throws(
    () =>
      selectEightHourStatusEvidence({
        launch,
        checkpoint: { mode: "rehearsal" },
        report: staleReport,
        exeSha256: "CURRENT",
      }),
    /identity or state is invalid/,
  );
});
