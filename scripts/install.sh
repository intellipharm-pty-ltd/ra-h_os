#!/usr/bin/env bash
# One-line installer for RA-H OS (Linux / macOS)
# Usage: curl -fsSL https://raw.githubusercontent.com/bradwmorris/ra-h_os/main/scripts/install.sh | bash
# Or with a profile: curl ... | bash -s -- --profile qwen-local
set -euo pipefail

REPO_URL="https://github.com/bradwmorris/ra-h_os.git"
INSTALL_DIR="${INSTALL_DIR:-ra-h_os}"
PROFILE="openai"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --dir)     INSTALL_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[ra-h]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ra-h]${NC} $*"; }
error() { echo -e "${RED}[ra-h] ERROR:${NC} $*" >&2; exit 1; }

# ── Dependency checks ────────────────────────────────────────────────────────

command -v git  >/dev/null 2>&1 || error "git is required but not installed."
command -v node >/dev/null 2>&1 || error "Node.js is required but not installed. Install v20.18.1+ from https://nodejs.org"
command -v npm  >/dev/null 2>&1 || error "npm is required but not installed."

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
NODE_MINOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[1]))")
NODE_PATCH=$(node -e "process.stdout.write(String(process.versions.node.split('.')[2]))")

version_ok=false
if [[ "$NODE_MAJOR" -gt 20 ]]; then
  version_ok=true
elif [[ "$NODE_MAJOR" -eq 20 ]]; then
  if [[ "$NODE_MINOR" -gt 18 ]]; then
    version_ok=true
  elif [[ "$NODE_MINOR" -eq 18 && "$NODE_PATCH" -ge 1 ]]; then
    version_ok=true
  fi
fi

$version_ok || error "Node.js v20.18.1 or higher is required (found $(node -v)). See https://nodejs.org"

# ── Clone ────────────────────────────────────────────────────────────────────

if [[ -d "$INSTALL_DIR" ]]; then
  warn "Directory '$INSTALL_DIR' already exists — pulling latest changes."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning RA-H OS into '$INSTALL_DIR'..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Install & setup ──────────────────────────────────────────────────────────

info "Installing dependencies..."
npm install

info "Running setup (profile: $PROFILE)..."
npm run setup:local -- --profile "$PROFILE"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
info "Installation complete!"
echo ""
echo "  Start the app:  cd $INSTALL_DIR && npm run dev"
echo "  Then open:      http://localhost:3000"
echo ""
echo "  Optional MCP setup (Claude Code / Cursor):"
echo "  npx -y ra-h-mcp-server@latest setup --client claude-code --yes"
echo ""
