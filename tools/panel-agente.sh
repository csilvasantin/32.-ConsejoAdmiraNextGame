#!/bin/bash
# panel-agente — un panel de la cuadratura para UN deepagent (bash 3.2, macOS · también Linux).
# r35 (Carlos 11-10-2026 14:04 «que se lea como la web»): SIEMPRE el mismo formato, sin pantalla de Idle:
#   ┌ línea de ESTADO grande y en color: TRABAJANDO (verde) · PENDIENTE SIN TRABAJAR (ámbar) · PARADO (gris)
#   │                                    · LOGIN PENDIENTE (ámbar) · SIN SESIÓN (gris) — y el nombre en ASCII compacto
#   ├ encargo en curso o último: «#NNNN · titular corto · HH:MM»  (+ «#NNNN abierto desde …» tenue si lo hay)
#   └ la terminal del agente debajo, en espejo (capture-pane cada 1 s, con colores; parado = su último contenido)
# El estado sale de estado-agente.py (junto a este script), la MISMA pieza que alimenta admira.live/visor
# (campo «agente» de cada ficha en GET /api/visor/pane) → la cuadrícula y el visor nunca se contradicen.
# Ni attach ni attach -r (en tmux 3.7 un cliente de solo lectura hace fallar los send-keys de los vigilantes).
# Nunca escribe en la sesión del agente, ni la redimensiona ni la interrumpe. El enlace OAuth del login se tapa.
# Sin parpadeo: solo repinta si cambia algo (cabecera o pantalla) y sin borrar la pantalla entera.
# Si cambia este script o estado-agente.py, el panel se recarga solo.
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
ASCII=$(printf '%s' "$N" | sed 's/[Áá]/A/g;s/[Éé]/E/g;s/[Íí]/I/g;s/[Óó]/O/g;s/[Úú]/U/g;s/[Ññ]/N/g' | tr 'a-z' 'A-Z')
DIRP="$(cd "$(dirname "$SELF")" && pwd)"; ESTADO="$DIRP/estado-agente.py"
PY=/usr/bin/python3; [ -x "$PY" ] || PY="$(command -v python3)"
PER="$(printf '%s' "${ASCII:0:1}")$(printf '%s' "${ASCII:1}" | tr 'a-z' 'A-Z' | tr 'A-Z' 'a-z')"
E=nosesion; ETQ="Sin sesión"; MIS=""; LINEA=""; VIEJO=""; ENC="sin encargos"; REL=0; VOK=0
# PANEL_REMOTO=1: la sesión vive en otra máquina sin ssh desde aquí (Merovingio en la caja) → estado y terminal del
# relevo del visor (GET /api/visor/pane?g=6, llave de ~/.config/admira/visor-enlace.txt) y, si no lo hay, por sus encargos
decide(){ local o; o=$("$PY" "$ESTADO" --sh "$SES" "$PER" ${PANEL_REMOTO:+--visor} 2>/dev/null) && [ -n "$o" ] && eval "$o"; }
VTXT="$HOME/.cache/admiranext/estado-agentes/visor-$(printf '%s' "$SES" | tr -c 'A-Za-z0-9._-' '_').txt"
firma(){ cat "$SELF" "$ESTADO" 2>/dev/null | cksum; }
FIRMA=$(firma); FT=0
recarga(){ FT=$((FT+1)); [ $FT -ge 30 ] || return; FT=0
  [ "$(firma)" = "$FIRMA" ] || { limpia; exec /bin/bash "$SELF" "$N" "$HOST" "$SES" "$MOD" "$MAC"; }; }
ESC=$(printf '\033')
limpia(){ printf '\033[?7h\033[0m'; tput cnorm 2>/dev/null; }
trap 'limpia; exit 0' INT TERM HUP
trap limpia EXIT
# restos de visores de este mismo origen que quedaron huérfanos (sin cliente)
for s in $($T list-sessions -F '#{session_name} #{session_attached}' 2>/dev/null | awk -v p="$SES-visor-" 'index($1,p)==1 && $2==0 {print $1}'); do $T kill-session -t "=$s" 2>/dev/null; done

# estado → palabra grande y color (fondo) de la banda
banda(){ # modo ahorro: los de ~/.config/admiranext/relajados salen RELAJADO (gris) salvo que estén trabajando
  if [ "$REL" = 1 ] && [ "$E" != vivo ]; then PAL="RELAJADO"; BC="97;100"; NC="1;37"; return; fi
  case "$E" in
  vivo)      PAL="TRABAJANDO";             BC="30;42";  NC="1;32" ;;
  pendiente) PAL="PENDIENTE SIN TRABAJAR"; BC="30;43";  NC="1;33" ;;
  login)     PAL="LOGIN PENDIENTE";        BC="30;43";  NC="1;33" ;;
  nosesion)  PAL="SIN SESIÓN";             BC="97;100"; NC="2" ;;
  *)         PAL="PARADO";                 BC="97;100"; NC="1;37" ;;
