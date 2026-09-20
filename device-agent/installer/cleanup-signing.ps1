$ErrorActionPreference = 'Stop'
# Backup for cancellation/termination of the build step on the ephemeral runner.
if ($env:CARLOSTECH_SIGNING_THUMBPRINT) {
  if ($env:CARLOSTECH_SIGNING_THUMBPRINT -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid cleanup certificate thumbprint.' }
  $certificatePath = "Cert:\CurrentUser\My\$env:CARLOSTECH_SIGNING_THUMBPRINT"
  if (Test-Path -LiteralPath $certificatePath) { Remove-Item -LiteralPath $certificatePath -DeleteKey -Force }
}
if ($env:RUNNER_TEMP) {
  $runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
  Get-ChildItem -LiteralPath $runnerRoot -Directory | Where-Object Name -Match '^carlostech-signing-[a-f0-9]{32}$' | ForEach-Object {
    $directory = [IO.Path]::GetFullPath($_.FullName)
    if ([IO.Path]::GetDirectoryName($directory) -ne $runnerRoot -or $_.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Invalid signing cleanup path.' }
    $pfxFile = Join-Path $directory 'windows-signing-cert.pfx'
    if (Test-Path -LiteralPath $pfxFile) { Remove-Item -LiteralPath $pfxFile -Force }
    # No recursive delete: fail if the scoped directory contains anything else.
    Remove-Item -LiteralPath $directory -Force
  }
}
