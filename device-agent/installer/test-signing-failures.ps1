$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'signing.ps1')
# Only rejection tests: no real or self-signed certificate is generated.
$oldBase64 = $env:WINDOWS_SIGNING_CERT_BASE64
$oldPassword = $env:WINDOWS_SIGNING_CERT_PASSWORD
function Expect-Failure([string]$Expected, [scriptblock]$Action) {
  try { & $Action } catch {
    if (-not $_.Exception.Message.Contains($Expected)) { throw }
    Write-Host "PASS: $Expected"
    return
  }
  throw "Expected failure did not occur: $Expected"
}
try {
  $env:WINDOWS_SIGNING_CERT_BASE64 = $null
  $env:WINDOWS_SIGNING_CERT_PASSWORD = $null
  Expect-Failure 'required secrets are missing' { Import-ReleaseCertificate }
  $env:WINDOWS_SIGNING_CERT_BASE64 = 'invalid-base64!'
  Expect-Failure 'required secrets are missing' { Import-ReleaseCertificate }
  $env:WINDOWS_SIGNING_CERT_PASSWORD = [Guid]::NewGuid().ToString('N')
  Expect-Failure 'invalid Base64' { Import-ReleaseCertificate }
  $env:WINDOWS_SIGNING_CERT_BASE64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('not a certificate'))
  $env:WINDOWS_SIGNING_CERT_PASSWORD = [Guid]::NewGuid().ToString('N')
  Expect-Failure 'cannot open PFX' { Import-ReleaseCertificate }
  Expect-Failure 'certificate has no private key' { Assert-CodeSigningCertificate ([pscustomobject]@{ HasPrivateKey = $false }) }
  Expect-Failure 'executable missing or empty' { Assert-ReleaseSignature (Join-Path $PSScriptRoot 'no-such-artifact.exe') 'unused' 'unused' }
} finally {
  $env:WINDOWS_SIGNING_CERT_BASE64 = $oldBase64
  $env:WINDOWS_SIGNING_CERT_PASSWORD = $oldPassword
}
