#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export ADMIRANEXT_CONTROL_ROOT="$REPO_ROOT"

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
  echo "No se encontro node en PATH: $PATH" >&2
  exit 1
fi

cd "$REPO_ROOT"
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

if [[ -z "${AGORA_BIN:-}" && -x "$HOME/.local/bin/agora" ]]; then
  export AGORA_BIN="$HOME/.local/bin/agora"
fi

TAILSCALE_BIN=""
if [[ -x "/Applications/Tailscale.app/Contents/MacOS/Tailscale" ]]; then
  TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
elif command -v tailscale >/dev/null 2>&1; then
  TAILSCALE_BIN="$(command -v tailscale)"
fi

heal_tailscale_route() {
  [[ -n "$TAILSCALE_BIN" ]] || return 0

  local current=""
  current="$("$TAILSCALE_BIN" funnel status 2>/dev/null || true)"
  if grep -Fq "proxy http://127.0.0.1:3030" <<<"$current"; then
    echo "Tailscale Funnel ya apunta a 127.0.0.1:3030"
    return 0
  fi

  echo "Reparando Tailscale Funnel -> 127.0.0.1:3030"
  "$TAILSCALE_BIN" funnel --bg 3030 >/dev/null
}

wait_for_local_api() {
  local attempts="${1:-30}"
  local delay="${2:-1}"
  local i
  for ((i=1; i<=attempts; i+=1)); do
    if curl -fsS --max-time 3 "http://127.0.0.1:3030/api/council/assignees" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

"$NODE_BIN" src/server.js &
NODE_PID=$!

cleanup() {
  if kill -0 "$NODE_PID" >/dev/null 2>&1; then
    kill "$NODE_PID" >/dev/null 2>&1 || true
    wait "$NODE_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if wait_for_local_api; then
  heal_tailscale_route
else
  echo "La API local no respondio en 127.0.0.1:3030; no se toca Tailscale." >&2
fi

wait "$NODE_PID"
