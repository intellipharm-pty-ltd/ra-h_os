# Launches Windows Sandbox with the local repo mounted read-only, bootstraps
# git + Node into the throwaway session, then runs the RA-H installer.
#
# Mirrors the Linux harness MODE switch (see linux-docker-matrix.sh):
#   -Mode local  (default) : run the mounted working-copy install.ps1 and
#                            pre-clone the branch from the mount (tests the PR).
#   -Mode remote           : fetch install.ps1 from GitHub at -Ref and run it
#                            (tests the published installer; -Ref defaults to main).
#
# The host repo mount is read-only and the sandbox is destroyed on close,
# so the host is never modified. A separate read-write "logs" folder is
# mounted so the full install transcript survives on the host after the
# sandbox closes - inspect it at the path printed below.
[CmdletBinding()]
param(
  [string]$AiProfile = "openai",
  [ValidateSet('local','remote')][string]$Mode = "local",
  [string]$Ref = "main",
  # -Heavy switches the llama-cpp profile from the in-sandbox mock to a REAL
  # llama-server + GGUF models (downloads ~hundreds of MB). No effect on other
  # profiles. Mirrors ALLOW_HEAVY=1 in the Linux matrix.
  [switch]$Heavy,
  # -Winget installs winget into the sandbox and skips the portable Node/Ollama
  # bootstrap, so install.ps1's own winget install/upgrade paths get exercised.
  [switch]$Winget
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
$SandboxLog = 'C:\Users\WDAGUtilityAccount\Desktop\ra-h-logs'

# Per-run host log directory (read-write mount target). Survives sandbox close.
$RunStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$HostLog  = Join-Path $PSScriptRoot "logs\$RunStamp-$Mode-$AiProfile"
New-Item -ItemType Directory -Path $HostLog -Force | Out-Null

$LogFile  = "$SandboxLog\install.log"
$WsbPath  = Join-Path $env:TEMP "rah-install-test-$(Get-Random).wsb"

# The actual work lives in a generated runner.ps1 written to the read-write log
# mount, rather than an inline -Command. This avoids all XML/quote escaping and,
# critically, lets the LogonCommand launch it via `cmd /c start` so a REAL,
# VISIBLE console window is allocated (a bare powershell.exe in a LogonCommand
# often runs without surfacing a window). runner.ps1 runs sandbox-bootstrap.ps1
# as a CHILD powershell so install.ps1's `exit` can't close the -NoExit window,
# and tees all output to the log mount so it survives on the host.
$SandboxBootstrap = "$SandboxSrc\scripts\install-tests\sandbox-bootstrap.ps1"
$runnerContent = @"
Write-Host '[ra-h] Testing installer in Windows Sandbox (mode: $Mode, profile: $AiProfile)' -ForegroundColor Green
Set-Location `$env:USERPROFILE\Desktop
powershell.exe -ExecutionPolicy Bypass -File '$SandboxBootstrap' -SrcPath '$SandboxSrc' -Mode $Mode -Ref $Ref -AiProfile $AiProfile$(if ($Heavy) { ' -Heavy' })$(if ($Winget) { ' -Winget' }) 2>&1 | Tee-Object -FilePath '$LogFile'
Write-Host "[ra-h] bootstrap+install finished (exit code `$LASTEXITCODE)" -ForegroundColor Cyan
"@
[System.IO.File]::WriteAllText((Join-Path $HostLog 'runner.ps1'), $runnerContent, [System.Text.UTF8Encoding]::new($false))

$SandboxRunner = "$SandboxLog\runner.ps1"
$logonCmd = "cmd.exe /c start `"ra-h installer`" powershell.exe -NoExit -ExecutionPolicy Bypass -File `"$SandboxRunner`""

# Heavy profiles download/extract multi-GB artifacts (Ollama ~2GB, models) and
# run local model servers, so give them more headroom than the openai default.
$MemMB = if ($AiProfile -eq 'qwen-local' -or $Heavy) { 8192 } else { 4096 }

@"
<Configuration>
  <Networking>Enable</Networking>
  <MemoryInMB>$MemMB</MemoryInMB>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$RepoRoot</HostFolder>
      <SandboxFolder>$SandboxSrc</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$HostLog</HostFolder>
      <SandboxFolder>$SandboxLog</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>$logonCmd</Command>
  </LogonCommand>
</Configuration>
"@ | Set-Content -Path $WsbPath -Encoding UTF8

Write-Host "Mode / Ref / Profile:    $Mode / $Ref / $AiProfile"
Write-Host "Repo (read-only mount):  $RepoRoot"
Write-Host "Log (read-write mount):  $HostLog"
Write-Host "Transcript on host:      $HostLog\install.log"
Write-Host "WSB config:              $WsbPath"
Write-Host "Launching Windows Sandbox..."
Start-Process -FilePath $WsbPath
