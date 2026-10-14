#!/bin/bash
# interruptor-agentes.sh — los dos interruptores de cada tarjeta de Mac en admira.live/control (#5862, Jensen por
# orden de Carlos, 14-10-2026). La web lo sirve y el relay FleetControl lo ejecuta por SSH en el Mac de la tarjeta
# (POST /api/run, login Google + CSRF), así que no hay que instalar nada en cada Mac.
#
#   interruptor-agentes.sh estado | apps-on | apps-off | clis-on | clis-off
#
#   apps-*: apps de escritorio de agentes, Claude y ChatGPT (o Codex.app si existe). Abrir sin robar el foco (open -g);
#           antes de cerrarlas se guarda el sitio de sus ventanas en ~/.admira-fleet/apps-ventanas.json.
#   clis-*: sesiones CLI/tmux de los deepagents del Mac: apagar = ~/.fleet/apagar-agentes.sh todos (apagado ordenado
#           y verificado, nunca toca las apps); encender = ~/.fleet/arrancar-agentes.sh todos (deja lo apagado como
#           estaba) y coloca las ventanas espejo de los CLIs en el MISMO espacio que ocupaban las apps de escritorio.
#           En el Mac de la cuadratura (MAC_CUADRATURA de mac-libre.conf) no se mueve ninguna ventana.
# Siempre acaba con una línea «__INTERRUPTOR__ {json}» con el estado real: la web pinta el botón con ella.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
ORDEN="${1:-estado}"
DIR="$HOME/.admira-fleet"; mkdir -p "$DIR"
VENTANAS="$DIR/apps-ventanas.json"
FLEET="$HOME/.fleet"
PY=/usr/bin/python3

