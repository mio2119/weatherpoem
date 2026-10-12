param(
    [string]$CargoAuditPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$utilityModule = Join-Path $PSHOME "Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"
Import-Module -Name $utilityModule -ErrorAction Stop

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packagePath = Join-Path $projectRoot "package.json"
$lockPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\Cargo.lock")
)
$package = Get-Content -LiteralPath $packagePath -Raw -Encoding UTF8 |
    ConvertFrom-Json
$appVersion = [string]$package.version
$reportPath = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot "output\WeatherPoem_0.2.0_CARGO_AUDIT.json")
)

function Resolve-CargoAudit {
    param([string]$RequestedPath)

    $candidates = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        $candidates.Add($RequestedPath)
    }
    if (-not [string]::IsNullOrWhiteSpace($env:CARGO_AUDIT_BIN)) {
        $candidates.Add($env:CARGO_AUDIT_BIN)
    }
    $command = Get-Command "cargo-audit.exe" -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        $candidates.Add($command.Source)
    }
    $command = Get-Command "cargo-audit" -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        $candidates.Add($command.Source)
    }
    foreach ($candidate in $candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }
        $resolved = [System.IO.Path]::GetFullPath($candidate)
        if (Test-Path -LiteralPath $resolved -PathType Leaf) {
            return $resolved
        }
    }
    throw "cargo-audit was not found. Set CARGO_AUDIT_BIN or pass -CargoAuditPath."
}

function Quote-ProcessArgument {
    param([string]$Value)
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-CapturedProcess {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $startInfo.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
    $startInfo.Arguments = (
        $Arguments |
            ForEach-Object { Quote-ProcessArgument -Value $_ }
    ) -join " "

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            throw "Failed to start $FilePath."
        }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            Stdout = $stdoutTask.GetAwaiter().GetResult()
            Stderr = $stderrTask.GetAwaiter().GetResult()
        }
    }
    finally {
        $process.Dispose()
    }
}

function Finding-PackageKey {
    param([object]$Finding)
    return (
        [string]$Finding.package.name +
        "@" +
        [string]$Finding.package.version
    )
}

function Convert-FindingSummary {
    param(
        [object]$Finding,
        [string]$Kind
    )
    $advisoryId = $null
    if (
        $null -ne $Finding.PSObject.Properties["advisory"] -and
        $null -ne $Finding.advisory
    ) {
        $advisoryId = [string]$Finding.advisory.id
    }
    return [ordered]@{
        kind = $Kind
        advisoryId = $advisoryId
        package = [string]$Finding.package.name
        version = [string]$Finding.package.version
    }
}

$cargoAudit = Resolve-CargoAudit -RequestedPath $CargoAuditPath
$versionResult = Invoke-CapturedProcess `
    -FilePath $cargoAudit `
    -Arguments @("--version")
if ($versionResult.ExitCode -ne 0) {
    throw "cargo-audit --version failed: $($versionResult.Stderr.Trim())"
}
$toolVersion = $versionResult.Stdout.Trim()
if ($toolVersion -notmatch '^cargo-audit [0-9]+\.[0-9]+\.[0-9]+') {
    throw "Unexpected cargo-audit version output: $toolVersion"
}

$tempBase = [System.IO.Path]::GetFullPath(
    [System.IO.Path]::GetTempPath()
)
$tempPrefix = $tempBase.TrimEnd("\") + "\"
$runRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $tempBase (
        "WeatherPoem.RustSec." +
        [System.Guid]::NewGuid().ToString("N")
    ))
)
if (-not $runRoot.StartsWith(
    $tempPrefix,
    [System.StringComparison]::OrdinalIgnoreCase
)) {
    throw "RustSec temporary directory escaped the system temp root."
}
[System.IO.Directory]::CreateDirectory($runRoot) | Out-Null

