param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$utilityModule = Join-Path $PSHOME "Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"
Import-Module -Name $utilityModule -ErrorAction Stop

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$longRunScript = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot "test-performance-long-run.ps1")
)
$exePath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\target\release\weatherpoem.exe")
)
$outputDirectory = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot "output")
)
$launchPath = Join-Path $outputDirectory (
    "WeatherPoem_0.2.0_PERFORMANCE_8H_LAUNCH.json"
)

if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    throw "Release EXE not found. Build and freeze the candidate first."
}
if (@(Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "WeatherPoem is already running."
}
if (Test-Path -LiteralPath $launchPath -PathType Leaf) {
    $previousLaunch = Get-Content `
        -LiteralPath $launchPath `
        -Raw `
        -Encoding UTF8 |
        ConvertFrom-Json
    $previousProcess = Get-Process `
        -Id ([int]$previousLaunch.launcherProcessId) `
        -ErrorAction SilentlyContinue
    if ($null -ne $previousProcess) {
        throw "An eight-hour launcher is already active."
    }
}

[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$runId = [System.Guid]::NewGuid().ToString("N")
$stdoutPath = Join-Path $outputDirectory (
    "WeatherPoem_0.2.0_PERFORMANCE_8H_" + $runId + ".stdout.log"
)
$stderrPath = Join-Path $outputDirectory (
    "WeatherPoem_0.2.0_PERFORMANCE_8H_" + $runId + ".stderr.log"
)
$arguments = @(
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $longRunScript
)
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
    appVersion = "0.2.0"
    runId = $runId
    startedAt = [DateTime]::UtcNow.ToString("o")
    requestedDurationMinutes = 480
    sampleIntervalSeconds = 60
    launcherProcessId = $launcher.Id
    artifact = [ordered]@{
        path = "src-tauri/target/release/weatherpoem.exe"
        sha256 = (
            Get-FileHash -LiteralPath $exePath -Algorithm SHA256
        ).Hash.ToUpperInvariant()
    }
    checkpoint = "output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_CHECKPOINT.json"
    report = "output/WeatherPoem_0.2.0_PERFORMANCE_8H.json"
    stdout = "output/" + (Split-Path -Leaf $stdoutPath)
    stderr = "output/" + (Split-Path -Leaf $stderrPath)
    status = "launched"
}
[System.IO.File]::WriteAllText(
    $launchPath,
    ($launch | ConvertTo-Json -Depth 6) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host (
    "Eight-hour performance run launched in a hidden process. " +
    "PID: $($launcher.Id); launch record: $launchPath"
)
