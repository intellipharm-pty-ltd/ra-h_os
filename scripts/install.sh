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

# ── Profile pre-flight ───────────────────────────────────────────────────────

if [[ "$PROFILE" == "qwen-local" ]]; then
  if ! command -v ollama >/dev/null 2>&1; then
    warn "Ollama is not installed."
    read -rp $'\033[0;32m[ra-h]\033[0m Install Ollama now? [y/N] ' _answer </dev/tty || true
    if [[ "$_answer" =~ ^[Yy]$ ]]; then
      info "Installing Ollama..."
      if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
        brew install ollama
      else
        curl -fsSL https://ollama.com/install.sh | sh
      fi
      command -v ollama >/dev/null 2>&1 || error "Ollama installation failed. Install manually from https://ollama.com"
    else
      error "Ollama is required for the qwen-local profile. Install it from https://ollama.com then re-run."
    fi
  fi

  info "Checking Ollama daemon..."
  curl -sf http://127.0.0.1:11434 >/dev/null 2>&1 || error "Ollama is not running. Start it with: ollama serve"

  info "Pulling qwen3:4b (utility model)..."
  ollama pull qwen3:4b

  info "Pulling qwen3-embedding:0.6b (embedding model)..."
  ollama pull qwen3-embedding:0.6b
fi

if [[ "$PROFILE" == "llama-cpp" ]]; then
  info "Checking llama.cpp servers..."
  curl -sf http://127.0.0.1:8080/v1/models >/dev/null 2>&1 \
    || error "No llama.cpp server found on port 8080. Start it first:
    llama-server -m /path/to/qwen3-4b.gguf --port 8080"
  curl -sf http://127.0.0.1:8081/v1/models >/dev/null 2>&1 \
    || error "No llama.cpp embedding server found on port 8081. Start it first:
    llama-server -m /path/to/qwen3-embedding-0.6b.gguf --embedding --port 8081"
  info "llama.cpp servers reachable on ports 8080 and 8081."
fi

# ── Install & setup ──────────────────────────────────────────────────────────

info "Installing dependencies..."
npm install

info "Running setup (profile: $PROFILE)..."
npm run setup:local -- --profile "$PROFILE"

# ── Vector extension check ───────────────────────────────────────────────────

PLATFORM=$(uname -s)
if [[ "$PLATFORM" == "Darwin" ]]; then
  VEC_EXT="vendor/sqlite-extensions/vec0.dylib"
else
  VEC_EXT="vendor/sqlite-extensions/vec0.so"
fi

if [[ -f "$VEC_EXT" ]]; then
  info "sqlite-vec extension found: $VEC_EXT"
else
  warn "sqlite-vec extension not found at $VEC_EXT"
  warn "Vector search will be unavailable. Options:"
  warn "  1. Build or download vec0 for your platform and place it at $VEC_EXT"
  warn "  2. Use Qdrant as the vector backend — see QDRANT-DEPLOYMENT.md"
fi

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
