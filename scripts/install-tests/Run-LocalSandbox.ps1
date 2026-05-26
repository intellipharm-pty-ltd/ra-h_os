# Launches Windows Sandbox with the local repo mounted read-only,
# then runs scripts\install.ps1 from the mount inside the sandbox.
#
# Host is never modified — the mount is read-only and the sandbox is
# destroyed on close.
[CmdletBinding()]
param(
  [string]$AiProfile = "openai"
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command WindowsSandbox.exe -ErrorAction SilentlyContinue)) {
  Write-Host "Windows Sandbox is not enabled on this host." -ForegroundColor Red
  Write-Host "Enable it once in an admin PowerShell, then reboot:"
  Write-Host '  Enable-WindowsOptionalFeature -Online -FeatureName "Containers-DisposableClientVM" -All'
  exit 1
}

$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SandboxSrc = 'C:\Users\WDAGUtilityAccount\Desktop\ra-h_os-src'
$WsbPath    = Join-Path $env:TEMP "rah-install-test-$(Get-Random).wsb"

$logonCmd = "powershell.exe -NoExit -ExecutionPolicy Bypass -Command `"Write-Host '[ra-h] Testing local install.ps1 in Windows Sandbox' -ForegroundColor Green; Set-Location \$env:USERPROFILE\Desktop; &amp; '$SandboxSrc\scripts\install.ps1' -AiProfile $AiProfile -Yes`""

@"
<Configuration>
  <Networking>Enable</Networking>
  <MemoryInMB>4096</MemoryInMB>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$RepoRoot</HostFolder>
      <SandboxFolder>$SandboxSrc</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>$logonCmd</Command>
  </LogonCommand>
</Configuration>
"@ | Set-Content -Path $WsbPath -Encoding UTF8

Write-Host "Repo (read-only mount): $RepoRoot"
Write-Host "WSB config:             $WsbPath"
Write-Host "Launching Windows Sandbox..."
Start-Process -FilePath $WsbPath
