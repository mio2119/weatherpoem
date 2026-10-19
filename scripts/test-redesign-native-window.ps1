# Follow-up runs must pass a fresh -ReportPath and -SkipScreenshots. The original
# screenshot/report pair is immutable; this probe never overwrites evidence.
param(
    [string]$CandidatePath = "E:\weatherpoem\.work\redesign-native-20261015\release\weatherpoem.exe",
    [string]$ReportPath = "E:\weatherpoem\review\redesign\evidence\T04_NATIVE_WINDOW_20261015.json",
    [switch]$SkipScreenshots,
    [switch]$FocusOnly,
    [switch]$ControlledInput,
    [switch]$AllowOffscreenTrayInvoke
)

if ($ControlledInput -and -not $FocusOnly) {
    throw "ControlledInput requires FocusOnly"
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class WeatherPoemNativeWindowProbe {
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr state);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr state);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint currentThreadId, uint foregroundThreadId, bool attach);
    [DllImport("user32.dll")] private static extern int GetWindowTextLengthW(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr window, StringBuilder text, int length);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out RECT rect);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr window, int x, int y, int width, int height, bool repaint);

    public static IntPtr FindProductWindow(int wantedPid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((window, state) => {
            uint pid;
            GetWindowThreadProcessId(window, out pid);
            if (pid != wantedPid || !IsWindowVisible(window)) return true;
            var length = GetWindowTextLengthW(window);
            var text = new StringBuilder(length + 1);
            GetWindowTextW(window, text, text.Capacity);
            if (!text.ToString().StartsWith("WeatherPoem", StringComparison.Ordinal)) return true;
            found = window;
            return false;
        }, IntPtr.Zero);
        return found;
    }
    public static int OwnerPid(IntPtr window) {
        uint pid;
        GetWindowThreadProcessId(window, out pid);
        return (int)pid;
    }
    public static bool FocusExactTestWindow(IntPtr window) {
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
"@

function Wait-For {
    param([scriptblock]$Condition, [string]$Description, [int]$Seconds = 15)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        [System.Windows.Forms.Application]::DoEvents()
        $value = & $Condition
        if ($value -is [IntPtr]) {
            if ($value -ne [IntPtr]::Zero) { return $value }
        } elseif ($value) { return $value }
        Start-Sleep -Milliseconds 100
    }
    throw "Timed out waiting for $Description"
}

function Get-WindowObservation {
    param([IntPtr]$Handle)
    $rect = New-Object WeatherPoemNativeWindowProbe+RECT
    if (-not [WeatherPoemNativeWindowProbe]::GetWindowRect($Handle, [ref]$rect)) {
        throw "Cannot read product window bounds: handle=$Handle valid=$([WeatherPoemNativeWindowProbe]::IsWindow($Handle))"
    }
    $screen = [System.Windows.Forms.Screen]::FromHandle($Handle)
    return [ordered]@{
        left = $rect.Left; top = $rect.Top
        right = $rect.Right; bottom = $rect.Bottom
        width = $rect.Right - $rect.Left
        height = $rect.Bottom - $rect.Top
        dpi = [WeatherPoemNativeWindowProbe]::GetDpiForWindow($Handle)
        workingArea = [ordered]@{
            left = $screen.WorkingArea.Left; top = $screen.WorkingArea.Top
            right = $screen.WorkingArea.Right; bottom = $screen.WorkingArea.Bottom
        }
    }
}

function Find-Button {
    param([IntPtr]$Handle, [string]$Name)
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($Handle)
    $all = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )
    foreach ($element in $all) {
        if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
            $element.Current.Name.Contains($Name)) { return $element }
    }
    throw "Accessible button not found: $Name"
}

function Get-AccessibleElements {
    param([IntPtr]$Handle)
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($Handle)
    $all = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )
    $items = @()
    foreach ($element in $all) {
        $name = $element.Current.Name
        if (-not [string]::IsNullOrWhiteSpace($name)) {
            $items += [ordered]@{
                name = $name
                controlType = $element.Current.ControlType.ProgrammaticName
            }
        }
        if ($items.Count -ge 80) { break }
    }
    return $items
}

