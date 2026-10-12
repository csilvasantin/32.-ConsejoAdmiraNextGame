#!/bin/bash
# cuadratura — 4 terminales de agentes en cuadrícula 2x2, solo lectura, en ESTE Mac.
# Cada línea de ~/.config/admiranext/cuadratura.conf: Título|host-tailscale|sesión-tmux|perfil-Terminal
# El perfil (skin) distingue a cada agente de un vistazo: Homebrew, Red Sands, Ocean, Grass, Novel, Pro…
# Si el host es este Mac se engancha en local; si no, por ssh (tailscale).
# Uso: cuadratura            (abre/recoloca)   cuadratura cerrar   (cierra las 4)
CONF=~/.config/admiranext/cuadratura.conf
T=/opt/homebrew/bin/tmux
[ -f "$CONF" ] || { mkdir -p "$(dirname "$CONF")"; cat > "$CONF" <<'C'
Neo · Claude|macbook-pro-16|neo|Homebrew
Morfeo · Claude|macbook-pro-16|morfeo|Red Sands
Trinity · Codex|macbook-pro-16|trinity|Ocean
Oráculo · Codex|macmini|oraculo|Grass
C
}
yo=$(scutil --get LocalHostName | tr 'A-Z' 'a-z')
cerrar() {
  # cierra SOLO las ventanas de Terminal de la cuadrícula (título con [cuadratura] o enganche de solo lectura), sin diálogos
  for tty in $(osascript -e 'tell application "Terminal"
    set r to ""
    repeat with w in (every window)
      try
        set t to selected tab of w
        set p to (processes of t) as string
        if (custom title of t contains "[cuadratura]") or ((p contains "ssh") and (name of w contains "attach -r")) or (name of w contains "panel-agente") or (name of w contains "[cuadratura]") then set r to r & (tty of t) & " "
      end try
    end repeat
    return r
  end tell' 2>/dev/null); do
    ps -axo pid=,tty= | awk -v t="${tty#/dev/}" '$2==t {print $1}' | xargs kill -9 2>/dev/null
    sleep 0.3
    osascript -e "tell application \"Terminal\" to close (every window whose tty of selected tab is \"$tty\")" >/dev/null 2>&1
  done
  rm -f ~/.config/admiranext/.cuadratura-ids
  # la guardia (mantener la cuadrícula delante) vive solo mientras la cuadrícula está abierta
  [ -f ~/.config/admiranext/.guardia.pid ] && kill "$(cat ~/.config/admiranext/.guardia.pid)" 2>/dev/null; }
if [ "$1" = cerrar ]; then cerrar; exit 0; fi
cerrar
L=(); while IFS= read -r x; do L+=("$x"); done < <(grep -v '^[[:space:]]*#' "$CONF" | grep '|' | head -4)
# 11-oct (Carlos «/interface 6 en el MBP16»): con «6» añade los 2 de Grok (visor-grok.conf) en rejilla 3x2, por columnas de modelo (Claude, Codex, Grok: arriba y abajo)
if [ "$1" = 6 ]; then while IFS= read -r x; do L+=("$x"); done < <(grep -v '^[[:space:]]*#' ~/.config/admiranext/visor-grok.conf 2>/dev/null | grep '|' | head -2); fi
read W H < <(osascript -e 'tell application "Finder" to get bounds of window of desktop' | awk -F', ' '{print $3, $4}')
TOP=25; HW=$((W/2)); HH=$(((H-TOP)/2))
POS=("0 $TOP $HW $((TOP+HH))" "$HW $TOP $W $((TOP+HH))" "0 $((TOP+HH)) $HW $H" "$HW $((TOP+HH)) $W $H")
if [ ${#L[@]} -gt 4 ]; then TW=$((W/3)); POS=(); for c in 0 1 2; do for f in 0 1; do x2=$(((c+1)*TW)); [ $c = 2 ] && x2=$W; y2=$((TOP+HH)); [ $f = 1 ] && y2=$H; POS+=("$((c*TW)) $((TOP+f*HH)) $x2 $y2"); done; done; fi
i=0
for l in "${L[@]}"; do
  IFS='|' read -r TIT HOST SES SKIN <<< "$l"
  [ -n "$SKIN" ] || SKIN=Pro
  NOMBRE="${TIT%% ·*}"; RESTO="${TIT#* · }"
  TIT="$TIT · $HOST [cuadratura]"
  # modelo y Mac para la línea tenue del panel Idle
  case "$RESTO" in Claude*) MOD="Claude Code";; Codex*) MOD="Codex CLI";; Grok*) MOD="Grok CLI";; *) MOD="$RESTO";; esac
  case "$HOST" in macbook-pro-16*) MAC="MacBook Pro 16";; macbookpronegro14*|macbook-pro-14*) MAC="MacBook Pro 14";; macmini*) MAC="Mac mini";; *) MAC="$HOST";; esac
  # panel-agente: Idle = nombre grande + «Idle»; en misión = attach -r a un visor agrupado (nunca a la sesión del agente)
  if [ "$(echo "$HOST" | tr 'A-Z' 'a-z')" = "$yo" ]; then H=local; else H="$HOST"; fi
  INNER="exec /bin/bash $HOME/Claude/vista/panel-agente.sh '$NOMBRE' '$H' '$SES' '$MOD' '$MAC'"
  CMD="$INNER"
  IDS[$i]=$(osascript <<OSA
tell application "Terminal"
  set t to do script "$CMD"
  delay 0.5
  set wid to tty of t
  try
    set current settings of t to settings set "$SKIN"
  end try
  set custom title of t to "$TIT"
  set title displays custom title of t to true
  set title displays shell path of t to false
  set title displays window size of t to false
  set title displays device name of t to false
  return wid
end tell
OSA
)
  i=$((i+1))
done
sleep 1
i=0
for l in "${L[@]}"; do
  read x1 y1 x2 y2 <<< "${POS[$i]}"
  osascript -e "tell application \"Terminal\" to set bounds of (first window whose tty of selected tab is \"${IDS[$i]}\") to {$x1, $y1, $x2, $y2}" >/dev/null
  echo "${IDS[$i]}" >> ~/.config/admiranext/.cuadratura-ids
  i=$((i+1))
done
# guardia: si Carlos lleva > 60 s sin tocar el Mac y un navegador u otra app tapa la cuadrícula, la oculta
# (config y Mac libre en ~/.config/admiranext/mac-libre.conf · log en ~/.config/admiranext/guardia-cuadratura.log)
# se lanza dentro del servidor tmux (sobrevive al shell que abrió la cuadrícula; no es LaunchAgent ni login item)
$T run-shell -b "/bin/bash $HOME/Claude/vista/guardia-cuadratura.sh >/dev/null 2>&1" 2>/dev/null || { nohup /bin/bash "$HOME/Claude/vista/guardia-cuadratura.sh" </dev/null >/dev/null 2>&1 & disown 2>/dev/null; }
