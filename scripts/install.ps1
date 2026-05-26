# One-line installer for RA-H OS (Windows PowerShell)
# Usage: irm https://raw.githubusercontent.com/bradwmorris/ra-h_os/main/scripts/install.ps1 | iex
# Or with a profile: & ([scriptblock]::Create((irm https://raw.githubusercontent.com/bradwmorris/ra-h_os/main/scripts/install.ps1))) --profile qwen-local
param(
  [string]$Profile    = "openai",
  [string]$InstallDir = "ra-h_os"
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/bradwmorris/ra-h_os.git"

function Info  { param($msg) Write-Host "[ra-h] $msg" -ForegroundColor Green }
function Warn  { param($msg) Write-Host "[ra-h] $msg" -ForegroundColor Yellow }
function Abort { param($msg) Write-Host "[ra-h] ERROR: $msg" -ForegroundColor Red; exit 1 }

# ── Dependency checks ────────────────────────────────────────────────────────

if (-not (Get-Command git  -ErrorAction SilentlyContinue)) { Abort "git is required but not installed. See https://git-scm.com" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Abort "Node.js is required but not installed. Install v20.18.1+ from https://nodejs.org" }
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Abort "npm is required but not installed." }

$nodeVersion = (node -e "process.stdout.write(process.versions.node)").Trim()
$parts = $nodeVersion.Split('.')
$major = [int]$parts[0]; $minor = [int]$parts[1]; $patch = [int]$parts[2]

$versionOk = ($major -gt 20) -or
             ($major -eq 20 -and $minor -gt 18) -or
             ($major -eq 20 -and $minor -eq 18 -and $patch -ge 1)

if (-not $versionOk) { Abort "Node.js v20.18.1 or higher is required (found v$nodeVersion). See https://nodejs.org" }

# ── Clone ────────────────────────────────────────────────────────────────────

if (Test-Path $InstallDir) {
  Warn "Directory '$InstallDir' already exists — pulling latest changes."
  git -C $InstallDir pull --ff-only
} else {
  Info "Cloning RA-H OS into '$InstallDir'..."
  git clone $RepoUrl $InstallDir
}

Set-Location $InstallDir

# ── Install & setup ──────────────────────────────────────────────────────────

Info "Installing dependencies..."
npm install

Info "Running setup (profile: $Profile)..."
npm run setup:local -- --profile $Profile

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Info "Installation complete!"
Write-Host ""
Write-Host "  Start the app:  cd $InstallDir; npm run dev"
Write-Host "  Then open:      http://localhost:3000"
Write-Host ""
Write-Host "  Optional MCP setup (Claude Code / Cursor):"
Write-Host "  npx -y ra-h-mcp-server@latest setup --client claude-code --yes"
Write-Host ""
