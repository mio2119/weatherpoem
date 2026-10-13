param(
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,39}$')]
    [string]$CandidateName = 'motion-probe-20261013'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactRelativePath = ".work/redesign-$CandidateName/release/weatherpoem.exe"
$exePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $artifactRelativePath))
$seedScript = Join-Path $projectRoot 'scripts/seed-performance-profile.mjs'
$reportPath = Join-Path $projectRoot "review/redesign/evidence/T07_MOTION_RESOURCE_$CandidateName.json"
$resourceSeconds = 60
$sampleIntervalMs = 1000
$warmupSeconds = 5
$scenario = 'scene-rain'

if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Internal EXE not found: $exePath"
}
$runningProduct = @(Get-Process -Name 'weatherpoem' -ErrorAction SilentlyContinue)
if ($runningProduct.Count -gt 0) {
    throw "WeatherPoem is already running; refusing to overlap resource runs: $(($runningProduct.Id) -join ', ')"
}

$exeHash = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToUpperInvariant()
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempPrefix = $tempBase.TrimEnd('\') + '\'
$runRoot = [System.IO.Path]::GetFullPath((Join-Path $tempBase ("WeatherPoem.Performance.MotionCompare." + [Guid]::NewGuid().ToString('N'))))
if (-not $runRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $runRoot) -notlike 'WeatherPoem.Performance.MotionCompare.*' -or
    (Test-Path -LiteralPath $runRoot)) {
    throw "Unexpected isolated root: $runRoot"
}
[System.IO.Directory]::CreateDirectory($runRoot) | Out-Null
$profilePath = Join-Path $runRoot 'profile'
[System.IO.Directory]::CreateDirectory($profilePath) | Out-Null

function Get-P95 {
    param([double[]]$Values)
    if ($Values.Count -eq 0) { throw 'P95 needs samples.' }
    $ordered = @($Values | Sort-Object)
    return [double]$ordered[[Math]::Ceiling($ordered.Count * 0.95) - 1]
}

function Stop-ExactProcess {
    param([System.Diagnostics.Process]$Process)
    if ($null -eq $Process) { return }
    try {
        if (-not $Process.HasExited) {
            $Process.Kill()
            if (-not $Process.WaitForExit(5000)) {
                throw "Launched process $($Process.Id) did not exit."
            }
        }
    }
    finally { $Process.Dispose() }
}

function Read-ProfileState {
    $json = & node $seedScript --inspect $profilePath
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect isolated database.' }
    return ($json | ConvertFrom-Json)
}

function Get-ResourceSnapshot {
    param([int]$MainPid)
    $main = Get-Process -Id $MainPid -ErrorAction Stop
    if ([System.IO.Path]::GetFullPath($main.Path) -ne $exePath) {
        throw "Main process path changed for PID $MainPid."
    }
    $webviews = @(
        Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" |
            Where-Object {
                $null -ne $_.CommandLine -and
                $_.CommandLine.IndexOf($profilePath, [StringComparison]::OrdinalIgnoreCase) -ge 0
            }
    )
    $rows = [System.Collections.Generic.List[object]]::new()
    $main.Refresh()
    $rows.Add([pscustomobject]@{
        pid = $MainPid
        role = 'main'
        cpuMs = [Math]::Round($main.TotalProcessorTime.TotalMilliseconds, 2)
        memoryMiB = [Math]::Round($main.WorkingSet64 / 1MB, 2)
    })
    foreach ($webview in $webviews) {
        $child = Get-Process -Id ([int]$webview.ProcessId) -ErrorAction SilentlyContinue
        if ($null -eq $child) { continue }
        $role = if ($webview.CommandLine -match '--type=renderer(?:\s|$)') { 'renderer' } else { 'webview' }
        $rows.Add([pscustomobject]@{
            pid = [int]$webview.ProcessId
            role = $role
            cpuMs = [Math]::Round($child.TotalProcessorTime.TotalMilliseconds, 2)
            memoryMiB = [Math]::Round($child.WorkingSet64 / 1MB, 2)
        })
    }
    $processRows = @($rows.ToArray() | Sort-Object pid)
    $rendererCount = @($processRows | Where-Object role -eq 'renderer').Count
    if ($rendererCount -lt 1) { throw 'No WebView2 renderer was found in the isolated profile.' }
    return [pscustomobject]@{
        atUtc = [DateTime]::UtcNow.ToString('o')
        processes = $processRows
        rendererCount = $rendererCount
        memoryMiB = [Math]::Round((($processRows | Measure-Object memoryMiB -Sum).Sum), 2)
    }
}

