#!/usr/bin/env bash
# dashboard-report.sh — ingesta de 1 línea para el Dashboard de comunicaciones
# (www.admira.live/dashboard). Cualquier agente/nieto vuelca su reporte al feed
# común (bus = /api/diary del worker admira-telegram, HTTP fiable, sin Telegram).
#
# Uso:
#   PANEL_KEY=$(cat ~/.agents-comms/panel.key) \
#   PERSONA=infraNeo MACHINE=MacBookAir16plata PROJECT=ainimation \
#   ./dashboard-report.sh "reporte: lo que estoy haciendo"
#
# O una sola línea (lo que se documenta en la Cúpula para los nietos):
#   curl -s -X POST https://admira-telegram.csilvasantin.workers.dev/api/diary \
#     -H "Authorization: Bearer $(cat ~/.agents-comms/panel.key)" \
#     -H "Content-Type: application/json" \
#     -d "{\"persona\":\"$PERSONA\",\"machine\":\"$MACHINE\",\"runtime\":\"Claude\",\"kind\":\"log\",\"project\":\"$PROJECT\",\"text\":\"$MSG\"}"
set -euo pipefail
MSG="${1:?uso: dashboard-report.sh \"texto\"}"
KEY="${PANEL_KEY:-$(cat "$HOME/.agents-comms/panel.key" 2>/dev/null)}"
PERSONA="${PERSONA:-$(hostname)}"; MACHINE="${MACHINE:-$(hostname)}"
RUNTIME="${RUNTIME:-Claude}"; PROJECT="${PROJECT:-}"; KIND="${KIND:-log}"
curl -s -X POST "https://admira-telegram.csilvasantin.workers.dev/api/diary" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "$(printf '{"persona":"%s","machine":"%s","runtime":"%s","kind":"%s","project":"%s","text":"%s"}' \
        "$PERSONA" "$MACHINE" "$RUNTIME" "$KIND" "$PROJECT" "$MSG")"
echo
# El feed del Dashboard deriva la CAPA del nombre: subsub/infra=nieto, sub=hijo, resto=principal.
# Copia canónica para toda la flota: mirror en la Cúpula (admira-vault, s:DASHBOARD_REPORT_SH) — lo escribe Neo (admin).
