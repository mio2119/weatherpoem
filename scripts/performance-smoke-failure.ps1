function Write-PerformanceSmokeProbeFailure {
    param(
        [Parameter(Mandatory = $true)][string]$ReportPath,
        [Parameter(Mandatory = $true)][string]$ArtifactPath,
        [Parameter(Mandatory = $true)][string]$ExePath,
        [Parameter(Mandatory = $true)][string]$SampleLabel,
        [Parameter(Mandatory = $true)][string]$RunId,
        [Parameter(Mandatory = $true)][ValidateSet('exit-before-ready', 'ready-timeout')][string]$FailureKind,
        [Parameter(Mandatory = $true)][double]$ElapsedMs,
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][bool]$ProcessAlive,
        [Parameter(Mandatory = $true)][bool]$MarkerExists,
        [Nullable[int]]$ExitCode
    )

    $ErrorActionPreference = 'Stop'

    if ($RunId -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') {
        throw 'Performance probe failure run ID is not a GUID.'
    }
    if ($SampleLabel -notmatch '^(startup|content)-\d{2}$|^idle$') {
        throw 'Performance probe failure sample label is invalid.'
    }
    if ([double]::IsNaN($ElapsedMs) -or [double]::IsInfinity($ElapsedMs) -or $ElapsedMs -lt 0) {
        throw 'Performance probe failure elapsed time is invalid.'
    }

    $reportDirectory = [System.IO.Path]::GetFullPath((Split-Path -Parent $ReportPath))
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($ReportPath)
    $failurePath = Join-Path $reportDirectory ($stem + '.failure-' + $RunId + '.json')
    if (Test-Path -LiteralPath $failurePath) {
        throw 'Performance probe failure diagnostic already exists.'
    }
    $utilityModule = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
    Import-Module -Name $utilityModule -ErrorAction Stop
    $exe = Get-Item -LiteralPath $ExePath -ErrorAction Stop
    $hash = (Get-FileHash -LiteralPath $ExePath -Algorithm SHA256 -ErrorAction Stop).Hash.ToUpperInvariant()
    if ($hash -notmatch '^[0-9A-F]{64}$') {
        throw 'Performance probe failure artifact hash is invalid.'
    }
    $record = [ordered]@{
        schemaVersion = '1.0'
        testKind = 'performance-probe-failure'
        result = $FailureKind
        recordedAt = [DateTime]::UtcNow.ToString('o')
        artifact = [ordered]@{
            path = $ArtifactPath
            sha256 = $hash
            sizeBytes = [long]$exe.Length
        }
        sample = [ordered]@{
            label = $SampleLabel
            runId = $RunId
            elapsedMs = [Math]::Round($ElapsedMs, 2)
            processId = $ProcessId
            processAliveAtFailure = $ProcessAlive
            exitCode = $ExitCode
            readyMarkerExistsAtFailure = $MarkerExists
        }
        limitations = [ordered]@{
            performanceGateSatisfied = $false
            causeDetermined = $false
            realUserDataTouched = $false
        }
    }
    $json = $record | ConvertTo-Json -Depth 6
    [System.IO.Directory]::CreateDirectory($reportDirectory) | Out-Null
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
    $stream = [System.IO.FileStream]::new(
        $failurePath,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
    )
    try {
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    }
    finally {
        $stream.Dispose()
    }
    return $failurePath
}
