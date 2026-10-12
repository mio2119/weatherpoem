param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$securityModule = Join-Path `
    $PSHOME `
    "Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1"
Import-Module -Name $securityModule -ErrorAction Stop

$resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
$signature = Get-AuthenticodeSignature -LiteralPath $resolved

[ordered]@{
    path = $resolved
    status = [string]$signature.Status
    signerSubject = if ($signature.SignerCertificate) {
        $signature.SignerCertificate.Subject
    } else {
        $null
    }
    signerThumbprint = if ($signature.SignerCertificate) {
        $signature.SignerCertificate.Thumbprint
    } else {
        $null
    }
    signerNotBefore = if ($signature.SignerCertificate) {
        $signature.SignerCertificate.NotBefore.ToUniversalTime().ToString("o")
    } else {
        $null
    }
    signerNotAfter = if ($signature.SignerCertificate) {
        $signature.SignerCertificate.NotAfter.ToUniversalTime().ToString("o")
    } else {
        $null
    }
    timestampSubject = if ($signature.TimeStamperCertificate) {
        $signature.TimeStamperCertificate.Subject
    } else {
        $null
    }
    timestampThumbprint = if ($signature.TimeStamperCertificate) {
        $signature.TimeStamperCertificate.Thumbprint
    } else {
        $null
    }
} | ConvertTo-Json -Compress
