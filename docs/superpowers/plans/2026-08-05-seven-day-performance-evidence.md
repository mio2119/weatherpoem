# WeatherPoem Seven-Day Performance Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and launch a seven-day, machine-verifiable tray stability run for the frozen WeatherPoem 0.2.0 EXE without overwriting the accepted eight-hour evidence.

**Architecture:** Extend the existing long-run sampler with an explicit `seven-day` mode, but give that mode separate launch, checkpoint, report, status, check, log, and archive paths. Bind every layer with the same `runId`, release-manifest hash, EXE size, and SHA-256; reuse the existing statistical validator while adding seven-day duration and sample-continuity checks.

**Tech Stack:** PowerShell 5.1, Node.js 22 ESM, `node:test`, npm scripts, JSON evidence files, Windows process APIs.

## Global Constraints

- Actual development directory remains `E:\weatherpoem`; `D:\纯净工作台` remains control and audit only.
- The frozen EXE SHA-256 must remain `D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A`.
- Do not rebuild, replace, sign, install, uninstall, or terminate the frozen EXE as part of tool implementation.
- Seven-day duration is exactly 10,080 minutes with a 60-second sample interval.
- A seven-day report must contain at least 10,080 samples, cover at least 604,800 seconds, span at least seven UTC dates, and have no adjacent wall-clock or elapsed-time gap above 150 seconds.
- Seven-day commands must not write, move, archive, or delete any eight-hour artifact.
- `sleepWakeMeasured`, `realNetworkMeasured`, and `namedQualitySignoff` remain `false`; `gateSatisfied` remains `false`.
- The seven-day report may close only the seven-day sub-item of `RQT-13`; the complete requirement remains `partial`.
- `E:\weatherpoem` currently has no `.git` directory. Do not initialize a repository. Replace each normally required commit with a named verification checkpoint and a recorded file list.

---

## File Structure

### Files to create

- `scripts/performance-seven-day-contract.test.mjs`: validates accepted and rejected seven-day reports.
- `scripts/performance-seven-day-script-contract.test.mjs`: proves the PowerShell sampler selects isolated seven-day paths and fixed configuration.
- `scripts/start-performance-seven-day.ps1`: performs manifest/hash/process preflight, archives only prior seven-day evidence, and launches the sampler hidden.
- `scripts/performance-seven-day-launcher-contract.test.mjs`: checks launcher arguments, protected evidence, and forbidden operations.
- `scripts/performance-seven-day-status-support.mjs`: selects a valid current checkpoint or fully valid formal report.
- `scripts/performance-seven-day-status-support.test.mjs`: covers running, completed, stale, wrong-mode, wrong-run, and overclaimed evidence.
- `scripts/performance-seven-day-status.mjs`: reads current files, checks hashes/processes, and prints status JSON.
- `scripts/performance-seven-day-check.mjs`: validates the completed formal report against the current release candidate.

### Files to modify

- `scripts/performance-long-run-support.mjs`: add mode descriptors and `validateSevenDayPerformance`.
- `scripts/test-performance-long-run.ps1`: add explicit mode/run identity and mode-specific output paths/results.
- `package.json`: expose start/status/check commands and include contract tests in normal checks.
- `docs/PERFORMANCE_VERIFICATION.md`: document commands, evidence limits, and running discipline.
- `review/requirements-traceability.json`: update only after a real seven-day report passes; do not mark `RQT-13` passed.
- `docs/PROJECT_READINESS.md` and `output/WeatherPoem_0.2.0_READINESS.json`: regenerate only after the real report passes.

### Stable interfaces

```js
export const PERFORMANCE_SEVEN_DAY_REPORT =
  "output/WeatherPoem_0.2.0_PERFORMANCE_7D.json";

export function validateSevenDayPerformance(report, expected) {}

export function selectSevenDayStatusEvidence({
  launch,
  checkpoint,
  report,
  expected,
}) {}
```

`expected` is always:

```js
{
  appVersion: "0.2.0",
  exeSha256: "<64 uppercase hex characters>",
}
```

---

