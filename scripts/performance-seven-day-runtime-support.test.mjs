import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const supportPath = path.join(
  projectRoot,
  "scripts",
  "performance-seven-day-runtime-support.ps1",
);

function runPowerShell(body) {
  const quotedPath = supportPath.replaceAll("'", "''");
  const script = [
    '$ErrorActionPreference = "Stop"',
    `. '${quotedPath}'`,
    body,
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return spawnSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encoded,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
}

function output(result) {
  return `${result.stdout}\n${result.stderr}`;
}

test("execution-state lease requests system awake and restores continuous", () => {
  const result = runPowerShell(`
$script:flags = @()
$nativeCall = {
    param([uint32]$Flags)
    $script:flags += $Flags
    return [uint32]1
}
$held = Enter-SevenDayExecutionState -NativeCall $nativeCall
$released = Exit-SevenDayExecutionState -Held $held -NativeCall $nativeCall
[pscustomobject]@{
    held = $held
    released = $released
    enterFlags = $script:flags[0]
    exitFlags = $script:flags[1]
} | ConvertTo-Json -Compress
`);

  assert.equal(result.status, 0, output(result));
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    held: true,
    released: true,
    enterFlags: 2_147_483_649,
    exitFlags: 2_147_483_648,
  });
});

test("AC power assertion accepts an online power source", () => {
  const result = runPowerShell(`
$online = Assert-SevenDayAcPower -NativeCall { return [byte]1 }
[pscustomobject]@{ online = $online } | ConvertTo-Json -Compress
`);

  assert.equal(result.status, 0, output(result));
  assert.deepEqual(JSON.parse(result.stdout.trim()), { online: true });
});

for (const acLineStatus of [0, 255]) {
  test(`AC power assertion rejects status ${acLineStatus}`, () => {
    const result = runPowerShell(`
Assert-SevenDayAcPower -NativeCall { return [byte]${acLineStatus} }
`);

    assert.notEqual(result.status, 0);
    assert.match(
      output(result),
      /Seven-day sampling requires continuous AC power\./,
    );
  });
}

test("execution-state lease fails when Windows rejects the request", () => {
  const result = runPowerShell(`
Enter-SevenDayExecutionState -NativeCall {
    param([uint32]$Flags)
    return [uint32]0
}
`);

  assert.notEqual(result.status, 0);
  assert.match(
    output(result),
    /Could not prevent system sleep for seven-day sampling\./,
  );
});

test("seven-day continuity accepts exactly 150 seconds on both clocks", () => {
  const result = runPowerShell(`
$previous = [pscustomobject]@{
    elapsedSeconds = 60
    recordedAt = "2026-08-06T00:00:00Z"
}
$current = [pscustomobject]@{
    elapsedSeconds = 210
    recordedAt = "2026-08-06T00:02:30Z"
}
Assert-SevenDaySampleContinuity -EvidenceMode "seven-day" -PreviousSample $previous -CurrentSample $current
"CONTINUITY_OK"
`);

  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /CONTINUITY_OK/);
});

for (const sample of [
  {
    name: "elapsed clock",
    elapsedSeconds: 211,
    recordedAt: "2026-08-06T00:02:30Z",
  },
  {
    name: "UTC recorded clock",
    elapsedSeconds: 210,
    recordedAt: "2026-08-06T00:02:31Z",
  },
]) {
  test(`seven-day continuity fails when the ${sample.name} gap exceeds 150 seconds`, () => {
    const result = runPowerShell(`
$previous = [pscustomobject]@{
    elapsedSeconds = 60
    recordedAt = "2026-08-06T00:00:00Z"
}
$current = [pscustomobject]@{
    elapsedSeconds = ${sample.elapsedSeconds}
    recordedAt = "${sample.recordedAt}"
}
Assert-SevenDaySampleContinuity -EvidenceMode "seven-day" -PreviousSample $previous -CurrentSample $current
`);

    assert.notEqual(result.status, 0);
    assert.match(
      output(result),
      /Seven-day sample continuity exceeded 150 seconds\./,
    );
  });
}

test("eight-hour continuity does not apply the seven-day fail-fast gate", () => {
  const result = runPowerShell(`
$previous = [pscustomobject]@{
    elapsedSeconds = 60
    recordedAt = "2026-08-06T00:00:00Z"
}
$current = [pscustomobject]@{
    elapsedSeconds = 3600
    recordedAt = "2026-08-06T01:00:00Z"
}
Assert-SevenDaySampleContinuity -EvidenceMode "eight-hour" -PreviousSample $previous -CurrentSample $current
"EIGHT_HOUR_UNCHANGED"
`);

  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /EIGHT_HOUR_UNCHANGED/);
});
