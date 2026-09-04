#!/bin/sh
# Empuja vista-previa/estado.json al worker admira-estado (estado live compartido).
# Uso:  ESTADO_TOKEN=<token> ./put.sh   [ruta-al-estado.json]
# dominio propio: LaLiga bloquea workers.dev en horas de fútbol, FLT-1633
API="${ESTADO_API:-https://estado.admira.store}"
FILE="${1:-$(cd "$(dirname "$0")/../../vista-previa" && pwd)/estado.json}"
if [ -z "$ESTADO_TOKEN" ]; then echo "falta ESTADO_TOKEN (el secreto del worker)"; exit 1; fi
if [ ! -f "$FILE" ]; then echo "no existe $FILE"; exit 1; fi
code=$(curl -s -o /tmp/estado-put.out -w '%{http_code}' -X POST "$API/estado" \
  -H "Content-Type: application/json" -H "X-Estado-Token: $ESTADO_TOKEN" \
  --data-binary @"$FILE")
echo "HTTP $code"; cat /tmp/estado-put.out; echo
[ "$code" = "200" ] || exit 1
