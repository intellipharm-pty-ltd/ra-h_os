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

# ── Profile pre-flight ───────────────────────────────────────────────────────

if ($Profile -eq "qwen-local") {
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Abort "Ollama is required for the qwen-local profile but is not installed. See https://ollama.com"
  }

  Info "Checking Ollama daemon..."
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434" -UseBasicParsing -TimeoutSec 3 | Out-Null
  } catch {
    Abort "Ollama is not running. Start it with: ollama serve"
  }

  Info "Pulling qwen3:4b (utility model)..."
  ollama pull qwen3:4b

  Info "Pulling qwen3-embedding:0.6b (embedding model)..."
  ollama pull qwen3-embedding:0.6b
}

if ($Profile -eq "llama-cpp") {
  Info "Checking llama.cpp servers..."
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:8080/v1/models" -UseBasicParsing -TimeoutSec 3 | Out-Null
  } catch {
    Abort "No llama.cpp server found on port 8080. Start it first:`n  llama-server -m C:\path\to\qwen3-4b.gguf --port 8080"
  }
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:8081/v1/models" -UseBasicParsing -TimeoutSec 3 | Out-Null
  } catch {
    Abort "No llama.cpp embedding server found on port 8081. Start it first:`n  llama-server -m C:\path\to\qwen3-embedding-0.6b.gguf --embedding --port 8081"
  }
  Info "llama.cpp servers reachable on ports 8080 and 8081."
}

# ── Install & setup ──────────────────────────────────────────────────────────

Info "Installing dependencies..."
npm install

Info "Running setup (profile: $Profile)..."
npm run setup:local -- --profile $Profile

# ── Vector extension check ───────────────────────────────────────────────────

$vecDll = "vendor\sqlite-extensions\vec0.dll"
if (Test-Path $vecDll) {
  Info "sqlite-vec extension found: $vecDll"
} else {
  Warn "sqlite-vec extension (vec0.dll) not found at $vecDll"
  Warn "Vector search will be unavailable on Windows without it. Options:"
  Warn "  1. Download vec0.dll for your architecture from https://github.com/asg017/sqlite-vec/releases"
  Warn "     and place it at $((Resolve-Path .).Path)\$vecDll"
  Warn "  2. Use Qdrant as the vector backend — see QDRANT-DEPLOYMENT.md"
}

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
