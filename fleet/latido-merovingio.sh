#!/usr/bin/env bash
# latido-merovingio.sh — latido de presencia de Merovingio (Elon / Merovingio, Grok) desde su bucle tmux en un Mac.
# r40 (Carlos, 10-10-2026: «el Merovingio ni siquiera aparece»). El bucle tmux «merovingio» solo leía encargos y no
# latía: bot.yokup.com/api/presence no sabía que corría en el Mac y /consumos no lo veía.
#
# Contrato (igual que yokup_presencia en mcp/server/src/yokup.js): POST https://bot.yokup.com/api/presence
#   Authorization: Bearer <clave de panel de admira-telegram>, cuerpo {persona, machine, runtime, host, model, focus, …}.
#   Persona BASE («Merovingio», sin apellido de máquina): la presencia se indexa por persona + máquina.
# La clave se lee de $LATIDO_KEY_FILE (por defecto ~/.agents-comms/panel.key, la misma que fleet-control/dashboard-report.sh) y nunca se imprime.
#
# Uso:  latido-merovingio.sh            # un latido y sale (para un LaunchAgent con StartInterval 60)
#       latido-merovingio.sh --bucle    # late cada $LATIDO_CADA s (60) mientras viva
#       latido-merovingio.sh --dry-run  # imprime el cuerpo sin mandar nada
# Variables: LATIDO_PERSONA (Merovingio) · LATIDO_MAQUINA (hostname corto) · LATIDO_TMUX (merovingio) ·
#            LATIDO_MODELO (Grok) · LATIDO_URL · LATIDO_KEY_FILE · LATIDO_CADA (60)
set -uo pipefail
PERSONA="${LATIDO_PERSONA:-Merovingio}"
MAQUINA="${LATIDO_MAQUINA:-$(scutil --get LocalHostName 2>/dev/null || hostname -s)}"
SESION="${LATIDO_TMUX:-merovingio}"
MODELO="${LATIDO_MODELO:-Grok}"
URL="${LATIDO_URL:-https://bot.yokup.com/api/presence}"
KEY_FILE="${LATIDO_KEY_FILE:-$HOME/.agents-comms/panel.key}"
CADA="${LATIDO_CADA:-60}"

json_str() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }

cuerpo() {
  local vivo="false" adjunto="false" foco
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$SESION" 2>/dev/null; then
    vivo="true"
    [ -n "$(tmux list-clients -t "$SESION" 2>/dev/null)" ] && adjunto="true"
  fi
  if [ "$vivo" = "true" ]; then foco="Bucle de encargos en tmux «$SESION»"; else foco="Sin sesión tmux «$SESION»"; fi
  # Pasivo: un bucle que lee encargos está vivo pero no «trabajando»; así no infla el verde de /consumos.
  printf '{"persona":%s,"machine":%s,"runtime":"Grok","host":"cli","model":%s,"focus":%s,"session_id":%s,"attached":%s,"mode":"pasivo","working":false}\n' \
    "$(json_str "$PERSONA")" "$(json_str "$MAQUINA")" "$(json_str "$MODELO")" "$(json_str "$foco")" "$(json_str "$SESION")" "$adjunto"
}

latir() {
  local b; b="$(cuerpo)"
  if [ "${1:-}" = "--dry-run" ]; then echo "$b"; return 0; fi
  [ -r "$KEY_FILE" ] || { echo "latido: falta $KEY_FILE (clave de panel de admira-telegram)" >&2; return 3; }
  local code
  code="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -X POST "$URL" \
    -H 'content-type: application/json' -H "authorization: Bearer $(tr -d '\r\n' < "$KEY_FILE")" --data "$b")" || code="000"
  echo "$(date '+%H:%M:%S') latido $PERSONA@$MAQUINA → HTTP $code"
  [ "$code" = "200" ] || [ "$code" = "201" ] || [ "$code" = "204" ]
}

case "${1:-}" in
  --dry-run) latir --dry-run ;;
  --bucle) while :; do latir || true; sleep "$CADA"; done ;;
  *) latir ;;
esac
