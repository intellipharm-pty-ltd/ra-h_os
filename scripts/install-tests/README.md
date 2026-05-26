# Installer Tests

Disposable, host-isolated test harnesses for `scripts/install.sh` and `scripts/install.ps1`.

Nothing here modifies your host — Docker containers run with `--rm` and Windows Sandbox is destroyed on close. Repo mounts are read-only.

## Quick copy

### openai profile (fast — no models pulled)

```bash
# Linux — smoke test against your local working copy (single distro, ~3 min)
# Run from inside WSL Ubuntu so it talks to the WSL docker daemon
sudo service docker start   # if not already running
cd /mnt/f/Development/ra-h_os
DISTROS="ubuntu:24.04|apt" MODE=local ./scripts/install-tests/linux-docker-matrix.sh

# Linux — full 4-distro matrix against your local working copy (~10–15 min)
MODE=local ./scripts/install-tests/linux-docker-matrix.sh

# Linux — once the branch is on GitHub, test the actual one-liner URL
REF=feature/one-line-install-scripts ./scripts/install-tests/linux-docker-matrix.sh
```

```powershell
# Windows — test the public install.ps1 one-liner in a disposable VM
# (run from Windows, not WSL; requires Windows Sandbox enabled + reboot done)
explorer.exe scripts\install-tests\windows-sandbox-remote.wsb

# Windows — test your local install.ps1 working copy
.\scripts\install-tests\Run-LocalSandbox.ps1
```

### qwen-local profile (slow — pulls ~3 GB of ollama models per run)

Heads up: each container/sandbox pulls `qwen3:4b` (~2.6 GB) and `qwen3-embedding:0.6b` (~600 MB) from the ollama registry. The full Linux matrix downloads them four times. Budget ~10–15 min per distro and ensure you have the bandwidth and disk headroom.

```bash
# Linux — smoke test the qwen-local flow on one distro
PROFILE=qwen-local DISTROS="ubuntu:24.04|apt" MODE=local ./scripts/install-tests/linux-docker-matrix.sh

# Linux — full qwen-local matrix (~45–60 min, pulls models 4 times)
PROFILE=qwen-local MODE=local ./scripts/install-tests/linux-docker-matrix.sh
```

```powershell
# Windows — test public install.ps1 with qwen-local in a disposable VM
explorer.exe scripts\install-tests\windows-sandbox-remote-qwen.wsb

# Windows — test your local install.ps1 with qwen-local
.\scripts\install-tests\Run-LocalSandbox.ps1 -AiProfile qwen-local
```

See sections below for prerequisites and full option reference.

## Cleanup / disk usage

Models and installed packages **are cleaned up automatically** — both platforms are designed to be disposable:

- **Docker containers** run with `--rm`, so the container's writable layer (where ollama puts its ~3 GB of models, plus npm modules, plus everything else) is deleted on exit. Nothing about a test run persists on your host filesystem.
- **Windows Sandbox** destroys the entire VM when the window closes. The repo mount is read-only, so the host is never touched either way.

The one thing that *does* stay on disk is the Docker **base images** (ubuntu, debian, fedora) — about 500 MB total across all four distros — cached so subsequent runs are faster. To reclaim that space:

```bash
# Remove just the test base images
docker rmi ubuntu:24.04 ubuntu:22.04 debian:12 fedora:40

# Or nuke everything Docker is holding onto
docker system prune -a
```

Worst case after a full qwen-local matrix run: ~500 MB of base images on disk, zero models, zero changes to your host outside Docker's own data directory.

## Linux / macOS (Docker)

Runs the installer in a matrix of clean base images (`ubuntu:24.04`, `ubuntu:22.04`, `debian:12`, `fedora:40`).

### Prerequisite

A reachable Docker daemon. On Windows this typically means starting Docker inside your WSL distro before running the script:

```bash
# Inside WSL Ubuntu (one-shot, daemon dies on WSL shutdown)
sudo service docker start
```

Run the script from inside WSL so it talks to the WSL-side daemon directly.

### Quick validation (single distro)

Fast smoke test before fanning out to the full matrix:

```bash
DISTROS="ubuntu:24.04|apt" MODE=local ./scripts/install-tests/linux-docker-matrix.sh
```

### Full matrix

```bash
# Test the version published on main (mirrors the public one-liner)
./scripts/install-tests/linux-docker-matrix.sh

# Test a different ref on GitHub (use this once your branch is pushed)
REF=feature/one-line-install-scripts ./scripts/install-tests/linux-docker-matrix.sh

# Test your local working copy (mounts the repo read-only) — works pre-merge
MODE=local ./scripts/install-tests/linux-docker-matrix.sh

# Switch profile (default: openai)
PROFILE=qwen-local ./scripts/install-tests/linux-docker-matrix.sh

# Custom distro list (space-separated "image|pm" entries; pm is apt or dnf)
DISTROS="debian:12|apt fedora:40|dnf" MODE=local ./scripts/install-tests/linux-docker-matrix.sh
```

Prints a PASS/FAIL summary at the end and exits non-zero if any distro failed.

Each distro's full output is also streamed live AND written to a timestamped log file under `/tmp/rah-install-tests/<YYYYMMDD-HHMMSS>/<image>.log`. The summary lists the log path next to each result so failures are one tail away. Override with `LOG_DIR=/path/to/dir` if you want a stable location.

**Note:** in `MODE=local` the installer still `git clone`s `main` from GitHub — only `install.sh` itself comes from your working copy. Push your branch and use `REF=<branch>` if you need the clone to pick up your changes too.

## Windows (Windows Sandbox)

