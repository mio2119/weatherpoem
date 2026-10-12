param(
    [ValidateRange(2, 10080)]
    [int]$DurationMinutes = 480,

    [ValidateRange(5, 300)]
    [int]$SampleIntervalSeconds = 60,

    [ValidateSet("eight-hour", "seven-day")]
    [string]$EvidenceMode = "eight-hour",

    [string]$RunId = "",

    [switch]$Preflight,

    [switch]$Rehearsal
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$utilityModule = Join-Path $PSHOME "Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"
Import-Module -Name $utilityModule -ErrorAction Stop

if ($Rehearsal -and $DurationMinutes -gt 30) {
    throw "Rehearsal mode is limited to 30 minutes."
}
if ($Rehearsal -and $EvidenceMode -ne "eight-hour") {
    throw "Rehearsal cannot use seven-day evidence mode."
}
if (
    -not $Rehearsal -and
    $EvidenceMode -eq "eight-hour" -and
    $DurationMinutes -lt 480
) {
    throw "Formal evidence must run for at least 480 minutes. Use -Rehearsal for a shorter check."
}
if (
    -not $Rehearsal -and
    $EvidenceMode -eq "eight-hour" -and
    $DurationMinutes -gt 1440
) {
    throw "Eight-hour evidence mode is limited to 1440 minutes."
}
if ($EvidenceMode -eq "seven-day" -and $DurationMinutes -ne 10080) {
    throw "Seven-day evidence must run for exactly 10080 minutes."
}
if (
    $EvidenceMode -eq "seven-day" -and
    $RunId -notmatch "^[a-fA-F0-9]{32}$"
) {
    throw "Seven-day evidence requires a 32-character launcher run id."
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$package = Get-Content `
    -LiteralPath (Join-Path $projectRoot "package.json") `
    -Raw `
    -Encoding UTF8 |
    ConvertFrom-Json
$appVersion = [string]$package.version
$exePath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\target\release\weatherpoem.exe")
)
$seedScript = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot "scripts\seed-performance-profile.mjs")
)
$mode = if ($Rehearsal) {
    "rehearsal"
}
else {
    $EvidenceMode
}
if ($mode -eq "rehearsal") {
    $reportName = "WeatherPoem_${appVersion}_PERFORMANCE_LONG_RUN_REHEARSAL.json"
    $checkpointName = "WeatherPoem_${appVersion}_PERFORMANCE_LONG_RUN_CHECKPOINT.json"
    $testKind = "performance-long-run-rehearsal"
    $passedResult = "automated-rehearsal-passed"
    $failedResult = "automated-rehearsal-failed"
    $plannedEightHourMeasured = $false
    $plannedSevenDayMeasured = $false
}
elseif ($mode -eq "seven-day") {
    $reportName = "WeatherPoem_${appVersion}_PERFORMANCE_7D.json"
    $checkpointName = "WeatherPoem_${appVersion}_PERFORMANCE_7D_CHECKPOINT.json"
    $testKind = "performance-seven-day"
    $passedResult = "automated-seven-day-passed"
    $failedResult = "automated-seven-day-failed"
    $plannedEightHourMeasured = $true
    $plannedSevenDayMeasured = $true
}
else {
    $reportName = "WeatherPoem_${appVersion}_PERFORMANCE_8H.json"
    $checkpointName = "WeatherPoem_${appVersion}_PERFORMANCE_LONG_RUN_CHECKPOINT.json"
    $testKind = "performance-eight-hour"
    $passedResult = "automated-eight-hour-passed"
    $failedResult = "automated-eight-hour-failed"
    $plannedEightHourMeasured = $true
    $plannedSevenDayMeasured = $false
}
$reportPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot ("output\" + $reportName))
)
$checkpointPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot ("output\" + $checkpointName))
)

if ($Preflight) {
    $preflightResult = [ordered]@{
        stateChanged = $false
        mode = $mode
        runId = if ($mode -eq "seven-day") { $RunId } else { $null }
        requestedDurationMinutes = $DurationMinutes
        sampleIntervalSeconds = $SampleIntervalSeconds
        testKind = $testKind
        passedResult = $passedResult
        checkpoint = "output/" + $checkpointName
        report = "output/" + $reportName
    }
    if ($mode -eq "seven-day") {
        $preflightResult["continuityProtection"] = [ordered]@{
            systemSleepPrevented = $true
            automaticSystemSleepPrevented = $true
            userInitiatedSleepPrevented = $false
            displayRequired = $false
            continuousAcPowerRequired = $true
            lidMustRemainOpenUnlessHostPolicyIsDoNothing = $true
            executionStateRenewedEverySample = $true
            maximumSampleGapSeconds = 150
            failFast = $true
        }
    }
    $preflightResult["limitations"] = [ordered]@{
        eightHourIdleMeasured = $plannedEightHourMeasured
        sevenDayLongRunMeasured = $plannedSevenDayMeasured
        sleepWakeMeasured = $false
        realNetworkMeasured = $false
        namedQualitySignoff = $false
    }
    Write-Output ($preflightResult | ConvertTo-Json -Depth 6)
    exit 0
}

if ($mode -eq "seven-day") {
    . (Join-Path $PSScriptRoot "performance-seven-day-runtime-support.ps1")
    [void](Assert-SevenDayAcPower)
}

if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Release EXE not found. Run npm run tauri:build first."
}
if (@(Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "WeatherPoem is already running. Exit it before starting an isolated long-run measurement."
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempPrefix = $tempBase.TrimEnd("\") + "\"
$runRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $tempBase (
        "WeatherPoem.Performance.LongRun." +
        [System.Guid]::NewGuid().ToString("N")
    ))
)
if (-not $runRoot.StartsWith(
    $tempPrefix,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    throw "Long-run profile escaped the system temporary directory."
}
[System.IO.Directory]::CreateDirectory($runRoot) | Out-Null

function Get-Percentile95 {
    param([double[]]$Values)
    if ($Values.Count -eq 0) {
        throw "Cannot calculate P95 from an empty sample set."
    }
    $sorted = @($Values | Sort-Object)
    $index = [Math]::Max(0, [Math]::Ceiling($sorted.Count * 0.95) - 1)
    return [double]$sorted[$index]
}

function Stop-LaunchedProcess {
    param([System.Diagnostics.Process]$LaunchedProcess)
    if ($null -eq $LaunchedProcess) {
        return
    }
    try {
        if (-not $LaunchedProcess.HasExited) {
            $LaunchedProcess.Kill()
            if (-not $LaunchedProcess.WaitForExit(5000)) {
                throw "The long-run process did not exit within five seconds."
            }
        }
    }
    finally {
        $LaunchedProcess.Dispose()
    }
}

function Write-Checkpoint {
    param(
        [string]$Status,
        [string]$StartedAt,
        [int]$ProcessId,
        [object[]]$Samples,
        [string]$Message = ""
    )
    $checkpoint = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        appVersion = $appVersion
        mode = $mode
        status = $Status
        startedAt = $StartedAt
        updatedAt = [DateTime]::UtcNow.ToString("o")
        requestedDurationMinutes = $DurationMinutes
        sampleIntervalSeconds = $SampleIntervalSeconds
        processId = $ProcessId
        sampleCount = $Samples.Count
        lastSample = if ($Samples.Count -gt 0) {
            $Samples[$Samples.Count - 1]
        }
        else {
            $null
        }
        message = $Message
    }
    if ($mode -eq "seven-day") {
        $checkpoint["runId"] = $RunId
    }
    [System.IO.Directory]::CreateDirectory(
        (Split-Path -Parent $checkpointPath)
    ) | Out-Null
    [System.IO.File]::WriteAllText(
        $checkpointPath,
        ($checkpoint | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )
}

$launchedProcess = $null
$executionStateHeld = $false
$samples = [System.Collections.Generic.List[object]]::new()
$startedAt = [DateTime]::UtcNow.ToString("o")
try {
    $appData = Join-Path $runRoot "appdata"
    $localAppData = Join-Path $runRoot "localappdata"
    $probeDirectory = Join-Path $runRoot "temp\probe"
    foreach ($directory in @($appData, $localAppData, $probeDirectory)) {
        [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    }

    & node $seedScript $runRoot | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not seed the isolated long-run profile."
    }

    $markerPath = Join-Path $probeDirectory "weatherpoem-performance-ready.json"
    $probeRunId = if ($mode -eq "seven-day") {
        $RunId
    }
    else {
        [System.Guid]::NewGuid().ToString("D")
    }
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $exePath
    $startInfo.WorkingDirectory = Split-Path -Parent $exePath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $false
    [void]$startInfo.EnvironmentVariables
    $startInfo.EnvironmentVariables["APPDATA"] = $appData
    $startInfo.EnvironmentVariables["LOCALAPPDATA"] = $localAppData
    $startInfo.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_PROFILE"] = $runRoot
    $startInfo.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_PROBE"] = $markerPath
    $startInfo.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_RUN_ID"] = $probeRunId
    $startInfo.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_SCENARIO"] = "weather-offline"

    $launchedProcess = [System.Diagnostics.Process]::new()
    $launchedProcess.StartInfo = $startInfo
    if (-not $launchedProcess.Start()) {
        throw "Could not start the release candidate EXE."
    }
    Write-Checkpoint `
        -Status "starting" `
        -StartedAt $startedAt `
        -ProcessId $launchedProcess.Id `
        -Samples @()

    $readyDeadline = [DateTime]::UtcNow.AddSeconds(15)
    while (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        if ($launchedProcess.HasExited) {
            throw "WeatherPoem exited before writing the ready marker."
        }
        if ([DateTime]::UtcNow -ge $readyDeadline) {
            throw "WeatherPoem did not write the ready marker within 15 seconds."
        }
        Start-Sleep -Milliseconds 20
    }

    $marker = Get-Content `
        -LiteralPath $markerPath `
        -Raw `
        -Encoding UTF8 |
        ConvertFrom-Json
    if (
        [string]$marker.schemaVersion -ne "1.2" -or
        [string]$marker.runId -ne $probeRunId -or
        [int]$marker.processId -ne $launchedProcess.Id -or
        [string]$marker.performanceScenario -ne "weather-offline" -or
        [string]$marker.readyView -ne "poem" -or
        [string]$marker.readyMode -ne "offline-rules"
    ) {
        throw "Ready marker identity, scenario, or final view did not match."
    }

    $closeRequestAccepted = $launchedProcess.CloseMainWindow()
    Start-Sleep -Milliseconds 750
    if (-not $closeRequestAccepted -or $launchedProcess.HasExited) {
        throw "The main window did not close to the tray."
    }

    if ($mode -eq "seven-day") {
        [void](Assert-SevenDayAcPower)
        $executionStateHeld = Enter-SevenDayExecutionState
    }

    $processorCount = [Environment]::ProcessorCount
    $launchedProcess.Refresh()
    $cpuStartMs = $launchedProcess.TotalProcessorTime.TotalMilliseconds
    $measurement = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Checkpoint `
        -Status "running" `
        -StartedAt $startedAt `
        -ProcessId $launchedProcess.Id `
        -Samples @()

    while ($measurement.Elapsed.TotalMinutes -lt $DurationMinutes) {
        Start-Sleep -Seconds $SampleIntervalSeconds
        if ($mode -eq "seven-day") {
            [void](Assert-SevenDayAcPower)
            $executionStateHeld = Enter-SevenDayExecutionState
        }
        if ($launchedProcess.HasExited) {
            throw "WeatherPoem exited during long-run sampling."
        }
        $launchedProcess.Refresh()
        $currentSample = [pscustomobject][ordered]@{
            elapsedSeconds = [Math]::Round(
                $measurement.Elapsed.TotalSeconds,
                2
            )
            workingSetMiB = [Math]::Round(
                $launchedProcess.WorkingSet64 / 1MB,
                2
            )
            totalProcessorTimeMs = [Math]::Round(
                $launchedProcess.TotalProcessorTime.TotalMilliseconds,
                2
            )
            recordedAt = [DateTime]::UtcNow.ToString("o")
        }
        $previousSample = if ($samples.Count -gt 0) {
            $samples[$samples.Count - 1]
        }
        else {
            $null
        }
        if ($mode -eq "seven-day") {
            Assert-SevenDaySampleContinuity `
                -EvidenceMode $mode `
                -PreviousSample $previousSample `
                -CurrentSample $currentSample
        }
        $samples.Add($currentSample)
        Write-Checkpoint `
            -Status "running" `
            -StartedAt $startedAt `
            -ProcessId $launchedProcess.Id `
            -Samples ($samples.ToArray())
    }

    $launchedProcess.Refresh()
    $actualDurationMs = $measurement.Elapsed.TotalMilliseconds
    $cpuDeltaMs = (
        $launchedProcess.TotalProcessorTime.TotalMilliseconds -
        $cpuStartMs
    )
    $cpuAveragePercent = (
        $cpuDeltaMs /
        ($actualDurationMs * $processorCount)
    ) * 100
    $memoryValues = [double[]]@(
        $samples | ForEach-Object { $_.workingSetMiB }
    )
    $memoryP95 = Get-Percentile95 -Values $memoryValues
    $memoryGrowth = $memoryValues[$memoryValues.Count - 1] - $memoryValues[0]
    $durationSatisfied = (
        $actualDurationMs -ge ($DurationMinutes * 60 * 1000)
    )
    $cpuSatisfied = $cpuAveragePercent -lt 0.2
    $memorySatisfied = $memoryP95 -lt 100
    $memoryGrowthSatisfied = $memoryGrowth -lt 20
    $measurementSatisfied = (
        $durationSatisfied -and
        $cpuSatisfied -and
        $memorySatisfied -and
        $memoryGrowthSatisfied -and
        -not $launchedProcess.HasExited
    )
    $eightHourMeasured = (
        -not $Rehearsal -and
        $actualDurationMs -ge (480 * 60 * 1000)
    )
    $sevenDayMeasured = (
        $mode -eq "seven-day" -and
        $actualDurationMs -ge (10080 * 60 * 1000)
    )
    $artifact = Get-Item -LiteralPath $exePath
    $artifactHash = (
        Get-FileHash -LiteralPath $exePath -Algorithm SHA256
    ).Hash.ToUpperInvariant()

    $report = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        appVersion = $appVersion
        generatedAt = [DateTime]::UtcNow.ToString("o")
        testKind = $testKind
        artifact = [ordered]@{
            path = "src-tauri/target/release/weatherpoem.exe"
            sha256 = $artifactHash
            sizeBytes = [long]$artifact.Length
        }
        configuration = [ordered]@{
            mode = $mode
            requestedDurationMinutes = $DurationMinutes
            sampleIntervalSeconds = $SampleIntervalSeconds
            processorCount = $processorCount
            isolatedProfile = $true
            controlledScenario = "weather-offline"
            realUserDataTouched = $false
            closedToTray = $true
        }
        startup = [ordered]@{
            readyView = [string]$marker.readyView
            readyMode = [string]$marker.readyMode
            performanceScenario = [string]$marker.performanceScenario
            nativeReadyMs = [double]$marker.nativeReadyMs
            frontendReadyMs = [double]$marker.frontendReadyMs
            viewRenderMs = [double]$marker.viewRenderMs
        }
        thresholds = [ordered]@{
            idleCpuAveragePercent = 0.2
            idleMemoryP95MiB = 100
            memoryGrowthMiB = 20
        }
        results = [ordered]@{
            actualDurationSeconds = [Math]::Round(
                $actualDurationMs / 1000,
                2
            )
            sampleCount = $samples.Count
            samples = @($samples.ToArray())
            closeRequestAccepted = [bool]$closeRequestAccepted
            processStayedAlive = (-not $launchedProcess.HasExited)
            cpuTimeDeltaMs = [Math]::Round($cpuDeltaMs, 2)
            cpuAveragePercent = [Math]::Round($cpuAveragePercent, 4)
            memoryP95MiB = [Math]::Round($memoryP95, 2)
            memoryGrowthMiB = [Math]::Round($memoryGrowth, 2)
            durationSatisfied = $durationSatisfied
            cpuThresholdSatisfied = $cpuSatisfied
            memoryThresholdSatisfied = $memorySatisfied
            memoryGrowthThresholdSatisfied = $memoryGrowthSatisfied
        }
        limitations = [ordered]@{
            eightHourIdleMeasured = $eightHourMeasured
            sevenDayLongRunMeasured = $sevenDayMeasured
            sleepWakeMeasured = $false
            realNetworkMeasured = $false
            namedQualitySignoff = $false
        }
        gateSatisfied = $false
        result = if ($measurementSatisfied) {
            $passedResult
        }
        else {
            $failedResult
        }
    }
    if ($mode -eq "seven-day") {
        $report["runId"] = $RunId
    }
    [System.IO.Directory]::CreateDirectory(
        (Split-Path -Parent $reportPath)
    ) | Out-Null
    [System.IO.File]::WriteAllText(
        $reportPath,
        ($report | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Checkpoint `
        -Status "completed" `
        -StartedAt $startedAt `
        -ProcessId $launchedProcess.Id `
        -Samples ($samples.ToArray()) `
        -Message $reportName
    if (-not $measurementSatisfied) {
        throw "Long-run thresholds were not met. Inspect $reportPath"
    }
    Write-Host "Long-run performance measurement passed: $reportPath"
}
catch {
    $failedProcessId = if ($null -eq $launchedProcess) {
        0
    }
    else {
        $launchedProcess.Id
    }
    Write-Checkpoint `
        -Status "failed" `
        -StartedAt $startedAt `
        -ProcessId $failedProcessId `
        -Samples ($samples.ToArray()) `
        -Message $_.Exception.Message
    throw
}
finally {
    try {
        if ($null -ne $launchedProcess) {
            Stop-LaunchedProcess -LaunchedProcess $launchedProcess
        }
    }
    finally {
        if ($mode -eq "seven-day") {
            $released = Exit-SevenDayExecutionState `
                -Held $executionStateHeld
            if (-not $released) {
                [Console]::Error.WriteLine(
                    "Could not release the seven-day system sleep requirement."
                )
            }
            $executionStateHeld = $false
        }
    }
    $resolvedRunRoot = [System.IO.Path]::GetFullPath($runRoot)
    if (
        $resolvedRunRoot.StartsWith(
            $tempPrefix,
            [System.StringComparison]::OrdinalIgnoreCase
        ) -and
        (Split-Path -Leaf $resolvedRunRoot).StartsWith(
            "WeatherPoem.Performance.LongRun.",
            [System.StringComparison]::Ordinal
        )
    ) {
        if (Test-Path -LiteralPath $resolvedRunRoot) {
            $removed = $false
            for ($attempt = 1; $attempt -le 10; $attempt++) {
                try {
                    Remove-Item `
                        -LiteralPath $resolvedRunRoot `
                        -Recurse `
                        -Force `
                        -ErrorAction Stop
                    $removed = $true
                    break
                }
                catch {
                    if ($attempt -lt 10) {
                        Start-Sleep -Milliseconds 500
                    }
                }
            }
            if (-not $removed) {
                [Console]::Error.WriteLine(
                    "Could not remove the isolated seven-day profile after ten retries: $resolvedRunRoot"
                )
            }
        }
    }
}
