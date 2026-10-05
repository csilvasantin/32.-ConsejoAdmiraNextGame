#!/usr/bin/env bash
# Abre el player DS a pantalla completa en la sesión ya preparada por fleet-sesh
# (csilva, DISPLAY=:2). No toca el Chromium de bitsatoms ni el perfil normal.
set -u
URL="${SIGN_URL:-https://www.admira.tv/canal?screen=dgx-spark&machine=dgx-spark&embed=mupi&chrome=0&ontop=1}"
# Snap solo deja escribir el perfil dentro de su directorio common.
PROFILE="${HOME}/snap/chromium/common/admira-signage-kiosk"
mkdir -p "$PROFILE"
pkill -f '[a]dmira-signage-kiosk' 2>/dev/null || true
sleep 1
CH="$(command -v chromium-browser || command -v chromium || true)"
if [ -z "$CH" ] && [ -x /snap/bin/chromium ]; then CH=/snap/bin/chromium; fi
if [ -z "$CH" ]; then
  echo "no hay chromium en la sesión de $(id -un)" >&2
  exit 127
fi
setsid "$CH" --user-data-dir="$PROFILE" --kiosk --start-fullscreen \
  --noerrdialogs --disable-infobars --no-first-run \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  "$URL" >/tmp/admira-ds-open.log 2>&1 < /dev/null &
sleep 2
if ! pgrep -f '[a]dmira-signage-kiosk' >/dev/null; then
  echo "DS no arrancó en ${DISPLAY:-sin-display}" >&2
  exit 1
fi
# Chromium en este Spark abre la ventana sin cubrir el HDMI. wmctrl la pone
# a 3840×2160, que es la única salida de DISPLAY=:2.
if command -v wmctrl >/dev/null 2>&1; then
  wmctrl -r "Digital Signage" -b add,fullscreen || true
fi
echo "DS fullscreen en ${DISPLAY:-?} → ${URL}"
