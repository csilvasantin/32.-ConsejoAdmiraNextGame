#!/bin/sh
# Escribe vista-previa/quien.json con la identidad de ESTA máquina, para que el
# tablero «¿En qué estamos?» muestre quién eres dentro del panel de Preview.
# Portable macOS/Linux. En el skill /en-que-estamos se ejecuta antes de servir.
DIR="$(cd "$(dirname "$0")" && pwd)"
NAME="$( (scutil --get ComputerName 2>/dev/null) || hostname 2>/dev/null || echo desconocido )"
HOST="$(hostname 2>/dev/null || echo '?')"
case "$(uname -s 2>/dev/null)" in Darwin) OS=macos ;; Linux) OS=linux ;; *) OS=other ;; esac
ID="$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//;s/-*$//')"
cat > "$DIR/quien.json" <<EOF
{ "maquina": "$ID", "id": "$ID", "nombre": "$NAME", "hostname": "$HOST", "os": "$OS" }
EOF
echo "quien.json → $NAME ($OS)"
