#!/usr/bin/env bash
# Cierra solo el perfil del player DS. El escritorio de la sesión queda.
set -u
pkill -f '[a]dmira-signage-kiosk' 2>/dev/null || true
sleep 1
if pgrep -f '[a]dmira-signage-kiosk' >/dev/null; then
  echo "el player DS sigue activo" >&2
  exit 1
fi
echo "DS parado"
