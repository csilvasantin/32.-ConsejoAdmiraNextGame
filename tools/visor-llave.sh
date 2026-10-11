#!/bin/bash
# visor-llave.sh — llaves del visor admira.live/visor (r27). El token de máquina nunca se imprime.
#   visor-llave.sh nueva [nombre]   crea una llave y guarda el enlace en ~/.config/admira/visor-enlace.txt (600)
#   visor-llave.sh revocar          invalida TODAS las llaves al momento (el enlace deja de abrir)
#   visor-llave.sh listar           nombre, fecha y 4 primeras letras de cada llave
set -euo pipefail
TOK="${COUNCIL_MACHINE_TOKEN:-$(cat "$HOME/.config/admira/consumos-lecturas.token" 2>/dev/null || true)}"
[ -n "$TOK" ] || { echo "sin token de máquina" >&2; exit 1; }
API="https://www.admira.live/api/visor/llave"; A="${1:-listar}"; N="${2:-visor}"
R="$(curl -s --max-time 20 -X POST "$API" -H "content-type: application/json" -H "X-Council-Token: $TOK" -d "{\"accion\":\"$A\",\"nombre\":\"$N\"}")"
if [ "$A" = nueva ]; then
  K="$(printf '%s' "$R" | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin).get("llave",""))')"
  [ -n "$K" ] || { echo "no se pudo crear la llave" >&2; exit 1; }
  umask 077; printf 'https://www.admira.live/visor/#k=%s\n' "$K" > "$HOME/.config/admira/visor-enlace.txt"
  echo "llave creada ($N) · enlace en ~/.config/admira/visor-enlace.txt"
else
  printf '%s\n' "$R"
fi
