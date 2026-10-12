param(
    [switch]$Preflight
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$utilityModule = Join-Path $PSHOME "Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"
Import-Module -Name $utilityModule -ErrorAction Stop

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packagePath = Join-Path $projectRoot "package.json"
$package = Get-Content -LiteralPath $packagePath -Raw -Encoding UTF8 |
    ConvertFrom-Json
$appVersion = [string]$package.version
$outputDirectory = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot "output")
)
$outputPrefix = $outputDirectory.TrimEnd("\") + "\"
$longRunScript = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot "test-performance-long-run.ps1")
)
$exePath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\target\release\weatherpoem.exe")
)
$releaseRelativePath = "output/WeatherPoem_${appVersion}_RELEASE.json"
$releasePath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot ($releaseRelativePath.Replace("/", "\")))
)
$launchRelativePath = "output/WeatherPoem_${appVersion}_PERFORMANCE_7D_LAUNCH.json"
$checkpointRelativePath = "output/WeatherPoem_${appVersion}_PERFORMANCE_7D_CHECKPOINT.json"
$reportRelativePath = "output/WeatherPoem_${appVersion}_PERFORMANCE_7D.json"
$launchPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot ($launchRelativePath.Replace("/", "\")))
)
$checkpointPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot ($checkpointRelativePath.Replace("/", "\")))
)
$reportPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot ($reportRelativePath.Replace("/", "\")))
)
$runtimeSupportPath = Join-Path `
    $PSScriptRoot `
    "performance-seven-day-runtime-support.ps1"
if (-not (Test-Path -LiteralPath $runtimeSupportPath -PathType Leaf)) {
    throw "Seven-day runtime support is missing."
}
. $runtimeSupportPath
$acLineStatus = Get-SevenDayAcLineStatus
$acOnline = ([byte]$acLineStatus -eq [byte]1)

if (-not (Test-Path -LiteralPath $longRunScript -PathType Leaf)) {
    throw "Long-run sampler is missing."
}
if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Release EXE not found. Build and freeze the candidate first."
}
if (-not (Test-Path -LiteralPath $releasePath -PathType Leaf)) {
    throw "Current release manifest is missing."
}
if (@(Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "WeatherPoem is already running."
}

$previousLaunch = $null
if (Test-Path -LiteralPath $launchPath -PathType Leaf) {
    $previousLaunch = Get-Content -LiteralPath $launchPath -Raw -Encoding UTF8 |
        ConvertFrom-Json
    $previousLauncher = Get-Process `
        -Id ([int]$previousLaunch.launcherProcessId) `
        -ErrorAction SilentlyContinue
    if ($null -ne $previousLauncher) {
        throw "A seven-day launcher is already active."
    }
}

$releaseManifest = Get-Content -LiteralPath $releasePath -Raw -Encoding UTF8 |
    ConvertFrom-Json
$portableArtifacts = @(
    $releaseManifest.artifacts |
        Where-Object { [string]$_.kind -eq "portable" }
)
if (
    [string]$releaseManifest.schemaVersion -ne "1.0" -or
    [string]$releaseManifest.product -ne "WeatherPoem" -or
    [string]$releaseManifest.version -ne $appVersion -or
    $portableArtifacts.Count -ne 1
) {
    throw "Release manifest identity or portable artifact is invalid."
}

$portable = $portableArtifacts[0]
$exeItem = Get-Item -LiteralPath $exePath
$exeHash = (
    Get-FileHash -LiteralPath $exePath -Algorithm SHA256
).Hash.ToUpperInvariant()
if (
    [string]$portable.name -ne $exeItem.Name -or
    [long]$portable.size -ne [long]$exeItem.Length -or
    [string]$portable.sha256 -ne $exeHash
) {
    throw "Frozen EXE does not match the current release manifest."
}

$protectedRelativePaths = @(
    "output/WeatherPoem_${appVersion}_PERFORMANCE_8H_LAUNCH.json",
    "output/WeatherPoem_${appVersion}_PERFORMANCE_LONG_RUN_CHECKPOINT.json",
    "output/WeatherPoem_${appVersion}_PERFORMANCE_8H.json"
)
$protectedEvidence = @(
    foreach ($relativePath in $protectedRelativePaths) {
        $absolutePath = [System.IO.Path]::GetFullPath(
            (Join-Path $projectRoot ($relativePath.Replace("/", "\")))
        )
        if (
            -not $absolutePath.StartsWith(
                $outputPrefix,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -or
            -not (Test-Path -LiteralPath $absolutePath -PathType Leaf)
        ) {
            throw "Protected eight-hour evidence is missing or outside output: $relativePath"
        }
        [ordered]@{
            path = $relativePath
            sha256 = (
                Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256
            ).Hash.ToUpperInvariant()
        }
    }
)

$runId = [System.Guid]::NewGuid().ToString("N").ToLowerInvariant()
$stdoutRelativePath = "output/WeatherPoem_${appVersion}_PERFORMANCE_7D_${runId}.stdout.log"
$stderrRelativePath = "output/WeatherPoem_${appVersion}_PERFORMANCE_7D_${runId}.stderr.log"
$stdoutPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot ($stdoutRelativePath.Replace("/", "\")))
)
$stderrPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot ($stderrRelativePath.Replace("/", "\")))
)
$arguments = @(
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $longRunScript,
    "-EvidenceMode",
    "seven-day",
    "-DurationMinutes",
    "10080",
    "-SampleIntervalSeconds",
    "60",
    "-RunId",
    $runId
)
$releaseManifestHash = (
    Get-FileHash -LiteralPath $releasePath -Algorithm SHA256
).Hash.ToUpperInvariant()

$launchPlan = [ordered]@{
    stateChanged = $false
    readyForLaunch = $acOnline
    hostReadiness = [ordered]@{
        acOnline = $acOnline
        userInitiatedSleepPrevented = $false
    }
    operatorRequirements = [ordered]@{
        keepConnectedToAcPower = $true
        doNotCloseLidUnlessLidActionIsDoNothing = $true
        doNotSelectSleepOrHibernate = $true
    }
    appVersion = $appVersion
    runId = $runId
    configuration = [ordered]@{
        mode = "seven-day"
        requestedDurationMinutes = 10080
        sampleIntervalSeconds = 60
    }
    artifact = [ordered]@{
        path = "src-tauri/target/release/weatherpoem.exe"
        sha256 = $exeHash
        sizeBytes = [long]$exeItem.Length
    }
    releaseManifest = [ordered]@{
        path = $releaseRelativePath
        sha256 = $releaseManifestHash
    }
    protectedEvidence = $protectedEvidence
    launch = $launchRelativePath
    checkpoint = $checkpointRelativePath
    report = $reportRelativePath
    stdout = $stdoutRelativePath
    stderr = $stderrRelativePath
    samplerArguments = $arguments
}

if ($Preflight) {
    Write-Output ($launchPlan | ConvertTo-Json -Depth 8)
    exit 0
}

if (-not $acOnline) {
    throw "Seven-day sampling requires continuous AC power."
}

[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$archiveDirectory = [System.IO.Path]::GetFullPath(
    (Join-Path $outputDirectory "performance-7d-archive")
)
$archivePrefix = $archiveDirectory.TrimEnd("\") + "\"
$previousRunId = if (
    $null -ne $previousLaunch -and
    [string]$previousLaunch.runId -match "^[a-fA-F0-9]{32}$"
) {
    [string]$previousLaunch.runId
}
else {
    "orphan"
}
$archiveTimestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssfffZ")
$sevenDayPaths = @($launchPath, $checkpointPath, $reportPath)
if (@($sevenDayPaths | Where-Object { Test-Path -LiteralPath $_ }).Count -gt 0) {
    [System.IO.Directory]::CreateDirectory($archiveDirectory) | Out-Null
    foreach ($sourcePath in $sevenDayPaths) {
        $resolvedSource = [System.IO.Path]::GetFullPath($sourcePath)
        if (-not (Test-Path -LiteralPath $resolvedSource -PathType Leaf)) {
            continue
        }
        if (-not $resolvedSource.StartsWith(
            $outputPrefix,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
            throw "Seven-day archive source escaped the output directory."
        }
        $sourceItem = Get-Item -LiteralPath $resolvedSource
        $archiveName = (
            $sourceItem.BaseName + "_" + $previousRunId + "_" +
            $archiveTimestamp + $sourceItem.Extension
        )
        $archiveTarget = [System.IO.Path]::GetFullPath(
            (Join-Path $archiveDirectory $archiveName)
        )
        if (-not $archiveTarget.StartsWith(
            $archivePrefix,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
            throw "Seven-day archive target escaped its directory."
        }
        Move-Item -LiteralPath $resolvedSource -Destination $archiveTarget
    }
}

$launcher = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $arguments `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

$launch = [ordered]@{
    schemaVersion = "1.0"
    product = "WeatherPoem"
    appVersion = $appVersion
    runId = $runId
    startedAt = [DateTime]::UtcNow.ToString("o")
    requestedDurationMinutes = 10080
    sampleIntervalSeconds = 60
    launcherProcessId = $launcher.Id
    hostReadiness = $launchPlan.hostReadiness
    operatorRequirements = $launchPlan.operatorRequirements
    artifact = $launchPlan.artifact
    releaseManifest = $launchPlan.releaseManifest
    protectedEvidence = $protectedEvidence
    checkpoint = $checkpointRelativePath
    report = $reportRelativePath
    stdout = $stdoutRelativePath
    stderr = $stderrRelativePath
    status = "launched"
}
[System.IO.File]::WriteAllText(
    $launchPath,
    ($launch | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host (
    "Seven-day performance run launched in a hidden process. " +
    "PID: $($launcher.Id); runId: $runId; launch record: $launchPath"
)
