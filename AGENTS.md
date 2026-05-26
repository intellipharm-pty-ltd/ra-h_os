# RA-OS Agent Workflow (Open Source)

This file is the source of truth for AI agents and contributors working in this repository.

## Scope

- This workflow applies to `ra-h_os` only.
- Do not require private-repo docs, handoffs, or backlog files to complete work here.

## Working Rules

1. Start from `main` and create a branch:
   - `feat/<short-name>`
   - `fix/<short-name>`
   - `docs/<short-name>`
2. Keep changes small and reviewable.
3. If behavior changes, update docs in the same PR.
4. Do not commit directly to `main`.

## Standard Dev Loop

1. Reproduce/define the problem.
2. Implement the minimal correct change.
3. Run local checks.
4. Update docs and screenshots if needed.
5. Open PR with clear summary and test notes.

## Required Checks

```bash
npm run type-check
npm run lint
npm run build
```

## Installer Scripts

`scripts/install.sh` (bash) and `scripts/install.ps1` (PowerShell) are one-line installers for fresh-machine setup. They are **not** dev tools — do not run them inside an existing clone.

Key behaviours to preserve when editing:
- `set -euo pipefail` (bash) / `$ErrorActionPreference = "Stop"` (PS) — every failure must be intentionally handled with `|| warn` / `$LASTEXITCODE` checks or it aborts
- Version parsing uses `IFS=. read -r` + `%%[!0-9]*` suffix stripping (bash) and `-replace '[^\d].*$',''` (PS) — pre-release tags like `20.18.1-rc.1` must not cause arithmetic errors
- `.env.local` is hardened (`chmod 600` / `icacls`) immediately after `npm run setup:local` AND again after any key write — both locations are required
- `git rev-parse --git-dir` validates existing dirs before `git pull` — non-git directories must abort, not warn-and-continue
- `_OLLAMA_BG` flag passes daemon start method from `_start_ollama` to the caller so persistence warnings land in the right order
- `_ensure_zstd` is called before `curl -fsSL https://ollama.com/install.sh | sh` — Ollama's installer needs `zstd` for tarball extraction but does not check for it; minimal systems (containers, fresh cloud VMs, minimal WSL) fail without this preflight
- Both scripts accept `--yes` / `-Yes` for fully non-interactive CI use

Profiles: `openai` (default), `qwen-local` (Ollama + model pull), `llama-cpp` (pre-running servers on `--llm-port` / `--embedding-port`).

### Testing the installers

Disposable, host-isolated test harness lives at `scripts/install-tests/`. Run the relevant scenarios before opening a PR that touches `install.sh` or `install.ps1`:

- **Linux** — Docker. Must be run from inside WSL (or any Linux env) where the docker daemon is reachable.
  - `linux-docker-matrix.sh` — runs the installer across `ubuntu:24.04`, `ubuntu:22.04`, `debian:12`, `fedora:40`. `MODE=local` mounts the working repo (read-only); `REF=<branch>` tests a pushed branch; `PROFILE=qwen-local` exercises the Ollama path (~10 min, pulls ~3 GB of models).
  - `linux-edge-cases.sh` — seven edge-case scenarios that the distro matrix doesn't cover: no API key, non-git existing dir, re-run uses pull, nvm-present-no-node, old-node-auto-upgrade, prerelease-node-tag-no-crash, llama-cpp-with-mock-servers. Tier 2 scenarios use pre-seeded images built from `fixtures/Dockerfile.*`.
- **Windows** — Windows Sandbox (requires `Enable-WindowsOptionalFeature -FeatureName "Containers-DisposableClientVM"` + reboot once). Double-click `windows-sandbox-remote.wsb` (openai) or `windows-sandbox-remote-qwen.wsb` (qwen-local) to test the public one-liner; `Run-LocalSandbox.ps1` mounts the working repo read-only into a fresh VM.
- **Cleanup** — `cleanup.sh` removes test-scoped Docker images and log files. Pass `--with-build-cache` to also prune Docker's shared build cache.

What the harness does NOT verify (documented in `scripts/install-tests/README.md`): macOS-native paths (Darwin branch, brew, `.dylib`), `npm run dev` actually booting, API key validity, MCP setup. A `PASS` line only proves the installer exited 0 with "Installation complete!" printed.

## Docs Map

- `README.md` - product overview + quick start
- `docs/README.md` - docs index
- `docs/4_tools-and-guides.md` - MCP tools + skills surface
- `docs/6_ui.md` - UI behavior
- `docs/8_mcp.md` - MCP setup, troubleshooting, and memory-file guidance
- `docs/development/process.md` - contributor process
- `docs/development/docs-process.md` - docs maintenance process

## Upstream Relationship

- `ra-h_os` accepts direct contributions.
- Maintainers may sync relevant changes between public and private repos.
- Public contributions should remain attributable and not be overwritten.
