#!/usr/bin/env bash
# ============================================================
# agora-cmd-poller — vigila AgoraMatrix y ejecuta comandos LOCALES en este Mac.
# Lo dispara el LaunchAgent com.admira.agora-cmd-poller cada ~15 s.
# Fuente: repo 32.-ConsejoAdmiraNextGame, mcp/server/tools/agora-cmd-poller.sh
#
# Comandos (SIN barra: la barra la traga Telegram como comando de bot):
#   "apaga monitores" / "apaga las pantallas"   -> pmset displaysleepnow
#   "handON <Equipo>"  (Equipo = este Mac: MacMini, MacStudio…)
#        · escrito por una persona  -> caffeinate -u -t 2 (enciende monitores) y llama a la
#          tool MCP equipo_handon (encargos a los agentes + consejero_mensaje a sus consejeros)
#        · publicado por la tool (lleva [equipo_handon]) -> caffeinate -u -t 2
#   "handOFF <Equipo>"
#        · escrito por una persona  -> llama a equipo_handoff (resumen del día; la tool
#          publica al final «handOFF <Equipo> · [equipo_handoff] apaga monitores»)
#        · publicado por la tool (lleva [equipo_handoff]) -> pmset displaysleepnow
#
# Lee inbox (consume=0, PEEK) y feed de Agora sin consumir ni latir. Dedup por `ts`
# (high-water mark); el feed tiene su propio marcador, que arranca en «ahora».
# Clave MCP (solo para la llamada de una persona): $HANDON_MCP_KEY_FILE
# (~/.config/admiranext/handon-mcp.key) o, si no existe, la del conector admira_live de
# Codex en este Mac (~/.codex/config.toml). Nunca se imprime.
#
# Modo prueba:  CMD_POLLER_DRY=1 bash agora-cmd-poller.sh   (detecta y loguea, NO actúa)
# ============================================================
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

KEY="$(cat "$HOME/.agents-comms/.synckey" 2>/dev/null || true)"
WORKER="https://api.admira.store"
MCP_URL="${HANDON_MCP_URL:-https://mcp.admira.live/mcp}"
STATE="$HOME/.agents-comms/cmd-poller.state"
FEED_STATE="$HOME/.agents-comms/cmd-poller.feed.state"
LOG="$HOME/.agents-comms/cmd-poller.log"
AGORA="$HOME/.local/bin/agora"
DRY="${CMD_POLLER_DRY:-0}"
IDENTITIES=("Claude·admira" "Codex·admira" "Claude·gmail" "Codex·gmail")
EQUIPO="${CMD_POLLER_EQUIPO:-$(hostname -s)}"              # MacMini / MacStudio
case "$(echo "$EQUIPO" | tr '[:upper:]' '[:lower:]')" in
  macstudio*) FIRMA_FROM="${CMD_POLLER_FROM:-Merovingio}"; FIRMA="Merovingio · MacStudio" ;;
  *)          FIRMA_FROM="${CMD_POLLER_FROM:-Claude}";     FIRMA="Morfeo" ;;
esac

[ -n "$KEY" ] || { echo "$(date '+%F %T') ERROR sin synckey" >> "$LOG"; exit 1; }

now_ms() { python3 -c 'import time;print(int(time.time()*1000))'; }
[ -f "$STATE" ] || now_ms > "$STATE"
[ -f "$FEED_STATE" ] || now_ms > "$FEED_STATE"
last_ts="$(cat "$STATE" 2>/dev/null || echo 0)"
last_feed="$(cat "$FEED_STATE" 2>/dev/null || echo 0)"

tmp="$(mktemp)"; tmpf="$(mktemp)"
for idraw in "${IDENTITIES[@]}"; do
  id="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$idraw")"
  curl -fsS -m 10 "$WORKER/agora/inbox?key=$KEY&id=$id&consume=0" 2>/dev/null >> "$tmp" || true
  echo >> "$tmp"
done
curl -fsS -m 10 "$WORKER/agora/feed?key=$KEY&limit=40" 2>/dev/null > "$tmpf" || true