Requires Windows 10/11 Pro or Enterprise with the Sandbox feature enabled (one-time, admin PowerShell on host):

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName "Containers-DisposableClientVM" -All
```
Reboot afterward.

### Remote mode — tests the public one-liner

Double-click `windows-sandbox-remote.wsb`. A fresh Windows 11 VM boots, a PowerShell window opens, and it runs:

```powershell
irm https://raw.githubusercontent.com/bradwmorris/ra-h_os/main/scripts/install.ps1 | iex
```

Close the Sandbox window when done — everything is wiped.

### Local mode — tests your working copy

```powershell
.\Run-LocalSandbox.ps1
```

Generates a temp `.wsb` that mounts the repo root read-only at `C:\Users\WDAGUtilityAccount\Desktop\ra-h_os-src` and runs `scripts\install.ps1 -Yes` from the mount. Same caveat as Linux local mode: the installer still clones `main` from GitHub for everything except `install.ps1` itself.

## What gets tested

The default `openai` profile is the cheap smoke test — it doesn't need network services or models. It verifies:

- Node detection / install (nvm on Linux, winget on Windows)
- Git clone
- `npm install` + `npm run setup:local`
- `.env.local` creation and permissions hardening
- sqlite-vec extension detection (warns but doesn't fail if missing)

`qwen-local` additionally installs Ollama, starts the daemon, and pulls multi-GB models. `llama-cpp` is not exercised here — it expects pre-running llama.cpp servers that aren't available in containers.

## What these tests do NOT cover

Be honest about the limits before relying on a green result:

- **macOS-native paths.** The README header says "Linux / macOS" because Docker can be run from a Mac host, but Docker on macOS runs Linux containers — the Darwin-specific branches of `install.sh` (`brew install ollama`, the `.dylib` sqlite-vec extension, `brew services`) are never executed. Test those on a real Mac.
- **The cloned repo contents.** `install.sh` and `install.ps1` always `git clone` from `main`. `REF=<branch>` only swaps where the *installer script itself* comes from. Changes to `setup-local.mjs`, `package.json`, or anything else on a feature branch won't be exercised until merged to main.
- **`llama-cpp` profile.** Not tested at all — it expects pre-running llama.cpp servers.
- **App boot.** `npm run dev` is never started. "Installation complete!" means the installer exited 0, not that the Next.js server actually starts, the database opens, or the UI loads.
- **API key validity.** The Linux tests pass `OPENAI_API_KEY=sk-test-placeholder` so the installer writes *something* to `.env.local`. It is never validated against OpenAI's API.
- **MCP setup.** The `npx -y ra-h-mcp-server@latest setup` step shown at the end of the installer is informational only — it isn't run.
- **Network edge cases.** Containers and Sandbox share the host's network. Behavior behind corporate proxies, captive portals, or with restrictive firewalls is not exercised.

## Interpreting results

A `PASS` line means: the installer script ran to completion, exited 0, and printed `Installation complete!`. That's it.

It does **not** prove the app works end-to-end. To verify the install actually produced a runnable app, drop `--rm` from a container (or open a shell into the Sandbox) and run `npm run dev` manually, then hit `http://localhost:3000`. Adding an automated post-install smoke that boots Next.js and curls the homepage would close this gap; it's not in scope today.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` | Daemon not running. Inside WSL: `sudo service docker start`. |
| `permission denied: ./linux-docker-matrix.sh` | Lost executable bit (common after Windows checkout). Fix: `chmod +x scripts/install-tests/linux-docker-matrix.sh`. |
| `docker: command not found` on Windows | You're in PowerShell on the host — switch to WSL Ubuntu, or install Docker Desktop. |
| `/mnt/f/Development/ra-h_os: No such file or directory` inside WSL | The drive isn't mounted in this WSL instance. Check `/etc/wsl.conf` automount settings. |
| Windows Sandbox menu entry missing | Feature not enabled, or reboot wasn't done. Re-run the `Enable-WindowsOptionalFeature` command and reboot. |
| `WindowsSandbox.exe` exists but `.wsb` won't launch | Try double-clicking from File Explorer instead of `explorer.exe <path>` — file association may not be registered for elevated shells. |
| Model pull stalls at 0% or 1% on the qwen-local profile | Ollama registry slowness or local bandwidth. Retry; or pre-pull on the host and bind-mount `~/.ollama` (advanced). |
| `ERROR: This version requires zstd` during ollama install | Should be handled by `install.sh`'s zstd preflight. If you see it, the installer is out of date — pull `main`. |
| Per-distro log path scrolls off screen | All logs land under `/tmp/rah-install-tests/<timestamp>/`; the dir is printed at the top of every run. |

## CI integration (sketch)

Not wired up today, but here's the rough shape if you want to add it. `linux-latest` runners have Docker preinstalled, so the matrix script works out of the box. `windows-latest` runners are already disposable VMs, so you don't need Sandbox — just run `install.ps1` directly.

```yaml
# .github/workflows/test-installers.yml
name: installer-tests
on:
  pull_request:
    paths:
      - 'scripts/install.sh'
      - 'scripts/install.ps1'
      - 'scripts/install-tests/**'

jobs:
  linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run installer matrix (openai profile, local mode)
        run: MODE=local ./scripts/install-tests/linux-docker-matrix.sh

  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run install.ps1 directly on the runner
        shell: pwsh
        run: ./scripts/install.ps1 -Yes
```

Caveats: (a) same `MODE=local` limitation — the installer clones `main` from GitHub regardless, so PRs that touch only `setup-local.mjs` won't catch regressions until merge; (b) the `qwen-local` profile pulls ~3 GB per run and will slow CI noticeably — gate it on a label or a `[full]` tag in the PR title if you add it; (c) GitHub-hosted Windows runners cannot run Windows Sandbox (no nested virtualization), so isolation comes from the runner itself, not Sandbox.
