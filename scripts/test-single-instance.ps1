param(
    [int]$TimeoutSeconds = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$securityModule = Join-Path $PSHOME "Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1"
Import-Module -Name $securityModule -ErrorAction Stop
$utilityModule = Join-Path $PSHOME "Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1"
Import-Module -Name $utilityModule -ErrorAction Stop

if ($TimeoutSeconds -lt 5 -or $TimeoutSeconds -gt 60) {
    throw "TimeoutSeconds must be between 5 and 60"
}

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class WeatherPoemWindowProbe
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(
        IntPtr hWnd,
        StringBuilder text,
        int maximumCount
    );

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

    public static IntPtr[] VisibleWindows(int processId)
    {
        var windows = new List<IntPtr>();
        EnumWindows((hWnd, lParam) =>
        {
            uint owner;
            GetWindowThreadProcessId(hWnd, out owner);
            RECT rect;
            var hasRect = GetWindowRect(hWnd, out rect);
            var hasArea = hasRect &&
                rect.Right > rect.Left &&
                rect.Bottom > rect.Top;
            var titleLength = GetWindowTextLength(hWnd);
            var title = new StringBuilder(titleLength + 1);
            GetWindowText(hWnd, title, title.Capacity);
            var isProductWindow = title.ToString().StartsWith(
                "WeatherPoem",
                StringComparison.Ordinal
            );
            if (
                owner == processId &&
                IsWindowVisible(hWnd) &&
                hasArea &&
                isProductWindow
            )
            {
                windows.Add(hWnd);
            }
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static int CloseVisibleWindows(int processId)
    {
        const uint WM_CLOSE = 0x0010;
        var windows = VisibleWindows(processId);
        foreach (var window in windows)
        {
            PostMessage(window, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
        }
        return windows.Length;
    }
}
"@

function Wait-ForCondition {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Condition,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (& $Condition) {
            return
        }
        Start-Sleep -Milliseconds 200
    }
    throw $FailureMessage
}

$projectRoot = [IO.Path]::GetFullPath(
    (Split-Path -Parent $PSScriptRoot)
)
$packageJson = Get-Content `
    -LiteralPath (Join-Path $projectRoot "package.json") `
    -Raw |
    ConvertFrom-Json
$version = [string]$packageJson.version
$appPath = [IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\target\release\weatherpoem.exe")
)
$releaseRoot = [IO.Path]::GetFullPath(
    (Join-Path $projectRoot "src-tauri\target\release")
).TrimEnd("\") + "\"
if (
    -not $appPath.StartsWith(
        $releaseRoot,
        [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not (Test-Path -LiteralPath $appPath -PathType Leaf)
) {
    throw "Release executable is missing from the expected directory"
}

$existing = @(
    Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue
)
if ($existing.Count -gt 0) {
    throw "Running WeatherPoem process detected; single-instance test stopped"
}

$primary = $null
$secondary = $null
$completed = $false
try {
    $primary = Start-Process `
        -FilePath $appPath `
        -PassThru `
        -WindowStyle Hidden
    Wait-ForCondition `
        -Condition {
            -not $primary.HasExited -and
            [WeatherPoemWindowProbe]::VisibleWindows(
                $primary.Id
            ).Count -gt 0
        } `
        -FailureMessage "Primary instance did not show its main window"

    $visibleBeforeClose = (
        [WeatherPoemWindowProbe]::VisibleWindows($primary.Id)
    ).Count
    $closeMessages = (
        [WeatherPoemWindowProbe]::CloseVisibleWindows($primary.Id)
    )
    if ($closeMessages -lt 1) {
        throw "No visible primary window accepted WM_CLOSE"
    }
    Wait-ForCondition `
        -Condition {
            -not $primary.HasExited -and
            [WeatherPoemWindowProbe]::VisibleWindows(
                $primary.Id
            ).Count -eq 0
        } `
        -FailureMessage "Primary window did not hide to tray after close"

    $secondary = Start-Process `
        -FilePath $appPath `
        -PassThru `
        -WindowStyle Hidden
    if (-not $secondary.WaitForExit($TimeoutSeconds * 1000)) {
        throw "Secondary instance did not exit through the single-instance plugin"
    }
    $secondary.Refresh()
    if ($secondary.ExitCode -ne 0) {
        throw "Secondary instance exit code was $($secondary.ExitCode)"
    }
    Wait-ForCondition `
        -Condition {
            -not $primary.HasExited -and
            [WeatherPoemWindowProbe]::VisibleWindows(
                $primary.Id
            ).Count -gt 0
        } `
        -FailureMessage "Secondary launch did not reveal the primary window"

    $matchingProcesses = @(
        Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Id -eq $primary.Id -or
                (
                    $_.Path -and
                    [IO.Path]::GetFullPath($_.Path) -eq $appPath
                )
            }
    )
    if (
        $matchingProcesses.Count -ne 1 -or
        $matchingProcesses[0].Id -ne $primary.Id
    ) {
        throw "Single-instance invariant failed after secondary launch"
    }

    $visibleAfterReveal = (
        [WeatherPoemWindowProbe]::VisibleWindows($primary.Id)
    ).Count
    $signature = Get-AuthenticodeSignature -LiteralPath $appPath
    $report = [ordered]@{
        schemaVersion = "1.0"
        product = "WeatherPoem"
        version = $version
        testedAt = [DateTime]::UtcNow.ToString("o")
        os = [Environment]::OSVersion.VersionString
        architecture = $env:PROCESSOR_ARCHITECTURE
        executable = [ordered]@{
            path = $appPath
            sha256 = (Get-FileHash -LiteralPath $appPath -Algorithm SHA256).Hash
            authenticodeStatus = [string]$signature.Status
        }
        checks = [ordered]@{
            primaryWindowVisible = if ($visibleBeforeClose -gt 0) {
                "passed"
            }
            else {
                "failed"
            }
            closeRequestHidesToTray = "passed"
            primaryRemainsRunningAfterClose = "passed"
            secondaryExited = "passed"
            secondaryExitCode = $secondary.ExitCode
            singleProcessAfterSecondary = "passed"
            secondaryRevealsPrimary = if ($visibleAfterReveal -gt 0) {
                "passed"
            }
            else {
                "failed"
            }
        }
        result = "passed"
    }
    $reportPath = Join-Path (
        Join-Path $projectRoot "output"
    ) "WeatherPoem_${version}_SINGLE_INSTANCE.json"
    $reportJson = $report | ConvertTo-Json -Depth 8
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($reportPath, $reportJson, $utf8NoBom)
    $completed = $true
    Write-Output "Single-instance lifecycle test passed: $reportPath"
}
finally {
    if ($secondary -and -not $secondary.HasExited) {
        Stop-Process -Id $secondary.Id -Force -ErrorAction SilentlyContinue
    }
    if ($primary -and -not $primary.HasExited) {
        Stop-Process -Id $primary.Id -Force -ErrorAction SilentlyContinue
        $primary.WaitForExit(10000) | Out-Null
    }
    if (-not $completed) {
        Write-Warning "Single-instance test did not complete"
    }
}
