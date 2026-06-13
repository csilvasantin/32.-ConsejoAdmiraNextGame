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

exec "$NODE_BIN" src/server.js
