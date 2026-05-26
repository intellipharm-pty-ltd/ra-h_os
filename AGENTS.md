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
- Both scripts accept `--yes` / `-Yes` for fully non-interactive CI use

Profiles: `openai` (default), `qwen-local` (Ollama + model pull), `llama-cpp` (pre-running servers on `--llm-port` / `--embedding-port`).

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
