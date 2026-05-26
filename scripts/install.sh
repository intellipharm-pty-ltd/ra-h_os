#!/usr/bin/env bash
# One-line installer for RA-H OS (Linux / macOS)
# Usage: curl -fsSL https://raw.githubusercontent.com/bradwmorris/ra-h_os/main/scripts/install.sh | bash
# Or with options: curl ... | bash -s -- --profile qwen-local --llm-port 8080 --embedding-port 8081
set -euo pipefail

REPO_URL="https://github.com/bradwmorris/ra-h_os.git"
INSTALL_DIR="${INSTALL_DIR:-ra-h_os}"
PROFILE="openai"
LLM_PORT="8080"
EMBEDDING_PORT="8081"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)        PROFILE="$2";        shift 2 ;;
    --dir)            INSTALL_DIR="$2";    shift 2 ;;
    --llm-port)       LLM_PORT="$2";       shift 2 ;;
    --embedding-port) EMBEDDING_PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[ra-h]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ra-h]${NC} $*"; }
error() { echo -e "${RED}[ra-h] ERROR:${NC} $*" >&2; exit 1; }
ask()   {
  local _a
  read -rp $'\033[0;32m[ra-h]\033[0m '"$1"$' [y/N] ' _a </dev/tty || true
  [[ "$_a" =~ ^[Yy]$ ]]
}

# ── git check ────────────────────────────────────────────────────────────────

command -v git >/dev/null 2>&1 || error "git is required but not installed. See https://git-scm.com"

# ── Node.js check ────────────────────────────────────────────────────────────

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  warn "Node.js is not installed."
  # Source nvm if already present but not yet loaded in this shell
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  if command -v nvm >/dev/null 2>&1; then
    info "nvm detected — using it to install Node.js v20..."
    nvm install 20
    nvm use 20
  elif ask "Install Node.js v20 via nvm now?"; then
    info "Installing nvm and Node.js v20..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
  else
    error "Node.js v20.18.1+ is required. Install from https://nodejs.org then re-run."
  fi
  command -v node >/dev/null 2>&1 || error "Node.js installation failed. Install manually from https://nodejs.org"
fi

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

_ollama_running() { curl -sf http://127.0.0.1:11434 >/dev/null 2>&1; }

_start_ollama() {
  info "Starting Ollama daemon..."
  if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1 && brew list ollama &>/dev/null 2>&1; then
    brew services start ollama
  elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files ollama.service &>/dev/null 2>&1; then
    sudo systemctl start ollama
  else
    ollama serve >/dev/null 2>&1 &
    disown
  fi
  local i=0
  while [[ $i -lt 15 ]]; do _ollama_running && return 0; sleep 1; (( i++ )) || true; done
  return 1
}

if [[ "$PROFILE" == "qwen-local" ]]; then
  # ── Install Ollama if missing ──
  if ! command -v ollama >/dev/null 2>&1; then
    warn "Ollama is not installed."
    if ask "Install Ollama now?"; then
      info "Installing Ollama..."
      if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
        brew install ollama
      else
        curl -fsSL https://ollama.com/install.sh | sh
      fi
      command -v ollama >/dev/null 2>&1 || error "Ollama installation failed. Install manually from https://ollama.com"
    else
      error "Ollama is required for the qwen-local profile. Install from https://ollama.com then re-run."
    fi
  fi

  # ── Start daemon if not running ──
  if ! _ollama_running; then
    warn "Ollama daemon is not running."
    if ask "Start Ollama now?"; then
      _start_ollama || error "Ollama daemon failed to start. Run 'ollama serve' in another terminal then re-run."
      info "Ollama daemon is running."
    else
      error "Ollama must be running to pull models. Start it with: ollama serve"
    fi
  else
    info "Ollama daemon is running."
  fi

  info "Pulling qwen3:4b (utility model)..."
  ollama pull qwen3:4b

  info "Pulling qwen3-embedding:0.6b (embedding model)..."
  ollama pull qwen3-embedding:0.6b
fi

if [[ "$PROFILE" == "llama-cpp" ]]; then
  info "Checking llama.cpp servers (ports $LLM_PORT / $EMBEDDING_PORT)..."
  curl -sf "http://127.0.0.1:$LLM_PORT/v1/models" >/dev/null 2>&1 \
    || error "No llama.cpp server on port $LLM_PORT. Start it first:
    llama-server -m /path/to/qwen3-4b.gguf --port $LLM_PORT"
  curl -sf "http://127.0.0.1:$EMBEDDING_PORT/v1/models" >/dev/null 2>&1 \
    || error "No llama.cpp embedding server on port $EMBEDDING_PORT. Start it first:
    llama-server -m /path/to/qwen3-embedding-0.6b.gguf --embedding --port $EMBEDDING_PORT"
  info "llama.cpp servers reachable on ports $LLM_PORT and $EMBEDDING_PORT."
fi

# ── Install & setup ──────────────────────────────────────────────────────────

info "Installing dependencies..."
npm install

info "Running setup (profile: $PROFILE)..."
if [[ "$PROFILE" == "llama-cpp" ]]; then
  LLM_BASE_URL="http://127.0.0.1:$LLM_PORT/v1" \
  EMBEDDING_BASE_URL="http://127.0.0.1:$EMBEDDING_PORT/v1" \
  npm run setup:local -- --profile "$PROFILE"
else
  npm run setup:local -- --profile "$PROFILE"
fi

# ── OpenAI API key ───────────────────────────────────────────────────────────

if [[ "$PROFILE" == "openai" ]]; then
  echo ""
  info "Enter your OpenAI API key to write it to .env.local now."
  info "Press Enter to skip — you can add it later in Settings → API Keys."
  read -rsp $'\033[0;32m[ra-h]\033[0m OpenAI API key: ' _oai_key </dev/tty || true
  echo ""
  if [[ -n "$_oai_key" ]]; then
    if grep -q "^OPENAI_API_KEY=" .env.local 2>/dev/null; then
      sed -i.bak "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$_oai_key|" .env.local && rm -f .env.local.bak
    else
      echo "OPENAI_API_KEY=$_oai_key" >> .env.local
    fi
    info "OpenAI API key saved to .env.local"
  else
    warn "Skipped — add your key later in Settings → API Keys."
  fi
fi

# ── Vector extension check ───────────────────────────────────────────────────

if [[ "$(uname -s)" == "Darwin" ]]; then
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
