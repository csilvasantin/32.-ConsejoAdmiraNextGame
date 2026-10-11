#!/bin/bash
# visor-instalar.sh — instala el publicador del visor (admira.live/visor) en ESTE Mac. Idempotente.
#   bash tools/visor-instalar.sh            instala/actualiza y arranca
#   bash tools/visor-instalar.sh quitar     lo para y lo quita
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; L=com.admiranext.visor-publicar; P="$HOME/Library/LaunchAgents/$L.plist"
# r31: el plist solo se escribe si falta o cambió (cada reescritura saca el aviso de «actividad en segundo plano» de macOS);
# si ya está igual, basta con sustituir los scripts y reiniciar el proceso con kickstart.
if [ "${1:-}" = quitar ]; then launchctl bootout "gui/$(id -u)/$L" 2>/dev/null || true; rm -f "$P"; echo "visor-publicar quitado"; exit 0; fi
mkdir -p "$HOME/.fleet/logs" "$HOME/.config/admiranext" "$HOME/Claude/vista"
# estado-agente.py: la fuente única del estado (vivo/idle/login/nosesion) que comparten la cuadrícula y el visor
install -m 755 "$D/estado-agente.py" "$HOME/Claude/vista/.estado-agente.tmp" && mv -f "$HOME/Claude/vista/.estado-agente.tmp" "$HOME/Claude/vista/estado-agente.py"
install -m 755 "$D/visor-publicar.py" "$HOME/.fleet/.visor-publicar.tmp" && mv -f "$HOME/.fleet/.visor-publicar.tmp" "$HOME/.fleet/visor-publicar.py"
install -m 755 "$D/terminal-inventory.py" "$HOME/.fleet/.terminal-inventory.tmp" && mv -f "$HOME/.fleet/.terminal-inventory.tmp" "$HOME/.fleet/terminal-inventory.py"
[ -f "$HOME/.config/admiranext/cuadratura.conf" ] || cat > "$HOME/.config/admiranext/cuadratura.conf" <<'C'
Neo · Claude|macbook-pro-16|neo|Homebrew
Morfeo · Claude|macbook-pro-16|morfeo|Red Sands
Trinity · Codex|macbook-pro-16|trinity|Ocean
Oráculo · Codex|macmini|oraculo|Grass
C
NUEVO="$(sed "s#__HOME__#$HOME#g" "$D/$L.plist")"
if [ -f "$P" ] && [ "$NUEVO" = "$(cat "$P")" ] && launchctl print "gui/$(id -u)/$L" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/$L"
else
  launchctl bootout "gui/$(id -u)/$L" 2>/dev/null || true
  printf '%s\n' "$NUEVO" > "$P"
  launchctl bootstrap "gui/$(id -u)" "$P"
fi
echo "visor-publicar instalado en $(scutil --get LocalHostName) · lista: ~/.config/admiranext/cuadratura.conf"
