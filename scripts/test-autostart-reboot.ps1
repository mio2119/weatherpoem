param(
    [Parameter(Mandatory = $true)]
    [ValidateSet(
        "PrepareEnable",
        "VerifyEnable",
        "PrepareDisable",
        "VerifyDisable",
        "Status",
        "Abort"
    )]
    [string]$Mode,
    [int]$ObservationSeconds = 10
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
                    displayIcon = [string]$_.DisplayIcon
                    registryPath = [string]$_.PSPath
                }
            }
    }
    return @($records)
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

function Get-WeatherPoemProcesses {
    return @(
        Get-CimInstance Win32_Process `
            -Filter "Name = 'weatherpoem.exe'" `
            -ErrorAction SilentlyContinue |
            ForEach-Object {
                $created = if ($_.CreationDate) {
                    ([DateTime]$_.CreationDate).ToUniversalTime().ToString("o")
                }
                else {
                    $null
                }
                [pscustomobject]@{
                    processId = [int]$_.ProcessId
                    executablePath = [string]$_.ExecutablePath
                    commandLine = [string]$_.CommandLine
                    startedAt = $created
                }
            }
    )
}

function Get-BootTimeUtc {
    $os = Get-CimInstance Win32_OperatingSystem
    return ([DateTime]$os.LastBootUpTime).ToUniversalTime().ToString("o")
}

function Get-CurrentUserSid {
    return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
}

function Get-Sha256Text {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
        return (
            [BitConverter]::ToString(
                $sha256.ComputeHash($bytes)
            ).Replace("-", "")
        )
    }
    finally {
        $sha256.Dispose()
    }
}

function Test-SamePath {
    param(
        [string]$Left,
        [string]$Right
    )
    if (-not $Left -or -not $Right) {
        return $false
    }
    try {
        return [IO.Path]::GetFullPath($Left).TrimEnd("\") -ieq
            [IO.Path]::GetFullPath($Right).TrimEnd("\")
    }
    catch {
        return $false
    }
}

function Assert-EnabledAutostart {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Entries,
        [Parameter(Mandatory = $true)]
        [string]$ExecutablePath
    )
    if ($Entries.Count -ne 1) {
        throw "Expected exactly one WeatherPoem autostart registration"
    }
    $value = [string]$Entries[0].value
    if (
        $value.IndexOf(
            $ExecutablePath,
            [StringComparison]::OrdinalIgnoreCase
        ) -lt 0
    ) {
        throw "Autostart registration does not target the installed executable"
    }
    if ($value -notmatch "(?i)(?:^|\s)--autostart(?:\s|$)") {
        throw "Autostart registration is missing the --autostart argument"
    }
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [object]$Value
    )
    $json = $Value | ConvertTo-Json -Depth 12
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Read-State {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "No pending autostart reboot state exists"
    }
    return Get-Content -LiteralPath $Path -Encoding utf8 -Raw |
        ConvertFrom-Json
}

function Assert-StateBinding {
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$State,
        [Parameter(Mandatory = $true)]
        [string]$Version,
        [Parameter(Mandatory = $true)]
        [string]$MachineBinding,
        [Parameter(Mandatory = $true)]
        [string]$UserBinding,
        [Parameter(Mandatory = $true)]
        [string]$ExecutablePath,
        [Parameter(Mandatory = $true)]
        [string]$ExecutableHash
    )
    if (
        $State.schemaVersion -ne "1.0" -or
        $State.product -ne "WeatherPoem" -or
        $State.version -ne $Version -or
        $State.machineBindingSha256 -ne $MachineBinding -or
        $State.userBindingSha256 -ne $UserBinding -or
        -not (Test-SamePath $State.executable.path $ExecutablePath) -or
        $State.executable.sha256 -ne $ExecutableHash
    ) {
        throw (
            "Pending autostart state belongs to another build, user, " +
            "machine, or installed executable"
        )
    }
}