function Invoke-Button {
    param([IntPtr]$Handle, [string]$Name)
    $button = Find-Button -Handle $Handle -Name $Name
    Invoke-ObservedButton -Element $button -RequestedName $Name -Stage "named-button:$Name"
}

function Get-InvokePatternDiagnostic {
    param([System.Windows.Automation.AutomationElement]$Element)
    $invokePattern = $null
    $tryGetSupported = $false
    $tryGetError = $null
    try {
        $tryGetSupported = $Element.TryGetCurrentPattern(
            [System.Windows.Automation.InvokePattern]::Pattern,
            [ref]$invokePattern
        )
    } catch {
        $tryGetError = [string]$_
    }
    return [ordered]@{
        name = $Element.Current.Name
        controlType = $Element.Current.ControlType.ProgrammaticName
        className = $Element.Current.ClassName
        frameworkId = $Element.Current.FrameworkId
        automationId = $Element.Current.AutomationId
        isEnabled = $Element.Current.IsEnabled
        isKeyboardFocusable = $Element.Current.IsKeyboardFocusable
        isOffscreen = $Element.Current.IsOffscreen
        boundingRectangle = [ordered]@{
            left = $Element.Current.BoundingRectangle.Left
            top = $Element.Current.BoundingRectangle.Top
            width = $Element.Current.BoundingRectangle.Width
            height = $Element.Current.BoundingRectangle.Height
        }
        supportedPatterns = @($Element.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName })
        tryGetInvokePatternSupported = $tryGetSupported
        tryGetInvokePatternError = $tryGetError
    }
}

function Invoke-ObservedButton {
    param(
        [System.Windows.Automation.AutomationElement]$Element,
        [string]$RequestedName,
        [string]$Stage
    )
    $diagnostic = [ordered]@{
        stage = $Stage
        requestedName = $RequestedName
        element = Get-InvokePatternDiagnostic -Element $Element
        getCurrentPattern = "pending"
    }
    $script:uiaInvocationDiagnostics += $diagnostic
    try {
        $pattern = $Element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $diagnostic.getCurrentPattern = "available"
        $pattern.Invoke()
        $diagnostic.invoke = "completed"
    } catch {
        $diagnostic.getCurrentPattern = "failed-or-invoke-failed"
        $diagnostic.error = [string]$_
        throw
    }
}

function Find-TrayElement {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $script:trayDiagnostic = @()
    $overflow = $null
    $offscreenExact = $null
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        $all = $root.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )
        foreach ($element in $all) {
            $name = $element.Current.Name
            if ($name -in @("WeatherPoem 今日诗笺", "显示隐藏的图标", "Show hidden icons")) {
                $script:trayDiagnostic += [ordered]@{
                    name = $name
                    controlType = $element.Current.ControlType.ProgrammaticName
                    className = $element.Current.ClassName
                }
            }
            if ($name -in @("显示隐藏的图标", "Show hidden icons") -and
                $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button) {
                $overflow = $element
            }
            if ($name -eq "WeatherPoem 今日诗笺" -and
                $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
                $element.Current.ClassName -eq "SystemTray.NormalButton") {
                if (-not $element.Current.IsOffscreen) { return $element }
                $offscreenExact = $element
            }
        }
        if ($attempt -eq 0 -and $overflow) {
            $overflow.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
            Start-Sleep -Milliseconds 500
        }
    }
    if ($AllowOffscreenTrayInvoke) { return $offscreenExact }
    return $null
}

function Invoke-TrayElement {
    param([System.Windows.Automation.AutomationElement]$Element)
    if ($Element.Current.Name -ne "WeatherPoem 今日诗笺" -or
        $Element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button -or
        $Element.Current.ClassName -ne "SystemTray.NormalButton") {
        throw "Refusing to invoke an unexpected tray element"
    }
    Invoke-ObservedButton -Element $Element -RequestedName "WeatherPoem 今日诗笺" -Stage "tray-button"
}

