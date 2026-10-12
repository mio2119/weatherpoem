param(
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

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}

function Get-OptionalPropertyValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )
    $property = $InputObject.PSObject.Properties[$Name]
    if (-not $property) {
        return ""
    }
    return [string]$property.Value
}

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
                    displayName = Get-OptionalPropertyValue `
                        -InputObject $_ `
                        -Name "DisplayName"
                    displayVersion = Get-OptionalPropertyValue `
                        -InputObject $_ `
                        -Name "DisplayVersion"
                    installLocation = Get-OptionalPropertyValue `
                        -InputObject $_ `
                        -Name "InstallLocation"
                    displayIcon = Get-OptionalPropertyValue `
                        -InputObject $_ `
                        -Name "DisplayIcon"
                    uninstallString = Get-OptionalPropertyValue `
                        -InputObject $_ `
                        -Name "UninstallString"
                    productCode = Get-OptionalPropertyValue `
                        -InputObject $_ `
                        -Name "PSChildName"
                    registryPath = Get-OptionalPropertyValue `
                        -InputObject $_ `
                        -Name "PSPath"
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

function Invoke-MsiExec {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [int]$TimeoutSeconds = 240
    )
    $process = Start-Process `
        -FilePath "msiexec.exe" `
        -ArgumentList $Arguments `
        -PassThru `
        -WindowStyle Hidden
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "msiexec timed out"
    }
    $process.Refresh()
    if ($process.ExitCode -notin @(0, 3010)) {
        throw "Unexpected msiexec exit code: $($process.ExitCode)"
    }
    return $process.ExitCode
}

function Resolve-InstalledExecutable {
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$Installation
    )
    $candidates = @()
    $installLocation = ([string]$Installation.installLocation).Trim().Trim('"')
    if ($installLocation) {
        $fullInstallLocation = [IO.Path]::GetFullPath($installLocation)
        if (
            $fullInstallLocation -eq [IO.Path]::GetPathRoot(
                $fullInstallLocation
            )
        ) {
            throw "Registered install location resolves to a drive root"
        }
        $candidates += Join-Path $fullInstallLocation "weatherpoem.exe"
    }
    $displayIcon = ([string]$Installation.displayIcon).Trim()
    if ($displayIcon) {
        $iconPath = ($displayIcon -split ",", 2)[0].Trim().Trim('"')
        if ($iconPath) {
            $candidates += $iconPath
        }
    }
    $existing = @(
        $candidates |
            ForEach-Object {
                try {
                    [IO.Path]::GetFullPath($_)
                }
                catch {
                    $null
                }
            } |
            Where-Object {
                $_ -and
                    (Split-Path -Leaf $_) -ieq "weatherpoem.exe" -and
                    (Test-Path -LiteralPath $_ -PathType Leaf)
            } |
            Sort-Object -Unique
    )
    if ($existing.Count -ne 1) {
        throw "Unable to resolve exactly one installed WeatherPoem executable"
    }
    return $existing[0]
}

function Get-ApplicationDataObservation {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Paths
    )
    return @(
        $Paths |
            ForEach-Object {
                [pscustomobject]@{
                    path = $_
                    exists = Test-Path -LiteralPath $_
                }
            }
    )
}

function Test-PreexistingApplicationDataPreserved {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Before,
        [Parameter(Mandatory = $true)]
        [object[]]$After
    )
    foreach ($item in $Before) {
        if (-not $item.exists) {
            continue
        }
        $match = @(
            $After | Where-Object { $_.path -eq $item.path }
        )
        if ($match.Count -ne 1 -or -not $match[0].exists) {
            return $false
        }
    }
    return $true
}

if ($LaunchSeconds -lt 6 -or $LaunchSeconds -gt 30) {
    throw "LaunchSeconds must be between 6 and 30"
}