if ($ObservationSeconds -lt 5 -or $ObservationSeconds -gt 60) {
    throw "ObservationSeconds must be between 5 and 60"
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
$statePath = Join-Path (
    Join-Path $projectRoot "output"
) "WeatherPoem_${version}_AUTOSTART_REBOOT_STATE.json"
$reportPath = Join-Path (
    Join-Path $projectRoot "output"
) "WeatherPoem_${version}_AUTOSTART_REBOOT.json"

if ($Mode -eq "Status") {
    $state = Read-State -Path $statePath
    $state | ConvertTo-Json -Depth 12
    exit 0
}
if ($Mode -eq "Abort") {
    $state = Read-State -Path $statePath
    $state.phase = "aborted"
    $state | Add-Member `
        -NotePropertyName abortedAt `
        -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) `
        -Force
    Write-JsonFile -Path $statePath -Value $state
    Write-Output (
        "Autostart reboot test marked aborted. No registry, process, " +
        "application data, or reboot state was changed by this script."
    )
    exit 0
}

$installations = @(Get-WeatherPoemInstallations)
if ($installations.Count -ne 1) {
    throw (
        "Install exactly one current WeatherPoem package before running " +
        "the reboot test"
    )
}
if ($installations[0].displayVersion -ne $version) {
    throw "Installed WeatherPoem version does not match the release version"
}
$installedExecutable = Resolve-InstalledExecutable `
    -Installation $installations[0]
$installedHash = (
    Get-FileHash -LiteralPath $installedExecutable -Algorithm SHA256
).Hash
$releaseExecutable = Join-Path (
    Join-Path $projectRoot "src-tauri\target\release"
) "weatherpoem.exe"
if (-not (Test-Path -LiteralPath $releaseExecutable -PathType Leaf)) {
    throw "Current release executable is missing"
}
$releaseHash = (
    Get-FileHash -LiteralPath $releaseExecutable -Algorithm SHA256
).Hash
if ($installedHash -ne $releaseHash) {
    throw "Installed executable does not match the current release artifact"
}
$installedSignature = Get-AuthenticodeSignature `
    -LiteralPath $installedExecutable
$machineName = [Environment]::MachineName
$userSid = Get-CurrentUserSid
$machineBinding = Get-Sha256Text `
    -Value ($machineName.ToUpperInvariant())
$userBinding = Get-Sha256Text -Value $userSid
$bootTime = Get-BootTimeUtc

if ($Mode -eq "PrepareEnable") {
    if (Test-Path -LiteralPath $statePath -PathType Leaf) {
        $previous = Read-State -Path $statePath
        if ($previous.phase -notin @("completed", "aborted")) {
            throw (
                "An autostart reboot test is already pending. Continue it, " +
                "inspect it with Status, or mark it Abort."
            )
        }
    }
    $processes = @(Get-WeatherPoemProcesses)
    if ($processes.Count -gt 0) {
        throw (
            "Exit WeatherPoem from the tray before preparing the enabled " +
            "restart checkpoint"
        )
    }
    $entries = @(Get-WeatherPoemAutostart)
    Assert-EnabledAutostart `
        -Entries $entries `
        -ExecutablePath $installedExecutable

    $state = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        version = $version
        testId = [Guid]::NewGuid().ToString()
        machineBindingSha256 = $machineBinding
        userBindingSha256 = $userBinding
        createdAt = [DateTime]::UtcNow.ToString("o")
        phase = "enabled-awaiting-restart"
        executable = [ordered]@{
            path = $installedExecutable
            sha256 = $installedHash
            authenticodeStatus = [string]$installedSignature.Status
        }
        enabled = [ordered]@{
            preparedAt = [DateTime]::UtcNow.ToString("o")
            bootBefore = $bootTime
            autostartEntry = $entries[0]
        }
        disabled = $null
    }
    Write-JsonFile -Path $statePath -Value $state
    Write-Output (
        "Enabled checkpoint recorded. Restart Windows normally; after " +
        "sign-in, do not manually open or close WeatherPoem, then run " +
        "VerifyEnable."
    )
    exit 0
}

