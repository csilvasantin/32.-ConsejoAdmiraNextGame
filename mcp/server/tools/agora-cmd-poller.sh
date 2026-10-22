#!/usr/bin/env bash
# ============================================================
# agora-cmd-poller — vigila AgoraMatrix y ejecuta comandos LOCALES en este Mac.
# Lo dispara el LaunchAgent com.admira.agora-cmd-poller cada ~15 s.
# Fuente: repo 32.-ConsejoAdmiraNextGame, mcp/server/tools/agora-cmd-poller.sh
#
# Comandos (SIN barra; se pueden escribir desde cualquier Mac o desde Telegram):
#   "apaga monitores"                 -> pmset displaysleepnow (como siempre, este Mac)
#   "handON <Equipo>"                 -> tool equipo_handon; el poller de <Equipo> enciende
#                                        monitores (caffeinate -u -t 2) y reanuda sus vigilantes
#   "handOFF <Equipo>"                -> tool equipo_handoff (cierre progresivo); el poller de
#                                        <Equipo> apaga monitores, los mantiene en negro mientras
#                                        nadie toque el Mac y, pasada la gracia, PAUSA (SIGSTOP,
#                                        reversible) sus vigilantes de encargos. Nunca duerme el Mac.
#   "setup modo ahorro <Equipo>"      -> tool equipo_ahorro; el poller de <Equipo> SOLO apaga monitores.
# Equipos: MacMini, MacStudio, MacBookPro16 (MBP16), MacBookProNegro14 (MBP14).
# XPACIOS (grupos de equipos): AdmiraNeXT = MacMini + MacStudio. «handOFF AdmiraNeXT» → el llamador
#   llama UNA vez a la tool con el xpacio; la tool publica UN aviso con la marca
#   [equipo_* … equipos=MacMini,MacStudio] y actúa cada poller cuyo Mac esté en la lista.
#   Xpacio nuevo: tabla XPACIOS de mcp/server/src/equipos.js y (para escribirlo a mano) XP aquí abajo.
#
# Reglas: · Monitores/pausa: solo actúa el poller del Mac nombrado (marca [equipo_*] de la tool).
#         · La tool se llama UNA vez: solo el poller «llamador» (fichero
#           ~/.agents-comms/cmd-poller.llamador o CMD_POLLER_LLAMADOR=1; hoy, el MacMini).
# Clave MCP (solo el llamador): $HANDON_MCP_KEY_FILE (~/.config/admiranext/handon-mcp.key) o la del
# conector admira_live de Codex del Mac (~/.codex/config.toml). Nunca se imprime.
# Modo prueba:  CMD_POLLER_DRY=1 bash agora-cmd-poller.sh   (detecta y loguea, NO actúa)
# ============================================================
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

C="$HOME/.agents-comms"
KEY="$(cat "$C/.synckey" 2>/dev/null || true)"
WORKER="https://api.admira.store"
MCP_URL="${HANDON_MCP_URL:-https://mcp.admira.live/mcp}"
STATE="$C/cmd-poller.state"; FEED_STATE="$C/cmd-poller.feed.state"; LOG="$C/cmd-poller.log"
OFF="$C/handoff.estado"          # marca de handOFF: pausa_at=<epoch> monitores=<1|0>
PIDS="$C/handoff.pids"           # PIDs pausados (SIGSTOP) para reanudar con SIGCONT
AGORA="$HOME/.local/bin/agora"
DRY="${CMD_POLLER_DRY:-0}"
VIGIL_PAT="${CMD_POLLER_VIGIL_PAT:-agent-inbox}"
IDENTITIES=("Claude·admira" "Codex·admira" "Claude·gmail" "Codex·gmail")
HOST="${CMD_POLLER_EQUIPO:-$(hostname -s)}"
LLAMADOR="${CMD_POLLER_LLAMADOR:-$([ -f "$C/cmd-poller.llamador" ] && echo 1 || echo 0)}"
case "$(echo "$HOST" | tr '[:upper:]' '[:lower:]')" in
  macstudio*) FIRMA_FROM="${CMD_POLLER_FROM:-Merovingio}"; FIRMA="Merovingio · MacStudio" ;;
  macbook-pro-16*|macbookpro16*) FIRMA_FROM="${CMD_POLLER_FROM:-Claude}"; FIRMA="Neo · MBP16" ;;
  macbookpronegro14*) FIRMA_FROM="${CMD_POLLER_FROM:-Claude}"; FIRMA="Neo · MBP14" ;;
  *) FIRMA_FROM="${CMD_POLLER_FROM:-Claude}"; FIRMA="Morfeo" ;;
esac
log() { echo "$(date '+%F %T') $*" >> "$LOG"; }
say() { [ "$DRY" = 1 ] && { log "[DRY] diría: $1"; return; }; "$AGORA" send --from "$FIRMA_FROM" "$1 — $FIRMA" >/dev/null 2>&1 || true; }
run() { if [ "$DRY" = 1 ]; then log "[DRY] ejecutaría: $*"; else "$@"; fi; }

