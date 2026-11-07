#!/bin/bash
# Instala el agente de captura Python en la sesión gráfica del usuario.
#
# Versión empaquetada: CAPTURE_VERSION de fleet-capture.py (BUNDLED, abajo).
#   · misma versión y el plist ya apunta a python3 → no reinicia (idempotente)
#   · versión instalada MAYOR → no se pisa, salvo FLEET_CAPTURE_FORCE=1
#   · sin sesión gui/<uid> → no arranca el agente (salir 2). Lanzarlo por SSH
#     cambiaría a quién atribuye macOS la Grabación de pantalla. No se toca TCC.
#
#   bash deploy-capture-agent.sh local
#   FLEET_CAPTURE_FORCE=1 bash deploy-capture-agent.sh local
set -eu

BUNDLED=3
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$HERE/fleet-capture.py"
GEO="$HERE/display_geometry.py"

install_local() {
  [ -f "$PY" ] || { echo "falta $PY" >&2; exit 1; }
  [ -f "$GEO" ] || { echo "falta $GEO" >&2; exit 1; }
  mkdir -p "$HOME/.fleet/capture-queue" "$HOME/Library/LaunchAgents"

  inst=0
  if [ -f "$HOME/.fleet/fleet-capture.version" ]; then
    inst="$(tr -cd '0-9' < "$HOME/.fleet/fleet-capture.version" | head -c 8)"
    [ -n "$inst" ] || inst=0
  fi
  # Un arreglo a mano puede no haber escrito el fichero de versión. El número
  # dentro del propio python manda si es mayor: no se vuelve a poner el viejo.
  if [ -f "$HOME/.fleet/fleet-capture.py" ]; then
    pyver="$(grep -E '^CAPTURE_VERSION[[:space:]]*=' "$HOME/.fleet/fleet-capture.py" | head -1 | tr -cd '0-9' | head -c 8)"
    if [ -n "${pyver:-}" ] && [ "$pyver" -gt "$inst" ]; then inst="$pyver"; fi
  fi
  if [ "${FLEET_CAPTURE_FORCE:-}" != "1" ] && [ "$inst" -gt "$BUNDLED" ]; then
    echo "agente de captura ya es más nuevo (v$inst > v$BUNDLED); no se pisa"
    exit 0
  fi

  plist="$HOME/Library/LaunchAgents/com.admiranext.fleet-capture.plist"
  same=0
  if [ "${FLEET_CAPTURE_FORCE:-}" != "1" ] && [ "$inst" -eq "$BUNDLED" ] && [ -f "$HOME/.fleet/fleet-capture.py" ] && cmp -s "$PY" "$HOME/.fleet/fleet-capture.py" && [ -f "$plist" ] && grep -q 'fleet-capture.py' "$plist"; then
    same=1
  fi
  if [ "$same" -eq 1 ]; then
    echo "agente de captura ya instalado (v$BUNDLED) en $(hostname)"
    exit 0
  fi

  # El dominio gui existe solo con un usuario con sesión. bootstrap desde un
  # ssh sin esa sesión atribuye el proceso a otro sitio y screencapture falla
  # con rc=1 aunque el permiso ya estuviera concedido a la sesión de antes.
  if ! launchctl print "gui/$(id -u)" >/dev/null 2>&1; then
    echo "sin sesión gráfica gui/$(id -u): no se instala el agente. Entra en el Mac y ejecuta el instalador desde esa sesión. No se ha modificado TCC." >&2
    exit 2
  fi

  cp "$PY" "$HOME/.fleet/fleet-capture.py"
  cp "$GEO" "$HOME/.fleet/display_geometry.py"
  chmod 755 "$HOME/.fleet/fleet-capture.py"
  printf '%s\n' "$BUNDLED" > "$HOME/.fleet/fleet-capture.version"
  # El buzón viejo no se vuelve a usar. Vaciarlo evita que un demonio a medio
  # migrar sirva una petición ya olvidada.
  : > "$HOME/.fleet/capture.req" || true
  rm -f "$HOME/.fleet/capture.paused" "$HOME/.fleet/capture.pause"

  cat > "$plist" <<EOP
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.admiranext.fleet-capture</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string>
    <string>$HOME/.fleet/fleet-capture.py</string>
  </key>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/fleet-capture.log</string>
  <key>StandardOutPath</key><string>/tmp/fleet-capture.log</string>
</dict></plist>
EOP
  launchctl bootout "gui/$(id -u)/com.admiranext.fleet-capture" >/dev/null 2>&1 || true
  launchctl enable "gui/$(id -u)/com.admiranext.fleet-capture" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "agente de captura instalado (v$BUNDLED) en $(hostname)"
}

if [ "${1:-}" = "local" ]; then
  install_local
  exit 0
fi

install_local

for H in macbook-pro-16 macbookpronegro14 macbookair16; do
  echo "=== $H ==="
  DEST="csilvasantin@$H.tail48b61c.ts.net"
  ssh -o ConnectTimeout=8 -o BatchMode=yes "$DEST" 'mkdir -p ~/.fleet/capture-install' || { echo "ssh $H falló"; continue; }
  scp -o ConnectTimeout=8 -o BatchMode=yes "$0" "$PY" "$GEO" "$DEST:.fleet/capture-install/" || { echo "scp $H falló"; continue; }
  ssh -o ConnectTimeout=8 -o BatchMode=yes "$DEST" 'bash ~/.fleet/capture-install/deploy-capture-agent.sh local' || echo "instalación $H falló"
done
echo "=== fin ==="
