#!/bin/bash
# Instala el agente de captura Python en la sesión gráfica del usuario.
#
# Versión empaquetada: CAPTURE_VERSION de fleet-capture.py (BUNDLED, abajo).
#   · misma versión, el .py coincide y el plist es XML válido que apunta a
#     python3 → no reinicia (idempotente). Un plist roto no cuenta como instalado.
#   · versión instalada MAYOR → no se pisa, salvo FLEET_CAPTURE_FORCE=1
#   · el marcador fleet-capture.version se escribe SOLO después de que
#     launchctl bootstrap haya devuelto 0. Si el arranque falla, se deja el
#     plist y el script anteriores y se vuelve a cargar ese servicio.
#   · sin sesión gui/<uid> → no arranca el agente (salir 2). No se toca TCC.
#   · un fichero uchg se detecta y no se le quita el flag.
#
#   bash deploy-capture-agent.sh local
#   FLEET_CAPTURE_FORCE=1 bash deploy-capture-agent.sh local
set -eu

BUNDLED=4
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$HERE/fleet-capture.py"
GEO="$HERE/display_geometry.py"

# macOS lista uchg en ls -lO. No llama a chflags: quitar el flag lo hace la persona.
immutable() {
  local f="$1" listing
  [ -e "$f" ] || return 1
  listing="$(ls -lO "$f" 2>/dev/null || true)"
  printf '%s\n' "$listing" | grep -q 'uchg'
}