function Save-WindowImage {
    param([IntPtr]$Handle, [string]$Path)
    $bounds = Get-WindowObservation -Handle $Handle
    $bitmap = [System.Drawing.Bitmap]::new($bounds.width, $bounds.height)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($bounds.left, $bounds.top, 0, 0, $bitmap.Size)
        } finally { $graphics.Dispose() }
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$candidate = [IO.Path]::GetFullPath($CandidatePath)
$expectedCandidateRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot ".work")) + [IO.Path]::DirectorySeparatorChar
if (-not $candidate.StartsWith($expectedCandidateRoot, [StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "Candidate must be an existing EXE under this project's .work directory"
}
$evidenceRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "review\redesign\evidence")) + [IO.Path]::DirectorySeparatorChar
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
if (-not $ReportPath.StartsWith($evidenceRoot, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetExtension($ReportPath) -ne ".json") {
    throw "Report must be a JSON file under review/redesign/evidence"
}
if (Test-Path -LiteralPath $ReportPath) {
    throw "Refusing to overwrite an existing native-window report: $ReportPath"
}
if (@(Get-Process -Name weatherpoem -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "A WeatherPoem process is already running; isolated window test stopped"
}
$report = [ordered]@{
    schemaVersion = "1.0"
    testKind = if ($FocusOnly) { "isolated-native-autostart-focus" } else { "isolated-native-window" }
    generatedAt = [DateTime]::UtcNow.ToString("o")
    sourceCommit = (& git -C $projectRoot rev-parse HEAD).Trim()
    candidate = [ordered]@{
        path = $candidate
        sha256 = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
    }
    testHarness = [ordered]@{
        path = "scripts/test-redesign-native-window.ps1"
        sha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
    }
    profileIsolation = $true
    realUserDataTouched = $false
    systemAutostartChanged = $false
    systemDisplaySettingsChanged = $false
    observations = [ordered]@{}
    limitations = @()
    result = "in-progress"
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$profile = Join-Path $tempRoot ("WeatherPoem.Performance.Window." + [Guid]::NewGuid().ToString("N"))
$profile = [IO.Path]::GetFullPath($profile)
if (-not $profile.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    -not (Split-Path -Leaf $profile).StartsWith("WeatherPoem.Performance.Window.")) {
    throw "Unsafe isolated profile path"
}
$process = $null
$focusForm = $null
$script:uiaInvocationDiagnostics = @()
try {
    foreach ($part in @("appdata", "localappdata", "temp\probe")) {
        [IO.Directory]::CreateDirectory((Join-Path $profile $part)) | Out-Null
    }
    & node (Join-Path $projectRoot "scripts\seed-performance-profile.mjs") $profile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not seed isolated profile" }

    if ($ControlledInput) {
        $focusForm = [System.Windows.Forms.Form]::new()
        $focusForm.Text = "WeatherPoem 隔离焦点测试"
        $focusForm.Width = 380
        $focusForm.Height = 120
        $focusForm.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
        $focusInput = [System.Windows.Forms.TextBox]::new()
        $focusInput.Dock = [System.Windows.Forms.DockStyle]::Fill
        $focusInput.Text = "焦点测试，不保存输入"
        $focusForm.Controls.Add($focusInput)
        $focusForm.Show()
        $focusReady = $false
        for ($focusAttempt = 1; $focusAttempt -le 5; $focusAttempt++) {
            $focusForm.Activate()
            $focusInput.Focus() | Out-Null
            $accepted = [WeatherPoemNativeWindowProbe]::FocusExactTestWindow($focusForm.Handle)
            [System.Windows.Forms.Application]::DoEvents()
            if ([WeatherPoemNativeWindowProbe]::GetForegroundWindow() -eq $focusForm.Handle -and
                $focusInput.Focused) {
                $focusReady = $true
                break
            }
            Start-Sleep -Milliseconds 200
        }
        $report.observations.foregroundProbeAttempts = $focusAttempt
        $report.observations.foregroundProbeActivationAccepted = $accepted
        $report.observations.foregroundProbeOwnerPid = [WeatherPoemNativeWindowProbe]::OwnerPid(
            [WeatherPoemNativeWindowProbe]::GetForegroundWindow()
        )
        $report.observations.foregroundProbeInputFocused = $focusInput.Focused
        if (-not $focusReady) { throw "Could not foreground isolated text input" }
        $report.observations.foregroundProbeKind = "temporary-winforms-text-input"
    }

    $foregroundBefore = [WeatherPoemNativeWindowProbe]::GetForegroundWindow()
    if ($foregroundBefore -eq [IntPtr]::Zero) {
        throw "Windows did not expose a foreground window before launch"
    }
    $report.observations.foregroundBeforePid = [WeatherPoemNativeWindowProbe]::OwnerPid($foregroundBefore)
    $script:productTookFocus = $false

    $markerPath = Join-Path $profile "temp\probe\weatherpoem-performance-ready.json"
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $candidate
    $start.WorkingDirectory = Split-Path -Parent $candidate
    $start.UseShellExecute = $false
    $start.Arguments = "--autostart"
    $start.EnvironmentVariables["APPDATA"] = Join-Path $profile "appdata"
    $start.EnvironmentVariables["LOCALAPPDATA"] = Join-Path $profile "localappdata"
    $start.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_PROFILE"] = $profile
    $start.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_PROBE"] = $markerPath
    $start.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_RUN_ID"] = [Guid]::NewGuid().ToString("N")
    $start.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_SCENARIO"] = "weather-offline"
    $process = [System.Diagnostics.Process]::Start($start)
    if (-not $process) { throw "Could not launch isolated candidate" }
    $window = Wait-For {
        if ($process.HasExited) { throw "Candidate exited before showing a window" }
        if ([WeatherPoemNativeWindowProbe]::OwnerPid([WeatherPoemNativeWindowProbe]::GetForegroundWindow()) -eq $process.Id) {
            $script:productTookFocus = $true
        }
        [WeatherPoemNativeWindowProbe]::FindProductWindow($process.Id)
    } "product window" 20
    $marker = Wait-For {
        if ([WeatherPoemNativeWindowProbe]::OwnerPid([WeatherPoemNativeWindowProbe]::GetForegroundWindow()) -eq $process.Id) {
            $script:productTookFocus = $true
        }
        if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
            Get-Content -LiteralPath $markerPath -Raw -Encoding utf8 | ConvertFrom-Json
        }
    } "frontend ready marker" 20
    $window = Wait-For {
        $current = [WeatherPoemNativeWindowProbe]::FindProductWindow($process.Id)
        if ($current -ne [IntPtr]::Zero -and [WeatherPoemNativeWindowProbe]::IsWindow($current)) {
            $candidateRect = [WeatherPoemNativeWindowProbe+RECT]::new()
            if ([WeatherPoemNativeWindowProbe]::GetWindowRect($current, [ref]$candidateRect)) {
                $current
            }
        }
    } "stable product window bounds" 10
    $report.observations.readyView = $marker.readyView
    $report.observations.readyMode = $marker.readyMode
    $report.observations.processId = $process.Id
    $report.observations.windowHandle = [string]$window
    $report.observations.windowHandleType = $window.GetType().FullName
    $report.observations.foregroundAfterPid = [WeatherPoemNativeWindowProbe]::OwnerPid(
        [WeatherPoemNativeWindowProbe]::GetForegroundWindow()
    )
    $report.observations.productTookFocus = $script:productTookFocus -or
        $report.observations.foregroundAfterPid -eq $process.Id
    $report.observations.foregroundUnchanged = [WeatherPoemNativeWindowProbe]::GetForegroundWindow() -eq $foregroundBefore
    $report.observations.glance = Get-WindowObservation -Handle $window
    if ($FocusOnly) {
        Start-Sleep -Milliseconds 1000
        [System.Windows.Forms.Application]::DoEvents()
        $foregroundAfterOneSecond = [WeatherPoemNativeWindowProbe]::GetForegroundWindow()
        $report.observations.foregroundAfterOneSecondPid = [WeatherPoemNativeWindowProbe]::OwnerPid(
            $foregroundAfterOneSecond
        )
        $report.observations.foregroundAfterOneSecondSameHandle = $foregroundAfterOneSecond -eq $foregroundBefore
        if ($ControlledInput) {
            $report.observations.foregroundProbeInputStillFocused = $focusInput.Focused
        }
        $report.observations.productTookFocus = $report.observations.productTookFocus -or
            $report.observations.foregroundAfterOneSecondPid -eq $process.Id
        $report.result = if ($report.observations.productTookFocus) {
            "autostart-took-focus"
        } elseif ($ControlledInput -and
            (-not $report.observations.foregroundAfterOneSecondSameHandle -or
             -not $report.observations.foregroundProbeInputStillFocused)) {
            "input-focus-not-preserved-cause-unresolved"
        } else {
            "autostart-preserved-focus"
        }
        return
    }
    if ($report.observations.productTookFocus) { throw "Autostart took foreground focus" }
    if ($marker.readyView -ne "poem") { throw "Expected isolated poem view, got $($marker.readyView)" }

    $readButton = Wait-For {
        try { Find-Button -Handle $window -Name "继续读" } catch { $null }
    } "accessible read button" 10
    $report.observations.accessibleElements = @(Get-AccessibleElements -Handle $window)
    $readButton.SetFocus()
    Start-Sleep -Milliseconds 250
    $report.observations.manualForegroundOwnerPid = [WeatherPoemNativeWindowProbe]::OwnerPid(
        [WeatherPoemNativeWindowProbe]::GetForegroundWindow()
    )
    if (-not $SkipScreenshots -and $report.observations.manualForegroundOwnerPid -eq $process.Id) {
        $report.observations.glanceScreenshot = [IO.Path]::GetFileNameWithoutExtension($ReportPath) + "_glance.png"
        $glanceScreenshotPath = Join-Path (Split-Path -Parent $ReportPath) $report.observations.glanceScreenshot
        if (Test-Path -LiteralPath $glanceScreenshotPath) { throw "Refusing to overwrite a glance screenshot" }
        $glance = $report.observations.glance
        [WeatherPoemNativeWindowProbe]::MoveWindow($window, 350, 180, $glance.width, $glance.height, $true) | Out-Null
        Start-Sleep -Milliseconds 300
        Save-WindowImage -Handle $window -Path $glanceScreenshotPath
    } elseif (-not $SkipScreenshots) {
        $report.limitations += "Glance screenshot omitted because Windows did not foreground the test app."
    }
    Invoke-ObservedButton -Element $readButton -RequestedName "继续读" -Stage "expand-reading"
    $reading = Wait-For {
        $state = Get-WindowObservation -Handle $window
        if ($state.width -ge 540 -and $state.height -ge 600) { $state }
    } "expanded reading window" 10
    $report.observations.reading = $reading
    if (-not $SkipScreenshots) {
        $report.observations.readingScreenshot = [IO.Path]::GetFileNameWithoutExtension($ReportPath) + "_reading.png"
        $readingScreenshotPath = Join-Path (Split-Path -Parent $ReportPath) $report.observations.readingScreenshot
        if (Test-Path -LiteralPath $readingScreenshotPath) { throw "Refusing to overwrite a reading screenshot" }
        [WeatherPoemNativeWindowProbe]::MoveWindow($window, 350, 140, $reading.width, $reading.height, $true) | Out-Null
        Start-Sleep -Milliseconds 300
        Save-WindowImage -Handle $window -Path $readingScreenshotPath
    }

    if (-not [WeatherPoemNativeWindowProbe]::MoveWindow($window, 350, 160, 640, 640, $true)) {
        throw "Windows did not accept reading window resize"
    }
    $report.observations.resizedReading = Wait-For {
        $state = Get-WindowObservation -Handle $window
        if ([Math]::Abs($state.width - 640) -le 8 -and [Math]::Abs($state.height - 640) -le 8) { $state }
    } "resized reading window" 10
    Start-Sleep -Milliseconds 650
    Invoke-Button -Handle $window -Name "今日诗笺"
    $report.observations.returnedGlance = Wait-For {
        $state = Get-WindowObservation -Handle $window
        if ($state.width -le 440 -and $state.height -le 600) { $state }
    } "return to glance" 10
    Invoke-Button -Handle $window -Name "继续读"
    $report.observations.reopenedReading = Wait-For {
        $state = Get-WindowObservation -Handle $window
        if ([Math]::Abs($state.width - 640) -le 16 -and [Math]::Abs($state.height - 640) -le 16) { $state }
    } "remembered reading size" 10

    Invoke-Button -Handle $window -Name "今日诗笺"
    Wait-For { (Get-WindowObservation -Handle $window).width -le 440 } "glance before hiding" 10 | Out-Null
    Invoke-Button -Handle $window -Name "收起"
    Wait-For {
        [WeatherPoemNativeWindowProbe]::FindProductWindow($process.Id) -eq [IntPtr]::Zero
    } "hidden tray window" 10 | Out-Null
    $report.observations.hiddenProcessAlive = -not $process.HasExited
    if (-not $report.observations.hiddenProcessAlive) { throw "Hiding exited the app" }
    $trayElement = Find-TrayElement
    $report.observations.trayDiagnostic = $script:trayDiagnostic
    if ($trayElement) {
        $report.observations.trayControlType = $trayElement.Current.ControlType.ProgrammaticName
        $report.observations.trayBounds = [ordered]@{
            left = $trayElement.Current.BoundingRectangle.Left
            top = $trayElement.Current.BoundingRectangle.Top
            width = $trayElement.Current.BoundingRectangle.Width
            height = $trayElement.Current.BoundingRectangle.Height
            offscreen = $trayElement.Current.IsOffscreen
        }
        try {
            Invoke-TrayElement -Element $trayElement
            $report.observations.trayInteraction = if ($trayElement.Current.IsOffscreen) {
                "exact UI Automation InvokePattern on offscreen element"
            } else {
                "exact UI Automation InvokePattern"
            }
            $reopenedFromTray = Wait-For {
                [WeatherPoemNativeWindowProbe]::FindProductWindow($process.Id)
            } "tray recovery" 10
            $report.observations.trayWindowHandle = [string]$reopenedFromTray
            $report.observations.trayRecovered = [WeatherPoemNativeWindowProbe]::FindProductWindow($process.Id) -ne [IntPtr]::Zero
            $focusedFromTray = $false
            try {
                Wait-For {
                    [WeatherPoemNativeWindowProbe]::OwnerPid(
                        [WeatherPoemNativeWindowProbe]::GetForegroundWindow()
                    ) -eq $process.Id
                } "tray-opened app focus" 3 | Out-Null
                $focusedFromTray = $true
            } catch {
                $report.limitations += "Programmatic tray invocation restored the window but focus was not observed within three seconds; human click focus remains unverified."
            }
            $report.observations.trayForegroundOwnerPid = [WeatherPoemNativeWindowProbe]::OwnerPid(
                [WeatherPoemNativeWindowProbe]::GetForegroundWindow()
            )
            $report.observations.trayOpenedWithFocus = $focusedFromTray
        } catch {
            $report.observations.trayRecovered = $false
            $report.limitations += "Exact tray UI Automation invocation did not recover the window: $_"
        }
    } else {
        $report.observations.trayRecovered = $null
        $report.limitations += "Tray icon was not exposed as a visible UI Automation button."
    }
    $process.Kill()
    if (-not $process.WaitForExit(10000)) { throw "First isolated process did not exit" }
    $process.Dispose()
    $process = $null
    Start-Sleep -Milliseconds 800
    $inspect = & node (Join-Path $projectRoot "scripts\seed-performance-profile.mjs") --inspect $profile |
        ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect isolated settings" }
    $report.observations.persistedReadingSize = $inspect.settings.readingWindowSize

    # The native probe intentionally accepts only this fixed basename. Remove the
    # first process's marker before restarting with the same isolated profile.
    $restartMarkerPath = $markerPath
    Remove-Item -LiteralPath $restartMarkerPath -ErrorAction Stop
    $start.Arguments = ""
    $start.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_PROBE"] = $restartMarkerPath
    $start.EnvironmentVariables["WEATHERPOEM_PERFORMANCE_RUN_ID"] = [Guid]::NewGuid().ToString("N")
    $process = [System.Diagnostics.Process]::Start($start)
    if (-not $process) { throw "Could not restart isolated candidate" }
    $restartWindow = Wait-For {
        if ($process.HasExited) { throw "Candidate exited during restart" }
        [WeatherPoemNativeWindowProbe]::FindProductWindow($process.Id)
    } "restarted product window" 20
    $restartMarker = Wait-For {
        if (Test-Path -LiteralPath $restartMarkerPath -PathType Leaf) {
            Get-Content -LiteralPath $restartMarkerPath -Raw -Encoding utf8 | ConvertFrom-Json
        }
    } "restart ready marker" 20
    if ($restartMarker.readyView -ne "poem") { throw "Restart did not return to the poem" }
    $restartReadButton = Wait-For {
        try { Find-Button -Handle $restartWindow -Name "继续读" } catch { $null }
    } "restart read button" 10
    Invoke-ObservedButton -Element $restartReadButton -RequestedName "继续读" -Stage "restart-expand-reading"
    $report.observations.restartProcessId = $process.Id
    $report.observations.restartReading = Wait-For {
        $state = Get-WindowObservation -Handle $restartWindow
        if ([Math]::Abs($state.width - 640) -le 16 -and [Math]::Abs($state.height - 640) -le 16) { $state }
    } "reading size after restart" 10
    $report.limitations += "Resize was generated by Win32 MoveWindow, not a physical drag."
    if (-not $report.observations.trayRecovered) {
        throw "Programmatic tray recovery did not pass; cross-restart size check completed"
    }
    $report.limitations += "Programmatic UI Automation invocation cannot replace a human manual-click focus check."
    if ($report.observations.trayBounds.offscreen) {
        $report.limitations += "Offscreen tray invocation proves the app route only, not user-visible icon reachability."
        $report.result = "offscreen-tray-invoke-diagnostic-only"
    } else {
        $report.result = "focus-resize-tray-invoke-and-restart-passed"
    }
} catch {
    $report.result = "failed"
    $report.error = [string]$_
    throw
} finally {
    if ($focusForm) {
        $focusForm.Close()
        $focusForm.Dispose()
    }
    if ($process) {
        try {
            if (-not $process.HasExited) {
                $process.Kill()
                $process.WaitForExit(10000) | Out-Null
            }
        } finally { $process.Dispose() }
    }
    if (Test-Path -LiteralPath $profile -PathType Container) {
        $resolvedProfile = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $profile).Path)
        if ($resolvedProfile.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -and
            (Split-Path -Leaf $resolvedProfile).StartsWith("WeatherPoem.Performance.Window.")) {
            for ($attempt = 0; $attempt -lt 20; $attempt++) {
                try {
                    Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction Stop
                    break
                } catch {
                    if ($attempt -eq 19) {
                        $report.limitations += "Could not remove isolated test profile: $resolvedProfile"
                    } else { Start-Sleep -Milliseconds 500 }
                }
            }
        } else { throw "Refusing to remove unexpected profile path" }
    }
    $report.observations.uiaInvocationDiagnostics = @($script:uiaInvocationDiagnostics)
    $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $ReportPath -Encoding utf8
}

Write-Output "Isolated native window report: $ReportPath ($($report.result))"