### Task 1: Seven-Day Report Contract

**Files:**

- Create: `scripts/performance-seven-day-contract.test.mjs`
- Modify: `scripts/performance-long-run-support.mjs`
- Test: `scripts/performance-seven-day-contract.test.mjs`
- Regression: `scripts/performance-eight-hour-contract.test.mjs`
- Regression: `scripts/performance-long-run-contract.test.mjs`

**Interfaces:**

- Consumes: existing `validateLongRunRehearsal` and `validateEightHourPerformance` behavior.
- Produces: `PERFORMANCE_SEVEN_DAY_REPORT` and `validateSevenDayPerformance(report, expected)`.

- [ ] **Step 1: Write the failing valid-report test**

Create a fixture with 10,080 samples. Use zero CPU growth and deterministic memory so recomputed values are exact:

```js
const HASH = "A".repeat(64);
const SAMPLE_COUNT = 10_080;

function fixture() {
  const startedAt = Date.parse("2026-08-05T00:00:00.000Z");
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, index) => ({
    elapsedSeconds: (index + 1) * 60,
    workingSetMiB: 35,
    totalProcessorTimeMs: 0,
    recordedAt: new Date(
      startedAt + (index + 1) * 60_000,
    ).toISOString(),
  }));
  return {
    schemaVersion: "1.0",
    product: "WeatherPoem",
    appVersion: "0.2.0",
    generatedAt: new Date(
      startedAt + SAMPLE_COUNT * 60_000 + 1_000,
    ).toISOString(),
    runId: "1".repeat(32),
    testKind: "performance-seven-day",
    artifact: {
      path: "src-tauri/target/release/weatherpoem.exe",
      sha256: HASH,
      sizeBytes: 1_000_000,
    },
    configuration: {
      mode: "seven-day",
      requestedDurationMinutes: 10_080,
      sampleIntervalSeconds: 60,
      processorCount: 8,
      isolatedProfile: true,
      controlledScenario: "weather-offline",
      realUserDataTouched: false,
      closedToTray: true,
    },
    startup: {
      readyView: "poem",
      readyMode: "offline-rules",
      performanceScenario: "weather-offline",
      nativeReadyMs: 600,
      frontendReadyMs: 400,
      viewRenderMs: 50,
    },
    thresholds: {
      idleCpuAveragePercent: 0.2,
      idleMemoryP95MiB: 100,
      memoryGrowthMiB: 20,
    },
    results: {
      actualDurationSeconds: 604_800,
      sampleCount: samples.length,
      samples,
      closeRequestAccepted: true,
      processStayedAlive: true,
      cpuTimeDeltaMs: 0,
      cpuAveragePercent: 0,
      memoryP95MiB: 35,
      memoryGrowthMiB: 0,
      durationSatisfied: true,
      cpuThresholdSatisfied: true,
      memoryThresholdSatisfied: true,
      memoryGrowthThresholdSatisfied: true,
    },
    limitations: {
      eightHourIdleMeasured: true,
      sevenDayLongRunMeasured: true,
      sleepWakeMeasured: false,
      realNetworkMeasured: false,
      namedQualitySignoff: false,
    },
    gateSatisfied: false,
    result: "automated-seven-day-passed",
  };
}

test("formal report proves seven continuous days without wider claims", () => {
  assert.doesNotThrow(() =>
    validateSevenDayPerformance(fixture(), {
      appVersion: "0.2.0",
      exeSha256: HASH,
    }),
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test scripts/performance-seven-day-contract.test.mjs
```

Expected: FAIL because `validateSevenDayPerformance` is not exported.

- [ ] **Step 3: Add rejection tests before implementation**

Add separate tests that mutate one fact at a time:

```js
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
  gap.results.samples[5_000].recordedAt = new Date(
    Date.parse(gap.results.samples[4_999].recordedAt) + 151_000,
  ).toISOString();
  assert.throws(
    () => validateSevenDayPerformance(gap, expected),
    /sample continuity/,
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
```

- [ ] **Step 4: Implement a mode descriptor instead of copying the validator**

