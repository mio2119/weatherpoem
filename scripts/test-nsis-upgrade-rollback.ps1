param(
    [string]$BaselineVersion = "0.1.0",
    [string]$BaselineInstallerPath = "",
    [int]$LaunchSeconds = 6,
    [switch]$Preflight,
    [switch]$ConfirmLifecycle
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$securityModule = Join-Path $PSHOME "Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1"
Import-Module -Name $securityModule -ErrorAction Stop
$utilityModule = Join-Path $PSHOME "Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1"
Import-Module -Name $utilityModule -ErrorAction Stop

function Get-WeatherPoemInstallations {
    $roots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $records = foreach ($root in $roots) {
        Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
            Where-Object {
                $property = $_.PSObject.Properties["DisplayName"]
                $name = if ($property) {
                    [string]$property.Value
                }
                else {
                    ""
                }
                $name -eq "WeatherPoem" -or
                    $name -like "WeatherPoem *"
            } |
            ForEach-Object {
                [pscustomobject]@{
                    displayName = [string]$_.DisplayName
                    displayVersion = [string]$_.DisplayVersion
                    installLocation = [string]$_.InstallLocation
                    uninstallString = [string]$_.UninstallString
                    registryPath = [string]$_.PSPath
                }
            }
    }
    return @($records)
}

function Get-WeatherPoemAutostart {
    $runKey = Get-ItemProperty `
        -LiteralPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
        -ErrorAction SilentlyContinue
    if (-not $runKey) {
        return @()
    }
    return @(
        $runKey.PSObject.Properties |
            Where-Object {
                $_.Name -notlike "PS*" -and
                (
                    $_.Name -like "*weather*poem*" -or
                    [string]$_.Value -like "*weatherpoem*"
                )
            } |
            ForEach-Object {
                [pscustomobject]@{
                    name = $_.Name
                    value = [string]$_.Value
                }
            }
    )
}

function Get-WeatherPoemShortcuts {
    $locations = @(
        [Environment]::GetFolderPath("Desktop"),
        [Environment]::GetFolderPath("StartMenu"),
        [Environment]::GetFolderPath("CommonDesktopDirectory"),
        [Environment]::GetFolderPath("CommonStartMenu")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    $shortcuts = foreach ($location in $locations) {
        Get-ChildItem -LiteralPath $location -Filter "*.lnk" -File -Recurse `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -like "*WeatherPoem*" -or
                    $_.FullName -like "*WeatherPoem*"
            } |
            Select-Object -ExpandProperty FullName
    }
    return @($shortcuts | Sort-Object -Unique)
}

function Invoke-CheckedProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [int]$TimeoutSeconds = 180
    )
    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -PassThru `
        -WindowStyle Hidden
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "Process timed out: $FilePath"
    }
    $process.Refresh()
    if ($process.ExitCode -ne 0) {
        throw "Unexpected process exit code: $FilePath -> $($process.ExitCode)"
    }
}

function Invoke-AppProbe {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExecutablePath,
        [Parameter(Mandatory = $true)]
        [int]$Seconds
    )
    $process = Start-Process `
        -FilePath $ExecutablePath `
        -ArgumentList @("--autostart") `
        -PassThru `
        -WindowStyle Hidden
    try {
        Start-Sleep -Seconds $Seconds
        if ($process.HasExited) {
            throw "Application exited before $Seconds seconds"
        }
    }
    finally {
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            $process.WaitForExit(10000) | Out-Null
        }
    }
}

function Assert-RegisteredVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExpectedVersion,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedInstallRoot
    )
    $records = @(Get-WeatherPoemInstallations)
    if ($records.Count -ne 1) {
        throw "Expected exactly one WeatherPoem uninstall registration"
    }
    if ($records[0].displayVersion -ne $ExpectedVersion) {
        throw (
            "Registered version mismatch: expected $ExpectedVersion, " +
            "actual $($records[0].displayVersion)"
        )
    }
    $registeredLocation = (
        [string]$records[0].installLocation
    ).Trim().Trim('"')
    if (
        -not $registeredLocation -or
        [IO.Path]::GetFullPath($registeredLocation).TrimEnd("\") -ne
            $ExpectedInstallRoot.TrimEnd("\")
    ) {
        throw "Uninstall registration points outside the test install root"
    }
    return $records[0]
}

function Get-InstalledFiles {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallRoot
    )
    $apps = @(
        Get-ChildItem -LiteralPath $InstallRoot -Filter "*.exe" -File |
            Where-Object { $_.Name -notlike "uninstall*" }
    )
    $uninstallers = @(
        Get-ChildItem `
            -LiteralPath $InstallRoot `
            -Filter "uninstall*.exe" `
            -File
    )
    if ($apps.Count -ne 1 -or $uninstallers.Count -ne 1) {
        throw (
            "Unexpected installed executable counts: app=$($apps.Count), " +
            "uninstaller=$($uninstallers.Count)"
        )
    }
    return [pscustomobject]@{
        app = $apps[0].FullName
        uninstaller = $uninstallers[0].FullName
    }
}