[ -n "$KEY" ] || { log "ERROR sin synckey"; exit 1; }
now_ms() { python3 -c 'import time;print(int(time.time()*1000))'; }
[ -f "$STATE" ] || now_ms > "$STATE"
[ -f "$FEED_STATE" ] || now_ms > "$FEED_STATE"
last_ts="$(cat "$STATE" 2>/dev/null || echo 0)"; last_feed="$(cat "$FEED_STATE" 2>/dev/null || echo 0)"

# ---------- acciones locales ----------
idle_s() { ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'; }
monitores_off() {
  # Unreal/Epic: solo si retienen la pantalla con una aserción (NoDisplaySleep / PreventUserIdleDisplaySleep).
  if [ "${1:-}" = "cerrar-unreal" ]; then
    for app in UnrealEditor EpicGamesLauncher; do
      if pmset -g assertions | grep -E "\(${app}[^)]*\).*(NoDisplaySleep|PreventUserIdleDisplaySleep)" >/dev/null; then
        log "handOFF: $app retiene la pantalla → se le pide salir (quit, sin matar)"
        case $app in UnrealEditor) run osascript -e 'tell application id "com.epicgames.UnrealEditor" to quit' ;; *) run osascript -e 'tell application "Epic Games Launcher" to quit' ;; esac
      fi
    done
  fi
  run pmset displaysleepnow
}
pausar_vigilantes() {
  local pids; pids="$(pgrep -f "$VIGIL_PAT" | grep -v "^$$\$" | tr '\n' ' ')"
  [ -n "$pids" ] || { log "handOFF: no hay vigilantes «$VIGIL_PAT» que pausar"; return; }
  log "handOFF: pauso (SIGSTOP) vigilantes $pids"
  [ "$DRY" = 1 ] && { log "[DRY] kill -STOP $pids"; return; }
  echo "$pids" >> "$PIDS"; kill -STOP $pids 2>/dev/null || true
}
reanudar() {
  if [ -s "$PIDS" ]; then local pids; pids="$(tr '\n' ' ' < "$PIDS")"; log "handON: reanudo (SIGCONT) $pids"; run kill -CONT $pids 2>/dev/null || true; fi
  [ "$DRY" = 1 ] || rm -f "$PIDS" "$OFF"
}

# ---------- leer Agora ----------
tmp="$(mktemp)"; tmpf="$(mktemp)"
for idraw in "${IDENTITIES[@]}"; do
  id="$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$idraw")"
  curl -fsS -m 10 "$WORKER/agora/inbox?key=$KEY&id=$id&consume=0" 2>/dev/null >> "$tmp" || true; echo >> "$tmp"
done
curl -fsS -m 10 "$WORKER/agora/feed?key=$KEY&limit=40" 2>/dev/null > "$tmpf" || true

# salida: línea 1 "<inbox_ts>\t<feed_ts>"; luego una acción por línea: ACCION\tEQUIPO\tARG
out="$(python3 - "$last_ts" "$tmp" "$last_feed" "$tmpf" "$HOST" <<'PY'
import sys, json, re
last_ts, f_inbox, last_feed, f_feed, host = int(sys.argv[1] or 0), sys.argv[2], int(sys.argv[3] or 0), sys.argv[4], sys.argv[5]
N = lambda s: re.sub(r'[^a-z0-9]', '', (s or '').lower())
EQ = {'MacMini': ['macmini', 'mini'], 'MacStudio': ['macstudio', 'studio'],
      'MacBookPro16': ['macbookpro16', 'mbp16'], 'MacBookProNegro14': ['macbookpronegro14', 'mbp14', 'macbookpro14', 'negro14']}
XP = {'AdmiraNeXT': {'alias': ['admiranext', 'xpacioadmiranext'], 'equipos': ['MacMini', 'MacStudio']}}
def canon(s):
    n = N(s)
    for k, al in EQ.items():
        if n in al: return k
    return None
def xpacio(s):
    n = N(s)
    for k, x in XP.items():
        if n in x['alias']: return k
    return None
ME = canon(host)
def items(path):
    out = []
    for line in open(path):
        line = line.strip()
        if not line: continue
        try: out += json.loads(line).get("items", [])
        except Exception: pass
    return out
cmd = re.compile(r'^\W*(hand\s*on|hand\s*off|setup\s+modo\s+ahorro)\s+([A-Za-z0-9 .\-]{2,30}?)\s*(?:·|$)', re.I)
acts = []
def scan(lista, last, inbox):
    mx = last
    for it in lista:
        try: ts = int(it.get("ts", 0))
        except Exception: ts = 0
        mx = max(mx, ts)
        if ts <= last: continue
        text = (it.get("text") or "").strip()
        if inbox and 'apaga' in N(text) and ('monitor' in N(text) or 'pantalla' in N(text)) and not cmd.match(text):
            acts.append(("APAGA", ME or '', '')); continue
        m = cmd.match(text)
        if not m: continue
        verbo = N(m.group(1)); eq = canon(m.group(2)); xp = xpacio(m.group(2))
        if not eq and not xp: continue
        miembros = [eq] if eq else XP[xp]['equipos']
        mk = re.search(r'\[equipo_(handon|handoff|ahorro)([^\]]*)\]', text)
        if mk:
            le = re.search(r'equipos=([A-Za-z0-9,]+)', mk.group(2))
            if le: miembros = [canon(x) for x in le.group(1).split(',')]
            if ME not in miembros: continue
            eq = ME
            if mk.group(1) == 'handon': acts.append(("WAKE", eq, ''))
            elif mk.group(1) == 'ahorro': acts.append(("AHORRO", eq, ''))
            else:
                p = re.search(r'pausa=(\d+)', mk.group(2)); mon = 'monitores=no' not in mk.group(2)
                acts.append(("OFF", eq, f"{p.group(1) if p else 10}:{1 if mon else 0}"))
        elif len(text) <= 120:
            acts.append(({"handon": "CALL_ON", "handoff": "CALL_OFF", "setupmodoahorro": "CALL_AHORRO"}[verbo], eq or xp, ','.join(miembros)))
    return mx
