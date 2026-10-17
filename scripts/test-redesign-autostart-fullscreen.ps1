param(
    [Parameter(Mandatory = $true)][string]$CandidatePath,
    [Parameter(Mandatory = $true)][string]$ReportPath,
    [ValidateSet('full-screen', 'work-area')][string]$ProbeMode = 'full-screen'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WeatherPoemFullScreenProbe {
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr state);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr state);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] private static extern int GetWindowTextLengthW(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr window, StringBuilder text, int length);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint currentThreadId, uint foregroundThreadId, bool attach);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out RECT rect);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    public static IntPtr FindMainWindow(int wantedPid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((window, state) => {
            uint pid;
            GetWindowThreadProcessId(window, out pid);
            if (pid != wantedPid) return true;
            var length = GetWindowTextLengthW(window);
            var title = new StringBuilder(length + 1);
            GetWindowTextW(window, title, title.Capacity);
            if (!title.ToString().StartsWith("WeatherPoem", StringComparison.Ordinal)) return true;
            found = window;
            return false;
        }, IntPtr.Zero);
        return found;
    }
    public static bool FocusExactWindow(IntPtr window) {
        var foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero || window == IntPtr.Zero) return false;
        uint pid;
        var foregroundThread = GetWindowThreadProcessId(foreground, out pid);
        var currentThread = GetCurrentThreadId();
        if (foregroundThread == currentThread) return SetForegroundWindow(window);
        if (!AttachThreadInput(currentThread, foregroundThread, true)) return false;
        try { return SetForegroundWindow(window); }
        finally { AttachThreadInput(currentThread, foregroundThread, false); }
    }
}
'@

function Wait-Until {
    param([scriptblock]$Condition, [string]$Label, [int]$Seconds = 15)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        [System.Windows.Forms.Application]::DoEvents()
        $value = & $Condition
        if ($value -is [IntPtr]) {
            if ($value -ne [IntPtr]::Zero) { return $value }
        } elseif ($value) { return $value }
        Start-Sleep -Milliseconds 100
    }
    throw "Timed out waiting for $Label"
}