$projectRoot = [IO.Path]::GetFullPath(
    (Split-Path -Parent $PSScriptRoot)
)
$packageJson = Get-Content `
    -LiteralPath (Join-Path $projectRoot "package.json") `
    -Encoding utf8 `
    -Raw |
    ConvertFrom-Json
$version = [string]$packageJson.version
$msiPath = [IO.Path]::GetFullPath(
    (
        Join-Path $projectRoot (
            "src-tauri\target\release\bundle\msi\" +
            "WeatherPoem_${version}_x64_en-US.msi"
        )
    )
)
$expectedMsiRoot = [IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\target\release\bundle\msi")
).TrimEnd("\") + "\"
if (
    -not $msiPath.StartsWith(
        $expectedMsiRoot,
        [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not (Test-Path -LiteralPath $msiPath -PathType Leaf)
) {
    throw "MSI package is missing from the expected release directory"
}

$wixSourcePath = Join-Path (
    Join-Path $projectRoot "src-tauri\target\release\wix\x64"
) "main.wxs"
$wixSource = Get-Content -LiteralPath $wixSourcePath -Encoding utf8 -Raw
if ($wixSource -notmatch 'InstallScope="perMachine"') {
    throw "Generated WiX source no longer declares perMachine scope"
}

$existingInstallations = @(Get-WeatherPoemInstallations)
$existingAutostart = @(Get-WeatherPoemAutostart)
$existingShortcuts = @(Get-WeatherPoemShortcuts)
$runningProcesses = @(
    Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue
)
$isAdministrator = Test-IsAdministrator
$hasConflictingState = (
    $existingInstallations.Count -gt 0 -or
    $existingAutostart.Count -gt 0 -or
    $existingShortcuts.Count -gt 0 -or
    $runningProcesses.Count -gt 0
)
if ($Preflight) {
    [ordered]@{
        preflightOnly = $true
        product = "WeatherPoem"
        version = $version
        packagePath = $msiPath
        packageSha256 = (
            Get-FileHash -LiteralPath $msiPath -Algorithm SHA256
        ).Hash
        wixInstallScope = "perMachine"
        administrator = $isAdministrator
        explicitLifecycleConfirmation = [bool]$ConfirmLifecycle
        existingInstallationCount = $existingInstallations.Count
        existingAutostartCount = $existingAutostart.Count
        existingShortcutCount = $existingShortcuts.Count
        runningProcessCount = $runningProcesses.Count
        readyForApprovedRun = (
            $isAdministrator -and
            -not $hasConflictingState
        )
        stateChanged = $false
    } | ConvertTo-Json -Depth 5
    exit 0
}
if (-not $ConfirmLifecycle) {
    throw (
        "This test installs, repairs, and uninstalls the current per-machine " +
        "MSI. Re-run from an approved elevated PowerShell session with " +
        "-ConfirmLifecycle. Use -Preflight for a read-only readiness check."
    )
}
if (-not $isAdministrator) {
    throw "The MSI lifecycle test requires an elevated Administrator session."
}
if ($hasConflictingState) {
    throw (
        "Existing WeatherPoem installation, process, shortcut, or autostart " +
        "state detected; refusing to overwrite it."
    )
}

$evidenceRoot = [IO.Path]::GetFullPath(
    (Join-Path $projectRoot "output\windows-manual-evidence")
)
$expectedEvidenceRoot = [IO.Path]::GetFullPath(
    (Join-Path $projectRoot "output")
).TrimEnd("\") + "\"
if (
    -not $evidenceRoot.StartsWith(
        $expectedEvidenceRoot,
        [StringComparison]::OrdinalIgnoreCase
    )
) {
    throw "Evidence directory failed containment validation"
}
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

$runId = [Guid]::NewGuid().ToString("N")
$installLog = Join-Path $evidenceRoot "msi-$runId-install.log"
$repairLog = Join-Path $evidenceRoot "msi-$runId-repair.log"
$uninstallLog = Join-Path $evidenceRoot "msi-$runId-uninstall.log"
$appDataPaths = @(
    (Join-Path $env:APPDATA "cn.weatherpoem.desktop"),
    (Join-Path $env:LOCALAPPDATA "cn.weatherpoem.desktop")
)
$appDataBefore = @(
    Get-ApplicationDataObservation -Paths $appDataPaths
)

$appProcess = $null
$installedByThisRun = $false
$productCode = $null
$installLocation = $null
$cleanupAttempted = $false
$completed = $false
try {
    $installExitCode = Invoke-MsiExec -Arguments @(
        "/i",
        "`"$msiPath`"",
        "/qn",
        "/norestart",
        "/l*v",
        "`"$installLog`""
    )
    if ($installExitCode -ne 0) {
        throw "MSI install requested a reboot; lifecycle evidence is incomplete"
    }
    $installedByThisRun = $true

    $installedRecords = @(Get-WeatherPoemInstallations)
    if ($installedRecords.Count -ne 1) {
        throw "Unexpected MSI installation registration count"
    }
    $installation = $installedRecords[0]
    if ($installation.displayVersion -ne $version) {
        throw "Installed MSI version does not match the release version"
    }
    $productCode = $installation.productCode.ToUpperInvariant()
    if (
        $productCode -notmatch
            "^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$"
    ) {
        throw "MSI uninstall registration is missing a valid product code"
    }

    $installedAppPath = Resolve-InstalledExecutable `
        -Installation $installation
    $installLocation = Split-Path -Parent $installedAppPath
    $installedAppHash = (
        Get-FileHash -LiteralPath $installedAppPath -Algorithm SHA256
    ).Hash
    $installedAppSignature = Get-AuthenticodeSignature `
        -LiteralPath $installedAppPath

    $appProcess = Start-Process `
        -FilePath $installedAppPath `
        -ArgumentList @("--autostart") `
        -PassThru `
        -WindowStyle Hidden
    Start-Sleep -Seconds $LaunchSeconds
    if ($appProcess.HasExited) {
        throw "Installed MSI payload exited before $LaunchSeconds seconds"
    }
    Stop-Process -Id $appProcess.Id -ErrorAction Stop
    $appProcess.WaitForExit(10000) | Out-Null
    $appProcess = $null

    $repairExitCode = Invoke-MsiExec -Arguments @(
        "/fa",
        $productCode,
        "/qn",
        "/norestart",
        "/l*v",
        "`"$repairLog`""
    )
    if ($repairExitCode -ne 0) {
        throw "MSI repair requested a reboot; lifecycle evidence is incomplete"
    }
    $repairedRecords = @(Get-WeatherPoemInstallations)
    if ($repairedRecords.Count -ne 1) {
        throw "MSI repair changed the installation registration count"
    }
    $repairedAppPath = Resolve-InstalledExecutable `
        -Installation $repairedRecords[0]
    $repairedAppHash = (
        Get-FileHash -LiteralPath $repairedAppPath -Algorithm SHA256
    ).Hash
    if (
        $repairedAppPath -ne $installedAppPath -or
        $repairedAppHash -ne $installedAppHash
    ) {
        throw "MSI repair did not restore the same installed executable"
    }

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
        "msi",
        "--install-root",
        $installLocation,
        "--artifact",
        $msiPath,
        "--output",
        $noticeEvidencePath
    )
    & node $noticeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Installed MSI NOTICE verification failed"
    }

    $uninstallExitCode = Invoke-MsiExec -Arguments @(
        "/x",
        $productCode,
        "/qn",
        "/norestart",
        "/l*v",
        "`"$uninstallLog`""
    )
    $cleanupAttempted = $true
    if ($uninstallExitCode -ne 0) {
        throw "MSI uninstall requested a reboot; lifecycle evidence is incomplete"
    }
    $installedByThisRun = $false

    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (
        (
            @(Get-WeatherPoemInstallations).Count -gt 0 -or
            (Test-Path -LiteralPath $installLocation)
        ) -and
        [DateTime]::UtcNow -lt $deadline
    ) {
        Start-Sleep -Milliseconds 250
    }

    $remainingInstallations = @(Get-WeatherPoemInstallations)
    $remainingAutostart = @(Get-WeatherPoemAutostart)
    $remainingShortcuts = @(Get-WeatherPoemShortcuts)
    $remainingProcesses = @(
        Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue
    )
    if ($remainingInstallations.Count -gt 0) {
        throw "MSI uninstall registration remains after uninstall"
    }
    if (Test-Path -LiteralPath $installLocation) {
        throw "MSI install directory remains after uninstall"
    }
    if ($remainingAutostart.Count -gt 0) {
        throw "WeatherPoem autostart state remains after MSI uninstall"
    }
    if ($remainingShortcuts.Count -gt 0) {
        throw "WeatherPoem shortcut remains after MSI uninstall"
    }
    if ($remainingProcesses.Count -gt 0) {
        throw "WeatherPoem process remains after MSI uninstall"
    }

    $appDataAfter = @(
        Get-ApplicationDataObservation -Paths $appDataPaths
    )
    if (
        -not (
            Test-PreexistingApplicationDataPreserved `
                -Before $appDataBefore `
                -After $appDataAfter
        )
    ) {
        throw "Pre-existing WeatherPoem application data was removed"
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $msiPath
    $report = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        version = $version
        testedAt = [DateTime]::UtcNow.ToString("o")
        os = [Environment]::OSVersion.VersionString
        architecture = $env:PROCESSOR_ARCHITECTURE
        scope = "elevated-per-machine-install-repair-uninstall"
        runId = $runId
        administrator = $true
        package = [ordered]@{
            path = $msiPath
            sha256 = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash
            authenticodeStatus = [string]$signature.Status
            wixInstallScope = "perMachine"
        }
        installedExecutable = [ordered]@{
            path = $installedAppPath
            sha256 = $installedAppHash
            authenticodeStatus = [string]$installedAppSignature.Status
        }
        installation = [ordered]@{
            productCode = $productCode
            installLocation = $installLocation
            logFiles = @($installLog, $repairLog, $uninstallLog)
        }
        isolation = [ordered]@{
            existingInstallationProtected = $true
            explicitLifecycleConfirmation = $true
            cleanupAttempted = $cleanupAttempted
            applicationDataDeleted = $false
            preexistingApplicationDataPreserved = $true
            applicationDataBefore = $appDataBefore
            applicationDataAfter = $appDataAfter
        }
        checks = [ordered]@{
            elevatedSession = "passed"
            perMachineInstall = "passed"
            installExitCode = $installExitCode
            uninstallRegistration = "passed"
            installedExecutableCount = 1
            installedLaunchSeconds = $LaunchSeconds
            installedLaunch = "passed"
            repair = "passed"
            repairExitCode = $repairExitCode
            repairedExecutableHash = "passed"
            uninstall = "passed"
            uninstallExitCode = $uninstallExitCode
            installDirectoryRemoved = "passed"
            uninstallRegistrationRemoved = "passed"
            shortcutResidue = "passed"
            autostartResidue = "passed"
            processResidue = "passed"
        }
        result = "passed"
    }
    $reportPath = Join-Path (
        Join-Path $projectRoot "output"
    ) "WeatherPoem_${version}_MSI_ELEVATED_LIFECYCLE.json"
    $reportJson = $report | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($reportPath, $reportJson, $utf8NoBom)
    $completed = $true
    Write-Output "Elevated MSI lifecycle test passed: $reportPath"
}
finally {
    if ($appProcess -and -not $appProcess.HasExited) {
        Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($installedByThisRun -and $productCode) {
        $cleanupAttempted = $true
        try {
            Invoke-MsiExec -Arguments @(
                "/x",
                $productCode,
                "/qn",
                "/norestart"
            ) | Out-Null
        }
        catch {
            Write-Warning (
                "Automatic MSI cleanup failed. Inspect the Windows Installer " +
                "registration and logs before retrying: $($_.Exception.Message)"
            )
        }
    }
    if (-not $completed) {
        Write-Warning (
            "No passing lifecycle report was written. Logs, if created, are " +
            "under $evidenceRoot."
        )
    }
}