Refactor the private validator to consume a descriptor:

```js
const MODE_CONTRACTS = {
  rehearsal: {
    minimumMinutes: 2,
    maximumMinutes: 30,
    testKind: "performance-long-run-rehearsal",
    result: "automated-rehearsal-passed",
    eightHourMeasured: false,
    sevenDayMeasured: false,
  },
  "eight-hour": {
    minimumMinutes: 480,
    maximumMinutes: 1_440,
    testKind: "performance-eight-hour",
    result: "automated-eight-hour-passed",
    eightHourMeasured: true,
    sevenDayMeasured: false,
  },
  "seven-day": {
    minimumMinutes: 10_080,
    maximumMinutes: 10_080,
    testKind: "performance-seven-day",
    result: "automated-seven-day-passed",
    eightHourMeasured: true,
    sevenDayMeasured: true,
    maximumSampleGapSeconds: 150,
    minimumUtcDateCount: 7,
  },
};
```

For seven-day mode only, require top-level `runId` to match `/^[a-f0-9]{32}$/i`. Iterate samples and reject either `elapsedSeconds` gaps or `recordedAt` gaps above 150 seconds. Build a set from `recordedAt.slice(0, 10)` and require at least seven dates.

Export:

```js
export const PERFORMANCE_SEVEN_DAY_REPORT =
  "output/WeatherPoem_0.2.0_PERFORMANCE_7D.json";

export function validateSevenDayPerformance(report, expected) {
  validateLongRunReport(report, expected, "seven-day");
}
```

- [ ] **Step 5: Verify GREEN and regressions**

Run:

```powershell
node --test scripts/performance-seven-day-contract.test.mjs scripts/performance-eight-hour-contract.test.mjs scripts/performance-long-run-contract.test.mjs
```

Expected: all tests PASS; existing eight-hour reports still reject `sevenDayLongRunMeasured = true`.

- [ ] **Step 6: Record checkpoint 1**

Run `Get-FileHash scripts\performance-long-run-support.mjs,scripts\performance-seven-day-contract.test.mjs -Algorithm SHA256` and retain the output in the task log. Do not initialize Git.

---

### Task 2: Mode-Aware PowerShell Sampler

**Files:**

- Create: `scripts/performance-seven-day-script-contract.test.mjs`
- Modify: `scripts/test-performance-long-run.ps1`
- Test: `scripts/performance-seven-day-script-contract.test.mjs`
- Regression: `scripts/performance-long-run-contract.test.mjs`

**Interfaces:**

- Consumes: `-DurationMinutes`, `-SampleIntervalSeconds`, and `-Rehearsal` compatibility.
- Produces: `-EvidenceMode seven-day` and `-RunId <32 hex>`.

- [ ] **Step 1: Write the failing script contract**

Read the PowerShell source and assert the explicit mode, exact duration, isolated paths, and result strings exist:

```js
test("sampler exposes a fixed seven-day mode with isolated evidence", async () => {
  const source = await readFile(
    new URL("./test-performance-long-run.ps1", import.meta.url),
    "utf8",
  );
  for (const token of [
    '[ValidateSet("eight-hour", "seven-day")]',
    '$EvidenceMode = "eight-hour"',
    '$DurationMinutes -ne 10080',
    'WeatherPoem_${appVersion}_PERFORMANCE_7D.json',
    'WeatherPoem_${appVersion}_PERFORMANCE_7D_CHECKPOINT.json',
    'performance-seven-day',
    'automated-seven-day-passed',
    'sevenDayLongRunMeasured = $sevenDayMeasured',
  ]) {
    assert.ok(source.includes(token), token);
  }
});
```

