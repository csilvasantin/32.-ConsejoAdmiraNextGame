#!/bin/bash
# Puente cola→captura para el Mac Mini (9-nov-2026, admira.live/control).
# El server de PR #318 pide fotogramas por ~/.fleet/capture-queue/<nonce>.req
# (display=<indice 0-based de /displays>). En el Mini no corre el agente Python de la
# cola. v2 (18:50): captura cada pantalla con `screencapture -D <indice+1>` dentro de
# una sesión SSH a 127.0.0.1 (el contexto sshd ya tiene Grabación de pantalla; mismo
# contrato que fleet-capture.py: screencapture_d = indice + 1). AgoraCapture.app sólo
# saca la principal (un único fichero), así que queda como respaldo SOLO para display=0.
# Pantalla inexistente → ERR_NO_SUCH_DISPLAY; nunca se devuelve otra disfrazada.
# No toca TCC. Revertir: launchctl bootout gui/$(id -u)/com.admiranext.capture-queue-bridge
D="$HOME/.fleet"; Q="$D/capture-queue"; OLD="$D/capture-queue-stale"; T="$D/capture-bridge-tmp"
mkdir -p "$Q" "$OLD" "$T"
SSHO=(-o BatchMode=yes -o ConnectTimeout=3 -o StrictHostKeyChecking=accept-new)
agora_main() {   # respaldo display 0 vía demonio bash (fleet-capture.sh → AgoraCapture)
  local n="qb$(date +%s)$$$RANDOM" i
  printf '%s|0' "$n" > "$D/capture.req"
  for i in $(seq 1 100); do [ "$(head -1 "$D/capture.out" 2>/dev/null)" = "$n" ] && { sed -n 2p "$D/capture.out"; return 0; }; sleep 0.1; done
  echo ERR_NO_CAPTURE; return 1
}
while true; do
  now=$(date +%s)
  find "$Q" -maxdepth 1 -name '*.req' -print0 2>/dev/null | while IFS= read -r -d '' f; do
    m=$(stat -f %m "$f" 2>/dev/null || echo "$now"); [ $((now - m)) -gt 20 ] && mv -f "$f" "$OLD/" 2>/dev/null
  done
  find "$Q" -maxdepth 1 -name '*.out' -mmin +2 -exec mv -f {} "$OLD/" \; 2>/dev/null
  shopt -s nullglob; reqs=("$Q"/*.req); shopt -u nullglob
  if [ ${#reqs[@]} -eq 0 ]; then sleep 0.1; continue; fi
  first="${reqs[0]}"
  dsp=$(sed -n 's/^display=\([0-9]*\).*/\1/p' "$first" | head -1); dsp=${dsp:-0}
  sd=$((dsp + 1)); f="$T/f-$dsp.jpg"; rm -f "$f"
  err=$(ssh "${SSHO[@]}" csilvasantin@127.0.0.1 "/usr/sbin/screencapture -x -t jpg -D $sd '$f'" 2>&1); rc=$?
  body=""; det=""
  if [ $rc -eq 0 ] && [ -s "$f" ] && [ "$(wc -c < "$f")" -gt 1000 ]; then
    /usr/bin/sips -Z 1600 "$f" >/dev/null 2>&1
    body=$(/usr/bin/base64 < "$f" | tr -d '\n')
  elif echo "$err" | grep -qi 'invalid display'; then
    body="ERR_NO_SUCH_DISPLAY"; det="la pantalla $dsp no existe (screencapture -D $sd)"
  elif [ "$dsp" = 0 ]; then
    body=$(agora_main); det="ssh rc=$rc; respaldo AgoraCapture"
  else
    body="ERR_CAPTURE_TRANSIENT"; det="SCREEN_CAPTURE_FAILED rc=$rc $(echo "$err" | tr '\n' ' ' | head -c 200)"
  fi
  rm -f "$f"
  ts=$(date +%s)
  shopt -s nullglob
  for r in "$Q"/*.req; do
    rd=$(sed -n 's/^display=\([0-9]*\).*/\1/p' "$r" | head -1); rd=${rd:-0}
    [ "$rd" = "$dsp" ] || continue
    o="${r%.req}.out"
    case "$body" in
      ERR_*) printf '%s\ncaptured_at=%s\ndisplay=%s\ndetail=%s\n' "$body" "$ts" "$dsp" "${det:-$body}" > "$o.tmp" ;;
      *) printf 'OK\n%s\ncaptured_at=%s\ndisplay=%s\n' "$body" "$ts" "$dsp" > "$o.tmp" ;;
    esac
    mv -f "$o.tmp" "$o"; rm -f "$r"
  done
  shopt -u nullglob
done