function Assert-Marker {
    param(
        [Parameter(Mandatory = $true)]
        [string]$MarkerPath,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedValue
    )
    if (
        -not (Test-Path -LiteralPath $MarkerPath -PathType Leaf) -or
        (Get-Content -LiteralPath $MarkerPath -Encoding utf8 -Raw) -ne
            $ExpectedValue
    ) {
        throw "Controlled user-data marker was lost or changed"
    }
}

function Assert-ExactTestDataRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Parent
    )
    $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd("\")
    $fullParent = [IO.Path]::GetFullPath($Parent).TrimEnd("\")
    $expected = Join-Path $fullParent "cn.weatherpoem.desktop"
    if (
        $fullRoot -ne $expected -or
        (Split-Path -Leaf $fullRoot) -ne "cn.weatherpoem.desktop" -or
        (Split-Path -Parent $fullRoot) -ne $fullParent
    ) {
        throw "Application-data cleanup target failed exact-path validation"
    }
}

function Remove-ControlledTestData {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Roots
    )
    foreach ($item in $Roots) {
        Assert-ExactTestDataRoot -Root $item.path -Parent $item.parent
        if (Test-Path -LiteralPath $item.path) {
            $deadline = [DateTime]::UtcNow.AddSeconds(20)
            do {
                Remove-Item -LiteralPath $item.path -Recurse -Force `
                    -ErrorAction SilentlyContinue
                if (-not (Test-Path -LiteralPath $item.path)) {
                    break
                }
                Start-Sleep -Milliseconds 250
            } while ([DateTime]::UtcNow -lt $deadline)
        }
        if (Test-Path -LiteralPath $item.path) {
            throw "Controlled application-data directory remains after cleanup"
        }
    }
}

if ($LaunchSeconds -lt 6 -or $LaunchSeconds -gt 30) {
    throw "LaunchSeconds must be between 6 and 30"
}
try {
    $baselineSemanticVersion = [Version]$BaselineVersion
}
catch {
    throw "BaselineVersion must be a numeric dotted version"
}

$projectRoot = [IO.Path]::GetFullPath(
    (Split-Path -Parent $PSScriptRoot)
)
$packageJson = Get-Content `
    -LiteralPath (Join-Path $projectRoot "package.json") `
    -Encoding utf8 `
    -Raw |
    ConvertFrom-Json
$targetVersion = [string]$packageJson.version
$targetSemanticVersion = [Version]$targetVersion
if ($baselineSemanticVersion -ge $targetSemanticVersion) {
    throw "BaselineVersion must be lower than the current target version"
}

$nsisRoot = [IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\target\release\bundle\nsis")
).TrimEnd("\") + "\"
$targetInstallerPath = [IO.Path]::GetFullPath(
    (
        Join-Path $nsisRoot (
            "WeatherPoem_${targetVersion}_x64-setup.exe"
        )
    )
)
if (-not $BaselineInstallerPath) {
    $BaselineInstallerPath = Join-Path $nsisRoot (
        "WeatherPoem_${BaselineVersion}_x64-setup.exe"
    )
}
$baselineInstaller = [IO.Path]::GetFullPath($BaselineInstallerPath)
$expectedBaselineName =
    "WeatherPoem_${BaselineVersion}_x64-setup.exe"
if (
    (Split-Path -Leaf $baselineInstaller) -ne $expectedBaselineName -or
    -not (Test-Path -LiteralPath $baselineInstaller -PathType Leaf)
) {
    throw "Baseline NSIS installer is missing or has an unexpected name"
}
if (
    -not $targetInstallerPath.StartsWith(
        $nsisRoot,
        [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not (Test-Path -LiteralPath $targetInstallerPath -PathType Leaf)
) {
    throw "Current NSIS installer is missing from the release directory"
}
if ($baselineInstaller -eq $targetInstallerPath) {
    throw "Baseline and target installers must be different files"
}

$baselineInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo(
    $baselineInstaller
)
$targetInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo(
    $targetInstallerPath
)
if (
    $baselineInfo.ProductVersion -ne $BaselineVersion -or
    $targetInfo.ProductVersion -ne $targetVersion
) {
    throw "Installer ProductVersion does not match the declared versions"
}

$checksumPath = Join-Path (
    Join-Path $projectRoot "output"
) "WeatherPoem_${BaselineVersion}_SHA256.txt"
if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
    throw "Baseline checksum list is missing"
}
$baselineExpectedHash = (
    Select-String `
        -LiteralPath $checksumPath `
        -Pattern (
            "^([A-F0-9]{64})  " +
            [Regex]::Escape($expectedBaselineName) +
            "$"
        )
).Matches.Groups[1].Value
$baselineActualHash = (
    Get-FileHash -LiteralPath $baselineInstaller -Algorithm SHA256
).Hash
if (
    -not $baselineExpectedHash -or
    $baselineActualHash -ne $baselineExpectedHash
) {
    throw "Baseline installer does not match its SHA-256 list"
}

$existingInstallations = @(Get-WeatherPoemInstallations)
$existingAutostart = @(Get-WeatherPoemAutostart)
$existingShortcuts = @(Get-WeatherPoemShortcuts)
$runningProcesses = @(
    Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue
)
$testDataRoots = @(
    [pscustomobject]@{
        path = Join-Path $env:APPDATA "cn.weatherpoem.desktop"
        parent = $env:APPDATA
    },
    [pscustomobject]@{
        path = Join-Path $env:LOCALAPPDATA "cn.weatherpoem.desktop"
        parent = $env:LOCALAPPDATA
    }
)
foreach ($item in $testDataRoots) {
    Assert-ExactTestDataRoot -Root $item.path -Parent $item.parent
}
$existingDataRoots = @(
    $testDataRoots |
        Where-Object { Test-Path -LiteralPath $_.path }
)
$hasConflictingState = (
    $existingInstallations.Count -gt 0 -or
    $existingAutostart.Count -gt 0 -or
    $existingShortcuts.Count -gt 0 -or
    $runningProcesses.Count -gt 0 -or
    $existingDataRoots.Count -gt 0
)
if ($Preflight) {
    [ordered]@{
        preflightOnly = $true
        product = "WeatherPoem"
        baselineVersion = $BaselineVersion
        targetVersion = $targetVersion
        baselineInstallerPath = $baselineInstaller
        baselineInstallerSha256 = $baselineActualHash
        targetInstallerPath = $targetInstallerPath
        targetInstallerSha256 = (
            Get-FileHash `
                -LiteralPath $targetInstallerPath `
                -Algorithm SHA256
        ).Hash
        existingInstallationCount = $existingInstallations.Count
        existingAutostartCount = $existingAutostart.Count
        existingShortcutCount = $existingShortcuts.Count
        runningProcessCount = $runningProcesses.Count
        existingApplicationDataRootCount = $existingDataRoots.Count
        explicitLifecycleConfirmation = [bool]$ConfirmLifecycle
        readyForDedicatedAccountRun = (-not $hasConflictingState)
        stateChanged = $false
    } | ConvertTo-Json -Depth 5
    exit 0
}
if (-not $ConfirmLifecycle) {
    throw (
        "This test installs a baseline, upgrades, rolls back, and uninstalls. " +
        "Use -Preflight first, then re-run on a dedicated clean Windows " +
        "account with -ConfirmLifecycle."
    )
}
if ($hasConflictingState) {
    throw (
        "Existing WeatherPoem installation, process, shortcut, autostart, " +
        "or application data detected; refusing to overwrite user state."
    )
}

$tempBase = [IO.Path]::GetFullPath(
    [IO.Path]::GetTempPath()
).TrimEnd("\") + "\"
$runId = [Guid]::NewGuid().ToString("N")
$installRoot = [IO.Path]::GetFullPath(
    (Join-Path $tempBase "weatherpoem-nsis-upgrade-$runId")
)
if (
    -not $installRoot.StartsWith(
        $tempBase,
        [StringComparison]::OrdinalIgnoreCase
    ) -or
    (Split-Path -Leaf $installRoot) -notmatch
        "^weatherpoem-nsis-upgrade-[a-f0-9]{32}$" -or
    (Test-Path -LiteralPath $installRoot)
) {
    throw "Temporary install path failed containment validation"
}

$markerValue = "weatherpoem-upgrade-marker-$runId"
$markerRoot = $testDataRoots[0].path
$markerPath = Join-Path $markerRoot "upgrade-test-marker.txt"
$testDataMayExist = $false
$uninstallerPath = $null
$installedByThisRun = $false
$completed = $false
try {
    Invoke-CheckedProcess `
        -FilePath $baselineInstaller `
        -Arguments @("/S", "/D=$installRoot")
    $installedByThisRun = $true
    Assert-RegisteredVersion `
        -ExpectedVersion $BaselineVersion `
        -ExpectedInstallRoot $installRoot |
        Out-Null
    $baselineFiles = Get-InstalledFiles -InstallRoot $installRoot
    $uninstallerPath = $baselineFiles.uninstaller
    $baselinePayloadHash = (
        Get-FileHash `
            -LiteralPath $baselineFiles.app `
            -Algorithm SHA256
    ).Hash

    New-Item -ItemType Directory -Path $markerRoot -Force | Out-Null
    $testDataMayExist = $true
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($markerPath, $markerValue, $utf8NoBom)
    Invoke-AppProbe `
        -ExecutablePath $baselineFiles.app `
        -Seconds $LaunchSeconds
    Assert-Marker -MarkerPath $markerPath -ExpectedValue $markerValue

    Invoke-CheckedProcess `
        -FilePath $targetInstallerPath `
        -Arguments @("/S", "/D=$installRoot")
    Assert-RegisteredVersion `
        -ExpectedVersion $targetVersion `
        -ExpectedInstallRoot $installRoot |
        Out-Null
    $targetFiles = Get-InstalledFiles -InstallRoot $installRoot
    $uninstallerPath = $targetFiles.uninstaller
    $targetPayloadHash = (
        Get-FileHash -LiteralPath $targetFiles.app -Algorithm SHA256
    ).Hash
    $releasePayloadPath = Join-Path (
        Join-Path $projectRoot "src-tauri\target\release"
    ) "weatherpoem.exe"
    $releasePayloadHash = (
        Get-FileHash `
            -LiteralPath $releasePayloadPath `
            -Algorithm SHA256
    ).Hash
    if ($targetPayloadHash -ne $releasePayloadHash) {
        throw "Upgraded payload does not match the current release EXE"
    }
    Assert-Marker -MarkerPath $markerPath -ExpectedValue $markerValue
    Invoke-AppProbe `
        -ExecutablePath $targetFiles.app `
        -Seconds $LaunchSeconds
    Assert-Marker -MarkerPath $markerPath -ExpectedValue $markerValue

    Invoke-CheckedProcess `
        -FilePath $baselineInstaller `
        -Arguments @("/S", "/D=$installRoot")
    Assert-RegisteredVersion `
        -ExpectedVersion $BaselineVersion `
        -ExpectedInstallRoot $installRoot |
        Out-Null
    $rollbackFiles = Get-InstalledFiles -InstallRoot $installRoot
    $uninstallerPath = $rollbackFiles.uninstaller
    $rollbackPayloadHash = (
        Get-FileHash `
            -LiteralPath $rollbackFiles.app `
            -Algorithm SHA256
    ).Hash
    if ($rollbackPayloadHash -ne $baselinePayloadHash) {
        throw "Manual rollback did not restore the baseline payload"
    }
    Assert-Marker -MarkerPath $markerPath -ExpectedValue $markerValue
    Invoke-AppProbe `
        -ExecutablePath $rollbackFiles.app `
        -Seconds $LaunchSeconds
    Assert-Marker -MarkerPath $markerPath -ExpectedValue $markerValue

    Invoke-CheckedProcess `
        -FilePath $uninstallerPath `
        -Arguments @("/S")
    $installedByThisRun = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (
        (
            (Test-Path -LiteralPath $installRoot) -or
            @(Get-WeatherPoemInstallations).Count -gt 0
        ) -and
        [DateTime]::UtcNow -lt $deadline
    ) {
        Start-Sleep -Milliseconds 250
    }
    if (
        (Test-Path -LiteralPath $installRoot) -or
        @(Get-WeatherPoemInstallations).Count -gt 0 -or
        @(Get-WeatherPoemAutostart).Count -gt 0 -or
        @(Get-WeatherPoemShortcuts).Count -gt 0 -or
        @(Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue).
            Count -gt 0
    ) {
        throw "Upgrade lifecycle left installation or system residue"
    }
    Assert-Marker -MarkerPath $markerPath -ExpectedValue $markerValue
    Remove-ControlledTestData -Roots $testDataRoots
    $testDataMayExist = $false

    $baselineSignature = Get-AuthenticodeSignature `
        -LiteralPath $baselineInstaller
    $targetSignature = Get-AuthenticodeSignature `
        -LiteralPath $targetInstallerPath
    $targetPayloadSignature = Get-AuthenticodeSignature `
        -LiteralPath $releasePayloadPath
    $report = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        version = $targetVersion
        testedAt = [DateTime]::UtcNow.ToString("o")
        scope = "nsis-in-place-upgrade-manual-rollback"
        runId = $runId
        baseline = [ordered]@{
            version = $BaselineVersion
            installerName = $expectedBaselineName
            installerSha256 = $baselineActualHash
            authenticodeStatus = [string]$baselineSignature.Status
            installedPayloadSha256 = $baselinePayloadHash
        }
        target = [ordered]@{
            version = $targetVersion
            installerName = Split-Path -Leaf $targetInstallerPath
            installerSha256 = (
                Get-FileHash `
                    -LiteralPath $targetInstallerPath `
                    -Algorithm SHA256
            ).Hash
            authenticodeStatus = [string]$targetSignature.Status
            installedPayloadSha256 = $targetPayloadHash
            installedPayloadAuthenticodeStatus =
                [string]$targetPayloadSignature.Status
        }
        isolation = [ordered]@{
            explicitLifecycleConfirmation = $true
            existingInstallationProtected = $true
            applicationDataAbsentBefore = $true
            preexistingApplicationDataDeleted = $false
            controlledMarkerPreservedThroughRollback = $true
            controlledTestDataRemoved = $true
            temporaryInstallRootRemoved = $true
        }
        limitations = [ordered]@{
            automaticUpdaterTested = $false
            msiUpgradeTested = $false
            rollbackMethod = "baseline-nsis-reinstall"
            contentWithdrawalTested = $false
        }
        checks = [ordered]@{
            baselineInstall = "passed"
            baselineRegistration = "passed"
            baselineLaunchSeconds = $LaunchSeconds
            baselineLaunch = "passed"
            targetInPlaceUpgrade = "passed"
            targetRegistration = "passed"
            targetPayloadMatchesRelease = "passed"
            targetLaunchSeconds = $LaunchSeconds
            targetLaunch = "passed"
            userDataMarkerAfterUpgrade = "passed"
            baselineManualRollback = "passed"
            rollbackRegistration = "passed"
            rollbackPayloadRestored = "passed"
            rollbackLaunchSeconds = $LaunchSeconds
            rollbackLaunch = "passed"
            userDataMarkerAfterRollback = "passed"
            finalUninstall = "passed"
            installDirectoryRemoved = "passed"
            uninstallRegistrationRemoved = "passed"
            shortcutResidue = "passed"
            autostartResidue = "passed"
            processResidue = "passed"
            controlledTestDataCleanup = "passed"
        }
        result = "passed"
    }
    $reportPath = Join-Path (
        Join-Path $projectRoot "output"
    ) "WeatherPoem_${targetVersion}_NSIS_UPGRADE_ROLLBACK.json"
    $reportJson = $report | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText($reportPath, $reportJson, $utf8NoBom)
    $completed = $true
    Write-Output "NSIS upgrade and rollback test passed: $reportPath"
}
finally {
    if (
        $installedByThisRun -and
        $uninstallerPath -and
        (Test-Path -LiteralPath $uninstallerPath -PathType Leaf)
    ) {
        try {
            Invoke-CheckedProcess `
                -FilePath $uninstallerPath `
                -Arguments @("/S") `
                -TimeoutSeconds 180
        }
        catch {
            Write-Warning (
                "Automatic NSIS cleanup failed; inspect the temporary " +
                "installation before retrying: $($_.Exception.Message)"
            )
        }
    }
    if (
        (Test-Path -LiteralPath $installRoot) -and
        $installRoot.StartsWith(
            $tempBase,
            [StringComparison]::OrdinalIgnoreCase
        ) -and
        (Split-Path -Leaf $installRoot) -match
            "^weatherpoem-nsis-upgrade-[a-f0-9]{32}$"
    ) {
        $remainingRecords = @(Get-WeatherPoemInstallations)
        if ($remainingRecords.Count -eq 0) {
            Remove-Item -LiteralPath $installRoot -Recurse -Force `
                -ErrorAction SilentlyContinue
        }
        else {
            Write-Warning (
                "The temporary install root was preserved because an " +
                "uninstall registration still exists: $installRoot"
            )
        }
    }
    if ($testDataMayExist) {
        try {
            Remove-ControlledTestData -Roots $testDataRoots
        }
        catch {
            Write-Warning (
                "Controlled test-data cleanup failed: " +
                $_.Exception.Message
            )
        }
    }
    if (-not $completed) {
        Write-Warning "No passing upgrade/rollback report was written."
    }
}