$state = Read-State -Path $statePath
Assert-StateBinding `
    -State $state `
    -Version $version `
    -MachineBinding $machineBinding `
    -UserBinding $userBinding `
    -ExecutablePath $installedExecutable `
    -ExecutableHash $installedHash

if ($Mode -eq "VerifyEnable") {
    if ($state.phase -ne "enabled-awaiting-restart") {
        throw "VerifyEnable requires the enabled-awaiting-restart phase"
    }
    if (
        [DateTime]::Parse($bootTime).ToUniversalTime() -le
        [DateTime]::Parse($state.enabled.bootBefore).ToUniversalTime()
    ) {
        throw "Windows has not restarted since PrepareEnable"
    }
    $entries = @(Get-WeatherPoemAutostart)
    Assert-EnabledAutostart `
        -Entries $entries `
        -ExecutablePath $installedExecutable
    $processes = @(Get-WeatherPoemProcesses)
    if ($processes.Count -ne 1) {
        throw "Expected one WeatherPoem process after enabled restart"
    }
    $process = $processes[0]
    if (-not (Test-SamePath $process.executablePath $installedExecutable)) {
        throw "Autostart process path does not match the installed executable"
    }
    if ($process.commandLine -notmatch "(?i)(?:^|\s)--autostart(?:\s|$)") {
        throw "Autostart process command line is missing --autostart"
    }
    if (
        -not $process.startedAt -or
        [DateTime]::Parse($process.startedAt).ToUniversalTime() -lt
        [DateTime]::Parse($bootTime).ToUniversalTime()
    ) {
        throw "WeatherPoem process did not start after the recorded reboot"
    }
    $state.enabled | Add-Member `
        -NotePropertyName verifiedAt `
        -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) `
        -Force
    $state.enabled | Add-Member `
        -NotePropertyName bootAfter `
        -NotePropertyValue $bootTime `
        -Force
    $state.enabled | Add-Member `
        -NotePropertyName process `
        -NotePropertyValue $process `
        -Force
    $state.enabled | Add-Member `
        -NotePropertyName checks `
        -NotePropertyValue ([ordered]@{
            autostartRegistration = "passed"
            restartOccurred = "passed"
            processStartedAfterRestart = "passed"
            processPath = "passed"
            autostartArgument = "passed"
        }) `
        -Force
    $state.phase = "enabled-verified"
    Write-JsonFile -Path $statePath -Value $state
    Write-Output (
        "Enabled restart verified. In WeatherPoem settings disable startup, " +
        "save, exit from the tray, then run PrepareDisable."
    )
    exit 0
}

if ($Mode -eq "PrepareDisable") {
    if ($state.phase -ne "enabled-verified") {
        throw "PrepareDisable requires the enabled-verified phase"
    }
    $entries = @(Get-WeatherPoemAutostart)
    if ($entries.Count -ne 0) {
        throw "WeatherPoem autostart is still enabled"
    }
    $processes = @(Get-WeatherPoemProcesses)
    if ($processes.Count -ne 0) {
        throw "Exit WeatherPoem from the tray before PrepareDisable"
    }
    $state.disabled = [ordered]@{
        preparedAt = [DateTime]::UtcNow.ToString("o")
        bootBefore = $bootTime
        autostartEntryCount = 0
        processCount = 0
    }
    $state.phase = "disabled-awaiting-restart"
    Write-JsonFile -Path $statePath -Value $state
    Write-Output (
        "Disabled checkpoint recorded. Restart Windows normally; after " +
        "sign-in, do not manually open WeatherPoem, then run VerifyDisable."
    )
    exit 0
}