codex_app() { [ -d /Applications/Codex.app ] && echo Codex || echo ChatGPT; }
app_abierta() { pgrep -xq "$1" || pgrep -f "/Applications/$1.app/Contents/MacOS/$1\$" >/dev/null; }
host_norm() { scutil --get LocalHostName 2>/dev/null | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9'; }
es_cuadratura() {
  local c; c=$(grep -h '^MAC_CUADRATURA=' "$HOME/.config/admiranext/mac-libre.conf" 2>/dev/null | head -1 | cut -d= -f2 | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')
  [ -n "$c" ] && [ "$c" = "$(host_norm)" ]
}

estado() {
  local cx claude=0 codex=0 linea sesiones=""
  cx=$(codex_app)
  app_abierta Claude && claude=1
  app_abierta "$cx" && codex=1
  if [ -x "$FLEET/apagar-agentes.sh" ]; then
    linea=$("$FLEET/apagar-agentes.sh" todos --dry-run 2>/dev/null | grep -m1 'Sesiones tmux de agente que se cerrarían:')
    sesiones=$(printf '%s' "$linea" | sed 's/.*cerrarían: *//; s/—//; s/ //g')
  fi
  CLAUDE=$claude CODEX=$codex CX="$cx" SES="$sesiones" FLEETOK=$([ -x "$FLEET/apagar-agentes.sh" ] && echo 1 || echo 0) \
  MAQ="$(scutil --get ComputerName 2>/dev/null || hostname -s)" $PY -c '
import json, os
ses = [s for s in os.environ["SES"].split(",") if s]
apps = {"Claude": os.environ["CLAUDE"] == "1", os.environ["CX"]: os.environ["CODEX"] == "1"}
print("__INTERRUPTOR__ " + json.dumps({
  "maquina": os.environ["MAQ"], "apps": apps, "apps_on": any(apps.values()),
  "clis": ses, "clis_on": bool(ses), "fleet_scripts": os.environ["FLEETOK"] == "1"}, ensure_ascii=False))'
}

guardar_ventanas() {
  # {app: [x, y, ancho, alto]} de la primera ventana de cada app; necesita Accesibilidad para System Events.
  local cx; cx=$(codex_app)
  CX="$cx" $PY - "$VENTANAS" <<'PY' || true
import json, os, subprocess, sys
res = {}
for app in ("Claude", os.environ["CX"]):
    s = 'tell application "System Events" to if exists process "%s" then get {position, size} of window 1 of process "%s"' % (app, app)
    p = subprocess.run(["osascript", "-e", s], capture_output=True, text=True, timeout=10)
    n = [int(x) for x in p.stdout.replace(" ", "").split(",") if x.strip().lstrip("-").isdigit()]
    if len(n) == 4 and n[2] > 200 and n[3] > 150:
        res[app] = n
if res:
    json.dump(res, open(sys.argv[1], "w"))
    print("ventanas guardadas: " + ", ".join("%s %s" % (k, v) for k, v in res.items()))
else:
    print("ventanas: sin datos (¿app sin ventana o sin permiso de Accesibilidad?); se conserva lo anterior")
PY
}

colocar_clis() {
  # Las ventanas espejo de los CLIs (Terminal con «tmux attach» de una sesión de agente) ocupan el rectángulo que
  # cubrían las ventanas de las apps; si hay varias se reparten en columnas (rectángulo ancho) o filas (alto).
  if es_cuadratura; then echo "colocación: Mac de la cuadratura → no se mueve ninguna ventana"; return; fi
  if [ ! -s "$VENTANAS" ]; then
    echo "colocación: sin sitio guardado de las apps → layout estándar"
    "$FLEET/arrancar-agentes.sh" --solo-layout >/dev/null 2>&1 || true; return
  fi
  $PY - "$VENTANAS" "$1" <<'PY' || true
import json, subprocess, sys
fr = list(json.load(open(sys.argv[1])).values())
ses = [s for s in sys.argv[2].split(",") if s]
x1 = min(f[0] for f in fr); y1 = min(f[1] for f in fr)
x2 = max(f[0] + f[2] for f in fr); y2 = max(f[1] + f[3] for f in fr)
p = subprocess.run(["osascript", "-e", 'tell application "Terminal" to get {id, tty of selected tab} of every window'],
                   capture_output=True, text=True, timeout=10)
vals = [v.strip() for v in p.stdout.split(",")]
half = len(vals) // 2
espejos = []
for wid, tty in zip(vals[:half], vals[half:]):
    if not tty.startswith("/dev/"):
        continue
    ps = subprocess.run(["ps", "-t", tty[5:], "-o", "command="], capture_output=True, text=True).stdout
    if "tmux" in ps and "attach" in ps and (not ses or any(s in ps for s in ses)):
        espejos.append(wid)
if not espejos:
    print("colocación: no hay ventanas espejo de CLIs abiertas"); sys.exit(0)
n = len(espejos); cols = (x2 - x1) >= (y2 - y1)
for i, wid in enumerate(sorted(espejos)):
    if cols:
        w = (x2 - x1) // n; b = [x1 + i * w, y1, x1 + (i + 1) * w, y2]
    else:
        h = (y2 - y1) // n; b = [x1, y1 + i * h, x2, y1 + (i + 1) * h]
    subprocess.run(["osascript", "-e", 'tell application "Terminal" to set bounds of window id %s to {%d, %d, %d, %d}' % (wid, *b)],
                   capture_output=True, timeout=10)
print("colocación: %d CLI(s) en el sitio de las apps {%d,%d → %d,%d}" % (n, x1, y1, x2, y2))
PY
}

case "$ORDEN" in
  estado) ;;
  apps-on)
    cx=$(codex_app)
    for a in Claude "$cx"; do
      if app_abierta "$a"; then echo "$a: ya estaba abierta"; else open -g -a "$a" && echo "$a: abriendo"; fi
    done
    for i in $(seq 1 20); do app_abierta Claude && app_abierta "$cx" && break; sleep 1; done ;;
  apps-off)
    guardar_ventanas
    cx=$(codex_app)
    for a in Claude "$cx"; do
      if app_abierta "$a"; then osascript -e "quit app \"$a\"" >/dev/null 2>&1; echo "$a: cerrando"; else echo "$a: ya estaba cerrada"; fi
    done
    for i in $(seq 1 15); do app_abierta Claude || app_abierta "$cx" || break; sleep 1; done
    for a in Claude "$cx"; do app_abierta "$a" && { pkill -TERM -x "$a"; echo "$a: no respondía a quit → SIGTERM"; }; done
    sleep 1 ;;
  clis-off)
    [ -x "$FLEET/apagar-agentes.sh" ] || { echo "sin ~/.fleet/apagar-agentes.sh en este Mac"; estado; exit 2; }
    "$FLEET/apagar-agentes.sh" todos 2>&1 | grep -E '^══ Resultado|^  • |^▶ (CLIs|Sesiones)' | tail -15 ;;
  clis-on)
    [ -x "$FLEET/arrancar-agentes.sh" ] || { echo "sin ~/.fleet/arrancar-agentes.sh en este Mac"; estado; exit 2; }
    "$FLEET/arrancar-agentes.sh" todos --sin-layout 2>&1 | grep -E '^══|^▶|^  [•✓✗]' | tail -15
    sleep 2
    ses=$("$FLEET/apagar-agentes.sh" todos --dry-run 2>/dev/null | grep -m1 'Sesiones tmux de agente que se cerrarían:' | sed 's/.*cerrarían: *//; s/—//; s/ //g')
    colocar_clis "$ses" ;;
  *) echo "uso: interruptor-agentes.sh estado|apps-on|apps-off|clis-on|clis-off"; exit 64 ;;
esac
estado
