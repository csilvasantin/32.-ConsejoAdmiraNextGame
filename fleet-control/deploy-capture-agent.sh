#!/bin/bash
# ============================================================================
# Instala el mini-agente de captura (LaunchAgent) en cada Mac de la flota.
# Corre EN EL MACMINI: instala local + despliega en 16 y 14 por SSH.
# El agente vive en la sesión del usuario (donde AgoraCapture tiene TCC),
# se dispara por WatchPaths cuando llega ~/.fleet/capture.req y deja la
# captura en base64 en ~/.fleet/capture.out.
# ============================================================================

read -r -d '' CAPTURE_SH <<'EOS'
#!/bin/bash
# Demonio de captura: lee un nonce en ~/.fleet/capture.req y deja
# "<nonce>\n<base64>" en ~/.fleet/capture.out (handshake determinista).
D="$HOME/.fleet"; mkdir -p "$D"
P="$HOME/.agents-comms/agora-proof.jpg"
last=""
while true; do
  n=$(cat "$D/capture.req" 2>/dev/null)
  if [ -n "$n" ] && [ "$n" != "$last" ]; then
    last="$n"
    rm -f "$P"
    # despertar la pantalla por si está apagada por inactividad (laptops ociosos)
    caffeinate -u -t 4 >/dev/null 2>&1 &
    /usr/bin/pmset touch >/dev/null 2>&1 || true
    sleep 1
    open -W -n -a "$HOME/Applications/AgoraCapture.app" >/dev/null 2>&1
    for i in 1 2 3 4 5 6; do [ -f "$P" ] && break; sleep 0.4; done
    if [ -f "$P" ] && [ "$(wc -c < "$P" 2>/dev/null)" -gt 1000 ]; then
      /usr/bin/sips -Z 1100 "$P" >/dev/null 2>&1
      { printf '%s\n' "$n"; /usr/bin/base64 < "$P" | tr -d "\n"; } > "$D/capture.out.tmp" && mv "$D/capture.out.tmp" "$D/capture.out"
    else
      printf '%s\nERR_NO_CAPTURE' "$n" > "$D/capture.out"
    fi
  fi
  sleep 0.5
done
EOS

install_local() {
  mkdir -p "$HOME/.fleet" "$HOME/Library/LaunchAgents"
  printf '%s\n' "$CAPTURE_SH" > "$HOME/.fleet/fleet-capture.sh"
  chmod +x "$HOME/.fleet/fleet-capture.sh"
  PL="$HOME/Library/LaunchAgents/com.admiranext.fleet-capture.plist"
  cat > "$PL" <<EOP
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.admiranext.fleet-capture</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$HOME/.fleet/fleet-capture.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/fleet-capture.log</string>
</dict></plist>
EOP
  : > "$HOME/.fleet/capture.req"
  launchctl bootout "gui/$(id -u)/com.admiranext.fleet-capture" 2>/dev/null
  launchctl enable "gui/$(id -u)/com.admiranext.fleet-capture" 2>/dev/null
  launchctl bootstrap "gui/$(id -u)" "$PL" 2>/dev/null
  echo "✅ agente de captura instalado en $(scutil --get ComputerName 2>/dev/null || hostname)"
}

# Modo "solo local" (lo invocan los remotos)
if [ "${1:-}" = "local" ]; then install_local; exit 0; fi

# 1) local (MacMini)
install_local

# 2) remotos: re-ejecuta este mismo script allí en modo local.
# NOTA: el modo local instala el watcher + LaunchAgent, pero NO copia AgoraCapture.app
# (~/Applications/AgoraCapture.app) ni concede el permiso de Grabación de pantalla (TCC):
# la app hay que copiarla aparte y el permiso lo concede el humano una vez por máquina.
for H in macbook-pro-16 macbookpronegro14 macbookair16; do
  echo "=== $H ==="
  ssh -o ConnectTimeout=8 -o BatchMode=yes "csilvasantin@$H.tail48b61c.ts.net" 'bash -s -- local' < "$0" 2>&1 | tail -2 || echo "⚠️ ssh $H falló"
done
echo "=== fin ==="
