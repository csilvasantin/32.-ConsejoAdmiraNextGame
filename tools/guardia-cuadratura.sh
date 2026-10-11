#!/bin/bash
# guardia-cuadratura — mantiene la cuadrícula de 4 terminales a la vista en este Mac (bash 3.2, macOS).
# Cada GUARDIA_CADA s mira la app que está delante. Si Carlos lleva > GUARDIA_IDLE s sin tocar teclado/ratón
# (HIDIdleTime) y delante hay un navegador (GUARDIA_OCULTAR) o una app que pasó al frente mientras estaba
# inactivo, la oculta (NSRunningApplication.hide: no cierra nada, no pide permisos) y lo apunta en el log.
# Nunca toca GUARDIA_NUNCA (Terminal, GrokBot, Finder, diálogos del sistema…). Ni LaunchAgent ni login item:
# la lanza cuadratura.sh y termina sola al cerrar la cuadrícula (desaparece .cuadratura-ids).
# Uso: guardia-cuadratura.sh [--prueba]   (--prueba: solo registra lo que ocultaría)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
D=~/.config/admiranext; IDS=$D/.cuadratura-ids; PID=$D/.guardia.pid; LOG=$D/guardia-cuadratura.log
GUARDIA=1; GUARDIA_CADA=5; GUARDIA_IDLE=60; GUARDIA_OCULTAR="com.google.Chrome com.apple.Safari"
GUARDIA_NUNCA="com.apple.Terminal com.anysphere.sand com.apple.finder"
carga(){ [ -r $D/mac-libre.conf ] && . $D/mac-libre.conf; }
carga; [ "$GUARDIA" = 1 ] || exit 0
PRUEBA=""; [ "$1" = --prueba ] && PRUEBA=1
# una sola guardia a la vez
if [ -f "$PID" ] && kill -0 "$(cat "$PID" 2>/dev/null)" 2>/dev/null; then exit 0; fi
echo $$ > "$PID"; trap 'rm -f "$PID"' EXIT; trap 'exit 0' INT TERM HUP
log(){ echo "$(date '+%F %T') $*" >> "$LOG"; [ $(wc -l < "$LOG") -gt 2000 ] && tail -n 1000 "$LOG" > "$LOG.t" && mv -f "$LOG.t" "$LOG"; }
en(){ case " $2 " in *" $1 "*) return 0;; esac; return 1; }
inactivo(){ ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'; }
frente(){ local a; a=$(lsappinfo front 2>/dev/null); [ -n "$a" ] || return
  lsappinfo info -only bundleid "$a" 2>/dev/null | sed -n 's/.*"CFBundleIdentifier"="\(.*\)".*/\1/p'; }
nombre(){ lsappinfo info -only name "$(lsappinfo front)" 2>/dev/null | sed -n 's/.*"LSDisplayName"="\(.*\)".*/\1/p'; }
oculta(){ osascript -l JavaScript -e "ObjC.import('AppKit'); var a=\$.NSRunningApplication.runningApplicationsWithBundleIdentifier('$1').js; var r=false; for (var i=0;i<a.length;i++) r=a[i].hide || r; r" 2>/dev/null; }
log "inicio pid $$ (cada ${GUARDIA_CADA}s, inactivo>${GUARDIA_IDLE}s${PRUEBA:+, PRUEBA})"
FRENTE_CARLOS="$(frente)"; SIN_IDS=0; N=0   # al arrancar se respeta lo que ya hay delante
while :; do
  if [ -f "$IDS" ]; then SIN_IDS=0; else SIN_IDS=$((SIN_IDS+1)); [ $SIN_IDS -ge 3 ] && { log "cuadrícula cerrada, fin"; exit 0; }; fi
  N=$((N+1)); [ $((N % 12)) -eq 0 ] && { carga; [ "$GUARDIA" = 1 ] || { log "desactivada en mac-libre.conf, fin"; exit 0; }; }
  b=$(frente); i=$(inactivo); i=${i:-0}
  if [ -n "$b" ] && [ -f "$IDS" ]; then
    if [ "$i" -lt "$GUARDIA_IDLE" ]; then
      FRENTE_CARLOS="$b"                       # lo que Carlos tiene delante mientras usa el Mac: se respeta
    elif ! en "$b" "$GUARDIA_NUNCA" && ! printf '%s' "$b" | grep -qi grok; then
      if en "$b" "$GUARDIA_OCULTAR" || [ "$b" != "$FRENTE_CARLOS" ]; then
        n=$(nombre)
        if [ -n "$PRUEBA" ]; then log "PRUEBA ocultaría $n ($b) · inactivo ${i}s"
        else r=$(oculta "$b"); log "oculto $n ($b) · inactivo ${i}s · ok=$r"; fi
      fi
    fi
  fi
  sleep "$GUARDIA_CADA"
done
