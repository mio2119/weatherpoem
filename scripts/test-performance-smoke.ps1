param(
    [ValidateRange(10, 100)]
    [int]$StartupSamples = 10,

    [ValidateRange(10, 100)]
    [int]$ContentSamples = 10,

    [ValidateRange(60, 3600)]
    [int]$ResourceSeconds = 60,

    [ValidateRange(500, 5000)]
    [int]$SampleIntervalMs = 1000,

    [switch]$RedesignCandidate,

    [switch]$BaselineComparison,

    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,39}$')]
    [string]$CandidateName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$securityModule = Join-Path $PSHOME "Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1"
Import-Module -Name $securityModule -ErrorAction Stop
$utilityModule = Join-Path $PSHOME "Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1"
Import-Module -Name $utilityModule -ErrorAction Stop
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$appVersion = [string]$packageJson.version
if ($RedesignCandidate -and $BaselineComparison) {
    throw "RedesignCandidate and BaselineComparison are mutually exclusive."
}
if ($PSBoundParameters.ContainsKey('CandidateName') -and
    ([string]::IsNullOrWhiteSpace($CandidateName) -or $CandidateName -eq 'target')) {
    throw "CandidateName must be a nonempty new candidate name, not target."
}
if ($CandidateName -and ($RedesignCandidate -or $BaselineComparison)) {
    throw "CandidateName cannot be combined with another candidate switch."
}
if ($CandidateName) {
    $artifactPath = ".work/redesign-$CandidateName/release/weatherpoem.exe"
    $reportRelativePath = "review/redesign/evidence/T09_PERFORMANCE_SMOKE_$CandidateName.json"
}
elseif ($RedesignCandidate) {
    $artifactPath = ".work/redesign-target/release/weatherpoem.exe"
    $reportRelativePath = "review/redesign/evidence/T09_PERFORMANCE_SMOKE.json"
}
elseif ($BaselineComparison) {
    $artifactPath = "src-tauri/target/release/weatherpoem.exe"
    $reportRelativePath = "review/redesign/evidence/T09_BASELINE_PERFORMANCE_SMOKE.json"
}
else {
    $artifactPath = "src-tauri/target/release/weatherpoem.exe"
    $reportRelativePath = "output/WeatherPoem_0.2.0_PERFORMANCE_SMOKE.json"
}
$exePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $artifactPath))
$reportPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $reportRelativePath))
$seedScript = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "scripts\seed-performance-profile.mjs"))

if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Release EXE not found. Run npm run tauri:build first: $exePath"
}

$runningProduct = @(Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue)
if ($runningProduct.Count -gt 0) {
    $runningIds = ($runningProduct | ForEach-Object { $_.Id }) -join ", "
    throw "WeatherPoem is already running (PID: $runningIds). Exit it before the isolated performance smoke."
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempPrefix = $tempBase.TrimEnd("\") + "\"
$runRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $tempBase ("WeatherPoem.Performance." + [System.Guid]::NewGuid().ToString("N")))
)
if (-not $runRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved performance directory is outside the system temporary directory: $runRoot"
}
if (Test-Path -LiteralPath $runRoot) {
    throw "Performance directory unexpectedly already exists: $runRoot"
}
[System.IO.Directory]::CreateDirectory($runRoot) | Out-Null

function Get-Percentile95 {
    param([double[]]$Values)
    if ($Values.Count -eq 0) {
        throw "Cannot calculate P95 from an empty sample."
    }
    $sorted = @($Values | Sort-Object)
    $index = [Math]::Max(0, [Math]::Ceiling($sorted.Count * 0.95) - 1)
    return [double]$sorted[$index]
}

function Stop-LaunchedProcess {
    param([System.Diagnostics.Process]$Process)
    if ($null -eq $Process) {
        return
    }
    try {
        if (-not $Process.HasExited) {
            $Process.Kill()
            if (-not $Process.WaitForExit(5000)) {
                throw "Launched WeatherPoem process did not exit after termination."
            }
        }
    }
    finally {
        $Process.Dispose()
    }
}