function Start-IsolatedScene {
    param([bool]$ReduceMotion)
    if ($ReduceMotion) { & node $seedScript --reduce-motion $profilePath | Out-Null }
    else { & node $seedScript $profilePath | Out-Null }
    if ($LASTEXITCODE -ne 0) { throw 'Failed to seed isolated settings.' }
    $settings = (Read-ProfileState).settings
    if ([bool]$settings.reduceMotion -ne $ReduceMotion -or
        [bool]$settings.anonymousMetrics -or [bool]$settings.autostart) {
        throw 'Isolated settings are not what the comparison requires.'
    }

    $tempPath = Join-Path $profilePath 'temp'
    $appData = Join-Path $profilePath 'appdata'
    $localAppData = Join-Path $profilePath 'localappdata'
    $markerDirectory = Join-Path $tempPath ('probe-' + [Guid]::NewGuid().ToString('N'))
    foreach ($directory in @($tempPath, $appData, $localAppData, $markerDirectory)) {
        [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    }
    $markerPath = Join-Path $markerDirectory 'weatherpoem-performance-ready.json'
    $runId = [Guid]::NewGuid().ToString('D')
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $exePath
    $startInfo.WorkingDirectory = Split-Path -Parent $exePath
    $startInfo.UseShellExecute = $false
    $startInfo.EnvironmentVariables['APPDATA'] = $appData
    $startInfo.EnvironmentVariables['LOCALAPPDATA'] = $localAppData
    $startInfo.EnvironmentVariables['WEATHERPOEM_PERFORMANCE_PROFILE'] = $profilePath
    $startInfo.EnvironmentVariables['WEATHERPOEM_PERFORMANCE_PROBE'] = $markerPath
    $startInfo.EnvironmentVariables['WEATHERPOEM_PERFORMANCE_RUN_ID'] = $runId
    $startInfo.EnvironmentVariables['WEATHERPOEM_PERFORMANCE_SCENARIO'] = $scenario
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { $process.Dispose(); throw 'Failed to start internal EXE.' }

    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        while (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
            if ($process.HasExited) { throw "EXE exited before scene ready: $($process.ExitCode)" }
            if ([DateTime]::UtcNow -ge $deadline) { throw 'Scene did not emit ready marker within 15 seconds.' }
            Start-Sleep -Milliseconds 50
        }
        $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$marker.schemaVersion -ne '1.2' -or
            [string]$marker.runId -ne $runId -or
            [int]$marker.processId -ne $process.Id -or
            [string]$marker.performanceScenario -ne $scenario -or
            [string]$marker.readyView -ne 'poem') {
            throw 'Ready marker does not identify the expected isolated poem scene.'
        }
        $sceneMotion = $marker.sceneMotion
        if ($null -eq $sceneMotion -or
            [string]$sceneMotion.sceneKind -ne 'rain' -or
            -not [bool]$sceneMotion.sceneActive -or
            [string]$sceneMotion.visibilityState -ne 'visible' -or
            [bool]$sceneMotion.systemReduced -or
            [bool]$sceneMotion.appReduced -ne $ReduceMotion) {
            throw 'Computed scene or system motion state is not suitable for this comparison.'
        }
        if ($ReduceMotion) {
            if ([string]$sceneMotion.animationName -ne 'none') {
                throw 'Static preference still has a running scene animation.'
            }
        }
        elseif ([string]$sceneMotion.animationName -ne 'scene-drift' -or
            [string]$sceneMotion.animationIterationCount -ne 'infinite' -or
            [string]$sceneMotion.animationDuration -ne '16s') {
            throw 'Expected rain animation is not active in the native WebView.'
        }
        return [pscustomobject]@{ process = $process; marker = $marker; runId = $runId }
    }
    catch {
        Stop-ExactProcess -Process $process
        throw
    }
}

function Measure-Scene {
    param([string]$Label, [bool]$ReduceMotion)
    $launch = Start-IsolatedScene -ReduceMotion $ReduceMotion
    try {
        Write-Host "Measuring $Label (PID $($launch.process.Id), 60 seconds)..."
        Start-Sleep -Seconds $warmupSeconds
        $initial = Get-ResourceSnapshot -MainPid $launch.process.Id
        $previous = $initial
        $initialIds = @($initial.processes | ForEach-Object pid)
        $samples = [System.Collections.Generic.List[object]]::new()
        $cpuDeltaMs = 0.0
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        for ($index = 1; $index -le $resourceSeconds; $index++) {
            Start-Sleep -Milliseconds $sampleIntervalMs
            if ($launch.process.HasExited) { throw "EXE exited during $Label measurement." }
            $current = Get-ResourceSnapshot -MainPid $launch.process.Id
            $currentIds = @($current.processes | ForEach-Object pid)
            if (@(Compare-Object -ReferenceObject $initialIds -DifferenceObject $currentIds).Count -gt 0) {
                throw "WebView2 process set changed during $Label measurement."
            }
            $intervalCpuMs = 0.0
            foreach ($row in $current.processes) {
                $prior = @($previous.processes | Where-Object pid -eq $row.pid)[0]
                $delta = [double]$row.cpuMs - [double]$prior.cpuMs
                if ($delta -lt 0) { throw "CPU time went backward for PID $($row.pid)." }
                $intervalCpuMs += $delta
            }
            $cpuDeltaMs += $intervalCpuMs
            $samples.Add([pscustomobject]@{
                index = $index
                atUtc = $current.atUtc
                elapsedMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 2)
                cpuDeltaMs = [Math]::Round($intervalCpuMs, 2)
                memoryMiB = $current.memoryMiB
                rendererCount = $current.rendererCount
            })
            $previous = $current
        }
        $wallTimeMs = $timer.Elapsed.TotalMilliseconds
        $memoryValues = [double[]]@($samples | ForEach-Object memoryMiB)
        $state = Read-ProfileState
        if ($null -eq $state.dailyState -or [string]::IsNullOrWhiteSpace([string]$state.dailyState.work_id)) {
            throw "No selected daily poem was stored during $Label run."
        }
        return [ordered]@{
            label = $Label
            reduceMotion = $ReduceMotion
            runId = $launch.runId
            readyMarker = $launch.marker
            dailyState = $state.dailyState
            warmupSeconds = $warmupSeconds
            durationSeconds = [Math]::Round($wallTimeMs / 1000, 2)
            sampleCount = $samples.Count
            processIds = $initialIds
            rendererCount = $initial.rendererCount
            processorCount = [Environment]::ProcessorCount
            cpuTimeDeltaMs = [Math]::Round($cpuDeltaMs, 2)
            cpuAveragePercent = [Math]::Round(($cpuDeltaMs / ($wallTimeMs * [Environment]::ProcessorCount)) * 100, 4)
            memoryP95MiB = [Math]::Round((Get-P95 -Values $memoryValues), 2)
            samples = @($samples.ToArray())
        }
    }
    finally { Stop-ExactProcess -Process $launch.process }
}

