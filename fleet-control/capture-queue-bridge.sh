#!/bin/bash
# Puente cola→AgoraCapture para el Mac Mini (9-nov-2026, admira.live/control).
# El server de PR #318 pide fotogramas por ~/.fleet/capture-queue/<nonce>.req, pero en
# el Mini el único agente de captura con Grabación de pantalla es el demonio bash
# (fleet-capture.sh → AgoraCapture.app) que habla el protocolo viejo capture.req/out.
# Este puente atiende la cola con ese demonio. No toca TCC ni el demonio existente.
# Revertir: launchctl bootout gui/$(id -u)/com.admiranext.capture-queue-bridge
D="$HOME/.fleet"; Q="$D/capture-queue"; OLD="$D/capture-queue-stale"
mkdir -p "$Q" "$OLD"
while true; do
  now=$(date +%s)
  # peticiones abandonadas (>20 s): fuera de la cola, sin borrarlas
  find "$Q" -maxdepth 1 -name '*.req' -mtime -1 -print0 2>/dev/null | while IFS= read -r -d '' f; do
    m=$(stat -f %m "$f" 2>/dev/null || echo "$now"); [ $((now - m)) -gt 20 ] && mv -f "$f" "$OLD/" 2>/dev/null
  done
  find "$Q" -maxdepth 1 -name '*.req' -mtime +0 -exec mv -f {} "$OLD/" \; 2>/dev/null
  find "$Q" -maxdepth 1 -name '*.out' -mmin +2 -exec mv -f {} "$OLD/" \; 2>/dev/null
  shopt -s nullglob; reqs=("$Q"/*.req); shopt -u nullglob
  if [ ${#reqs[@]} -eq 0 ]; then sleep 0.15; continue; fi
  first="${reqs[0]}"
  dsp=$(sed -n 's/^display=\([0-9]*\).*/\1/p' "$first" | head -1); dsp=${dsp:-0}
  n="qb$(date +%s)$$$RANDOM"
  printf '%s|%s' "$n" "$dsp" > "$D/capture.req"
  got=""
  for i in $(seq 1 100); do
    if [ "$(head -1 "$D/capture.out" 2>/dev/null)" = "$n" ]; then got=1; break; fi
    sleep 0.1
  done
  if [ -n "$got" ]; then body=$(sed -n 2p "$D/capture.out"); else body="ERR_NO_CAPTURE"; fi
  ts=$(date +%s)
  shopt -s nullglob
  for r in "$Q"/*.req; do
    rd=$(sed -n 's/^display=\([0-9]*\).*/\1/p' "$r" | head -1); rd=${rd:-0}
    [ "$rd" = "$dsp" ] || continue
    o="${r%.req}.out"
    case "$body" in
      ERR_*) det="AgoraCapture devolvió $body"; [ -n "$got" ] || det="el demonio bash no contestó en 10 s"
             printf '%s\ncaptured_at=%s\ndisplay=%s\ndetail=%s\n' "$body" "$ts" "$dsp" "$det" > "$o.tmp" ;;
      *) printf 'OK\n%s\ncaptured_at=%s\ndisplay=%s\n' "$body" "$ts" "$dsp" > "$o.tmp" ;;
    esac
    mv -f "$o.tmp" "$o"; rm -f "$r"
  done
  shopt -u nullglob
done
