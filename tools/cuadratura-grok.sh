#!/bin/bash
# cuadratura-grok — los 2 deepagents de Grok (Smith y Merovingio) en la MITAD DERECHA de ESTE Mac,
# apilados arriba/abajo, solo lectura. La mitad izquierda queda libre para el chat de Grok Bot.
# Hermano de `cuadratura` (Neo/Morfeo/Trinity/Oráculo). Una sola ventana de Terminal con una
# sesión tmux local «cuadratura-grok» de 4 paneles: [banner Smith][vivo Smith][banner Merovingio][vivo Merovingio].
#   · Banner: nombre ASCII grande fijo arriba + cabecera (agente · runtime · modelo · cuenta · máquina)
#     + «Ahora:» con la misión en curso (bandeja pública de admira.live, cada 60 s).
#   · Vivo: si el agente tiene sesión tmux en un Mac alcanzable → `tmux attach -r` por ssh (Tailscale);
#     si no (Merovingio corre en la caja de Grok Bot, sin ssh) → feed en vivo de sus encargos (cada 20 s).
# Config: ~/.config/admiranext/cuadratura-grok.conf
#   Nombre|Runtime · Modelo|Cuenta|Máquina|host-ssh (o «-»)|sesión-tmux|persona-inbox|color-ANSI
# Uso: cuadratura-grok            abre / recoloca (idempotente; no toca otras ventanas)
#      cuadratura-grok cerrar     cierra SOLO la ventana del Mac (la sesión local sigue, p. ej. para el móvil)
#      cuadratura-grok parar      cierra la ventana Y la sesión local (las de los agentes siguen)
#      cuadratura-grok recrear    rehace la sesión local
#      cuadratura-grok movil      la sirve como web de SOLO LECTURA (ttyd, launchd persistente) para abrirla en
#                                 el móvil: ttyd SOLO en 127.0.0.1 y publicado con `tailscale serve` (https, solo tailnet).
#                                 Sin escucha en la LAN y sin clave en la línea de órdenes (auditoría 11-10-2026):
#                                 el acceso lo decide Tailscale. Luego cierra la ventana del Mac
#                                 (--sin-cerrar: deja también la ventana del Mac)
#      cuadratura-grok movil-qr   QR con la URL del tailnet (sin claves) en ESTE terminal, para escanearlo
#      cuadratura-grok movil-qr-ventana   lo mismo en una ventana propia, delante y en la mitad derecha
#      cuadratura-grok movil-off  quita el servicio web
# No arranca ningún modelo ni escribe en las sesiones de los agentes (attach -r = solo lectura).
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
[ -L "${BASH_SOURCE[0]}" ] && SELF="$(readlink "${BASH_SOURCE[0]}")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG=${LANG:-es_ES.UTF-8} LC_ALL=${LC_ALL:-es_ES.UTF-8}
T="$(command -v tmux)"; S=cuadratura-grok; TAG="[cuadratura-grok]"
CONF=~/.config/admiranext/cuadratura-grok.conf
INBOX="https://bot.yokup.com/api/public/inbox"
KEY=~/.ssh/admiranext_ed25519
[ -f "$CONF" ] || { mkdir -p "$(dirname "$CONF")"; cat > "$CONF" <<'C'
# Nombre|Runtime · Modelo|Cuenta|Máquina|host-ssh (o -)|sesión-tmux|persona-inbox|color ANSI
Smith|Grok CLI · Grok 4.7 (high)|csilva@admira.com (Jobs)|MacBook Pro 16|macbook-pro-16.tail48b61c.ts.net|smith|Smith|1;32
Merovingio|Grok CLI · Grok 4.7|csilvasantin@gmail.com (Elon)|GrokBotBox (caja Grok Bot)|-|merovingio|Merovingio|1;36
C
}
fila(){ grep -v '^[[:space:]]*#' "$CONF" | grep '|' | sed -n "${1}p"; }

arte(){ case "$1" in
 SMITH) cat <<'A'
  _____ __  __ _____ _______ _    _
 / ____|  \/  |_   _|__   __| |  | |
| (___ | \  / | | |    | |  | |__| |
 \___ \| |\/| | | |    | |  |  __  |
 ____) | |  | |_| |_   | |  | |  | |
|_____/|_|  |_|_____|  |_|  |_|  |_|
A
;; MEROVINGIO) cat <<'A'
 __  __ ______ _____   ______      _______ _   _  _____ _____ ____
