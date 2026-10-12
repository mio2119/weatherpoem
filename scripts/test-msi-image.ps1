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

function Invoke-MsiExec {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [int]$TimeoutSeconds = 180
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
$wixSource = Get-Content -LiteralPath $wixSourcePath -Raw
if ($wixSource -notmatch 'InstallScope="perMachine"') {
    throw "Generated WiX source no longer declares perMachine scope"
}

$existingInstallations = @(Get-WeatherPoemInstallations)
$existingAutostart = @(Get-WeatherPoemAutostart)
$existingShortcuts = @(Get-WeatherPoemShortcuts)
$runningProcesses = @(
    Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue
)
if (
    $existingInstallations.Count -gt 0 -or
    $existingAutostart.Count -gt 0 -or
    $existingShortcuts.Count -gt 0 -or
    $runningProcesses.Count -gt 0
) {
    throw "Existing WeatherPoem state detected; refusing MSI image test"
}

$tempBase = [IO.Path]::GetFullPath(
    [IO.Path]::GetTempPath()
).TrimEnd("\") + "\"
$extractRoot = [IO.Path]::GetFullPath(
    (
        Join-Path $tempBase (
            "weatherpoem-msi-image-" +
            [Guid]::NewGuid().ToString("N")
        )
    )
)
$extractLeaf = Split-Path -Leaf $extractRoot
if (
    -not $extractRoot.StartsWith(
        $tempBase,
        [StringComparison]::OrdinalIgnoreCase
    ) -or
    $extractLeaf -notmatch "^weatherpoem-msi-image-[a-f0-9]{32}$"
) {
    throw "MSI extraction path failed containment validation"
}
if (Test-Path -LiteralPath $extractRoot) {
    throw "MSI extraction path already exists"
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
$completed = $false
try {
    $msiExitCode = Invoke-MsiExec -Arguments @(
        "/a",
        $msiPath,
        "/qn",
        "TARGETDIR=$extractRoot",
        "/norestart"
    )
    if (-not (Test-Path -LiteralPath $extractRoot -PathType Container)) {
        throw "MSI administrative image did not create the target directory"
    }
    $appCandidates = @(
        Get-ChildItem `
            -LiteralPath $extractRoot `
            -Filter "*.exe" `
            -File `
            -Recurse |
            Where-Object { $_.Name -eq "weatherpoem.exe" }
    )
    if ($appCandidates.Count -ne 1) {
        throw "Unexpected MSI payload app count: $($appCandidates.Count)"
    }
    $payloadApp = $appCandidates[0]

    $appProcess = Start-Process `
        -FilePath $payloadApp.FullName `
        -ArgumentList @("--autostart") `
        -PassThru `
        -WindowStyle Hidden
    Start-Sleep -Seconds $LaunchSeconds
    if ($appProcess.HasExited) {
        throw "Extracted MSI payload exited before $LaunchSeconds seconds"
    }
    Stop-Process -Id $appProcess.Id -ErrorAction Stop
    $appProcess.WaitForExit(10000) | Out-Null
    $appProcess = $null

    if (@(Get-WeatherPoemInstallations).Count -gt 0) {
        throw "Administrative image unexpectedly registered an installation"
    }
    if (@(Get-WeatherPoemAutostart).Count -gt 0) {
        throw "Administrative image unexpectedly created an autostart entry"
    }
    if (@(Get-WeatherPoemShortcuts).Count -gt 0) {
        throw "Administrative image unexpectedly created a shortcut"
    }

    $payloadHash = (
        Get-FileHash -LiteralPath $payloadApp.FullName -Algorithm SHA256
    ).Hash
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
    if (Test-Path -LiteralPath $extractRoot) {
        throw "MSI extraction directory remains after controlled cleanup"
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
    $signature = Get-AuthenticodeSignature -LiteralPath $msiPath
    $report = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        version = $version
        testedAt = [DateTime]::UtcNow.ToString("o")
        os = [Environment]::OSVersion.VersionString
        architecture = $env:PROCESSOR_ARCHITECTURE
        scope = "administrative-image-extraction"
        limitations = [ordered]@{
            realInstallTested = $false
            repairTested = $false
            uninstallTested = $false
            reason = "The generated MSI is perMachine and requires an approved elevated test."
        }
        package = [ordered]@{
            path = $msiPath
            sha256 = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash
            authenticodeStatus = [string]$signature.Status
            wixInstallScope = "perMachine"
        }
        isolation = [ordered]@{
            existingInstallationProtected = $true
            temporaryExtractRoot = $extractRoot
            temporaryExtractRootRemoved = $true
            applicationDataDeleted = $false
            applicationDataBefore = $appDataBefore
            applicationDataAfter = $appDataAfter
        }
        checks = [ordered]@{
            administrativeImage = "passed"
            msiexecExitCode = $msiExitCode
            payloadExecutableCount = $appCandidates.Count
            payloadExecutableSha256 = $payloadHash
            payloadLaunchSeconds = $LaunchSeconds
            payloadLaunch = "passed"
            installRegistrationResidue = "passed"
            shortcutResidue = "passed"
            autostartResidue = "passed"
            extractionCleanup = "passed"
        }
        result = "passed"
    }
    $reportPath = Join-Path (
        Join-Path $projectRoot "output"
    ) "WeatherPoem_${version}_MSI_IMAGE.json"
    $reportJson = $report | ConvertTo-Json -Depth 8
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($reportPath, $reportJson, $utf8NoBom)
    $completed = $true
    Write-Output "MSI administrative image test passed: $reportPath"
}
finally {
    if ($appProcess -and -not $appProcess.HasExited) {
        Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if (
        -not $completed -and
        (Test-Path -LiteralPath $extractRoot) -and
        $extractRoot.StartsWith(
            $tempBase,
            [StringComparison]::OrdinalIgnoreCase
        ) -and
        (Split-Path -Leaf $extractRoot) -match
            "^weatherpoem-msi-image-[a-f0-9]{32}$"
    ) {
        Remove-Item -LiteralPath $extractRoot -Recurse -Force `
            -ErrorAction SilentlyContinue
    }
}