function Start-IsolatedProbe {
    param(
        [string]$ProfilePath,
        [string]$RunId,
        [string]$SampleLabel,
        [switch]$Configured
    )

    $appData = Join-Path $ProfilePath "appdata"
    $localAppData = Join-Path $ProfilePath "localappdata"
    $tempPath = Join-Path $ProfilePath "temp"
    $probeDirectory = Join-Path $tempPath "probe"
    foreach ($directory in @($appData, $localAppData, $tempPath, $probeDirectory)) {
        [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    }
    if ($Configured) {
        & node $seedScript $ProfilePath | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to seed the isolated configured performance profile."
        }
    }
    $markerPath = Join-Path $probeDirectory "weatherpoem-performance-ready.json"

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $exePath
    $startInfo.WorkingDirectory = Split-Path -Parent $exePath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $false
    $startInfo.EnvironmentVariables["APPDATA"] = $appData
    $startInfo.EnvironmentVariables["LOCALAPPDATA"] = $localAppData
    $startInfo.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_PROFILE"] = $ProfilePath
    $startInfo.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_PROBE"] = $markerPath
    $startInfo.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_RUN_ID"] = $RunId

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    if (-not $process.Start()) {
        $process.Dispose()
        throw "Failed to start release EXE."
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        if ($process.HasExited) {
            $exitCode = $process.ExitCode
            Stop-LaunchedProcess -Process $process
            throw "WeatherPoem exited before the ready marker (exit code $exitCode)."
        }
        if ([DateTime]::UtcNow -ge $deadline) {
            Stop-LaunchedProcess -Process $process
            throw "WeatherPoem did not emit the ready marker within 15 seconds ($SampleLabel)."
        }
        Start-Sleep -Milliseconds 20
    }
    $observedReadyMs = $stopwatch.Elapsed.TotalMilliseconds
    $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$marker.schemaVersion -ne "1.2") {
        Stop-LaunchedProcess -Process $process
        throw "Ready marker schema mismatch."
    }
    if ([string]$marker.runId -ne $RunId) {
        Stop-LaunchedProcess -Process $process
        throw "Ready marker run ID mismatch."
    }
    if ([int]$marker.processId -ne $process.Id) {
        Stop-LaunchedProcess -Process $process
        throw "Ready marker process ID mismatch."
    }
    if ([string]$marker.appVersion -ne $appVersion) {
        Stop-LaunchedProcess -Process $process
        throw "Ready marker app version mismatch."
    }
    if (
        [string]::IsNullOrWhiteSpace([string]$marker.readyView) -or
        [string]::IsNullOrWhiteSpace([string]$marker.readyMode)
    ) {
        Stop-LaunchedProcess -Process $process
        throw "Ready marker final view classification is missing."
    }
    $viewRenderMs = [double]$marker.viewRenderMs
    if (
        [double]::IsNaN($viewRenderMs) -or
        [double]::IsInfinity($viewRenderMs) -or
        $viewRenderMs -lt 0 -or
        $viewRenderMs -gt [double]$marker.frontendReadyMs
    ) {
        Stop-LaunchedProcess -Process $process
        throw "Ready marker view render time is invalid."
    }

    return [pscustomobject]@{
        Process = $process
        ObservedReadyMs = [Math]::Round($observedReadyMs, 2)
        NativeReadyMs = [Math]::Round([double]$marker.nativeReadyMs, 2)
        FrontendReadyMs = [Math]::Round([double]$marker.frontendReadyMs, 2)
        ReadyView = [string]$marker.readyView
        ReadyMode = [string]$marker.readyMode
        ViewRenderMs = [Math]::Round($viewRenderMs, 2)
    }
}

