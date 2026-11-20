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
  # 2026-11-20: /api puede ir por la guardia 127.0.0.1:9161 (→3030); también vale.
  if grep -Eq "/api +proxy http://127\.0\.0\.1:(3030|9161)" <<<"$current"; then
    echo "Tailscale Funnel ya sirve /api (directo o por la guardia)"
    return 0
  fi

  # NUNCA `funnel --bg 3030` ni `serve` sobre :443: el primero sustituye TODO el mapa
  # (borra /fleet) y el segundo apaga el Funnel del puerto. Solo se añade /api por la guardia.
  echo "Funnel sin /api; se añade por la guardia sin pisar el resto"
  "$TAILSCALE_BIN" funnel --bg --https=443 --set-path /api http://127.0.0.1:9161/api >/dev/null 2>&1 || true
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
