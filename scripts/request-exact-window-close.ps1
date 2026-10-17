param(
    [Parameter(Mandatory = $true)][int]$TargetProcessId,
    [Parameter(Mandatory = $true)][string]$ExpectedExePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$process = Get-Process -Id $TargetProcessId -ErrorAction Stop
$actualPath = [IO.Path]::GetFullPath($process.Path)
$expectedPath = [IO.Path]::GetFullPath($ExpectedExePath)
if (-not [string]::Equals($actualPath, $expectedPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to close a process other than the isolated candidate"
}
if (-not $process.MainWindowTitle.StartsWith("WeatherPoem", [StringComparison]::Ordinal)) {
    throw "The exact candidate does not own a WeatherPoem window"
}
$handle = $process.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) {
    throw "The exact candidate has no visible main window"
}
Add-Type -Namespace WeatherPoemProbe -Name WindowMessage -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool PostMessage(System.IntPtr window, uint message, System.IntPtr wParam, System.IntPtr lParam);
"@
if (-not [WeatherPoemProbe.WindowMessage]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
    throw "Could not post WM_CLOSE to the exact isolated window"
}
Write-Output "WM_CLOSE sent to isolated PID $TargetProcessId"