$startupResults = [System.Collections.Generic.List[object]]::new()
$contentResults = [System.Collections.Generic.List[object]]::new()
$idleProcess = $null
$testFailure = $null
try {
    for ($index = 1; $index -le $StartupSamples; $index++) {
        $profilePath = Join-Path $runRoot ("startup-" + $index.ToString("00"))
        [System.IO.Directory]::CreateDirectory($profilePath) | Out-Null
        $probe = Start-IsolatedProbe -ProfilePath $profilePath -RunId ([System.Guid]::NewGuid().ToString("D")) -SampleLabel "startup-$index"
        try {
            if ($probe.ReadyView -ne "onboarding" -or $probe.ReadyMode -ne "local-onboarding") {
                throw "Clean profile did not render onboarding as its final view."
            }
            $startupResults.Add([pscustomobject]@{
                observedReadyMs = $probe.ObservedReadyMs
                nativeReadyMs = $probe.NativeReadyMs
                frontendReadyMs = $probe.FrontendReadyMs
            })
        }
        finally {
            Stop-LaunchedProcess -Process $probe.Process
        }
        Start-Sleep -Milliseconds 250
    }

    for ($index = 1; $index -le $ContentSamples; $index++) {
        $profilePath = Join-Path $runRoot ("content-" + $index.ToString("00"))
        [System.IO.Directory]::CreateDirectory($profilePath) | Out-Null
        $probe = Start-IsolatedProbe `
            -ProfilePath $profilePath `
            -RunId ([System.Guid]::NewGuid().ToString("D")) `
            -SampleLabel "content-$index" `
            -Configured
        try {
            $contentResults.Add([pscustomobject]@{
                observedReadyMs = $probe.ObservedReadyMs
                nativeReadyMs = $probe.NativeReadyMs
                frontendReadyMs = $probe.FrontendReadyMs
                readyView = $probe.ReadyView
                readyMode = $probe.ReadyMode
                viewRenderMs = $probe.ViewRenderMs
            })
        }
        finally {
            Stop-LaunchedProcess -Process $probe.Process
        }
        Start-Sleep -Milliseconds 250
    }

    $idleProfile = Join-Path $runRoot "idle"
    [System.IO.Directory]::CreateDirectory($idleProfile) | Out-Null
    $idleProbe = Start-IsolatedProbe -ProfilePath $idleProfile -RunId ([System.Guid]::NewGuid().ToString("D")) -SampleLabel "idle"
    $idleProcess = $idleProbe.Process
    $closeRequestAccepted = $idleProcess.CloseMainWindow()
    Start-Sleep -Milliseconds 750
    if ($idleProcess.HasExited) {
        throw "WeatherPoem exited after close request instead of remaining available in the tray."
    }

    $processorCount = [Environment]::ProcessorCount
    $idleProcess.Refresh()
    $cpuStartMs = $idleProcess.TotalProcessorTime.TotalMilliseconds
    $measurement = [System.Diagnostics.Stopwatch]::StartNew()
    $memorySamples = [System.Collections.Generic.List[double]]::new()
    while ($measurement.Elapsed.TotalSeconds -lt $ResourceSeconds) {
        Start-Sleep -Milliseconds $SampleIntervalMs
        if ($idleProcess.HasExited) {
            throw "WeatherPoem exited during the idle resource smoke."
        }
        $idleProcess.Refresh()
        $memorySamples.Add([Math]::Round($idleProcess.WorkingSet64 / 1MB, 2))
    }
    $idleProcess.Refresh()
    $wallTimeMs = $measurement.Elapsed.TotalMilliseconds
    $cpuTimeDeltaMs = $idleProcess.TotalProcessorTime.TotalMilliseconds - $cpuStartMs
    $cpuAveragePercent = ($cpuTimeDeltaMs / ($wallTimeMs * $processorCount)) * 100
    $memoryValues = [double[]]$memorySamples.ToArray()

    $observedReadyValues = [double[]]@($startupResults | ForEach-Object { $_.observedReadyMs })
    $nativeReadyValues = [double[]]@($startupResults | ForEach-Object { $_.nativeReadyMs })
    $frontendReadyValues = [double[]]@($startupResults | ForEach-Object { $_.frontendReadyMs })
    $observedReadyP95 = Get-Percentile95 -Values $observedReadyValues
    $nativeReadyP95 = Get-Percentile95 -Values $nativeReadyValues
    $frontendReadyP95 = Get-Percentile95 -Values $frontendReadyValues
    $contentObservedReadyValues = [double[]]@($contentResults | ForEach-Object { $_.observedReadyMs })
    $contentNativeReadyValues = [double[]]@($contentResults | ForEach-Object { $_.nativeReadyMs })
    $contentFrontendReadyValues = [double[]]@($contentResults | ForEach-Object { $_.frontendReadyMs })
    $contentViewRenderValues = [double[]]@($contentResults | ForEach-Object { $_.viewRenderMs })
    $contentReadyViews = @($contentResults | ForEach-Object { $_.readyView })
    $contentReadyModes = @($contentResults | ForEach-Object { $_.readyMode })
    $contentObservedReadyP95 = Get-Percentile95 -Values $contentObservedReadyValues
    $contentNativeReadyP95 = Get-Percentile95 -Values $contentNativeReadyValues
    $contentFrontendReadyP95 = Get-Percentile95 -Values $contentFrontendReadyValues
    $contentViewRenderP95 = Get-Percentile95 -Values $contentViewRenderValues
    $onlineObservedReadyValues = [double[]]@(
        $contentResults |
            Where-Object { $_.readyMode -eq "live-weather" } |
            ForEach-Object { $_.observedReadyMs }
    )
    $degradedObservedReadyValues = [double[]]@(
        $contentResults |
            Where-Object { $_.readyMode -eq "offline-rules" } |
            ForEach-Object { $_.observedReadyMs }
    )
    $onlineObservedReadyP95 = if ($onlineObservedReadyValues.Count -gt 0) {
        Get-Percentile95 -Values $onlineObservedReadyValues
    }
    else {
        $null
    }
    $degradedObservedReadyP95 = if ($degradedObservedReadyValues.Count -gt 0) {
        Get-Percentile95 -Values $degradedObservedReadyValues
    }
    else {
        $null
    }
    $memoryP95 = Get-Percentile95 -Values $memoryValues

    $cleanStartupThresholdMs = 2000.0
    $contentFirstFrameThresholdMs = 300.0
    $onlineReadyThresholdMs = 5000.0
    $degradedReadyThresholdMs = 2000.0
    $idleCpuThresholdPercent = 0.2
    $idleMemoryThresholdMiB = 100.0
    $startupPassed = $observedReadyP95 -le $cleanStartupThresholdMs
    $poemFirstFrameMeasured = (
        @($contentReadyViews | Where-Object { $_ -eq "poem" }).Count -eq $ContentSamples
    )
    $poemFirstFramePassed = (
        $poemFirstFrameMeasured -and
        $contentViewRenderP95 -le $contentFirstFrameThresholdMs
    )
    $onlineReadyMeasured = $onlineObservedReadyValues.Count -gt 0
    $degradedReadyMeasured = $degradedObservedReadyValues.Count -gt 0
    $onlineReadyPassed = (
        $onlineReadyMeasured -and
        $onlineObservedReadyP95 -le $onlineReadyThresholdMs
    )
    $degradedReadyPassed = (
        $degradedReadyMeasured -and
        $degradedObservedReadyP95 -le $degradedReadyThresholdMs
    )
    $supportedModeCount = @(
        $contentReadyModes |
            Where-Object { $_ -eq "live-weather" -or $_ -eq "offline-rules" }
    ).Count
    $preparationPassed = (
        ($onlineReadyMeasured -or $degradedReadyMeasured) -and
        $supportedModeCount -eq $ContentSamples -and
        (-not $onlineReadyMeasured -or $onlineReadyPassed) -and
        (-not $degradedReadyMeasured -or $degradedReadyPassed)
    )
    $cpuPassed = $cpuAveragePercent -lt $idleCpuThresholdPercent
    $memoryPassed = $memoryP95 -lt $idleMemoryThresholdMiB

    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $signature = Get-AuthenticodeSignature -LiteralPath $exePath
    $file = Get-Item -LiteralPath $exePath
    $hash = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToUpperInvariant()
    $result = if (
        $startupPassed -and
        $poemFirstFramePassed -and
        $preparationPassed -and
        $cpuPassed -and
        $memoryPassed
    ) {
        "automated-smoke-passed"
    }
    else {
        "automated-smoke-failed"
    }

    $report = [ordered]@{
        schemaVersion = "1.2"
        product = "WeatherPoem"
        appVersion = $appVersion
        generatedAt = [DateTime]::UtcNow.ToString("o")
        testKind = "automated-performance-smoke"
        artifact = [ordered]@{
            path = $artifactPath
            sha256 = $hash
            sizeBytes = [long]$file.Length
            authenticodeStatus = [string]$signature.Status
        }
        host = [ordered]@{
            os = [string]$os.Caption
            version = [string]$os.Version
            build = [string]$os.BuildNumber
            processorCount = $processorCount
        }
        configuration = [ordered]@{
            startupSamplesRequired = $StartupSamples
            contentSamplesRequired = $ContentSamples
            resourceDurationSeconds = $ResourceSeconds
            sampleIntervalMs = $SampleIntervalMs
            cleanProfilePerStartup = $true
            seededConfiguredProfile = $true
            isolatedProfile = $true
            realUserDataTouched = $false
        }
        thresholds = [ordered]@{
            cleanStartupP95Ms = $cleanStartupThresholdMs
            contentFirstFrameP95Ms = $contentFirstFrameThresholdMs
            onlineReadyP95Ms = $onlineReadyThresholdMs
            degradedReadyP95Ms = $degradedReadyThresholdMs
            idleCpuAveragePercent = $idleCpuThresholdPercent
            idleMemoryP95MiB = $idleMemoryThresholdMiB
        }
        results = [ordered]@{
            startup = [ordered]@{
                sampleCount = $startupResults.Count
                observedReadyMs = @($observedReadyValues)
                nativeReadyMs = @($nativeReadyValues)
                frontendReadyMs = @($frontendReadyValues)
                observedReadyP95Ms = [Math]::Round($observedReadyP95, 2)
                nativeReadyP95Ms = [Math]::Round($nativeReadyP95, 2)
                frontendReadyP95Ms = [Math]::Round($frontendReadyP95, 2)
                thresholdSatisfied = $startupPassed
            }
            contentReady = [ordered]@{
                sampleCount = $contentResults.Count
                observedReadyMs = @($contentObservedReadyValues)
                nativeReadyMs = @($contentNativeReadyValues)
                frontendReadyMs = @($contentFrontendReadyValues)
                viewRenderMs = @($contentViewRenderValues)
                readyViews = @($contentReadyViews)
                readyModes = @($contentReadyModes)
                observedReadyP95Ms = [Math]::Round($contentObservedReadyP95, 2)
                nativeReadyP95Ms = [Math]::Round($contentNativeReadyP95, 2)
                frontendReadyP95Ms = [Math]::Round($contentFrontendReadyP95, 2)
                viewRenderP95Ms = [Math]::Round($contentViewRenderP95, 2)
                poemFirstFrameThresholdSatisfied = $poemFirstFramePassed
                onlineObservedReadyMs = @($onlineObservedReadyValues)
                onlineObservedReadyP95Ms = if ($null -eq $onlineObservedReadyP95) {
                    $null
                }
                else {
                    [Math]::Round([double]$onlineObservedReadyP95, 2)
                }
                onlineReadyMeasured = $onlineReadyMeasured
                onlineThresholdSatisfied = $onlineReadyPassed
                degradedObservedReadyMs = @($degradedObservedReadyValues)
                degradedObservedReadyP95Ms = if ($null -eq $degradedObservedReadyP95) {
                    $null
                }
                else {
                    [Math]::Round([double]$degradedObservedReadyP95, 2)
                }
                degradedReadyMeasured = $degradedReadyMeasured
                degradedThresholdSatisfied = $degradedReadyPassed
                preparationThresholdSatisfied = $preparationPassed
            }
            idle = [ordered]@{
                durationSeconds = $ResourceSeconds
                sampleCount = $memorySamples.Count
                closeRequestAccepted = [bool]$closeRequestAccepted
                processorCount = $processorCount
                cpuTimeDeltaMs = [Math]::Round($cpuTimeDeltaMs, 2)
                wallTimeMs = [Math]::Round($wallTimeMs, 2)
                cpuAveragePercent = [Math]::Round($cpuAveragePercent, 4)
                memorySamplesMiB = @($memoryValues)
                memoryP95MiB = [Math]::Round($memoryP95, 2)
                cpuThresholdSatisfied = $cpuPassed
                memoryThresholdSatisfied = $memoryPassed
            }
        }
        limitations = [ordered]@{
            poemFirstFrameMeasured = $poemFirstFrameMeasured
            onlineReadyMeasured = $onlineReadyMeasured
            degradedReadyMeasured = $degradedReadyMeasured
            eightHourIdleMeasured = $false
            sevenDayLongRunMeasured = $false
            contentUpdateAtomicityMeasured = $false
            eventBacklogMeasured = $false
            namedQualitySignoff = $false
        }
        gateSatisfied = $false
        result = $result
    }

    $json = $report | ConvertTo-Json -Depth 12
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $reportPath)) | Out-Null
    [System.IO.File]::WriteAllText(
        $reportPath,
        $json + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )

    if ($result -ne "automated-smoke-passed") {
        throw "Performance smoke did not meet the covered thresholds. Report: $reportPath"
    }
    Write-Host "Performance smoke passed: $reportPath"
}
catch {
    $testFailure = $_
    throw
}
finally {
    if ($null -ne $idleProcess) {
        Stop-LaunchedProcess -Process $idleProcess
    }
    $resolvedRunRoot = [System.IO.Path]::GetFullPath($runRoot)
    if (
        $resolvedRunRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedRunRoot).StartsWith("WeatherPoem.Performance.", [System.StringComparison]::Ordinal)
    ) {
        if (Test-Path -LiteralPath $resolvedRunRoot) {
            foreach ($attempt in 1..16) {
                try {
                    Remove-Item -LiteralPath $resolvedRunRoot -Recurse -Force -ErrorAction Stop
                    break
                }
                catch {
                    if ($attempt -eq 16) {
                        if ($null -ne $testFailure) {
                            Write-Warning "Isolated WebView data remained locked after performance smoke: $resolvedRunRoot. Original test failure is preserved."
                            break
                        }
                        throw "Isolated WebView data remained locked after performance smoke: $resolvedRunRoot"
                    }
                    Start-Sleep -Milliseconds 750
                }
            }
        }
    }
    else {
        throw "Refusing to clean an unexpected performance directory: $resolvedRunRoot"
    }
}