$testFailure = $null
try {
    $static = Measure-Scene -Label 'static' -ReduceMotion $true
    Start-Sleep -Seconds 2
    $motion = Measure-Scene -Label 'motion' -ReduceMotion $false
    $samePoem = $static.dailyState.local_date -eq $motion.dailyState.local_date -and
        $static.dailyState.work_id -eq $motion.dailyState.work_id
    $cpuDelta = [Math]::Round($motion.cpuAveragePercent - $static.cpuAveragePercent, 4)
    $memoryDelta = [Math]::Round($motion.memoryP95MiB - $static.memoryP95MiB, 2)
    $thresholdSatisfied = $samePoem -and $static.sampleCount -ge 60 -and $motion.sampleCount -ge 60 -and
        $static.durationSeconds -ge 60 -and $motion.durationSeconds -ge 60 -and
        $cpuDelta -le 2.0 -and $memoryDelta -le 20.0
    $report = [ordered]@{
        schemaVersion = '1.1'
        testKind = 'isolated-motion-resource-comparison'
        generatedAt = [DateTime]::UtcNow.ToString('o')
        artifact = [ordered]@{ path = $artifactRelativePath; sha256 = $exeHash }
        scenario = $scenario
        isolation = [ordered]@{
            profile = 'system-temp-only'
            realUserDataTouched = $false
            sameProfileForBothRuns = $true
            order = @('static', 'motion')
        }
        thresholds = [ordered]@{ cpuIncreasePercentagePoints = 2.0; memoryP95IncreaseMiB = 20.0 }
        results = [ordered]@{
            static = $static
            motion = $motion
            samePoemAndLocalDate = $samePoem
            cpuIncreasePercentagePoints = $cpuDelta
            memoryP95IncreaseMiB = $memoryDelta
            resourceThresholdSatisfied = $thresholdSatisfied
        }
        limitations = [ordered]@{
            syntheticWeatherNotRealLocalWeather = $true
            visibleMotionRecordingCaptured = $false
            systemReducedMotionMediaQueryChecked = $true
            computedSceneAnimationVerified = $true
            a7OverallSatisfied = $false
        }
        result = if ($thresholdSatisfied) { 'resource-comparison-passed' } else { 'resource-comparison-failed' }
    }
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $reportPath)) | Out-Null
    [System.IO.File]::WriteAllText(
        $reportPath,
        (($report | ConvertTo-Json -Depth 16) + [Environment]::NewLine),
        [System.Text.UTF8Encoding]::new($false)
    )
    if (-not $thresholdSatisfied) { throw "Resource comparison failed; see $reportPath" }
    Write-Host "Resource comparison passed: $reportPath"
}
catch {
    $testFailure = $_
    throw
}
finally {
    $resolvedRoot = [System.IO.Path]::GetFullPath($runRoot)
    if (-not $resolvedRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $resolvedRoot) -notlike 'WeatherPoem.Performance.MotionCompare.*') {
        throw "Refusing to clean unexpected path: $resolvedRoot"
    }
    foreach ($attempt in 1..16) {
        try {
            Remove-Item -LiteralPath $resolvedRoot -Recurse -Force -ErrorAction Stop
            break
        }
        catch {
            if ($attempt -eq 16) {
                if ($null -ne $testFailure) {
                    Write-Warning "Isolated data remained locked: $resolvedRoot. Original failure is preserved."
                    break
                }
                throw "Isolated data remained locked: $resolvedRoot"
            }
            Start-Sleep -Milliseconds 750
        }
    }
}