function Start-IsolatedCandidate {
    param([string]$Arguments)
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $candidate
    $start.WorkingDirectory = Split-Path -Parent $candidate
    $start.UseShellExecute = $false
    $start.Arguments = $Arguments
    $start.EnvironmentVariables['APPDATA'] = Join-Path $profile 'appdata'
    $start.EnvironmentVariables['LOCALAPPDATA'] = Join-Path $profile 'localappdata'
    $start.EnvironmentVariables['WEATHERPOEM_PERFORMANCE_PROFILE'] = $profile
    $start.EnvironmentVariables['WEATHERPOEM_PERFORMANCE_PROBE'] = $markerPath
    $start.EnvironmentVariables['WEATHERPOEM_PERFORMANCE_RUN_ID'] = $runId
    $start.EnvironmentVariables['WEATHERPOEM_PERFORMANCE_SCENARIO'] = 'weather-offline'
    return [System.Diagnostics.Process]::Start($start)
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$candidate = [IO.Path]::GetFullPath($CandidatePath)
$candidateRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.work')) + [IO.Path]::DirectorySeparatorChar
if (-not $candidate.StartsWith($candidateRoot, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($candidate) -ne 'weatherpoem.exe' -or
    -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw 'Candidate must be an existing internal .work weatherpoem.exe'
}
$evidenceRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'review\redesign\evidence')) + [IO.Path]::DirectorySeparatorChar
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
if (-not $ReportPath.StartsWith($evidenceRoot, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetExtension($ReportPath) -ne '.json' -or
    (Test-Path -LiteralPath $ReportPath)) {
    throw 'Report must be a new JSON file under review/redesign/evidence'
}
if (@(Get-Process -Name weatherpoem -ErrorAction SilentlyContinue).Count -gt 0) {
    throw 'WeatherPoem is already running; refusing isolated full-screen test'
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$profile = [IO.Path]::GetFullPath((Join-Path $tempRoot ('WeatherPoem.Performance.FullScreen.' + [Guid]::NewGuid().ToString('N'))))
if (-not $profile.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    -not (Split-Path -Leaf $profile).StartsWith('WeatherPoem.Performance.FullScreen.')) {
    throw 'Unsafe isolated profile path'
}
$markerPath = Join-Path $profile 'temp\probe\weatherpoem-performance-ready.json'
$runId = [Guid]::NewGuid().ToString('N')
$report = [ordered]@{
    schemaVersion = '1.0'
    testKind = 'isolated-native-autostart-foreground-bounds'
    generatedAt = [DateTime]::UtcNow.ToString('o')
    sourceCommit = (& git -C $projectRoot rev-parse HEAD).Trim()
    candidate = [ordered]@{ path = $candidate; sha256 = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash }
    isolation = [ordered]@{ temporaryProfile = $true; realUserDataTouched = $false; systemAutostartChanged = $false; systemDisplaySettingsChanged = $false }
    observations = [ordered]@{}
    limitations = @('Borderless WinForms probe is not a real presentation, game, or ordinary maximized application; single monitor and current DPI only.')
    result = 'in-progress'
}
$fullScreen = $null
$app = $null
$second = $null
$appLaunched = $false
try {
    foreach ($part in @('appdata', 'localappdata', 'temp\probe')) {
        [IO.Directory]::CreateDirectory((Join-Path $profile $part)) | Out-Null
    }
    & node (Join-Path $projectRoot 'scripts\seed-performance-profile.mjs') $profile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not seed isolated profile' }

    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    if (-not $screen) { throw 'No primary monitor available' }
    $fullScreen = [System.Windows.Forms.Form]::new()
    $fullScreen.Text = 'WeatherPoem 隔离前台边界演练'
    $fullScreen.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $fullScreen.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $targetBounds = if ($ProbeMode -eq 'full-screen') { $screen.Bounds } else { $screen.WorkingArea }
    $fullScreen.Bounds = $targetBounds
    $fullScreen.BackColor = [System.Drawing.Color]::FromArgb(34, 43, 48)
    $label = [System.Windows.Forms.Label]::new()
    $label.Text = "WeatherPoem 隔离前台边界演练 · $ProbeMode"
    $label.ForeColor = [System.Drawing.Color]::White
    $label.Dock = [System.Windows.Forms.DockStyle]::Fill
    $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $fullScreen.Controls.Add($label)
    $fullScreen.Show()
    $ready = $false
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $fullScreen.Activate()
        [WeatherPoemFullScreenProbe]::FocusExactWindow($fullScreen.Handle) | Out-Null
        [System.Windows.Forms.Application]::DoEvents()
        $rect = [WeatherPoemFullScreenProbe+RECT]::new()
        $boundsAvailable = [WeatherPoemFullScreenProbe]::GetWindowRect($fullScreen.Handle, [ref]$rect)
        if ([WeatherPoemFullScreenProbe]::GetForegroundWindow() -eq $fullScreen.Handle -and
            $boundsAvailable -and
            $rect.Left -eq $targetBounds.Left -and $rect.Top -eq $targetBounds.Top -and
            $rect.Right -eq $targetBounds.Right -and $rect.Bottom -eq $targetBounds.Bottom) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 200
    }
    $report.observations.probeMode = $ProbeMode
    $report.observations.foregroundProbePrecondition = $ready
    $report.observations.foregroundProbeActivationAttempts = $attempt
    $report.observations.foregroundProbeDpi = [WeatherPoemFullScreenProbe]::GetDpiForWindow($fullScreen.Handle)
    $report.observations.monitorBounds = [ordered]@{ left = $screen.Bounds.Left; top = $screen.Bounds.Top; right = $screen.Bounds.Right; bottom = $screen.Bounds.Bottom }
    $report.observations.workAreaBounds = [ordered]@{ left = $screen.WorkingArea.Left; top = $screen.WorkingArea.Top; right = $screen.WorkingArea.Right; bottom = $screen.WorkingArea.Bottom }
    if (-not $ready) { throw 'Could not establish exact foreground probe bounds' }

    $app = Start-IsolatedCandidate '--autostart'
    if (-not $app) { throw 'Could not launch isolated candidate' }
    $appLaunched = $true
    $report.observations.appPid = $app.Id
    $main = Wait-Until {
        if ($app.HasExited) { throw "Candidate exited before full-screen observation: $($app.ExitCode)" }
        [WeatherPoemFullScreenProbe]::FindMainWindow($app.Id)
    } 'hidden product window' 25
    if ($ProbeMode -eq 'work-area') {
        Wait-Until { [WeatherPoemFullScreenProbe]::IsWindowVisible($main) } 'automatic reveal behind work-area foreground' 15 | Out-Null
    }
    Start-Sleep -Seconds 3
    [System.Windows.Forms.Application]::DoEvents()
    $report.observations.productWindowHandle = [string]$main
    $report.observations.autoVisible = [WeatherPoemFullScreenProbe]::IsWindowVisible($main)
    $report.observations.probeStillForeground = [WeatherPoemFullScreenProbe]::GetForegroundWindow() -eq $fullScreen.Handle
    $report.observations.readyMarkerAfterAuto = Test-Path -LiteralPath $markerPath
    $shouldBeVisible = $ProbeMode -eq 'work-area'
    if ($report.observations.autoVisible -ne $shouldBeVisible -or -not $report.observations.probeStillForeground) {
        throw 'Autostart visibility/focus did not match foreground probe mode'
    }

    $second = Start-IsolatedCandidate ''
    if (-not $second) { throw 'Could not launch manual second instance' }
    $report.observations.secondInstancePid = $second.Id
    Wait-Until { $second.HasExited } 'manual second-instance forwarding' 12 | Out-Null
    $manual = Wait-Until {
        [WeatherPoemFullScreenProbe]::IsWindowVisible($main) -and
            [WeatherPoemFullScreenProbe]::GetForegroundWindow() -eq $main
    } 'manual recovery with foreground focus' 15
    $report.observations.manualVisible = [WeatherPoemFullScreenProbe]::IsWindowVisible($main)
    $report.observations.manualFocused = [WeatherPoemFullScreenProbe]::GetForegroundWindow() -eq $main
    $report.observations.manualResult = [bool]$manual
    $report.result = if ($ProbeMode -eq 'full-screen') {
        'full-screen-autostart-suppressed-manual-recovery-passed'
    } else {
        'work-area-autostart-revealed-without-focus-theft-passed'
    }
} catch {
    $report.result = if (-not $appLaunched) { 'test-precondition-failed' } else { 'failed' }
    $report.error = [string]$_
    throw
} finally {
    if ($fullScreen) { $fullScreen.Close(); $fullScreen.Dispose() }
    foreach ($exactProcess in @($second, $app)) {
        if ($exactProcess) {
            try {
                if (-not $exactProcess.HasExited) {
                    $exactProcess.Kill()
                    if (-not $exactProcess.WaitForExit(5000)) { throw "Exact test process $($exactProcess.Id) did not exit" }
                }
            } finally { $exactProcess.Dispose() }
        }
    }
    if (Test-Path -LiteralPath $profile) {
        $profileItem = Get-Item -LiteralPath $profile -Force
        if (($profileItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Refusing to delete a linked temporary profile'
        }
        $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $profile).ProviderPath)
        if (-not $resolved.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
            -not (Split-Path -Leaf $resolved).StartsWith('WeatherPoem.Performance.FullScreen.')) {
            throw 'Refusing to delete unvalidated temporary profile'
        }
        for ($cleanupAttempt = 1; $cleanupAttempt -le 10; $cleanupAttempt++) {
            try { Remove-Item -LiteralPath $resolved -Recurse -Force; break }
            catch {
                if ($cleanupAttempt -eq 10) { throw }
                Start-Sleep -Milliseconds 500
            }
        }
    }
    $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath -Encoding utf8
}
Write-Output "Foreground-bounds autostart result: $($report.result); report: $ReportPath"