# python imprime: <inbox_ts>\t<feed_ts>\t<acciones separadas por ;>\t<texto>
IFS=$'\t' read -r new_ts new_feed acts trig < <(python3 - "$last_ts" "$tmp" "$last_feed" "$tmpf" "$EQUIPO" <<'PY'
import sys, json, re
last_ts, f_inbox, last_feed, f_feed, equipo = int(sys.argv[1] or 0), sys.argv[2], int(sys.argv[3] or 0), sys.argv[4], sys.argv[5]
def items(path):
    out = []
    for line in open(path):
        line = line.strip()
        if not line: continue
        try: out += json.loads(line).get("items", [])
        except Exception: pass
    return out
eq = re.sub(r'[^a-z0-9]', '', equipo.lower())
pat = re.compile(r'^\W*hand\s*(on|off)\W+' + r'\W*'.join(map(re.escape, eq)) + r'(?![a-z0-9])', re.I)
acts, trig = [], ""
def scan(lista, last, inbox):
    global trig
    mx = last
    for it in lista:
        try: ts = int(it.get("ts", 0))
        except Exception: ts = 0
        mx = max(mx, ts)
        if ts <= last: continue
        text = it.get("text") or ""
        norm = re.sub(r'[^a-z0-9]', '', text.lower())
        if inbox and 'apaga' in norm and ('monitor' in norm or 'pantalla' in norm):
            acts.append("APAGA"); trig = text[:80]
        m = pat.match(text)
        if m:
            on = m.group(1).lower() == 'on'
            if '[equipo_handon]' in text and on: acts.append("WAKE")
            elif '[equipo_handoff]' in text and not on: acts.append("APAGA")
            elif not re.match(r'^\s*hand(on|off)\b[^·]*·\s*\[equipo_', text, re.I) and len(text) <= 120:
                acts.append("HUMANO_ON" if on else "HUMANO_OFF")
            trig = text[:80]
    return mx
a = scan(items(f_inbox), last_ts, True)
b = scan(items(f_feed), last_feed, False)
seen = []
for x in acts:
    if x not in seen: seen.append(x)
print(f"{a}\t{b}\t{';'.join(seen) or '-'}\t{trig.replace(chr(9),' ').replace(chr(10),' ') or '-'}")
PY
)
rm -f "$tmp" "$tmpf"
echo "${new_ts:-$last_ts}" > "$STATE"
echo "${new_feed:-$last_feed}" > "$FEED_STATE"

mcp_key() {
  local f="${HANDON_MCP_KEY_FILE:-$HOME/.config/admiranext/handon-mcp.key}"
  if [ -r "$f" ]; then tr -d ' \n' < "$f"; return; fi
  python3 - <<'PY' 2>/dev/null
import re, os
try: s = open(os.path.expanduser('~/.codex/config.toml')).read()
except Exception: raise SystemExit
m = re.search(r'\[mcp_servers\.admira_live\][^\[]*?Bearer ([A-Za-z0-9._~+/=-]+)', s, re.S)
if m: print(m.group(1), end='')
PY
}
llamar_tool() {  # llamar_tool <equipo_handon|equipo_handoff>
  local k; k="$(mcp_key)"
  [ -n "$k" ] || { echo "$(date '+%F %T') $1: sin clave MCP en este Mac" >> "$LOG"; return 1; }
  local body; body="$(python3 -c 'import json,sys;print(json.dumps({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":sys.argv[1],"arguments":{"equipo":sys.argv[2]}}}))' "$1" "$EQUIPO")"
  local out; out="$(curl -sS -m 60 -X POST "$MCP_URL" -H "authorization: Bearer $k" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' --data "$body" 2>&1)"
  echo "$(date '+%F %T') $1 → $(echo "$out" | tr '\n' ' ' | cut -c1-300)" >> "$LOG"
  [ -n "$out" ] || return 1
  echo "$out" | grep -q '"isError": *true' && return 1
  echo "$out" | grep -q '"error"' && ! echo "$out" | grep -q '"result"' && return 1
  return 0
}

[ "${acts:--}" = "-" ] && exit 0
echo "$(date '+%F %T') TRIGGER $acts  («$trig»)" >> "$LOG"
if [ "$DRY" = "1" ]; then echo "$(date '+%F %T') [DRY] no ejecuto: $acts" >> "$LOG"; exit 0; fi

IFS=';' read -ra LISTA <<< "$acts"
for act in "${LISTA[@]}"; do
  case "$act" in
    WAKE)
      caffeinate -u -t 2 ;;
    HUMANO_ON)
      caffeinate -u -t 2
      llamar_tool equipo_handon \
        || "$AGORA" send --from "$FIRMA_FROM" "🖥️ handON $EQUIPO: monitores encendidos, pero no pude llamar a equipo_handon (sin clave MCP en este Mac). — $FIRMA" >/dev/null 2>&1 || true ;;
    HUMANO_OFF)
      llamar_tool equipo_handoff \
        || "$AGORA" send --from "$FIRMA_FROM" "⚠️ handOFF $EQUIPO: no pude llamar a equipo_handoff (sin clave MCP); no apago monitores sin resumen. Usa «apaga monitores» si quieres solo apagar. — $FIRMA" >/dev/null 2>&1 || true ;;
    APAGA)
      pmset displaysleepnow
      "$AGORA" send --from "$FIRMA_FROM" "🖥️ Monitores apagados — el Mac sigue encendido. (toca una tecla para encenderlos). — $FIRMA" >/dev/null 2>&1 || true ;;
  esac
done
exit 0
