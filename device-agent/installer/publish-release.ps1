param([Parameter(Mandatory = $true)][string]$ReleaseDir)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'signing.ps1')
if ($env:GITHUB_REF_TYPE -ne 'tag' -or $env:GITHUB_REF_NAME -notmatch '^device-agent-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw 'RELEASE FAILED: a pushed version tag is required.' }
if ($env:GITHUB_REPOSITORY -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'RELEASE FAILED: invalid repository.' }
$tag = $env:GITHUB_REF_NAME
$repository = $env:GITHUB_REPOSITORY
$metadata = Get-Content -LiteralPath (Join-Path $ReleaseDir 'version.json') -Raw | ConvertFrom-Json
if ($metadata.signed -ne $true -or $metadata.tag -ne $tag -or "device-agent-v$($metadata.version)" -ne $tag -or $metadata.installer -ne 'CarlosTechDeviceAgentSetup.exe' -or $metadata.platform -ne 'windows-x64') { throw 'RELEASE FAILED: invalid signed release metadata.' }
$signTool = Get-SignTool
$installer = Join-Path $ReleaseDir 'CarlosTechDeviceAgentSetup.exe'
Assert-ReleaseSignature (Join-Path $ReleaseDir 'CarlosTechDeviceAgent.exe') $signTool $metadata.certificateThumbprint
Assert-ReleaseSignature $installer $signTool $metadata.certificateThumbprint
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
if ($metadata.sha256 -cne $hash -or $metadata.size -ne (Get-Item -LiteralPath $installer).Length) { throw 'RELEASE FAILED: installer changed after signature verification.' }
$sums = (Get-Content -LiteralPath (Join-Path $ReleaseDir 'SHA256SUMS.txt') -Raw).Trim()
if ($sums -cne "$hash  CarlosTechDeviceAgentSetup.exe") { throw 'RELEASE FAILED: checksum file mismatch.' }

# Never overwrite an existing release or publish a draft with leftover assets.
$existing = & gh release view $tag --repo $repository --json id 2>$null
if ($LASTEXITCODE -eq 0) { throw 'RELEASE FAILED: this release already exists; inspect it before retrying.' }
$files = @($installer, (Join-Path $ReleaseDir 'version.json'), (Join-Path $ReleaseDir 'SHA256SUMS.txt'))
& gh release create $tag @files --repo $repository --verify-tag --draft --title "CarlosTech Device Agent v$($metadata.version)" --notes-file (Join-Path $ReleaseDir 'release-notes.md')
if ($LASTEXITCODE -ne 0) { throw 'RELEASE FAILED: draft creation or asset upload failed.' }

# Download what GitHub actually stored and verify it before making it public.
$downloadDir = Join-Path $ReleaseDir 'github-verification'
New-Item -ItemType Directory -Path $downloadDir | Out-Null
& gh release download $tag --repo $repository --dir $downloadDir --pattern 'CarlosTechDeviceAgentSetup.exe' --pattern 'version.json' --pattern 'SHA256SUMS.txt'
if ($LASTEXITCODE -ne 0) { throw 'RELEASE FAILED: cannot verify uploaded draft assets.' }
foreach ($file in $files) {
  $downloaded = Join-Path $downloadDir ([IO.Path]::GetFileName($file))
  if ((Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash) { throw 'RELEASE FAILED: uploaded asset differs from verified build.' }
}
Assert-ReleaseSignature (Join-Path $downloadDir 'CarlosTechDeviceAgentSetup.exe') $signTool $metadata.certificateThumbprint
& gh release edit $tag --repo $repository --draft=false --latest
if ($LASTEXITCODE -ne 0) { throw 'RELEASE FAILED: verified draft could not be published.' }

$releaseUrl = "https://github.com/$repository/releases/tag/$tag"
$downloadUrl = "https://github.com/$repository/releases/download/$tag/CarlosTechDeviceAgentSetup.exe"
# Anonymous download must work: a private repo is not a public distribution.
$publicInstaller = Join-Path $downloadDir 'public-installer.exe'
Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $publicInstaller
if ((Get-FileHash -LiteralPath $publicInstaller -Algorithm SHA256).Hash.ToLowerInvariant() -cne $hash) { throw 'RELEASE FAILED: public download checksum mismatch.' }
Assert-ReleaseSignature $publicInstaller $signTool $metadata.certificateThumbprint
$report = @"
AGENT VERSION: $($metadata.version)
BUILD: SUCCESS
AGENT SIGNING: SUCCESS
INSTALLER SIGNING: SUCCESS
SIGNATURE VERIFICATION: SUCCESS
INSTALLER: CarlosTechDeviceAgentSetup.exe
SHA256: $hash
GITHUB RELEASE: $releaseUrl
DOWNLOAD: $downloadUrl
PUBLIC DOWNLOAD: SUCCESS
WEB DOWNLOAD BUTTON: NOT VERIFIED (requires deployed web end-to-end check)
"@
Write-Host $report
if ($env:GITHUB_STEP_SUMMARY) { $report | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append }