Also assert that seven-day output-selection blocks contain neither `PERFORMANCE_8H.json` nor `PERFORMANCE_LONG_RUN_CHECKPOINT.json`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test scripts/performance-seven-day-script-contract.test.mjs
```

Expected: FAIL on the missing `ValidateSet` token.

- [ ] **Step 3: Add sampler parameters and validation**

Change the parameter block to:

```powershell
param(
    [ValidateRange(2, 10080)]
    [int]$DurationMinutes = 480,

    [ValidateRange(5, 300)]
    [int]$SampleIntervalSeconds = 60,

    [ValidateSet("eight-hour", "seven-day")]
    [string]$EvidenceMode = "eight-hour",

    [ValidatePattern("^[a-fA-F0-9]{32}$")]
    [string]$RunId = "",

    [switch]$Rehearsal
)
```

Use exact validation:

```powershell
if ($Rehearsal -and $EvidenceMode -ne "eight-hour") {
    throw "Rehearsal cannot use seven-day evidence mode."
}
if (-not $Rehearsal -and $EvidenceMode -eq "eight-hour" -and $DurationMinutes -gt 1440) {
    throw "Eight-hour evidence mode is limited to 1440 minutes."
}
if ($EvidenceMode -eq "seven-day" -and $DurationMinutes -ne 10080) {
    throw "Seven-day evidence must run for exactly 10080 minutes."
}
if ($EvidenceMode -eq "seven-day" -and [string]::IsNullOrWhiteSpace($RunId)) {
    throw "Seven-day evidence requires the launcher run id."
}
```

- [ ] **Step 4: Select mode-specific identity and paths**

Create `$mode`, `$reportName`, `$checkpointName`, `$testKind`, and pass/fail result values before constructing paths. Keep rehearsal and eight-hour outputs unchanged. Seven-day values must be:

```powershell
$mode = "seven-day"
$reportName = "WeatherPoem_${appVersion}_PERFORMANCE_7D.json"
$checkpointName = "WeatherPoem_${appVersion}_PERFORMANCE_7D_CHECKPOINT.json"
$testKind = "performance-seven-day"
$passedResult = "automated-seven-day-passed"
$failedResult = "automated-seven-day-failed"
```

`Write-Checkpoint` must include `runId = $RunId` only for seven-day mode and use `$checkpointPath`. The final seven-day report must include the same `runId` as a top-level field.

- [ ] **Step 5: Compute measured limitations from actual duration**

Use:

```powershell
$eightHourMeasured = (
    -not $Rehearsal -and
    $actualDurationMs -ge (480 * 60 * 1000)
)
$sevenDayMeasured = (
    $EvidenceMode -eq "seven-day" -and
    $actualDurationMs -ge (10080 * 60 * 1000)
)
```

Set the result from `$passedResult`/`$failedResult`; never set `gateSatisfied` to true.

- [ ] **Step 6: Verify script contracts and existing rehearsal**

Run:

```powershell
node --test scripts/performance-seven-day-script-contract.test.mjs scripts/performance-long-run-contract.test.mjs
npm.cmd run performance:long-run:rehearsal
npm.cmd run performance:long-run:check
```

Expected: contract tests PASS; the two-minute rehearsal passes; the existing eight-hour formal report remains valid through `performance:long-run:check`.

- [ ] **Step 7: Record checkpoint 2**

Record hashes for `scripts/test-performance-long-run.ps1`, the new contract test, and `output/WeatherPoem_0.2.0_PERFORMANCE_8H.json`. Do not record the shared rehearsal checkpoint as protected evidence until after this rehearsal has finished.

---

### Task 3: Safe Seven-Day Background Launcher

**Files:**

- Create: `scripts/start-performance-seven-day.ps1`
- Create: `scripts/performance-seven-day-launcher-contract.test.mjs`
- Test: `scripts/performance-seven-day-launcher-contract.test.mjs`

**Interfaces:**

- Consumes: `output/WeatherPoem_0.2.0_RELEASE.json`, the current EXE, the sampler, and three eight-hour evidence paths.
- Produces: `WeatherPoem_0.2.0_PERFORMANCE_7D_LAUNCH.json`, run-specific stdout/stderr logs, and a hidden launcher process.

- [ ] **Step 1: Write the failing launcher contract**

Assert the launcher contains all required arguments and paths:

```js
test("launcher binds seven-day mode and protects eight-hour evidence", async () => {
  const source = await readFile(
    new URL("./start-performance-seven-day.ps1", import.meta.url),
    "utf8",
  );
  for (const token of [
    'WeatherPoem_${appVersion}_PERFORMANCE_7D_LAUNCH.json',
    'WeatherPoem_${appVersion}_PERFORMANCE_7D_CHECKPOINT.json',
    'WeatherPoem_${appVersion}_PERFORMANCE_7D.json',
    '"-EvidenceMode"',
    '"seven-day"',
    '"-DurationMinutes"',
    '"10080"',
    '"-SampleIntervalSeconds"',
    '"60"',
    '"-RunId"',
    'protectedEvidence',
    'output/WeatherPoem_0.2.0_RELEASE.json',
  ]) {
    assert.ok(source.includes(token), token);
  }
});
```

Add a forbidden-operation test:

```js
for (const forbidden of [
  /tauri:build/i,
  /cargo\s+build/i,
  /msiexec/i,
  /Stop-Process\s+-Name/i,
  /PERFORMANCE_8H\.json[^\r\n]*WriteAllText/i,
]) {
  assert.doesNotMatch(source, forbidden);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test scripts/performance-seven-day-launcher-contract.test.mjs
```

Expected: FAIL with `ENOENT` because the launcher does not exist.

- [ ] **Step 3: Implement release-manifest and process preflight**

The launcher must:

1. Load `package.json` for `$appVersion`.
2. Load `output/WeatherPoem_${appVersion}_RELEASE.json`.
3. Select exactly one `kind = portable` artifact.
4. Compare its name, size, and SHA-256 to the current EXE.
5. Reject any running `weatherpoem` process.
6. Reject a live launcher PID from the previous seven-day launch record.

Use explicit paths and `Get-FileHash`; do not accept a hash argument from the caller.

- [ ] **Step 4: Archive only prior seven-day files**

Resolve `output/performance-7d-archive` under the project output directory. For each exact prior seven-day path—launch, checkpoint, report—move it only if it exists, the previous launcher is not alive, and the resolved source begins with the resolved output directory. Use a suffix containing the previous `runId` and current UTC timestamp. Never enumerate or move eight-hour files.

- [ ] **Step 5: Record protected eight-hour hashes**

Before launch, hash exactly:

```text
output/WeatherPoem_0.2.0_PERFORMANCE_8H_LAUNCH.json
output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_CHECKPOINT.json
output/WeatherPoem_0.2.0_PERFORMANCE_8H.json
```

Store them as `protectedEvidence: [{ path, sha256 }]` in the launch record. Missing files must abort the launch.

- [ ] **Step 6: Launch the fixed sampler command**

Generate a 32-character lowercase hex `runId` and pass:

```powershell
@(
    "-NoLogo", "-NoProfile", "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", $longRunScript,
    "-EvidenceMode", "seven-day",
    "-DurationMinutes", "10080",
    "-SampleIntervalSeconds", "60",
    "-RunId", $runId
)
```

The launch JSON must record the launcher PID, fixed configuration, artifact size/hash, release manifest path/hash, protected evidence hashes, checkpoint/report/log paths, and `status = launched`.

- [ ] **Step 7: Verify GREEN without starting seven days**

Run only the contract test:

```powershell
node --test scripts/performance-seven-day-launcher-contract.test.mjs
```

Expected: PASS. Do not invoke the launcher in this task.

- [ ] **Step 8: Record checkpoint 3**

Record hashes for the launcher and its test in the task log.

---

### Task 4: Seven-Day Status Selection and CLI

**Files:**

- Create: `scripts/performance-seven-day-status-support.test.mjs`
- Create: `scripts/performance-seven-day-status-support.mjs`
- Create: `scripts/performance-seven-day-status.mjs`
- Test: `scripts/performance-seven-day-status-support.test.mjs`

**Interfaces:**

- Consumes: current launch, optional checkpoint, optional formal report, and `validateSevenDayPerformance`.
- Produces: `selectSevenDayStatusEvidence(...)` and status JSON.

- [ ] **Step 1: Write failing support tests**

Cover these cases with a shared launch fixture:

```js
const launch = {
  schemaVersion: "1.0",
  product: "WeatherPoem",
  appVersion: "0.2.0",
  runId: "1".repeat(32),
  startedAt: "2026-08-05T00:00:00.000Z",
  requestedDurationMinutes: 10_080,
  sampleIntervalSeconds: 60,
  artifact: { sha256: HASH, sizeBytes: 1_000_000 },
};
```

Tests must prove:

- a matching `running` checkpoint is selected;
- a fully valid formal report is selected when the checkpoint is absent;
- an eight-hour checkpoint is rejected;
- a mismatched `runId` is rejected;
- a report generated before the launch is rejected;
- a report with a wider limitation claim is rejected by the full validator.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test scripts/performance-seven-day-status-support.test.mjs
```

Expected: FAIL because the support module does not exist.

- [ ] **Step 3: Implement checkpoint selection**

A valid checkpoint requires exact identity, `mode = seven-day`, matching `runId`, 10,080 minutes, 60 seconds, a status in `starting|running|completed|failed`, a start time no earlier than ten seconds before launch, and a sample count from 0 through 10,081. A completed checkpoint needs at least 10,080 samples. A failed checkpoint is returned as failed rather than falling back to an older formal report.

- [ ] **Step 4: Implement formal-report selection**

Call `validateSevenDayPerformance(report, expected)` inside `try/catch`, then additionally require `report.runId === launch.runId` and `generatedAt >= launch.startedAt`. Return `source = formal-report`, `status = completed`, `processId = null`, and report sample/duration timestamps.

- [ ] **Step 5: Implement the status CLI**

Use an `optionalJson(path)` helper that returns `null` only for `ENOENT`; malformed JSON must fail. Require the launch file. Recompute current EXE size/hash, release-manifest hash, and every `protectedEvidence` hash before selecting status.

For `starting` or `running`, require the launcher to be alive; for `running`, require the checkpoint application PID to be alive. For `completed`, allow both to have naturally exited. Print:

```js
{
  status,
  source,
  runId,
  artifactSha256,
  launcherProcessId,
  launcherAlive,
  appProcessId,
  appAlive,
  sampleCount,
  elapsedSeconds,
  progressPercent,
  startedAt,
  updatedAt,
  lastSampleAt,
  report,
}
```

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
node --test scripts/performance-seven-day-status-support.test.mjs scripts/performance-seven-day-contract.test.mjs
node --check scripts/performance-seven-day-status.mjs
```

Expected: all tests PASS and syntax check exits 0.

- [ ] **Step 7: Record checkpoint 4**

Record hashes for the three new status files.

---

### Task 5: Formal Check Command and npm Integration

**Files:**

- Create: `scripts/performance-seven-day-check.mjs`
- Modify: `package.json`
- Test: all seven-day unit and contract tests.

**Interfaces:**

- Consumes: `PERFORMANCE_SEVEN_DAY_REPORT`, current package version, and current EXE.
- Produces: `performance:seven-day:start`, `performance:seven-day:status`, and `performance:seven-day:check`.

- [ ] **Step 1: Write the missing-command assertion first**

Add this test to `scripts/performance-seven-day-launcher-contract.test.mjs` before modifying `package.json`:

```js
test("package exposes all seven-day commands", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    packageJson.scripts["performance:seven-day:start"],
    "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/start-performance-seven-day.ps1",
  );
  assert.equal(
    packageJson.scripts["performance:seven-day:status"],
    "node scripts/performance-seven-day-status.mjs",
  );
  assert.match(
    packageJson.scripts["performance:seven-day:check"],
    /performance-seven-day-check\.mjs/,
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test scripts/performance-seven-day-launcher-contract.test.mjs
```

Expected: FAIL because package commands are undefined.

- [ ] **Step 3: Create the formal checker**

Follow `performance-eight-hour-check.mjs`, but import `PERFORMANCE_SEVEN_DAY_REPORT` and `validateSevenDayPerformance`. Recompute the EXE SHA-256 and validate the report. Print exactly:

```text
Seven-day tray evidence is valid and bound to the current EXE; sleep/wake, real-network, content/update recovery, event backlog, and named approval remain open.
```

- [ ] **Step 4: Add npm scripts**

Add:

```json
"performance:seven-day:start": "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/start-performance-seven-day.ps1",
"performance:seven-day:status": "node scripts/performance-seven-day-status.mjs",
"performance:seven-day:check": "node scripts/performance-seven-day-check.mjs && node --test scripts/performance-seven-day-contract.test.mjs scripts/performance-seven-day-status-support.test.mjs scripts/performance-seven-day-script-contract.test.mjs scripts/performance-seven-day-launcher-contract.test.mjs"
```

Append the four seven-day contract tests to `performance:long-run:check`; do not append `performance-seven-day-check.mjs`, because a real report does not exist before the seven-day run completes.

- [ ] **Step 5: Verify GREEN and normal-check compatibility**

Run:

```powershell
node --test scripts/performance-seven-day-contract.test.mjs scripts/performance-seven-day-status-support.test.mjs scripts/performance-seven-day-script-contract.test.mjs scripts/performance-seven-day-launcher-contract.test.mjs
npm.cmd run performance:long-run:check
npm.cmd run performance:eight-hour:check
```

Expected: all contract tests PASS; the current eight-hour formal report remains valid. Do not run `performance:seven-day:check` yet because the real seven-day report is intentionally absent.

- [ ] **Step 6: Record checkpoint 5**

Record hashes for `package.json`, `performance-seven-day-check.mjs`, and all seven-day test files.

---

### Task 6: Documentation and No-Overclaim Boundary

**Files:**

- Modify: `docs/PERFORMANCE_VERIFICATION.md`
- Test: `scripts/product-requirements-contract.test.mjs`
- Verify: `review/requirements-traceability.json` remains `partial` before the real run.

**Interfaces:**

- Consumes: the new command names and evidence paths.
- Produces: operator instructions that distinguish tooling readiness from measured evidence.

- [ ] **Step 1: Write the failing documentation contract**

Add a test to `scripts/product-requirements-contract.test.mjs` that reads the performance guide and requires all commands plus the claim boundary:

```js
for (const token of [
  "performance:seven-day:start",
  "performance:seven-day:status",
  "performance:seven-day:check",
  "WeatherPoem_0.2.0_PERFORMANCE_7D.json",
  "10,080",
  "休眠/唤醒仍需独立人工证据",
  "RQT-13 继续保持 partial",
]) {
  assert.ok(performanceGuide.includes(token), token);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test scripts/product-requirements-contract.test.mjs
```

Expected: FAIL on `performance:seven-day:start`.

- [ ] **Step 3: Update the performance guide**

Add a dedicated section with:

- fixed duration and sample interval;
- the three output paths;
- start/status/check commands;
- frozen-hash and no-rebuild discipline;
- no concurrent app-launching tests;
- continuity gap behavior;
- limitations that remain open;
- the instruction to update traceability only after the formal check passes.

Do not alter the current readiness counts or claim that seven days have already run.

- [ ] **Step 4: Verify GREEN and readiness remains honest**

Run:

```powershell
node --test scripts/product-requirements-contract.test.mjs
npm.cmd run requirements:check
```

Expected: tests PASS; output still says `internal-trial-ready-only`, campus pilot `not-ready`, public release `not-ready`, and `RQT-13` remains `partial`.

- [ ] **Step 5: Record checkpoint 6**

Record the guide hash and the unchanged current readiness status.

---

### Task 7: Full Verification, Hash Seal, and Formal Launch

**Files:**

- Read: all files changed in Tasks 1–6.
- Read: `output/WeatherPoem_0.2.0_RELEASE.json`.
- Read: the three protected eight-hour evidence files.
- Create at runtime: seven-day launch record, checkpoint, and run logs.
- Configure at runtime: an hourly WeatherPoem heartbeat monitor after successful launch.

**Interfaces:**

- Consumes: all seven-day commands.
- Produces: a verified running seven-day measurement and recurring status checks.

- [ ] **Step 1: Run the complete pre-launch verification**

Run:

```powershell
npm.cmd run check
npm.cmd run release:verify
npm.cmd run performance:eight-hour:check
```

Expected: all commands exit 0. `npm run check` must show 16 existing Vitest files/80 tests or a higher count, all passing; release verification must show 36/36 or a higher count, all passing.

- [ ] **Step 2: Seal the candidate and protected evidence hashes**

Run:

```powershell
Get-FileHash src-tauri\target\release\weatherpoem.exe -Algorithm SHA256
Get-FileHash output\WeatherPoem_0.2.0_PERFORMANCE_8H_LAUNCH.json -Algorithm SHA256
Get-FileHash output\WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_CHECKPOINT.json -Algorithm SHA256
Get-FileHash output\WeatherPoem_0.2.0_PERFORMANCE_8H.json -Algorithm SHA256
```

Expected: EXE hash exactly `D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A`. Retain all four hashes for the post-launch comparison.

- [ ] **Step 3: Confirm no WeatherPoem process is running**

Run:

```powershell
Get-Process -Name weatherpoem -ErrorAction SilentlyContinue |
  Select-Object Id,Path,StartTime
```

Expected: no output. If a process exists, do not terminate it automatically; stop and identify its owner and purpose.

- [ ] **Step 4: Start the formal seven-day run**

Run:

```powershell
npm.cmd run performance:seven-day:start
```

Expected: exit 0 and a launch record containing a new `runId`, a live launcher PID, 10,080 minutes, a 60-second interval, the frozen EXE hash, and protected-evidence hashes.

- [ ] **Step 5: Verify the first running checkpoint**

Run:

```powershell
npm.cmd run performance:seven-day:status
```

Expected within two minutes: `status = running`, `source = checkpoint`, launcher/application alive, sample count at least 1, and the frozen hash unchanged.

- [ ] **Step 6: Recheck protected evidence after launch**

Re-run the four hash commands from Step 2. Expected: all four hashes are byte-for-byte identical to the sealed values.

- [ ] **Step 7: Create the hourly heartbeat monitor**

Create a heartbeat attached to this task with automation id/name `weatherpoem-seven-day`. Its prompt must include the actual `runId`, frozen EXE hash, launcher PID, and these rules:

```text
Run npm.cmd run performance:seven-day:status in E:\weatherpoem.
If running, verify launcher/app are alive, the EXE hash and protected evidence hashes match, and report only meaningful progress.
Never rebuild, replace, sign, install, uninstall, or terminate the frozen EXE and never run another app-launching test in parallel.
If completed, run npm.cmd run performance:seven-day:check; only after it passes update RQT-13 wording and regenerate readiness without marking the full requirement passed.
If failed, preserve logs/checkpoint and report the exact failure; do not restart automatically.
```

Use an hourly schedule and normal success notifications only when the state changes materially or the run completes/fails.

- [ ] **Step 8: Update the live task plan**

Mark implementation and launch tasks complete. Add a single in-progress item: “Monitor the formal seven-day run and validate the final report.” Do not call the overall goal complete.

---

## Post-Completion Procedure After 168 Hours

This procedure is not executed during initial implementation, but it is the exact continuation when status becomes `completed`:

1. Run `npm.cmd run performance:seven-day:check`.
2. Confirm the launcher and app processes exited naturally.
3. Recompute the EXE and protected eight-hour hashes and compare them with the launch record.
4. Update only the `RQT-13` issue/evidence text in `review/requirements-traceability.json` to say seven-day continuous running passed for the bound candidate.
5. Keep the missing real-network, sleep/wake, content/update recovery, event backlog, and named signoff items explicit.
6. Run `npm.cmd run requirements:generate`, `npm.cmd run requirements:check`, `npm.cmd run check`, and `npm.cmd run release:verify`.
7. From `D:\纯净工作台`, run `.\cw.ps1 run task weatherpoem-verify`.
8. Stop the heartbeat after the final audit passes or after a failure requires user action.
