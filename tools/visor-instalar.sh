#!/bin/bash
# visor-instalar.sh — instala el publicador del visor (admira.live/visor) en ESTE Mac. Idempotente.
#   bash tools/visor-instalar.sh            instala/actualiza y arranca
#   bash tools/visor-instalar.sh quitar     lo para y lo quita
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; L=com.admiranext.visor-publicar; P="$HOME/Library/LaunchAgents/$L.plist"
launchctl bootout "gui/$(id -u)/$L" 2>/dev/null || true
if [ "${1:-}" = quitar ]; then rm -f "$P"; echo "visor-publicar quitado"; exit 0; fi
mkdir -p "$HOME/.fleet/logs" "$HOME/.config/admiranext"
install -m 755 "$D/visor-publicar.py" "$HOME/.fleet/visor-publicar.py"
[ -f "$HOME/.config/admiranext/cuadratura.conf" ] || cat > "$HOME/.config/admiranext/cuadratura.conf" <<'C'
Neo · Claude|macbook-pro-16|neo|Homebrew
Morfeo · Claude|macbook-pro-16|morfeo|Red Sands
Trinity · Codex|macbook-pro-16|trinity|Ocean
Oráculo · Codex|macmini|oraculo|Grass
C
sed "s#__HOME__#$HOME#g" "$D/$L.plist" > "$P"
launchctl bootstrap "gui/$(id -u)" "$P"
echo "visor-publicar instalado en $(scutil --get LocalHostName) · lista: ~/.config/admiranext/cuadratura.conf"
