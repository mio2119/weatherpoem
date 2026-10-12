param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolved = [IO.Path]::GetFullPath($Path)
if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "File does not exist: $resolved"
}
$info = [Diagnostics.FileVersionInfo]::GetVersionInfo($resolved)
[ordered]@{
    fileVersion = [string]$info.FileVersion
    productVersion = [string]$info.ProductVersion
    productName = [string]$info.ProductName
} | ConvertTo-Json -Compress