xml_escape() {
  local s="$1"
  s=${s//&/&amp;}
  s=${s//</&lt;}
  s=${s//>/&gt;}
  printf '%s' "$s"
}

validate_plist() {
  python3 - "$1" <<'PY'
import plistlib, sys
path = sys.argv[1]
with open(path, "rb") as fh:
    raw = fh.read()
if b"</array>" not in raw:
    sys.stderr.write("plist sin </array>\n")
    sys.exit(1)
data = plistlib.load(open(path, "rb"))
args = data.get("ProgramArguments")
if not isinstance(args, list) or len(args) != 2 or not all(isinstance(x, str) for x in args):
    sys.exit(1)
if args[0] != "/usr/bin/python3" or not args[1].endswith("/.fleet/fleet-capture.py"):
    sys.exit(1)
if data.get("Label") != "com.admiranext.fleet-capture":
    sys.exit(1)
if data.get("RunAtLoad") is not True or data.get("KeepAlive") is not True:
    sys.exit(1)
PY
}

install_local() {
  [ -f "$PY" ] || { echo "falta $PY" >&2; exit 1; }
  [ -f "$GEO" ] || { echo "falta $GEO" >&2; exit 1; }
  mkdir -p "$HOME/.fleet/capture-queue" "$HOME/Library/LaunchAgents"

  local old_sh="$HOME/.fleet/fleet-capture.sh"
  if immutable "$old_sh"; then
    echo "preflight: $old_sh está uchg (inmutable). No se modifica y no se quita el flag." >&2
  fi

  local inst=0 pyver=""
  if [ -f "$HOME/.fleet/fleet-capture.version" ]; then
    inst="$(tr -cd '0-9' < "$HOME/.fleet/fleet-capture.version" | head -c 8)"
    [ -n "$inst" ] || inst=0
  fi
  # Un arreglo a mano puede no haber escrito el fichero de versión. El número
  # dentro del propio python manda si es mayor: no se vuelve a poner el viejo.
  if [ -f "$HOME/.fleet/fleet-capture.py" ]; then
    pyver="$(grep -E '^CAPTURE_VERSION[[:space:]]*=' "$HOME/.fleet/fleet-capture.py" | head -1 | tr -cd '0-9' | head -c 8 || true)"
    if [ -n "${pyver:-}" ] && [ "$pyver" -gt "$inst" ]; then inst="$pyver"; fi
  fi
  if [ "${FLEET_CAPTURE_FORCE:-}" != "1" ] && [ "$inst" -gt "$BUNDLED" ]; then
    echo "agente de captura ya es más nuevo (v$inst > v$BUNDLED); no se pisa"
    exit 0
  fi

  local plist="$HOME/Library/LaunchAgents/com.admiranext.fleet-capture.plist"
  local domain="gui/$(id -u)"
  local live_py="$HOME/.fleet/fleet-capture.py"
  local live_geo="$HOME/.fleet/display_geometry.py"
  local version_file="$HOME/.fleet/fleet-capture.version"

  if [ "${FLEET_CAPTURE_FORCE:-}" != "1" ] && [ "$inst" -eq "$BUNDLED" ] && [ -f "$live_py" ] && cmp -s "$PY" "$live_py" && [ -f "$plist" ] && validate_plist "$plist" 2>/dev/null; then
    echo "agente de captura ya instalado (v$BUNDLED) en $(hostname)"
    exit 0
  fi

  # El dominio gui existe solo con un usuario con sesión. bootstrap desde un
  # ssh sin esa sesión atribuye el proceso a otro sitio y screencapture falla
  # con rc=1 aunque el permiso ya estuviera concedido a la sesión de antes.
  if ! launchctl print "$domain" >/dev/null 2>&1; then
    echo "sin sesión gráfica $domain: no se instala el agente. Entra en el Mac y ejecuta el instalador desde esa sesión. No se ha modificado TCC." >&2
    exit 2
  fi

  # No sustituir un destino inmutable. El flag no se quita desde aquí.
  local blocked=""
  for f in "$plist" "$live_py" "$live_geo" "$version_file"; do
    if immutable "$f"; then blocked="${blocked} $f"; fi
  done
  if [ -n "$blocked" ]; then
    echo "preflight: no se instala; estos ficheros están uchg y no se les quita el flag:${blocked}" >&2
    exit 3
  fi

  local staged py_esc
  staged="$(mktemp "$HOME/Library/LaunchAgents/com.admiranext.fleet-capture.plist.XXXXXX")"
  py_esc="$(xml_escape "$live_py")"
  cat > "$staged" <<EOP
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.admiranext.fleet-capture</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string>
    <string>${py_esc}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/fleet-capture.log</string>
  <key>StandardOutPath</key><string>/tmp/fleet-capture.log</string>
</dict></plist>
EOP
  if ! validate_plist "$staged"; then
    rm -f "$staged"
    echo "el plist generado no es válido; no se ha tocado el servicio ni el marcador de versión" >&2
    exit 1
  fi

  local bak
  bak="$(mktemp -d "$HOME/.fleet/capture-rollback.XXXXXX")"
  [ -f "$plist" ] && cp "$plist" "$bak/plist"
  [ -f "$live_py" ] && cp "$live_py" "$bak/py"
  [ -f "$live_geo" ] && cp "$live_geo" "$bak/geo"
  [ -f "$version_file" ] && cp "$version_file" "$bak/version"

  restore_previous() {
    if [ -f "$bak/plist" ]; then cp "$bak/plist" "$plist"; else rm -f "$plist"; fi
    if [ -f "$bak/py" ]; then cp "$bak/py" "$live_py"; else rm -f "$live_py"; fi
    if [ -f "$bak/geo" ]; then cp "$bak/geo" "$live_geo"; else rm -f "$live_geo"; fi
    if [ -f "$bak/version" ]; then cp "$bak/version" "$version_file"; else rm -f "$version_file"; fi
    if [ -f "$bak/plist" ]; then
      launchctl bootstrap "$domain" "$plist" >/dev/null 2>&1 || echo "no se pudo volver a cargar el agente anterior" >&2
    fi
  }

  cp "$PY" "$live_py"
  cp "$GEO" "$live_geo"
  chmod 755 "$live_py"
  mv "$staged" "$plist"

  launchctl bootout "$domain/com.admiranext.fleet-capture" >/dev/null 2>&1 || true
  launchctl enable "$domain/com.admiranext.fleet-capture" >/dev/null 2>&1 || true
  if ! launchctl bootstrap "$domain" "$plist"; then
    echo "bootstrap falló: se restaura el plist y el script anteriores. No se escribe el marcador de versión." >&2
    restore_previous
    exit 1
  fi

  # Solo un arranque aceptado fija la versión. Hasta aquí un fallo no la deja escrita.
  printf '%s\n' "$BUNDLED" > "$version_file"
  : > "$HOME/.fleet/capture.req" || true
  rm -f "$HOME/.fleet/capture.paused" "$HOME/.fleet/capture.pause"
  rm -rf "$bak"
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
