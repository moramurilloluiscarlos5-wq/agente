param([string]$Version = $env:DEVICE_AGENT_VERSION)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'signing.ps1')
$agentRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $agentRoot 'package.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $package.version }
$Version = $Version -replace '^device-agent-v', ''
if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$' -or $Version -ne $package.version) {
  throw 'BUILD FAILED: tag version must match device-agent/package.json.'
}
$tag = "device-agent-v$Version"
$thumbprint = $null
$previousBuildDir = $env:DEVICE_AGENT_BUILD_DIR
Push-Location $agentRoot
try {
  # Validate secrets before restoring dependencies or touching old artifacts.
  $thumbprint = Import-ReleaseCertificate
  $signTool = Get-SignTool
  $isccCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  $isccCandidates = @(
    $(if ($isccCommand) { $isccCommand.Source }),
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
  )
  $iscc = $isccCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
  if (-not $iscc) { throw 'BUILD FAILED: Inno Setup 6 not installed.' }
  # A unique directory prevents stale .exe files passing failed builds.
  $buildDir = Join-Path $agentRoot ('dist\release-' + $Version + '-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $buildDir | Out-Null
  $env:DEVICE_AGENT_BUILD_DIR = $buildDir
  $env:DEVICE_AGENT_VERSION = $Version
  npm.cmd ci --include=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'BUILD FAILED: dependency restore failed.' }
  npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'BUILD FAILED: agent tests failed.' }
  npm.cmd run build:exe
  if ($LASTEXITCODE -ne 0) { throw 'BUILD FAILED: executable compilation failed.' }
  npm.cmd run test:exe
  if ($LASTEXITCODE -ne 0) { throw 'BUILD FAILED: packaged executable smoke test failed.' }
  $agent = Join-Path $buildDir 'CarlosTechDeviceAgent.exe'
  Sign-ReleaseFile $agent $signTool $thumbprint
  Write-Host 'AGENT SIGNING: SUCCESS'

  $archive = Join-Path $buildDir 'platform-tools-windows.zip'
  Invoke-WebRequest -UseBasicParsing -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $archive
  Expand-Archive -LiteralPath $archive -DestinationPath $buildDir
  foreach ($tool in @('adb.exe', 'fastboot.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll')) {
    $toolPath = Join-Path $buildDir "platform-tools\$tool"
    if (-not (Test-Path -LiteralPath $toolPath -PathType Leaf) -or (Get-Item -LiteralPath $toolPath).Length -le 0) { throw "BUILD FAILED: missing $tool" }
  }
  & $iscc "/DBuildDir=$buildDir" (Join-Path $PSScriptRoot 'CarlosTechDeviceAgent.iss')
  if ($LASTEXITCODE -ne 0) { throw 'BUILD FAILED: installer compilation failed.' }
  $installer = Join-Path $buildDir 'CarlosTechDeviceAgentSetup.exe'
  Sign-ReleaseFile $installer $signTool $thumbprint
  Write-Host 'INSTALLER SIGNING: SUCCESS'
  Assert-ReleaseSignature $agent $signTool $thumbprint
  Assert-ReleaseSignature $installer $signTool $thumbprint
  Write-Host 'SIGNATURE VERIFICATION: SUCCESS'
  $hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  $metadata = [ordered]@{
    version = $Version; tag = $tag; platform = 'windows-x64'
    installer = 'CarlosTechDeviceAgentSetup.exe'; file = 'CarlosTechDeviceAgentSetup.exe'
    signed = $true; sha256 = $hash; size = (Get-Item -LiteralPath $installer).Length
    releaseDate = (Get-Date).ToUniversalTime().ToString('o')
    publisher = 'CARLOSTECH AI'; certificateThumbprint = $thumbprint
  }
  $utf8 = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText((Join-Path $buildDir 'version.json'), ($metadata | ConvertTo-Json) + "`n", $utf8)
  [IO.File]::WriteAllText((Join-Path $buildDir 'SHA256SUMS.txt'), "$hash  CarlosTechDeviceAgentSetup.exe`n", $utf8)
  $notes = @"
CarlosTech Device Agent v$Version

Publisher: CARLOSTECH AI
Windows 10 / Windows 11
Architecture: x64

Funciones:
- ADB
- Fastboot
- detección de dispositivos
- conexión con CarlosTech Web
- diagnóstico de dispositivos
- comunicación local segura

Installer: CarlosTechDeviceAgentSetup.exe
SHA-256: $hash

Agente e instalador firmados con SHA-256, timestamp RFC 3161 y firmas verificadas.
"@
  [IO.File]::WriteAllText((Join-Path $buildDir 'release-notes.md'), $notes, $utf8)
  if ($env:GITHUB_OUTPUT) {
    "release_dir=$buildDir" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
    "sha256=$hash" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
    "version=$Version" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append
  }
  Write-Host "AGENT VERSION: $Version"
  Write-Host 'BUILD: SUCCESS'
  Write-Host "SHA256: $hash"
  Write-Host "VERIFIED RELEASE ARTIFACTS: $buildDir"
} finally {
  $env:DEVICE_AGENT_BUILD_DIR = $previousBuildDir
  if ($thumbprint -and (Test-Path -LiteralPath "Cert:\CurrentUser\My\$thumbprint")) {
    Remove-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint" -DeleteKey -Force
  }
  Pop-Location
}
