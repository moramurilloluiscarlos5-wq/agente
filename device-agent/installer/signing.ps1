Set-StrictMode -Version Latest

function Get-SignTool {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $candidate = Get-ChildItem -LiteralPath $sdk -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $candidate) { throw 'WINDOWS CODE SIGNING FAILED: Windows SDK SignTool not installed.' }
  return $candidate
}

function Assert-CodeSigningCertificate($Certificate, $ChainCertificates) {
  if (-not $Certificate.HasPrivateKey) { throw 'WINDOWS CODE SIGNING FAILED: certificate has no private key.' }
  $now = Get-Date
  if ($Certificate.NotBefore -gt $now -or $Certificate.NotAfter -le $now) { throw 'WINDOWS CODE SIGNING FAILED: certificate is expired or not yet valid.' }
  $eku = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' })
  if ($eku.Count -ne 1 -or '1.3.6.1.5.5.7.3.3' -notin @($eku[0].EnhancedKeyUsages | ForEach-Object { $_.Value })) {
    throw 'WINDOWS CODE SIGNING FAILED: explicit Code Signing EKU is required.'
  }
  $publisher = $Certificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($publisher -cne 'CARLOSTECH AI') { throw 'WINDOWS CODE SIGNING FAILED: certificate publisher must be CARLOSTECH AI. Use a certificate legally issued to that identity.' }
  if ([Convert]::ToBase64String($Certificate.SubjectName.RawData) -eq [Convert]::ToBase64String($Certificate.IssuerName.RawData)) {
    throw 'WINDOWS CODE SIGNING FAILED: self-signed certificates are not permitted.'
  }
  $chain = New-Object Security.Cryptography.X509Certificates.X509Chain
  try {
    $chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::Online
    $chain.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(30)
    [void]$chain.ChainPolicy.ApplicationPolicy.Add((New-Object Security.Cryptography.Oid '1.3.6.1.5.5.7.3.3'))
    if ($ChainCertificates) { $chain.ChainPolicy.ExtraStore.AddRange($ChainCertificates) }
    if (-not $chain.Build($Certificate)) { throw 'WINDOWS CODE SIGNING FAILED: certificate trust/revocation validation failed.' }
  } finally { $chain.Dispose() }
}

function Import-ReleaseCertificate {
  $missing = $false
  foreach ($name in @('WINDOWS_SIGNING_CERT_BASE64', 'WINDOWS_SIGNING_CERT_PASSWORD')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
      Write-Host "${name}: NOT CONFIGURED"
      $missing = $true
    }
  }
  if ($missing) { throw 'WINDOWS CODE SIGNING FAILED: required secrets are missing.' }
  $tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
  $secretDir = Join-Path $tempRoot ('carlostech-signing-' + [Guid]::NewGuid().ToString('N'))
  $pfxPath = Join-Path $secretDir 'windows-signing-cert.pfx'
  $collection = New-Object Security.Cryptography.X509Certificates.X509Certificate2Collection
  $bytes = $null
  $password = $null
  $importedThumbprint = $null
  try {
    try { $bytes = [Convert]::FromBase64String($env:WINDOWS_SIGNING_CERT_BASE64) }
    catch { throw 'WINDOWS CODE SIGNING FAILED: invalid Base64.' }
    New-Item -ItemType Directory -Path $secretDir | Out-Null
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($identity)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $secretDir -AclObject $acl
    [IO.File]::WriteAllBytes($pfxPath, $bytes)
    try {
      $collection.Import($bytes, $env:WINDOWS_SIGNING_CERT_PASSWORD, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    } catch { throw 'WINDOWS CODE SIGNING FAILED: cannot open PFX; invalid file or password.' }
    $privateCertificates = @($collection | Where-Object HasPrivateKey)
    if ($privateCertificates.Count -ne 1) { throw 'WINDOWS CODE SIGNING FAILED: PFX must contain exactly one private signing certificate.' }
    $certificate = $privateCertificates[0]
    Assert-CodeSigningCertificate $certificate $collection
    $thumbprint = $certificate.Thumbprint
    if (Test-Path -LiteralPath "Cert:\CurrentUser\My\$thumbprint") {
      throw 'WINDOWS CODE SIGNING FAILED: certificate already exists in this user store; use a clean build runner.'
    }
    $password = ConvertTo-SecureString $env:WINDOWS_SIGNING_CERT_PASSWORD -AsPlainText -Force
    # The password never appears in a process command line or a file.
    $importedThumbprint = $thumbprint
    # Backup cleanup context for an interrupted GitHub step. No private data.
    if ($env:GITHUB_ENV) { "CARLOSTECH_SIGNING_THUMBPRINT=$thumbprint" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append }
    Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $password | Out-Null
    return $thumbprint
  } catch {
    if ($importedThumbprint -and (Test-Path -LiteralPath "Cert:\CurrentUser\My\$importedThumbprint")) {
      Remove-Item -LiteralPath "Cert:\CurrentUser\My\$importedThumbprint" -DeleteKey -Force
    }
    if ($_.Exception.Message.StartsWith('WINDOWS CODE SIGNING FAILED:')) { throw $_.Exception.Message }
    throw 'WINDOWS CODE SIGNING FAILED: certificate import failed.'
  } finally {
    foreach ($certificate in $collection) { $certificate.Dispose() }
    if ($password) { $password.Dispose() }
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $env:WINDOWS_SIGNING_CERT_BASE64 = $null
    $env:WINDOWS_SIGNING_CERT_PASSWORD = $null
    if (Test-Path -LiteralPath $pfxPath) { Remove-Item -LiteralPath $pfxPath -Force }
    if (Test-Path -LiteralPath $secretDir) { Remove-Item -LiteralPath $secretDir -Force }
  }
}

function Assert-ReleaseSignature([string]$File, [string]$SignTool, [string]$Thumbprint) {
  if (-not (Test-Path -LiteralPath $File -PathType Leaf) -or (Get-Item -LiteralPath $File).Length -le 0) {
    throw 'WINDOWS CODE SIGNING FAILED: executable missing or empty.'
  }
  & $SignTool verify /pa /all /v /tw $File
  if ($LASTEXITCODE -ne 0) { throw 'WINDOWS CODE SIGNING FAILED: SignTool verification failed or timestamp missing.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $File
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $Thumbprint -or -not $signature.TimeStamperCertificate) {
    throw 'WINDOWS CODE SIGNING FAILED: invalid Authenticode signature, unexpected publisher, or missing timestamp.'
  }
}

function Sign-ReleaseFile([string]$File, [string]$SignTool, [string]$Thumbprint) {
  & $SignTool sign /s My /sha1 $Thumbprint /fd SHA256 /tr 'http://timestamp.digicert.com' /td SHA256 /d 'CarlosTech Device Agent' $File
  if ($LASTEXITCODE -ne 0) { throw 'WINDOWS CODE SIGNING FAILED: SignTool signing failed.' }
  Assert-ReleaseSignature $File $SignTool $Thumbprint
}
