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

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WeatherPoemPositionProbe
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(
        IntPtr hWnd,
        StringBuilder text,
        int maximumCount
    );

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(
        IntPtr hWnd,
        uint message,
        IntPtr wParam,
        IntPtr lParam
    );

    public static IntPtr FindProductWindow(int processId)
    {
        var match = IntPtr.Zero;
        EnumWindows((hWnd, lParam) =>
        {
            uint owner;
            GetWindowThreadProcessId(hWnd, out owner);
            if (owner != processId || !IsWindowVisible(hWnd))
            {
                return true;
            }
            RECT rect;
            if (
                !GetWindowRect(hWnd, out rect) ||
                rect.Right <= rect.Left ||
                rect.Bottom <= rect.Top
            )
            {
                return true;
            }
            var length = GetWindowTextLength(hWnd);
            var title = new StringBuilder(length + 1);
            GetWindowText(hWnd, title, title.Capacity);
            if (
                title.ToString().StartsWith(
                    "WeatherPoem",
                    StringComparison.Ordinal
                )
            )
            {
                match = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return match;
    }
}
"@

function Wait-ForProductWindow {
    param(
        [Parameter(Mandatory = $true)]
        [System.Diagnostics.Process]$Process
    )
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Process.HasExited) {
            throw "WeatherPoem exited before its product window appeared"
        }
        $handle = [WeatherPoemPositionProbe]::FindProductWindow(
            $Process.Id
        )
        if ($handle -ne [IntPtr]::Zero) {
            return $handle
        }
        Start-Sleep -Milliseconds 200
    }
    throw "WeatherPoem product window did not appear"
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
if (@(Get-Process -Name "weatherpoem" -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "Running WeatherPoem process detected; position test stopped"
}

$logicalScreens = @([System.Windows.Forms.Screen]::AllScreens)
$physicalMonitorProbeCount = @(
    Get-CimInstance `
        -Namespace "root\wmi" `
        -ClassName "WmiMonitorBasicDisplayParams" `
        -ErrorAction SilentlyContinue |
        Where-Object Active
).Count
if ($logicalScreens.Count -lt 1) {
    throw "Windows did not expose a logical display work area"
}

$process = $null
$completed = $false
try {
    $process = Start-Process `
        -FilePath $appPath `
        -PassThru `
        -WindowStyle Hidden
    $windowHandle = Wait-ForProductWindow -Process $process
    $screen = [System.Windows.Forms.Screen]::FromHandle($windowHandle)
    $dpi = [WeatherPoemPositionProbe]::GetDpiForWindow($windowHandle)
    if ($dpi -lt 96) {
        throw "Window DPI was invalid: $dpi"
    }
    $expectedMargin = [Math]::Round(22 * $dpi / 96)
    $tolerance = [Math]::Max(4, [Math]::Round(4 * $dpi / 96))

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $rect = New-Object WeatherPoemPositionProbe+RECT
    $rightGap = [int]::MaxValue
    $bottomGap = [int]::MaxValue
    while ([DateTime]::UtcNow -lt $deadline) {
        [WeatherPoemPositionProbe]::GetWindowRect(
            $windowHandle,
            [ref]$rect
        ) | Out-Null
        $rightGap = $screen.WorkingArea.Right - $rect.Right
        $bottomGap = $screen.WorkingArea.Bottom - $rect.Bottom
        if (
            [Math]::Abs($rightGap - $expectedMargin) -le $tolerance -and
            [Math]::Abs($bottomGap - $expectedMargin) -le $tolerance
        ) {
            break
        }
        Start-Sleep -Milliseconds 200
    }
    if (
        [Math]::Abs($rightGap - $expectedMargin) -gt $tolerance -or
        [Math]::Abs($bottomGap - $expectedMargin) -gt $tolerance
    ) {
        throw (
            "Window margin mismatch: expected $expectedMargin +/- " +
            "$tolerance, actual right=$rightGap bottom=$bottomGap"
        )
    }
    if (
        $rect.Left -lt $screen.WorkingArea.Left -or
        $rect.Top -lt $screen.WorkingArea.Top -or
        $rect.Right -gt $screen.WorkingArea.Right -or
        $rect.Bottom -gt $screen.WorkingArea.Bottom
    ) {
        throw "WeatherPoem window extends outside the logical work area"
    }

    $WM_CLOSE = 0x0010
    [WeatherPoemPositionProbe]::PostMessage(
        $windowHandle,
        $WM_CLOSE,
        [IntPtr]::Zero,
        [IntPtr]::Zero
    ) | Out-Null
    $hideDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while (
        [DateTime]::UtcNow -lt $hideDeadline -and
        [WeatherPoemPositionProbe]::FindProductWindow(
            $process.Id
        ) -ne [IntPtr]::Zero
    ) {
        Start-Sleep -Milliseconds 200
    }
    if ($process.HasExited) {
        throw "Close request exited the app instead of hiding it"
    }
    if (
        [WeatherPoemPositionProbe]::FindProductWindow(
            $process.Id
        ) -ne [IntPtr]::Zero
    ) {
        throw "Close request did not hide the product window"
    }

    $screenRecords = @(
        $logicalScreens |
            ForEach-Object {
                [ordered]@{
                    deviceName = $_.DeviceName
                    primary = $_.Primary
                    bounds = [ordered]@{
                        x = $_.Bounds.X
                        y = $_.Bounds.Y
                        width = $_.Bounds.Width
                        height = $_.Bounds.Height
                    }
                    workingArea = [ordered]@{
                        x = $_.WorkingArea.X
                        y = $_.WorkingArea.Y
                        width = $_.WorkingArea.Width
                        height = $_.WorkingArea.Height
                    }
                }
            }
    )
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
        displayObservation = [ordered]@{
            physicalMonitorProbeCount = $physicalMonitorProbeCount
            logicalDisplayCount = $logicalScreens.Count
            extendedDesktopTested = $logicalScreens.Count -gt 1
            logicalScreens = $screenRecords
            windowDpi = $dpi
        }
        position = [ordered]@{
            window = [ordered]@{
                left = $rect.Left
                top = $rect.Top
                right = $rect.Right
                bottom = $rect.Bottom
                width = $rect.Right - $rect.Left
                height = $rect.Bottom - $rect.Top
            }
            expectedMargin = $expectedMargin
            tolerance = $tolerance
            actualRightGap = $rightGap
            actualBottomGap = $bottomGap
        }
        checks = [ordered]@{
            currentMonitorDetected = "passed"
            bottomRightMargin = "passed"
            insideWorkingArea = "passed"
            closeRequestHidesToTray = "passed"
            processRemainsAfterClose = "passed"
        }
        limitations = [ordered]@{
            extendedDesktopCrossMonitor = if ($logicalScreens.Count -gt 1) {
                "available-but-not-executed"
            }
            else {
                "not-available-one-logical-display"
            }
            systemScaleMatrix = "not-tested"
        }
        result = "passed"
    }
    $reportPath = Join-Path (
        Join-Path $projectRoot "output"
    ) "WeatherPoem_${version}_WINDOW_POSITION.json"
    $reportJson = $report | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($reportPath, $reportJson, $utf8NoBom)
    $completed = $true
    Write-Output "Window position test passed: $reportPath"
}
finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        $process.WaitForExit(10000) | Out-Null
    }
    if (-not $completed) {
        Write-Warning "Window position test did not complete"
    }
}
