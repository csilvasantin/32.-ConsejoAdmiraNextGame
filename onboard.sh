#!/usr/bin/env bash
# onboard.sh — alta automática de ESTA máquina en la flota de admira.live/control.
#
# Uso en la máquina nueva (MacBook Air, etc.):
#   curl -fsSL https://www.admira.live/onboard.sh | bash -s -- <FLEET_TOKEN> ["Rol"] ["emoji"]
#   o:  bash onboard.sh <FLEET_TOKEN>
#
# El token de flota (X-Fleet-Token) lo tienes en Telegram / ~/fleet-control/.fleet-token
# del MacMini. Si esta máquina ya tiene la synckey de la flota, el script puede sacar
# el token (y la pubkey SSH del hub) de la cúpula y no hace falta pasarlo.
set -euo pipefail
API="https://macmini.tail48b61c.ts.net/fleet/api"
VAULT="https://admira-vault.csilvasantin.workers.dev/secret"
vget(){ curl -s --max-time 10 "$VAULT/$1?key=$2" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin).get("value","") or "")' 2>/dev/null || true; }

SK="$(cat "$HOME/.agents-comms/.synckey" 2>/dev/null || true)"

# 1) token de flota: arg > vault(synckey) > fichero local
TOKEN="${1:-}"
[ -z "$TOKEN" ] && [ -n "$SK" ] && TOKEN="$(vget FLEET_CONTROL_TOKEN "$SK")"
[ -z "$TOKEN" ] && TOKEN="$(cat "$HOME/.agents-comms/.fleet-token" 2>/dev/null || true)"
[ -n "$TOKEN" ] || { echo "[onboard] falta el token de flota. Uso: bash onboard.sh <FLEET_TOKEN>"; exit 1; }

ROLE="${2:-Equipo nuevo}"; EMOJI="${3:-💻}"

# 2) identidad de esta máquina
NAME="$(scutil --get ComputerName 2>/dev/null || hostname -s)"
WHO="$(whoami)"
TS="$(command -v tailscale || echo /Applications/Tailscale.app/Contents/MacOS/Tailscale)"
HOST="$("$TS" status --json 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || true)"
[ -n "$HOST" ] || HOST="$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g;s/^-+//;s/-+$//').tail48b61c.ts.net"

# 3) (opcional) autoriza al hub MacMini a entrar por SSH → estado online + control remoto.
#    Requiere ademas: System Settings ▸ General ▸ Compartir ▸ Sesion remota = ON.
if [ -n "$SK" ]; then
  PK="$(vget FLEET_HUB_PUBKEY "$SK")"
  if [ -n "$PK" ]; then
    mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"; touch "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"
    grep -qF "$PK" "$HOME/.ssh/authorized_keys" 2>/dev/null || printf '%s\n' "$PK" >> "$HOME/.ssh/authorized_keys"
    echo "[onboard] hub MacMini autorizado por SSH (recuerda activar Sesion remota)"
  fi
fi

# 4) alta en FleetControl
BODY="$(NAME="$NAME" HOST="$HOST" WHO="$WHO" ROLE="$ROLE" EMOJI="$EMOJI" python3 -c 'import os,json;print(json.dumps({"name":os.environ["NAME"],"host":os.environ["HOST"],"user":os.environ["WHO"],"role":os.environ["ROLE"],"emoji":os.environ["EMOJI"]}))')"
RESP="$(curl -s --max-time 20 -X POST "$API/register" -H "Content-Type: application/json" -H "X-Fleet-Token: $TOKEN" -d "$BODY")"
echo "[onboard] $RESP"
echo "[onboard] -> revisa https://www.admira.live/control"