if ($Mode -ne "VerifyDisable") {
    throw "Unsupported autostart reboot mode"
}
if ($state.phase -ne "disabled-awaiting-restart") {
    throw "VerifyDisable requires the disabled-awaiting-restart phase"
}
if (
    [DateTime]::Parse($bootTime).ToUniversalTime() -le
    [DateTime]::Parse($state.disabled.bootBefore).ToUniversalTime()
) {
    throw "Windows has not restarted since PrepareDisable"
}

Start-Sleep -Seconds $ObservationSeconds
$entries = @(Get-WeatherPoemAutostart)
$processes = @(Get-WeatherPoemProcesses)
if ($entries.Count -ne 0) {
    throw "WeatherPoem autostart registration returned after disable restart"
}
if ($processes.Count -ne 0) {
    throw "WeatherPoem started after autostart was disabled"
}

$verifiedAt = [DateTime]::UtcNow.ToString("o")
$state.disabled | Add-Member `
    -NotePropertyName verifiedAt `
    -NotePropertyValue $verifiedAt `
    -Force
$state.disabled | Add-Member `
    -NotePropertyName bootAfter `
    -NotePropertyValue $bootTime `
    -Force
$state.disabled | Add-Member `
    -NotePropertyName observationSeconds `
    -NotePropertyValue $ObservationSeconds `
    -Force
$state.disabled | Add-Member `
    -NotePropertyName checks `
    -NotePropertyValue ([ordered]@{
        autostartRegistrationAbsent = "passed"
        restartOccurred = "passed"
        processRemainedAbsent = "passed"
    }) `
    -Force
$state.phase = "completed"
$state | Add-Member `
    -NotePropertyName completedAt `
    -NotePropertyValue $verifiedAt `
    -Force
Write-JsonFile -Path $statePath -Value $state

$sanitizedEnabledPhase = [ordered]@{
    preparedAt = $state.enabled.preparedAt
    bootBefore = $state.enabled.bootBefore
    verifiedAt = $state.enabled.verifiedAt
    bootAfter = $state.enabled.bootAfter
    autostart = [ordered]@{
        registrationValueSha256 = Get-Sha256Text `
            -Value ([string]$state.enabled.autostartEntry.value)
        targetExecutableObserved = $true
        autostartArgumentObserved = $true
    }
    process = [ordered]@{
        processId = $state.enabled.process.processId
        executablePathSha256 = Get-Sha256Text `
            -Value (
                ([string]$state.enabled.process.executablePath).ToUpperInvariant()
            )
        commandLineSha256 = Get-Sha256Text `
            -Value ([string]$state.enabled.process.commandLine)
        autostartArgumentObserved = $true
        startedAt = $state.enabled.process.startedAt
    }
    checks = $state.enabled.checks
}
$report = [ordered]@{
    schemaVersion = "1.0"
    product = "WeatherPoem"
    version = $version
    testedAt = $verifiedAt
    scope = "real-os-restart-enable-disable"
    testId = $state.testId
    machine = [ordered]@{
        bindingSha256 = $machineBinding
        userBindingSha256 = $userBinding
    }
    executable = [ordered]@{
        name = "weatherpoem.exe"
        pathSha256 = Get-Sha256Text `
            -Value ($installedExecutable.ToUpperInvariant())
        sha256 = $installedHash
        authenticodeStatus = [string]$installedSignature.Status
    }
    enabledPhase = $sanitizedEnabledPhase
    disabledPhase = $state.disabled
    isolation = [ordered]@{
        autostartStateChangedByScript = $false
        rebootTriggeredByScript = $false
        applicationDataDeleted = $false
    }
    checks = [ordered]@{
        enabledRegistration = "passed"
        restartAfterEnable = "passed"
        launchAfterEnabledRestart = "passed"
        launchCommandContainsAutostart = "passed"
        sameInstalledExecutable = "passed"
        disabledRegistration = "passed"
        restartAfterDisable = "passed"
        noLaunchAfterDisabledRestart = "passed"
    }
    result = "passed"
}
Write-JsonFile -Path $reportPath -Value $report
Write-Output "Autostart enable/disable restart test passed: $reportPath"