try {
    $githubHeaders = @{
        "User-Agent" = "WeatherPoem-security-audit"
        "Accept" = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    $apiUrl = "https://api.github.com/repos/RustSec/advisory-db/commits/main"
    $commit = Invoke-RestMethod `
        -Uri $apiUrl `
        -Headers $githubHeaders `
        -Method Get
    $commitSha = [string]$commit.sha
    if ($commitSha -notmatch "^[0-9a-f]{40}$") {
        throw "GitHub returned an invalid RustSec commit SHA."
    }
    $commitDate = [string]$commit.commit.committer.date
    $parsedCommitDate = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse(
        $commitDate,
        [ref]$parsedCommitDate
    )) {
        throw "GitHub returned an invalid RustSec commit date."
    }

    $archiveUrl = (
        "https://codeload.github.com/RustSec/advisory-db/zip/" +
        $commitSha
    )
    $archivePath = Join-Path $runRoot "advisory-db.zip"
    $curlResult = Invoke-CapturedProcess `
        -FilePath "curl.exe" `
        -Arguments @(
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--output",
            $archivePath,
            $archiveUrl
        )
    if ($curlResult.ExitCode -ne 0) {
        throw "Official RustSec archive download failed: $($curlResult.Stderr.Trim())"
    }
    if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
        throw "Official RustSec archive was not created."
    }
    $archive = Get-Item -LiteralPath $archivePath
    if ($archive.Length -lt 10000) {
        throw "Official RustSec archive is unexpectedly small."
    }
    $archiveHash = (
        Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
    ).Hash.ToUpperInvariant()

    $extractRoot = Join-Path $runRoot "extract"
    Expand-Archive `
        -LiteralPath $archivePath `
        -DestinationPath $extractRoot
    $databaseRoots = @(
        Get-ChildItem -LiteralPath $extractRoot -Directory
    )
    if ($databaseRoots.Count -ne 1) {
        throw "RustSec archive must contain exactly one root directory."
    }
    $databaseRoot = $databaseRoots[0].FullName
    $databaseConfig = Join-Path $databaseRoot "support.toml"
    $databaseCrates = Join-Path $databaseRoot "crates"
    $databaseRust = Join-Path $databaseRoot "rust"
    if (
        -not (Test-Path -LiteralPath $databaseConfig -PathType Leaf) -or
        -not (Test-Path -LiteralPath $databaseCrates -PathType Container) -or
        -not (Test-Path -LiteralPath $databaseRust -PathType Container)
    ) {
        throw "RustSec archive is missing its signed-off database structure."
    }

    $auditResult = Invoke-CapturedProcess `
        -FilePath $cargoAudit `
        -Arguments @(
            "audit",
            "--db",
            $databaseRoot,
            "--no-fetch",
            "--stale",
            "--target-os",
            "windows",
            "--target-arch",
            "x86_64",
            "--file",
            $lockPath,
            "--json"
        )
    if ([string]::IsNullOrWhiteSpace($auditResult.Stdout)) {
        throw "cargo-audit did not emit a JSON report: $($auditResult.Stderr.Trim())"
    }
    try {
        $audit = $auditResult.Stdout | ConvertFrom-Json
    }
    catch {
        throw "cargo-audit emitted invalid JSON: $($auditResult.Stdout)"
    }
    if ($auditResult.ExitCode -notin @(0, 1)) {
        throw "cargo-audit failed with exit code $($auditResult.ExitCode): $($auditResult.Stderr.Trim())"
    }

    $cargoCommand = Get-Command "cargo.exe" -ErrorAction SilentlyContinue
    if ($null -eq $cargoCommand) {
        $cargoCommand = Get-Command "cargo" -ErrorAction Stop
    }
    $targetTriple = "x86_64-pc-windows-msvc"
    $treeResult = Invoke-CapturedProcess `
        -FilePath $cargoCommand.Source `
        -Arguments @(
            "tree",
            "--locked",
            "--offline",
            "--target",
            $targetTriple,
            "--manifest-path",
            (Join-Path $projectRoot "src-tauri\Cargo.toml"),
            "--edges",
            "normal,build",
            "--prefix",
            "none",
            "--format",
            "{p}"
        )
    if ($treeResult.ExitCode -ne 0) {
        throw "Target-specific cargo tree failed: $($treeResult.Stderr.Trim())"
    }

    $targetPackageKeys = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::Ordinal
    )
    foreach ($line in ($treeResult.Stdout -split "\r?\n")) {
        if ($line -match "^(?<name>[A-Za-z0-9_-]+) v(?<version>[^ ]+)") {
            $targetPackageKeys.Add(
                [string]$Matches.name +
                "@" +
                [string]$Matches.version
            ) | Out-Null
        }
    }
    $targetPackages = @(
        $targetPackageKeys |
            ForEach-Object {
                $separator = $_.LastIndexOf("@")
                [ordered]@{
                    name = $_.Substring(0, $separator)
                    version = $_.Substring($separator + 1)
                }
            } |
            Sort-Object name, version
    )
    if ($targetPackages.Count -lt 100) {
        throw "Target-specific cargo tree resolved too few packages."
    }

    $rawVulnerabilities = @($audit.vulnerabilities.list)
    $targetVulnerabilities = @(
        $rawVulnerabilities |
            Where-Object {
                $targetPackageKeys.Contains(
                    (Finding-PackageKey -Finding $_)
                )
            } |
            ForEach-Object {
                Convert-FindingSummary `
                    -Finding $_ `
                    -Kind "vulnerability"
            }
    )
    $excludedVulnerabilities = @(
        $rawVulnerabilities |
            Where-Object {
                -not $targetPackageKeys.Contains(
                    (Finding-PackageKey -Finding $_)
                )
            } |
            ForEach-Object {
                Convert-FindingSummary `
                    -Finding $_ `
                    -Kind "vulnerability"
            }
    )

    $targetWarnings = [ordered]@{}
    $excludedWarnings = [ordered]@{}
    foreach ($warningProperty in $audit.warnings.PSObject.Properties) {
        $warningKind = [string]$warningProperty.Name
        $warningValues = @($warningProperty.Value)
        $targetWarnings[$warningKind] = @(
            $warningValues |
                Where-Object {
                    $targetPackageKeys.Contains(
                        (Finding-PackageKey -Finding $_)
                    )
                } |
                ForEach-Object {
                    Convert-FindingSummary `
                        -Finding $_ `
                        -Kind $warningKind
                }
        )
        $excludedWarnings[$warningKind] = @(
            $warningValues |
                Where-Object {
                    -not $targetPackageKeys.Contains(
                        (Finding-PackageKey -Finding $_)
                    )
                } |
                ForEach-Object {
                    Convert-FindingSummary `
                        -Finding $_ `
                        -Kind $warningKind
                }
        )
    }
    $blockingTargetWarningCount = 0
    foreach ($blockingKind in @("unsound", "yanked")) {
        if ($targetWarnings.Contains($blockingKind)) {
            $blockingTargetWarningCount += @(
                $targetWarnings[$blockingKind]
            ).Count
        }
    }
    $targetScanSatisfied = (
        $targetVulnerabilities.Count -eq 0 -and
        $blockingTargetWarningCount -eq 0
    )

    $generatedAt = [DateTime]::UtcNow.ToString("o")
    $report = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        appVersion = $appVersion
        generatedAt = $generatedAt
        tool = [ordered]@{
            name = "cargo-audit"
            version = $toolVersion
        }
        lockfile = [ordered]@{
            path = "src-tauri/Cargo.lock"
            sha256 = (
                Get-FileHash -LiteralPath $lockPath -Algorithm SHA256
            ).Hash.ToUpperInvariant()
        }
        database = [ordered]@{
            source = "https://github.com/RustSec/advisory-db"
            apiUrl = $apiUrl
            archiveUrl = $archiveUrl
            ref = "main"
            commitSha = $commitSha
            commitDate = $commitDate
            archiveSha256 = $archiveHash
            fetchedAt = $generatedAt
            transport = "official-github-api-and-codeload-https"
        }
        command = [ordered]@{
            noFetch = $true
            allowStaleSnapshot = $true
            targetTriple = $targetTriple
            cargoTreeOffline = $true
        }
        cargoAuditExitCode = $auditResult.ExitCode
        stderr = $auditResult.Stderr.Trim()
        audit = $audit
        targetResolution = [ordered]@{
            packageCount = $targetPackages.Count
            packages = @($targetPackages)
            vulnerabilities = @($targetVulnerabilities)
            excludedNonTargetVulnerabilities = @(
                $excludedVulnerabilities
            )
            warnings = $targetWarnings
            excludedNonTargetWarnings = $excludedWarnings
            blockingWarningKinds = @("unsound", "yanked")
            blockingWarningCount = $blockingTargetWarningCount
            targetScanSatisfied = $targetScanSatisfied
        }
        limitations = [ordered]@{
            targetSpecific = $true
            nonTargetFindingsRetained = $true
            unmaintainedRequiresHumanReview = $true
            namedSecurityReviewCompleted = $false
        }
        gateSatisfied = $false
        result = if ($targetScanSatisfied) {
            "automated-target-scan-passed"
        }
        else {
            "automated-target-scan-failed"
        }
    }

    [System.IO.Directory]::CreateDirectory(
        (Split-Path -Parent $reportPath)
    ) | Out-Null
    $json = $report | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText(
        $reportPath,
        $json + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )

    if (-not $targetScanSatisfied) {
        throw "cargo-audit found a Windows target blocking result. Report: $reportPath"
    }
    Write-Host "Native cargo-audit report generated: $reportPath"
}
finally {
    $resolvedRunRoot = [System.IO.Path]::GetFullPath($runRoot)
    if (
        $resolvedRunRoot.StartsWith(
            $tempPrefix,
            [System.StringComparison]::OrdinalIgnoreCase
        ) -and
        (Split-Path -Leaf $resolvedRunRoot).StartsWith(
            "WeatherPoem.RustSec.",
            [System.StringComparison]::Ordinal
        )
    ) {
        if (Test-Path -LiteralPath $resolvedRunRoot) {
            Remove-Item `
                -LiteralPath $resolvedRunRoot `
                -Recurse `
                -Force
        }
    }
}
