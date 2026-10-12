import assert from "node:assert/strict";
import test from "node:test";

import {
  validateSevenDayPerformance,
} from "./performance-long-run-support.mjs";
import {
  expectedSevenDay as expected,
  sevenDayFixture as fixture,
} from "./performance-seven-day-test-fixture.mjs";

test("formal report proves seven continuous days without wider claims", () => {
  assert.doesNotThrow(() =>
    validateSevenDayPerformance(fixture(), expected),
  );
});

test("rejects a duration or sample count below seven days", () => {
  const short = fixture();
  short.results.actualDurationSeconds = 604_799;
  assert.throws(
    () => validateSevenDayPerformance(short, expected),
    /duration/,
  );

  const sparse = fixture();
  sparse.results.samples.pop();
  sparse.results.sampleCount -= 1;
  assert.throws(
    () => validateSevenDayPerformance(sparse, expected),
    /too few resource samples/,
  );
});

test("rejects a sampling gap above 150 seconds", () => {
  const gap = fixture();
  for (let index = 5_000; index < gap.results.samples.length; index += 1) {
    gap.results.samples[index].recordedAt = new Date(
      Date.parse(gap.results.samples[index].recordedAt) + 91_000,
    ).toISOString();
  }
  gap.generatedAt = new Date(
    Date.parse(gap.generatedAt) + 91_000,
  ).toISOString();

  assert.throws(
    () => validateSevenDayPerformance(gap, expected),
    /sample continuity/,
  );
});

test("requires observations across at least seven UTC dates", () => {
  const compressedDates = fixture();
  const end = Date.parse(compressedDates.generatedAt) - 1_000;
  for (
    let index = 0;
    index < compressedDates.results.samples.length;
    index += 1
  ) {
    compressedDates.results.samples[index].recordedAt = new Date(
      end -
        (compressedDates.results.samples.length - index - 1) *
          5_000,
    ).toISOString();
  }

  assert.throws(
    () => validateSevenDayPerformance(compressedDates, expected),
    /UTC dates/,
  );
});

test("rejects a wrong run id, old hash, or wider claim", () => {
  const wrongRun = fixture();
  wrongRun.runId = "not-a-run-id";
  assert.throws(
    () => validateSevenDayPerformance(wrongRun, expected),
    /identity/,
  );

  const oldHash = fixture();
  oldHash.artifact.sha256 = "B".repeat(64);
  assert.throws(
    () => validateSevenDayPerformance(oldHash, expected),
    /current release EXE/,
  );

  for (const key of [
    "sleepWakeMeasured",
    "realNetworkMeasured",
    "namedQualitySignoff",
  ]) {
    const overclaim = fixture();
    overclaim.limitations[key] = true;
    assert.throws(
      () => validateSevenDayPerformance(overclaim, expected),
      /cannot claim/,
    );
  }
});
