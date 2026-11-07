#!/bin/bash
# deploy-input-agent.sh — lleva el inyector de RATÓN/TECLADO a una máquina de la flota.
#   bash deploy-input-agent.sh <user@host> macos|linux|windows
# macOS  → ~/.fleet/fleet-input.py      (Quartz; exige Accesibilidad para sshd/python)
# linux  → ~/.fleet/fleet-input-linux.py (xdotool en X11 / ydotool+ydotoold en Wayland)
# windows→ %USERPROFILE%\.fleet\fleet-input.ps1 (SendInput; el shell SSH es PowerShell)
# Misión 0052 (4-sep-2026): el hub despacha /api/input por plataforma con el mismo JSON.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
T="${1:?user@host}"; P="${2:?macos|linux|windows}"
case "$P" in
  macos)
    ssh -o BatchMode=yes "$T" 'mkdir -p ~/.fleet'
    scp -o BatchMode=yes -o ConnectTimeout=10 "$HERE/fleet-input.py" "$HERE/display_geometry.py" "$HERE/fleet-capture.py" "$T:~/.fleet/"
    ssh -o BatchMode=yes "$T" 'chmod 755 ~/.fleet/fleet-input.py ~/.fleet/fleet-capture.py; /usr/bin/python3 ~/.fleet/fleet-input.py --displays' ;;
  linux)
    ssh -o BatchMode=yes "$T" 'mkdir -p ~/.fleet'
    scp -o BatchMode=yes "$HERE/fleet-input-linux.py" "$T:~/.fleet/fleet-input-linux.py"
    ssh -o BatchMode=yes "$T" 'chmod +x ~/.fleet/fleet-input-linux.py; export DISPLAY="${DISPLAY:-:0}"; echo "xdotool=$(command -v xdotool || echo NO) ydotool=$(command -v ydotool || echo NO)"; python3 ~/.fleet/fleet-input-linux.py --displays' ;;
  windows)
    # PowerShell como shell: se vuelca el fichero por stdin en UTF-8.
    ssh -o BatchMode=yes "$T" 'New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.fleet" | Out-Null; $in=[Console]::In.ReadToEnd(); [IO.File]::WriteAllText("$env:USERPROFILE\.fleet\fleet-input.ps1",$in,(New-Object Text.UTF8Encoding($false))); & "$env:USERPROFILE\.fleet\fleet-input.ps1" -Displays' < "$HERE/fleet-input.ps1" ;;
  *) echo "plataforma desconocida: $P" >&2; exit 2 ;;
esac