a = scan(items(f_inbox), last_ts, True); b = scan(items(f_feed), last_feed, False)
print(f"{a}\t{b}")
seen = set()
for x in acts:
    if x in seen: continue
    seen.add(x); print("\t".join(x))
PY
)"
rm -f "$tmp" "$tmpf"
read -r new_ts new_feed <<< "$(echo "$out" | head -1)"
echo "${new_ts:-$last_ts}" > "$STATE"; echo "${new_feed:-$last_feed}" > "$FEED_STATE"

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
llamar_tool() {  # llamar_tool <tool> <equipo>
  [ "$DRY" = 1 ] && { log "[DRY] llamaría a $1 equipo=$2"; return 0; }
  local k; k="$(mcp_key)"
  [ -n "$k" ] || { log "$1: sin clave MCP en este Mac"; return 1; }
  local body; body="$(python3 -c 'import json,sys;print(json.dumps({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":sys.argv[1],"arguments":{"equipo":sys.argv[2]}}}))' "$1" "$2")"
  local r; r="$(curl -sS -m 90 -X POST "$MCP_URL" -H "authorization: Bearer $k" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' --data "$body" 2>&1)"
  log "$1 $2 → $(echo "$r" | tr '\n' ' ' | cut -c1-300)"
  [ -n "$r" ] || return 1
  echo "$r" | grep -q '"isError": *true' && return 1
  return 0
}

# ---------- ejecutar ----------
while IFS=$'\t' read -r act eq arg; do
  [ -n "${act:-}" ] || continue
  log "TRIGGER $act ${eq:-} ${arg:-} (yo=$HOST, llamador=$LLAMADOR)"
  case "$act" in
    APAGA) monitores_off; say "🖥️ Monitores apagados — el Mac sigue encendido (toca una tecla para encenderlos)." ;;
    WAKE)  reanudar; run caffeinate -u -t 2; say "☀️ handON $eq: monitores encendidos y vigilantes de encargos reanudados." ;;
    AHORRO) monitores_off; say "🌙 Modo ahorro $eq: monitores en negro; los agentes siguen trabajando." ;;
    OFF)
      gr="${arg%%:*}"; mon="${arg##*:}"
      [ "$DRY" = 1 ] || echo "pausa_at=$(( $(date +%s) + gr*60 )) monitores=$mon" > "$OFF"
      [ "$mon" = 1 ] && monitores_off cerrar-unreal
      say "🌙 handOFF $eq: monitores en negro; los agentes cierran su paso y en $gr min se pausan sus vigilantes. El Mac sigue encendido: «handON $eq» lo reanuda." ;;
    CALL_ON|CALL_OFF|CALL_AHORRO)
      # handON: enciende ya los monitores si este Mac es el equipo o está en el xpacio (arg = miembros)
      if [ "$act" = CALL_ON ]; then
        yo="$(echo "$HOST" | tr A-Z a-z | tr -d '-')"
        for m in ${arg//,/ }; do [ "$(echo "$m" | tr A-Z a-z)" = "$yo" ] && run caffeinate -u -t 2; done
      fi
      [ "$LLAMADOR" = 1 ] || continue
      t=$( [ "$act" = CALL_ON ] && echo equipo_handon || { [ "$act" = CALL_OFF ] && echo equipo_handoff || echo equipo_ahorro; } )
      llamar_tool "$t" "$eq" || say "⚠️ No pude llamar a $t para $eq (sin clave MCP o error)." ;;
  esac
done <<< "$(echo "$out" | tail -n +2)"

# ---------- handOFF en curso: pausa diferida y monitores en negro ----------
if [ -f "$OFF" ]; then
  pa="$(sed -nE 's/.*pausa_at=([0-9]+).*/\1/p' "$OFF")"; mon="$(sed -nE 's/.*monitores=([01]).*/\1/p' "$OFF")"
  if [ -n "$pa" ] && [ "$(date +%s)" -ge "$pa" ] && ! grep -q pausado "$OFF"; then
    pausar_vigilantes; [ "$DRY" = 1 ] || echo " pausado" >> "$OFF"
  fi
  if [ "${mon:-0}" = 1 ] && [ "$(idle_s 2>/dev/null || echo 0)" -ge 120 ]; then run pmset displaysleepnow; fi
fi
exit 0
