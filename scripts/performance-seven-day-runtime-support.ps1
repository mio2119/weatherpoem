Set-StrictMode -Version Latest

$script:EsContinuous = [uint32]2147483648
$script:EsSystemRequired = [uint32]1
$script:MaximumSevenDaySampleGapSeconds = 150.0

function Initialize-WeatherPoemNativePower {
    if ($null -eq ("WeatherPoemNativePower" -as [type])) {
        Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;

public static class WeatherPoemNativePower
{
    [StructLayout(LayoutKind.Sequential)]
    public struct SystemPowerStatus
    {
        public byte ACLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public int BatteryLifeTime;
        public int BatteryFullLifeTime;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint executionState);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemPowerStatus(
        out SystemPowerStatus systemPowerStatus
    );

    public static byte GetAcLineStatus()
    {
        SystemPowerStatus status;
        return GetSystemPowerStatus(out status)
            ? status.ACLineStatus
            : (byte)255;
    }
}
"@
    }
}

function Invoke-WeatherPoemExecutionState {
    param([uint32]$Flags)

    Initialize-WeatherPoemNativePower

    return [uint32][WeatherPoemNativePower]::SetThreadExecutionState($Flags)
}

function Get-SevenDayAcLineStatus {
    Initialize-WeatherPoemNativePower

    return [byte][WeatherPoemNativePower]::GetAcLineStatus()
}

function Assert-SevenDayAcPower {
    param([scriptblock]$NativeCall = $null)

    $status = if ($null -eq $NativeCall) {
        Get-SevenDayAcLineStatus
    }
    else {
        & $NativeCall
    }
    if ([byte]$status -ne [byte]1) {
        throw "Seven-day sampling requires continuous AC power."
    }

    return $true
}

function Enter-SevenDayExecutionState {
    param([scriptblock]$NativeCall = $null)

    $requested = [uint32](
        $script:EsContinuous -bor $script:EsSystemRequired
    )
    $previous = if ($null -eq $NativeCall) {
        Invoke-WeatherPoemExecutionState -Flags $requested
    }
    else {
        & $NativeCall $requested
    }
    if ([uint32]$previous -eq 0) {
        throw "Could not prevent system sleep for seven-day sampling."
    }

    return $true
}

function Exit-SevenDayExecutionState {
    param(
        [bool]$Held,
        [scriptblock]$NativeCall = $null
    )

    if (-not $Held) {
        return $true
    }
    $restored = if ($null -eq $NativeCall) {
        Invoke-WeatherPoemExecutionState -Flags $script:EsContinuous
    }
    else {
        & $NativeCall $script:EsContinuous
    }

    return ([uint32]$restored -ne 0)
}

function Assert-SevenDaySampleContinuity {
    param(
        [ValidateSet("eight-hour", "seven-day", "rehearsal")]
        [string]$EvidenceMode,
        [object]$PreviousSample,
        [object]$CurrentSample
    )

    if ($EvidenceMode -ne "seven-day" -or $null -eq $PreviousSample) {
        return
    }
    $elapsedGap = (
        [double]$CurrentSample.elapsedSeconds -
        [double]$PreviousSample.elapsedSeconds
    )
    $recordedGap = (
        [DateTimeOffset]::Parse([string]$CurrentSample.recordedAt) -
        [DateTimeOffset]::Parse([string]$PreviousSample.recordedAt)
    ).TotalSeconds
    if (
        $elapsedGap -gt $script:MaximumSevenDaySampleGapSeconds -or
        $recordedGap -gt $script:MaximumSevenDaySampleGapSeconds
    ) {
        throw "Seven-day sample continuity exceeded 150 seconds."
    }
}