|  \/  |  ____|  __ \ / __ \ \    / /_   _| \ | |/ ____|_   _/ __ \
| \  / | |__  | |__) | |  | \ \  / /  | | |  \| | |  __  | || |  | |
| |\/| |  __| |  _  /| |  | |\ \/ /   | | | . ` | | |_ | | || |  | |
| |  | | |____| | \ \| |__| | \  /   _| |_| |\  | |__| |_| || |__| |
|_|  |_|______|_|  \_\\____/   \/   |_____|_| \_|\_____|_____\____/
A
;; *) if command -v figlet >/dev/null; then figlet -w 200 -f big "$1"; else printf '\n  %s\n\n' "$1"; fi ;;
esac; }

# misión en curso de una persona (in_progress > ack > pending)
ahora(){ curl -s -m 8 "$INBOX?persona=$1" | /usr/bin/python3 -c '
import json,sys,time
try: d=json.load(sys.stdin)
except Exception: print("(admira.live sin respuesta)"); sys.exit()
it=d.get("items",[])
for st in ("in_progress","ack","pending"):
  xs=sorted([i for i in it if i.get("status")==st],key=lambda x:-x.get("ts",0))
  if xs:
    i=xs[0]; tx=" ".join((i.get("text") or "").split())
    print("%s %s · %s"%(i.get("etiqueta") or "#%s"%i.get("id"),st,tx)); sys.exit()
print("libre · sin encargos abiertos")' 2>/dev/null; }

banner(){ # banner <n-fila>  (panel fijo arriba; se redibuja al redimensionar y cada 60 s)
  IFS='|' read -r N RT CTA MAQ HOST SES PER COL <<< "$(fila "$1")"
  U=$(printf '%s' "$N" | tr '[:lower:]' '[:upper:]')
  printf '\033]2;%s\007' "$U"; tput civis 2>/dev/null
  dibuja(){ local w l h a; w=$(( $(tput cols) - 1 )); printf '\033[H\033[2J'
    while IFS= read -r l; do printf '\033[%sm%s\033[0m\n' "$COL" "${l:0:$w}"; done < <(arte "$U")
    h=" $U · $RT · $CTA · $MAQ"; a=" ▶ $(date '+%H:%M') · ${AH:-…}"
    printf '\033[%sm%s\033[0m\n\033[2m%s\033[0m' "$COL" "${h:0:$w}" "${a:0:$w}"; }
  trap dibuja WINCH; trap 'tput cnorm; exit 0' INT TERM HUP
  while :; do AH="$(ahora "$PER")"; dibuja; sleep 60 & wait $!; done
}

feed(){ # feed <persona> <color>  — últimos encargos, coloreados por estado
  local P="$1" C="$2"
  printf '\033[H\033[2J\033[%sm %s · encargos en admira.live (bot.yokup.com) · %s\033[0m\n\n' "$C" "$P" "$(date '+%H:%M:%S')"
  curl -s -m 8 "$INBOX?persona=$P" | /usr/bin/python3 -c '
import json,sys,time,shutil
c,r=shutil.get_terminal_size((100,24))
try: d=json.load(sys.stdin)
except Exception: print("  (sin respuesta de admira.live; reintento en 20 s)"); sys.exit()
col={"done":"32","cancelled":"90","pending":"33","ack":"36","in_progress":"35","blocked":"31"}
it=d.get("items",[])
abiertos=[i for i in it if i.get("status") in ("in_progress","ack","pending","blocked")]
print("  \033[1mabiertos: %d · total: %d\033[0m"%(len(abiertos),d.get("count",len(it))))
orden=lambda x:({"in_progress":0,"ack":1,"blocked":2,"pending":3}.get(x.get("status"),9), -max(x.get("ts") or 0, x.get("done_at") or 0, x.get("ack_at") or 0))
for i in sorted(it,key=orden)[:max(3,r-5)]:
  st=i.get("status",""); t=time.strftime("%d/%m %H:%M",time.localtime(i.get("ts",0)))
  fr=(i.get("from_name") or "").replace("status-web · ","").split(" (")[0][:14]
  tx=" ".join((i.get("text") or "").split())
  line="  \033[%sm%-11s\033[0m %s %-6s %-14s %s"%(col.get(st,"0"),st,t,"#%s"%i.get("id"),fr,tx)
  line=line.replace(tx,"".join(ch for ch in tx if ord(ch)<0x2000 or ch in "áéíóúñ·«»—–"))
  print(line[:c+6])' 2>/dev/null
}

vivo(){ # vivo <n-fila> — r35 (Carlos 14:04): el MISMO panel que la cuadrícula del MBP16 (panel-agente.sh):
  # cabecera de estado en color + encargo + terminal en espejo (capture-pane, SIN attach -r: un cliente de solo
  # lectura hace fallar los send-keys de los vigilantes). Estado = estado-agente.py, igual que admira.live/visor.
  IFS='|' read -r N RT CTA MAQ HOST SES PER COL <<< "$(fila "$1")"
  local PANEL; PANEL="$(dirname "$SELF")/panel-agente.sh"
  local MOD="${RT%% · *}"
  if [ "$HOST" != "-" ]; then
    PANEL_SSH_KEY="$KEY" exec /bin/bash "$PANEL" "$N" "$HOST" "$SES" "$MOD" "$MAQ"
  fi
  # sin ssh (Merovingio vive en la caja de GrokBot): si la sesión está en ESTE Mac, espejo local; si no, PANEL_REMOTO=1
  # (estado por sus encargos con la misma regla que el visor y aviso de dónde ver su terminal)
  PANEL_REMOTO=1 exec /bin/bash "$PANEL" "$N" local "$SES" "$MOD" "$MAQ"
}

layout(){ # r35: sin banners aparte — cada panel lleva su cabecera (panel-agente.sh) → mitad y mitad
  local H; H=$($T display -p -t "$S:0" '#{window_height}') || return
  local V=$(( (H - 1) / 2 )); [ "$V" -gt 3 ] || V=3
  local b; for b in "$($T show -v -t $S @b1 2>/dev/null)" "$($T show -v -t $S @b2 2>/dev/null)"; do
    [ -n "$b" ] && $T kill-pane -t "$b" 2>/dev/null; done
  $T set -u -t "$S" @b1 2>/dev/null; $T set -u -t "$S" @b2 2>/dev/null
  $T resize-pane -t "$($T show -v -t $S @v1)" -y "$V" 2>/dev/null
}

crear(){
  $T has-session -t "$S" 2>/dev/null && return 0
  local B="/bin/bash '$SELF'"
  $T new-session -d -s "$S" -n GROK -x 120 -y 66 "$B _vivo 1"
  local v1; v1=$($T display -p -t "$S:0.0" '#{pane_id}')
  local v2; v2=$($T split-window -v -P -F '#{pane_id}' -t "$v1" "$B _vivo 2")
  $T set -t "$S" @v1 "$v1"; $T set -t "$S" @v2 "$v2"   # r35: sin paneles de banner (la cabecera va en panel-agente.sh)
  $T set -t "$S" status off
  $T set -t "$S" mouse on
  $T set -t "$S" pane-border-style "fg=colour22"; $T set -t "$S" pane-active-border-style "fg=green"
  $T set -t "$S" set-titles on; $T set -t "$S" set-titles-string "Smith + Merovingio · Grok $TAG"
  $T setw -t "$S:GROK" allow-rename off; $T setw -t "$S:GROK" automatic-rename off
  $T set-hook -t "$S" client-resized "run-shell \"/bin/bash '$SELF' _layout\""
  $T select-pane -t "$v1"
}

ventana(){ # abre o reutiliza la ventana de Terminal y la pone en la mitad derecha
  read -r W H TOP < <(osascript -l JavaScript -e 'ObjC.import("AppKit");var s=$.NSScreen.mainScreen,f=s.frame,v=s.visibleFrame;[Math.round(f.size.width),Math.round(f.size.height),Math.round(f.size.height-(v.origin.y+v.size.height))].join(" ")')
  W=${W:-1440}; H=${H:-900}; TOP=${TOP:-25}; HALF=$((W/2))
  osascript - "$TAG" "$T attach -t $S" "$HALF" "$TOP" "$W" "$H" <<'AS' >/dev/null
on run argv
  set tg to item 1 of argv
  tell application "Terminal"
    set w to missing value
    repeat with x in windows
      try
        if custom title of selected tab of x contains tg then set w to x
      end try
    end repeat
    if w is missing value then
      set t to do script ("clear; exec " & (item 2 of argv))
      delay 0.6
      set w to front window
      try
        set current settings of t to settings set "Homebrew"
      end try
      set custom title of t to ("Smith + Merovingio · Grok " & tg)
      set title displays custom title of t to true
      set title displays shell path of t to false
      set title displays window size of t to false
      set title displays device name of t to false
      set title displays file name of t to false
    end if
    set bounds of w to {(item 3 of argv) as integer, (item 4 of argv) as integer, (item 5 of argv) as integer, (item 6 of argv) as integer}
  end tell
end run
AS
}

cerrar(){ # solo la ventana de Terminal; la sesión tmux sigue viva
  # ids ANTES de soltar tmux: al salir el proceso, Terminal borra el título propio y ya no se encuentra
  local ids tty
  ids=$(osascript -e "tell application \"Terminal\" to get id of every window whose custom title of selected tab contains \"$TAG\"" 2>/dev/null | tr -d ' ')
  [ -n "$ids" ] || return 0
  for i in ${ids//,/ }; do
    tty=$(osascript -e "tell application \"Terminal\" to get tty of selected tab of window id $i" 2>/dev/null)
    # el cliente tmux de esa ventana = detach (la sesión sigue); así Terminal no pide confirmación
    [ -n "$tty" ] && ps -t "${tty#/dev/}" -o pid=,command= | awk '/tmux attach/ {print $1}' | xargs kill 2>/dev/null
  done
  sleep 0.6
  for i in ${ids//,/ }; do osascript -e "tell application \"Terminal\" to close window id $i" >/dev/null 2>&1; done
}
parar(){ cerrar; $T kill-session -t "$S" 2>/dev/null; }

# ---------- móvil: web de solo lectura con ttyd ----------
PORT=${CUADRATURA_GROK_PORT:-7681}; PORT_TS=${CUADRATURA_GROK_PORT_TS:-7682}
TSBIN=/Applications/Tailscale.app/Contents/MacOS/Tailscale; [ -x "$TSBIN" ] || TSBIN="$(command -v tailscale)"
CRED=~/.config/admiranext/cuadratura-grok-ttyd.cred      # ANTIGUO (clave de la escucha LAN, retirada el 11-10-2026): movil lo borra
LA=~/Library/LaunchAgents
tsip(){ for b in /Applications/Tailscale.app/Contents/MacOS/Tailscale "$(command -v tailscale)"; do
          [ -x "$b" ] && { "$b" ip -4 2>/dev/null | head -1; return; }; done; }
tsurl(){ "$TSBIN" status --json 2>/dev/null | /usr/bin/python3 -c 'import json,sys;print("https://"+json.load(sys.stdin)["Self"]["DNSName"].rstrip(".")+"/")' 2>/dev/null; }
lanip(){ ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null; }
_ttyd(){ # lo lanza launchd. SOLO 127.0.0.1:$PORT_TS y sin -c (una clave en argv se ve en `ps`).
  # Lo publica `tailscale serve` en https://<este-mac>.<tailnet>.ts.net/: solo lo alcanzan los equipos del tailnet.
  exec "$(command -v ttyd)" -i 127.0.0.1 -p "$PORT_TS" -m 6 -P 20 \
    -t fontSize=${CUADRATURA_GROK_FONT:-11} -t titleFixed="Smith + Merovingio · Grok" -t disableLeaveAlert=true \
    -t disableResizeOverlay=true -t 'theme={"background":"#000000","foreground":"#28fe14"}' \
    /bin/bash "$SELF" _cliente
}
_cliente(){ crear; TERM=xterm-256color exec $T attach -r -t "$S"; }
plist(){ # plist <label> <interfaz|ip> [tailnet]
  cat > "$LA/$1.plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SELF</string><string>_ttyd</string><string>$2</string><string>${3:-}</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATH</string><key>LANG</key><string>es_ES.UTF-8</string></dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>/tmp/$1.log</string><key>StandardErrorPath</key><string>/tmp/$1.log</string>
</dict></plist>
P
  launchctl bootout "gui/$(id -u)/$1" 2>/dev/null; launchctl bootstrap "gui/$(id -u)" "$LA/$1.plist"; }
movil(){
  command -v ttyd >/dev/null || brew install ttyd >/dev/null 2>&1 || { echo "✗ no pude instalar ttyd"; return 1; }
  mkdir -p "$LA"
  local ts; ts=$(tsip); [ -n "$ts" ] || { echo "✗ este Mac no está en Tailscale: no publico nada (sin LAN abierta por seguridad)"; return 1; }
  # fuera lo antiguo: escucha LAN con usuario:clave en argv y su fichero de clave
  launchctl bootout "gui/$(id -u)/com.admiranext.cuadratura-grok-ttyd-lan" 2>/dev/null; rm -f "$LA/com.admiranext.cuadratura-grok-ttyd-lan.plist" "$CRED"
  crear
  plist com.admiranext.cuadratura-grok-ttyd-ts 127.0.0.1
  "$TSBIN" serve --bg --https=443 "http://127.0.0.1:$PORT_TS" >/dev/null 2>&1 || echo "⚠ tailscale serve no se pudo activar"
  sleep 2; [ "${1:-}" = "--sin-cerrar" ] || cerrar
  echo "✓ cuadratura-grok en web de solo lectura, solo tailnet: $(tsurl)"
  echo "  (ttyd solo en 127.0.0.1:$PORT_TS · sin clave en argv · el móvil necesita Tailscale) · QR: cuadratura-grok movil-qr"
}
movil_qr_ventana(){ # abre SU ventana de Terminal delante, en la mitad derecha, con el QR (se cierra al pulsar Intro)
  read -r W H TOP < <(osascript -l JavaScript -e 'ObjC.import("AppKit");var s=$.NSScreen.mainScreen,f=s.frame,v=s.visibleFrame;[Math.round(f.size.width),Math.round(f.size.height),Math.round(f.size.height-(v.origin.y+v.size.height))].join(" ")')
  osascript - "/bin/bash '$SELF' movil-qr; printf '\\n  Intro para cerrar… '; read; exit" "$((W/2))" "$TOP" "$W" "$H" <<'AS' >/dev/null
on run argv
  tell application "Terminal"
    set t to do script ("clear; " & (item 1 of argv))
    delay 0.5
    set w to front window
    set custom title of t to "QR móvil · cuadratura-grok"
    set title displays custom title of t to true
    try
      set current settings of t to settings set "Pro"
    end try
    set bounds of w to {(item 2 of argv) as integer, (item 3 of argv) as integer, (item 4 of argv) as integer, (item 5 of argv) as integer}
    set index of w to 1
    activate
  end tell
end run
AS
}
movil_qr(){ command -v qrencode >/dev/null || brew install qrencode >/dev/null 2>&1
  local u; u=$(tsurl); [ -n "$u" ] || { echo "✗ sin Tailscale"; return 1; }
  printf '\n  cuadratura-grok · Smith + Merovingio (solo lectura · solo tailnet)\n  %s\n\n' "$u"
  qrencode -m 2 -t ANSIUTF8 "$u"; echo "(el móvil tiene que tener Tailscale activo con la cuenta de Carlos)"; }
movil_off(){ "$TSBIN" serve --https=443 off >/dev/null 2>&1; for l in com.admiranext.cuadratura-grok-ttyd-lan com.admiranext.cuadratura-grok-ttyd-ts; do
  launchctl bootout "gui/$(id -u)/$l" 2>/dev/null; rm -f "$LA/$l.plist"; done; echo "✓ servicio web quitado"; }

# Guardia (Carlos 11-10-2026 14:41): la mitad Grok va en el MacBook Air; el MBP16 es SOLO para la cuadrícula de 4
# (Neo, Morfeo, Trinity, Oráculo). Ahí se niega a abrir salvo con --forzar (cerrar/parar sí se permiten).
FORZAR=""; for a in "$@"; do [ "$a" = "--forzar" ] && FORZAR=1; done
set -- $(for a in "$@"; do [ "$a" = "--forzar" ] || printf '%s\n' "$a"; done)
case "${1:-abrir}" in abrir|recrear|movil)
  YO_MAC=$(scutil --get LocalHostName 2>/dev/null | tr 'A-Z' 'a-z')
  case "$YO_MAC" in *macbook-pro-16*|*macbookpro16*)
    if [ -z "$FORZAR" ] && [ -z "$CUADRATURA_GROK_FORZAR" ]; then
      echo "$TAG en el MacBook Pro 16 no se abre (allí va solo la cuadrícula de 4): la mitad Grok va en el MacBook Air. Usa --forzar si de verdad la quieres aquí."
      exit 3
    fi ;;
  esac ;;
esac
case "${1:-abrir}" in
  _banner) banner "$2" ;;
  _vivo)   vivo "$2" ;;
  _layout) layout ;;
  _ttyd)   _ttyd ;;
  _cliente) _cliente ;;
  cerrar)  cerrar ;;
  parar)   parar ;;
  movil)   movil "$2" ;;
  movil-qr) movil_qr "$@" ;;
  movil-qr-ventana) movil_qr_ventana ;;
  movil-off) movil_off ;;
  recrear) parar; crear; ventana; sleep 1.5; layout ;;
  abrir|"") crear; ventana; sleep 1.5; layout ;;
  *) echo "uso: cuadratura-grok [abrir|cerrar|parar|recrear|movil|movil-qr|movil-off]"; exit 2 ;;
esac