esac; }
ART=""; ARTW=0
arte(){ local c="$1"; [ "$ARTW" = "$c" ] && return; ARTW="$c"
  ART=""; command -v figlet >/dev/null && ART=$(figlet -w "$c" -f small "$ASCII" 2>/dev/null | sed -e :a -e '/^[[:space:]]*$/{$d;N;ba' -e '}')
  local w; w=$(printf '%s\n' "$ART" | awk '{ if (length($0)>m) m=length($0) } END{print m+0}')
  { [ -n "$ART" ] && [ "$w" -le "$c" ]; } || ART=" $ASCII"; }
# r35b: la censura del enlace OAuth y el recorte van en awk (el sed BSD de macOS se atragantaba con la «/» del patrón)
OAUTH='code_challenge|redirect_uri=|client_id=|response_type=|[?&]state=|%3A%2F|oauth.authorize|[.]com.oauth'
cabecera(){ # pinta la cabecera en $CAB (líneas) y su alto en $NCAB
  local cols="$1" t enc v izq der pad
  banda; arte "$cols"; t=$(date +%H:%M)
  izq="  ● $PAL  "; der=" $N · $MOD · $MAC · $t "
  pad=$(( cols - ${#izq} - ${#der} )); [ $pad -ge 1 ] || { der=" $N · $t "; pad=$(( cols - ${#izq} - ${#der} )); }; [ $pad -ge 0 ] || pad=0
  enc=" $ENC"; [ ${#enc} -le $((cols - 1)) ] || enc="${enc:0:$((cols - 2))}…"
  v=""; [ -n "$VIEJO" ] && v="   $VIEJO"; [ ${#v} -le $((cols - 1)) ] || v="${v:0:$((cols - 2))}…"
  CAB="$(printf '%s\n' "$ART" | while IFS= read -r l; do printf '\033[%sm%s\033[0m\033[K\n' "$NC" "$l"; done)"
  CAB="$CAB
$(printf '\033[1;%sm%s%*s%s\033[0m\033[K' "$BC" "$izq" "$pad" "" "$der")
$(printf '\033[1m%s\033[0m\033[K' "$enc")"
  [ -n "$v" ] && CAB="$CAB
$(printf '\033[2;3m%s\033[0m\033[K' "$v")"
  CAB="$CAB
$(printf '\033[2m%s\033[0m\033[K' "$(printf '%*s' "$cols" '' | tr ' ' '-')")"
  NCAB=$(printf '%s\n' "$CAB" | wc -l | tr -d ' ')
}

printf '\033[?7l\033[2J'; tput civis 2>/dev/null
exec 2>/dev/null   # ningún error puede ensuciar el panel
REPINTA=1; trap 'REPINTA=1; ARTW=0; printf "\033[2J"' WINCH
hv=""; t=$CADA
while :; do
  t=$((t+1))
  if [ $t -ge $CADA ]; then t=0; decide; recarga; fi
  # tamaño real del panel (stty sobre /dev/tty: tput en $(…) con stderr a /dev/null cae a 80x24)
  set -- $(stty size </dev/tty 2>/dev/null); filas=${1:-24}; cols=${2:-80}
  cabecera "$cols"
  if [ -n "$PANEL_REMOTO" ] && ! $T has-session -t "=$SES" 2>/dev/null; then
    if [ "$VOK" = 1 ] && [ -s "$VTXT" ]; then cuerpo=$(cat "$VTXT")   # su terminal, vía el relevo del visor
    else cuerpo=$(printf '\n   \033[2m%s vive en %s · sin espejo de su terminal en este Mac (el relevo del visor no la trae)\033[0m' "$N" "$MAC"); fi
  elif [ "$E" = nosesion ]; then
    cuerpo=$(printf '\n   \033[2mla sesión tmux «%s» no está en marcha en este Mac\033[0m' "$SES")
  else
    cuerpo=$($T capture-pane -e -p -t "=$SES:" 2>/dev/null)
  fi
  h=$(printf '%s|%s|%s|%s' "$cols" "$filas" "$CAB" "$cuerpo" | cksum)
  if [ "$h" != "$hv" ] || [ -n "$REPINTA" ]; then
    hv="$h"; REPINTA=""
    resto=$((filas - NCAB)); [ $resto -ge 1 ] || resto=1
    # cabecera SIEMPRE fija en las filas 1..NCAB; la terminal solo en las filas de debajo, posicionada fila a fila
    # (cursor absoluto, sin autowrap): nada la puede empujar ni hacer scroll
    { printf '\033[H%s' "$CAB"
      printf '%s\n' "$cuerpo" | awk -v ini=$((NCAB + 1)) -v n="$resto" -v re="$OAUTH" '
        { l[NR] = $0 }
        END {
          m = NR
          while (m > 0) { s = l[m]; gsub(/\033\[[0-9;?]*[A-Za-z]/, "", s); if (s ~ /[^[:space:]]/) break; m-- }
          d = m - n + 1; if (d < 1) d = 1
          k = m - d + 1; off = n - k            # pegado abajo, como en el visor
          for (r = 0; r < off; r++) printf "\033[%d;1H\033[0m\033[2K", ini + r
          for (i = d; i <= m; i++) {
            x = l[i]; if (x ~ re) x = "   [enlace de login oculto]"
            printf "\033[%d;1H\033[0m\033[2K%s\033[0m", ini + off + i - d, x
          }
        }'
      printf '\033[0m'; } 2>/dev/null
  fi
  sleep 1 & wait $!
done
