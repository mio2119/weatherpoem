param(
    [int]$LaunchSeconds = 6
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
                $displayNameProperty =
                    $_.PSObject.Properties["DisplayName"]
                $displayName = if ($displayNameProperty) {
                    [string]$displayNameProperty.Value
                }
                else {
                    ""
                }
                $displayName -eq "WeatherPoem" -or
                    $displayName -like "WeatherPoem *"
            } |
            Select-Object DisplayName, DisplayVersion, InstallLocation, UninstallString, PSPath
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
        [int]$TimeoutSeconds = 120
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

if ($LaunchSeconds -lt 3 -or $LaunchSeconds -gt 30) {
    throw "LaunchSeconds must be between 3 and 30"
}

$projectRoot = [IO.Path]::GetFullPath(
    (Split-Path -Parent $PSScriptRoot)
)
$packageJson = Get-Content `
    -LiteralPath (Join-Path $projectRoot "package.json") `
    -Raw |
    ConvertFrom-Json
$version = [string]$packageJson.version
$installerPath = [IO.Path]::GetFullPath(
    (
        Join-Path $projectRoot (
            "src-tauri\target\release\bundle\nsis\" +
            "WeatherPoem_${version}_x64-setup.exe"
        )
    )
)
$expectedInstallerRoot = [IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\target\release\bundle\nsis")
).TrimEnd("\") + "\"
if (
    -not $installerPath.StartsWith(
        $expectedInstallerRoot,
        [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not (Test-Path -LiteralPath $installerPath -PathType Leaf)
) {
    throw "NSIS installer is missing from the expected release directory"
}

$existingInstallations = @(Get-WeatherPoemInstallations)
$existingAutostart = @(Get-WeatherPoemAutostart)
$existingShortcuts = @(Get-WeatherPoemShortcuts)
$runningProcesses = @(
    Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue
)
if ($existingInstallations.Count -gt 0) {
    throw "Existing WeatherPoem installation detected; refusing to overwrite it"
}
if ($existingAutostart.Count -gt 0) {
    throw "Existing WeatherPoem autostart entry detected; refusing to overwrite it"
}
if ($existingShortcuts.Count -gt 0) {
    throw "Existing WeatherPoem shortcut detected; refusing to overwrite it"
}
if ($runningProcesses.Count -gt 0) {
    throw "Running WeatherPoem process detected; lifecycle test stopped"
}

$tempBase = [IO.Path]::GetFullPath(
    [IO.Path]::GetTempPath()
).TrimEnd("\") + "\"
$installRoot = [IO.Path]::GetFullPath(
    (
        Join-Path $tempBase (
            "weatherpoem-nsis-lifecycle-" +
            [Guid]::NewGuid().ToString("N")
        )
    )
)
$installLeaf = Split-Path -Leaf $installRoot
if (
    -not $installRoot.StartsWith(
        $tempBase,
        [StringComparison]::OrdinalIgnoreCase
    ) -or
    $installLeaf -notmatch "^weatherpoem-nsis-lifecycle-[a-f0-9]{32}$"
) {
    throw "Temporary install path failed containment validation"
}
if (Test-Path -LiteralPath $installRoot) {
    throw "Temporary install directory already exists"
}

$appDataCandidates = @(
    (Join-Path $env:APPDATA "cn.weatherpoem.desktop"),
    (Join-Path $env:LOCALAPPDATA "cn.weatherpoem.desktop")
)
$appDataBefore = @(
    $appDataCandidates |
        ForEach-Object {
            [pscustomobject]@{
                path = $_
                exists = Test-Path -LiteralPath $_
            }
        }
)

$appProcess = $null
$uninstallerPath = $null
$completed = $false
try {
    Invoke-CheckedProcess `
        -FilePath $installerPath `
        -Arguments @("/S", "/D=$installRoot") `
        -TimeoutSeconds 120

    if (-not (Test-Path -LiteralPath $installRoot -PathType Container)) {
        throw "Silent NSIS install did not create the expected directory"
    }
    $appCandidates = @(
        Get-ChildItem -LiteralPath $installRoot -Filter "*.exe" -File |
            Where-Object { $_.Name -notlike "uninstall*" }
    )
    if ($appCandidates.Count -ne 1) {
        throw "Unexpected installed app executable count: $($appCandidates.Count)"
    }
    $uninstallCandidates = @(
        Get-ChildItem -LiteralPath $installRoot -Filter "uninstall*.exe" -File
    )
    if ($uninstallCandidates.Count -ne 1) {
        throw "Unexpected uninstaller count: $($uninstallCandidates.Count)"
    }
    $appPath = $appCandidates[0].FullName
    $uninstallerPath = $uninstallCandidates[0].FullName

    $installedRecords = @(Get-WeatherPoemInstallations)
    if ($installedRecords.Count -ne 1) {
        throw "Unexpected uninstall registration count: $($installedRecords.Count)"
    }
    $registeredInstallLocation = (
        [string]$installedRecords[0].InstallLocation
    ).Trim().Trim('"')
    if (
        -not $registeredInstallLocation -or
        [IO.Path]::GetFullPath(
            $registeredInstallLocation
        ).TrimEnd("\") -ne $installRoot.TrimEnd("\")
    ) {
        throw "Uninstall registration points outside the temporary install root"
    }

    $appProcess = Start-Process `
        -FilePath $appPath `
        -ArgumentList @("--autostart") `
        -PassThru `
        -WindowStyle Hidden
    Start-Sleep -Seconds $LaunchSeconds
    if ($appProcess.HasExited) {
        throw "Installed app exited before $LaunchSeconds seconds"
    }
    Stop-Process -Id $appProcess.Id -ErrorAction Stop
    $appProcess.WaitForExit(10000) | Out-Null
    $appProcess = $null

    $noticeVerifier = Join-Path `
        $projectRoot `
        "scripts\verify-installed-notice.mjs"
    $noticeEvidencePath = [IO.Path]::GetFullPath(
        (
            Join-Path `
                $projectRoot `
                "output\WeatherPoem_${version}_INSTALLED_NOTICE.json"
        )
    )
    $noticeArguments = @(
        $noticeVerifier,
        "--kind",
        "nsis",
        "--install-root",
        $installRoot,
        "--artifact",
        $installerPath,
        "--output",
        $noticeEvidencePath
    )
    & node $noticeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Installed NSIS NOTICE verification failed"
    }

    Invoke-CheckedProcess `
        -FilePath $uninstallerPath `
        -Arguments @("/S") `
        -TimeoutSeconds 120

    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while (
        (Test-Path -LiteralPath $installRoot) -and
        [DateTime]::UtcNow -lt $deadline
    ) {
        Start-Sleep -Milliseconds 250
    }

    $remainingInstallations = @(Get-WeatherPoemInstallations)
    $remainingAutostart = @(Get-WeatherPoemAutostart)
    $remainingShortcuts = @(Get-WeatherPoemShortcuts)
    if (Test-Path -LiteralPath $installRoot) {
        throw "Temporary install directory remains after uninstall: $installRoot"
    }
    if ($remainingInstallations.Count -gt 0) {
        throw "WeatherPoem uninstall registration remains after uninstall"
    }
    if ($remainingAutostart.Count -gt 0) {
        throw "WeatherPoem autostart entry remains after uninstall"
    }
    if ($remainingShortcuts.Count -gt 0) {
        throw "WeatherPoem shortcut remains after uninstall"
    }

    $appDataAfter = @(
        $appDataCandidates |
            ForEach-Object {
                [pscustomobject]@{
                    path = $_
                    exists = Test-Path -LiteralPath $_
                }
            }
    )
    $signature = Get-AuthenticodeSignature -LiteralPath $installerPath
    $report = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        version = $version
        testedAt = [DateTime]::UtcNow.ToString("o")
        os = [Environment]::OSVersion.VersionString
        architecture = $env:PROCESSOR_ARCHITECTURE
        installer = [ordered]@{
            path = $installerPath
            sha256 = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
            authenticodeStatus = [string]$signature.Status
        }
        isolation = [ordered]@{
            existingInstallationProtected = $true
            temporaryInstallRoot = $installRoot
            applicationDataDeleted = $false
            applicationDataBefore = $appDataBefore
            applicationDataAfter = $appDataAfter
        }
        checks = [ordered]@{
            silentInstall = "passed"
            installedExecutableCount = $appCandidates.Count
            uninstallExecutableCount = $uninstallCandidates.Count
            uninstallRegistration = "passed"
            installedLaunchSeconds = $LaunchSeconds
            installedLaunch = "passed"
            silentUninstall = "passed"
            installDirectoryRemoved = "passed"
            uninstallRegistrationRemoved = "passed"
            shortcutResidue = "passed"
            autostartResidue = "passed"
        }
        result = "passed"
    }
    $reportPath = Join-Path (
        Join-Path $projectRoot "output"
    ) "WeatherPoem_${version}_NSIS_LIFECYCLE.json"
    $reportJson = $report | ConvertTo-Json -Depth 8
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($reportPath, $reportJson, $utf8NoBom)
    $completed = $true
    Write-Output "NSIS lifecycle test passed: $reportPath"
}
finally {
    if ($appProcess -and -not $appProcess.HasExited) {
        Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if (-not $completed -and (Test-Path -LiteralPath $installRoot)) {
        $fallbackUninstaller = @(
            Get-ChildItem `
                -LiteralPath $installRoot `
                -Filter "uninstall*.exe" `
                -File `
                -ErrorAction SilentlyContinue
        )
        if ($fallbackUninstaller.Count -eq 1) {
            try {
                Invoke-CheckedProcess `
                    -FilePath $fallbackUninstaller[0].FullName `
                    -Arguments @("/S") `
                    -TimeoutSeconds 120
            }
            catch {
                Write-Warning (
                    "Automatic cleanup failed; inspect controlled path: " +
                    $installRoot
                )
            }
        }
    }
}
