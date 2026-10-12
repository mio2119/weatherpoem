$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath(
    (Split-Path -Parent $PSScriptRoot)
)
$fixtureKey = Join-Path (
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
) (
    "WeatherPoemContract-" + [Guid]::NewGuid().ToString("N")
)

try {
    New-Item -Path $fixtureKey -Force | Out-Null
    Set-ItemProperty -LiteralPath $fixtureKey `
        -Name "DisplayName" `
        -Value "WeatherPoem Contract Fixture"
    Set-ItemProperty -LiteralPath $fixtureKey `
        -Name "DisplayVersion" `
        -Value "0.0.0"
    Set-ItemProperty -LiteralPath $fixtureKey `
        -Name "InstallLocation" `
        -Value "C:\WeatherPoemContractFixture"
    Set-ItemProperty -LiteralPath $fixtureKey `
        -Name "UninstallString" `
        -Value "MsiExec.exe /X{00000000-0000-0000-0000-000000000000}"

    & (
        Join-Path $projectRoot "scripts\test-msi-elevated-lifecycle.ps1"
    ) -Preflight
}
finally {
    Remove-Item -LiteralPath $fixtureKey -Recurse -Force `
        -ErrorAction SilentlyContinue
}
