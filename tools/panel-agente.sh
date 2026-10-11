#!/bin/bash
# panel-agente — un panel de la cuadratura para UN deepagent (bash 3.2, macOS).
#  · Idle      → terminal limpio: nombre en ASCII grande centrado + «Idle» + línea tenue (modelo · Mac).
#  · En misión → espejo en vivo SIN cliente tmux (capture-pane cada 1 s, con colores). Ni attach ni attach -r:
#                en tmux 3.7 cualquier cliente de solo lectura en el servidor hace fallar TODOS los send-keys
#                de los vigilantes («client is read-only»), sea cual sea la sesión.
#  · Sin sesión → nombre + «Sin sesión».   · Login pendiente → nombre + «Login pendiente» (sin enseñar el enlace OAuth).
# r31 (Carlos 11-10-2026 13:13 «¿por qué no coinciden?»): el ESTADO y la última misión los decide UNA sola pieza,
# estado-agente.py (junto a este script), que comparte con visor-publicar.py (admira.live/visor) el estado guardado en
# ~/.cache/admiranext/estado-agentes/ → la cuadrícula del Mac y el visor del Fold dicen lo mismo, con la misma histéresis
# (vivo al primer indicio, Idle tras IDLE_TRAS=80 s quieto). Si cambia este script o estado-agente.py, el panel se recarga solo.
# Nunca escribe en la sesión del agente, ni la redimensiona ni la interrumpe.
# Uso: panel-agente.sh <Nombre> <host|local> <sesión> "<modelo>" "<Mac>"
#      host ≠ local → se ejecuta a sí mismo en ese host por ssh (copia atómica previa) y reintenta si cae.
#      env: PANEL_SSH_KEY (clave ssh opcional), PANEL_USER (por defecto csilvasantin)
N="$1"; HOST="${2:-local}"; SES="$3"; MOD="$4"; MAC="$5"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG=${LANG:-es_ES.UTF-8} LC_ALL=${LC_ALL:-es_ES.UTF-8}
SELF="$0"
CADA=3; IDLE_TRAS=${IDLE_TRAS:-80}

