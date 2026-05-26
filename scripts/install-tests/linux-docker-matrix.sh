#!/usr/bin/env bash
# Runs scripts/install.sh in disposable Docker containers across a matrix of distros.
# Host is never touched — containers use --rm and any repo mount is read-only.
#
# Env vars:
#   REF=main                              GitHub ref for remote mode
#   MODE=remote|local                     remote = curl from REF; local = mount working copy
#   PROFILE=openai|qwen-local|llama-cpp   --profile passed to install.sh
#   DISTROS="ubuntu:24.04|apt debian:12|apt"   space-separated image|pm overrides
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

REF="${REF:-main}"
MODE="${MODE:-remote}"
PROFILE="${PROFILE:-openai}"

if [[ -n "${DISTROS:-}" ]]; then
  read -ra DISTROS_ARR <<< "$DISTROS"
else
  DISTROS_ARR=(
    "ubuntu:24.04|apt"
    "ubuntu:22.04|apt"
    "debian:12|apt"
    "fedora:40|dnf"
  )
fi

APT_BOOTSTRAP='apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git ca-certificates >/dev/null'
DNF_BOOTSTRAP='dnf install -y -q curl git ca-certificates >/dev/null'

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }

if [[ "$MODE" == "remote" ]]; then
  INSTALL_CMD="curl -fsSL https://raw.githubusercontent.com/bradwmorris/ra-h_os/$REF/scripts/install.sh | bash -s -- --profile $PROFILE --yes"
elif [[ "$MODE" == "local" ]]; then
  INSTALL_CMD="bash /work/scripts/install.sh --profile $PROFILE --yes"
else
  echo "MODE must be 'remote' or 'local' (got: $MODE)" >&2
  exit 1
fi

LOG_DIR="${LOG_DIR:-/tmp/rah-install-tests/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$LOG_DIR"
echo "Per-distro logs: $LOG_DIR"

results=()

for entry in "${DISTROS_ARR[@]}"; do
  image="${entry%|*}"
  pm="${entry#*|}"
  case "$pm" in
    apt) bootstrap="$APT_BOOTSTRAP" ;;
    dnf) bootstrap="$DNF_BOOTSTRAP" ;;
    *)   echo "Unknown package manager '$pm' for $image — skipping" >&2; results+=("SKIP  $image (unknown pm)"); continue ;;
  esac

  log_file="$LOG_DIR/${image//[:\/]/-}.log"

  echo ""
  echo "=== $image  (mode=$MODE, profile=$PROFILE, ref=$REF) ==="
  echo "    log: $log_file"

  docker_args=(run --rm -e OPENAI_API_KEY=sk-test-placeholder)
  [[ "$MODE" == "local" ]] && docker_args+=(-v "$REPO_ROOT:/work:ro")

  # tee streams live AND captures to file; PIPESTATUS preserves docker's exit code through the pipe
  docker "${docker_args[@]}" "$image" bash -c "$bootstrap && cd /tmp && $INSTALL_CMD" 2>&1 | tee "$log_file"
  status=${PIPESTATUS[0]}

  if [[ "$status" -eq 0 ]]; then
    results+=("PASS  $image  ($log_file)")
  else
    results+=("FAIL  $image  ($log_file)")
  fi
done

echo ""
echo "=== Summary ==="
printf '  %s\n' "${results[@]}"

if printf '%s\n' "${results[@]}" | grep -q '^FAIL'; then
  exit 1
fi