if [ "$HOST" != "local" ]; then
  U=${PANEL_USER:-csilvasantin}
  O=(-o ConnectTimeout=8 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
  [ -n "$PANEL_SSH_KEY" ] && [ -f "$PANEL_SSH_KEY" ] && O+=(-i "$PANEL_SSH_KEY" -o IdentitiesOnly=yes)
  printf '\033]2;%s\007' "$N"
  q(){ printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
  while :; do
    ssh -o BatchMode=yes "${O[@]}" "$U@$HOST" 'mkdir -p Claude/vista && cat > Claude/vista/.estado-agente.tmp && mv -f Claude/vista/.estado-agente.tmp Claude/vista/estado-agente.py && chmod +x Claude/vista/estado-agente.py' < "$(dirname "$SELF")/estado-agente.py" 2>/dev/null
    ssh -o BatchMode=yes "${O[@]}" "$U@$HOST" 'mkdir -p Claude/vista && cat > Claude/vista/.panel-agente.tmp && mv -f Claude/vista/.panel-agente.tmp Claude/vista/panel-agente.sh && chmod +x Claude/vista/panel-agente.sh' < "$SELF" 2>/dev/null
    ssh -t "${O[@]}" "$U@$HOST" "TERM=xterm-256color /bin/bash Claude/vista/panel-agente.sh $(q "$N") local $(q "$SES") $(q "$MOD") $(q "$MAC")" 2>/dev/null
    clear; tput civis 2>/dev/null
    printf '\n\n   %s\n\n   \033[2mSin conexión con %s · reintento en 15 s\033[0m\n' "$N" "$HOST"
    sleep 15
  done
fi

T="$(command -v tmux)"
YO=$(scutil --get LocalHostName 2>/dev/null | tr 'A-Z' 'a-z'); [ -n "$YO" ] || YO=$(hostname -s)
ASCII=$(printf '%s' "$N" | sed 's/[Áá]/A/g;s/[Éé]/E/g;s/[Íí]/I/g;s/[Óó]/O/g;s/[Úú]/U/g;s/[Ññ]/N/g' | tr 'a-z' 'A-Z')

DIRP="$(cd "$(dirname "$SELF")" && pwd)"; ESTADO="$DIRP/estado-agente.py"
PER="$(printf '%s' "${ASCII:0:1}")$(printf '%s' "${ASCII:1}" | tr 'A-Z' 'a-z')"
# decide: deja en $E vivo|idle|login|nosesion, $ETQ la palabra («Idle», «Login pendiente», «Sin sesión») y $MIS la última
# misión — todo de estado-agente.py, la misma fuente que el visor (sin subshell para E/MIS: eval de su salida --sh)
E=nosesion; ETQ="Sin sesión"; MIS="sin misiones registradas"
decide(){ local o; o=$(/usr/bin/python3 "$ESTADO" --sh "$SES" "$PER" 2>/dev/null) && [ -n "$o" ] && eval "$o"
  [ "$E" = vivo ] && E=ocupado; [ -n "$MIS" ] || MIS="sin misiones registradas"; }
mision(){ :; }  # la trae decide() (cacheada 60 s en estado-agente.py)
# recarga en caliente: si cambia este script o estado-agente.py, el panel se reemplaza a sí mismo (sin cerrar la ventana)
firma(){ cat "$SELF" "$ESTADO" 2>/dev/null | cksum; }
FIRMA=$(firma); FT=0
recarga(){ FT=$((FT+1)); [ $FT -ge 10 ] || return; FT=0
  [ "$(firma)" = "$FIRMA" ] || { limpia; exec /bin/bash "$SELF" "$N" "$HOST" "$SES" "$MOD" "$MAC"; }; }

pinta(){ # pinta <estado>  — mismo formato de cabecera: nombre grande · línea info (modelo · Mac · estado · hora) · última misión
  local cols filas art n top i w m
  cols=$(tput cols 2>/dev/null || echo 80); filas=$(tput lines 2>/dev/null || echo 24)
  mision
  art=""
  if command -v figlet >/dev/null; then
    for f in big standard small; do
      art=$(figlet -w "$cols" -c -f "$f" "$ASCII" 2>/dev/null)
      w=$(printf '%s\n' "$art" | awk '{ if (length($0)>m) m=length($0) } END{print m+0}')
      [ "$w" -lt "$cols" ] && break
    done
  fi
  [ -n "$art" ] || art=$(printf '%*s' $(( (cols + ${#ASCII}) / 2 )) "$ASCII")
  n=$(printf '%s\n' "$art" | wc -l | tr -d ' ')
  top=$(( (filas - n - 6) / 2 )); [ "$top" -ge 0 ] || top=0
  m="última misión: $MIS"; [ ${#m} -lt $((cols - 2)) ] || m="${m:0:$((cols - 3))}…"
  { printf '\033[H'; tput civis 2>/dev/null
    i=0; while [ $i -lt $top ]; do printf '\033[K\n'; i=$((i+1)); done
    printf '%s\n' "$art" | while IFS= read -r l; do printf '\033[1m%s\033[0m\033[K\n' "$l"; done
    printf '\033[K\n'
    centra "$1" 1
    printf '\033[K\n'
    centra "$MOD · $MAC · $1 · $(date +%H:%M)" 2
    centra "$m" 2
    printf '\033[0m\033[J'; }
}
centra(){ local s="$1" c pad; c=$(tput cols 2>/dev/null || echo 80)
  pad=$(( (c - ${#s}) / 2 )); [ $pad -ge 0 ] || pad=0
  printf '%*s\033[%sm%s\033[0m\033[K\n' "$pad" "" "$2" "$s"; }

ESC=$(printf '\033')
limpia(){ printf '\033[?7h'; tput cnorm 2>/dev/null; }
trap 'limpia; exit 0' INT TERM HUP
trap limpia EXIT
# restos de visores de este mismo origen que quedaron huérfanos (sin cliente)
for s in $($T list-sessions -F '#{session_name} #{session_attached}' 2>/dev/null | awk -v p="$SES-visor-" 'index($1,p)==1 && $2==0 {print $1}'); do $T kill-session -t "=$s" 2>/dev/null; done

vivo(){ # espejo SIN cliente tmux: capture-pane cada segundo (no hay attach -r, así que nunca bloquea send-keys)
  local cols filas cab h hv=x t=0 hdr n
  printf '\033[?7l'; tput civis 2>/dev/null
  while :; do
    t=$((t+1))
    if [ $t -ge $CADA ]; then t=0; decide; [ "$E" = ocupado ] || break; recarga; fi
    cols=$(tput cols 2>/dev/null || echo 80); filas=$(tput lines 2>/dev/null || echo 24)
    cuerpo=$($T capture-pane -e -p -t "=$SES:" 2>/dev/null) || break
    h=$(printf '%s%s%s' "$cols" "$filas" "$cuerpo" | cksum)
    if [ "$h" != "$hv" ] || [ -n "$REPINTA" ]; then
      hv="$h"; REPINTA=""
      if command -v figlet >/dev/null; then hdr=$(figlet -w "$cols" -f small "$ASCII" 2>/dev/null); else hdr=" $ASCII"; fi
      n=$(printf '%s\n' "$hdr" | wc -l | tr -d ' '); n=$((n+2)); mision
      cuerpo=$(printf '%s\n' "$cuerpo" | tail -n $((filas - n)))
      { printf '\033[H\033[1m%s\033[0m\033[K\n' "$(printf '%s\n' "$hdr" | sed "s/\$/${ESC}[K/")"
        printf '\033[2m %s · %s · en misión · %s\033[0m\033[K\n' "$MOD" "$MAC" "$(date +%H:%M)"
        printf '\033[2m ▶ %s\033[0m\033[K\n' "${MIS:0:$((cols - 4))}"
        printf '%s\n' "$cuerpo" | sed "s/\$/${ESC}[0m${ESC}[K/"
        printf '\033[0m\033[J'; } 2>/dev/null
    fi
    sleep 1 & wait $!
  done
  printf '\033[?7h'
}

EST=""; PINTADO=""; REPINTA=""
trap 'PINTADO=""; REPINTA=1' WINCH
while :; do
  decide
  if [ "$E" = ocupado ]; then
    EST=ocupado; PINTADO=""; REPINTA=1
    vivo
    [ "$E" = ocupado ] && continue
  fi
  EST="$E"
  if [ "$PINTADO" != "$E" ] || [ "$(date +%H:%M)" != "$PMIN" ]; then
    PMIN=$(date +%H:%M)
    pinta "$ETQ"
    PINTADO="$E"
  fi
  recarga
  sleep $CADA & wait $!
done
