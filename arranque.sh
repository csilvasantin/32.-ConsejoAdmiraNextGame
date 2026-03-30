#!/bin/bash
# arranque.sh — AdmiraNext Team
# Abre Claude (izquierda, oscuro) y Codex (derecha, claro) y los posiciona en mitades del monitor principal
# Uso: bash arranque.sh

set -e

# Obtener dimensiones del monitor principal via Finder
BOUNDS=$(osascript -e 'tell application "Finder" to get bounds of window of desktop' 2>/dev/null || true)

if [ -n "$BOUNDS" ]; then
  SW=$(echo "$BOUNDS" | awk -F',' '{gsub(/ /,"",$3); print $3}')
  SH=$(echo "$BOUNDS" | awk -F',' '{gsub(/ /,"",$4); print $4}')
else
  # Fallback: resolucion tipica MacBook Pro 14"
  SW=1800
  SH=1120
fi

HW=$((SW / 2))

echo "Monitor: ${SW}x${SH}  —  mitad: ${HW}px"
echo ""
echo "  ◀ CLAUDE oscuro ($HW px)  |  CODEX claro ($HW px) ▶"
echo ""

# ── CHROME: tema oscuro para Claude (Default) ────────────────
echo "→ Aplicando tema oscuro en Chrome (Claude / csilvasantin@gmail.com)..."
CHROME_DEFAULT="$HOME/Library/Application Support/Google/Chrome/Default/Preferences"
if [ -f "$CHROME_DEFAULT" ]; then
  python3 -c "
import json, sys
p = '$CHROME_DEFAULT'
with open(p, 'r', encoding='utf-8') as f:
    d = json.load(f)
d.setdefault('browser', {})['theme'] = d['browser'].get('theme', {})
d['browser'].setdefault('color_scheme2', 0)
d['browser']['color_scheme2'] = 2  # 2 = dark
with open(p, 'w', encoding='utf-8') as f:
    json.dump(d, f, separators=(',', ':'))
"
  echo "  ✓ Chrome Default -> dark"
else
  echo "  ⚠ Chrome Default/Preferences no encontrado"
fi

# ── CHROME: tema claro para Codex (Profile 1) ────────────────
echo "→ Aplicando tema claro en Chrome (Codex / csilva@admira.com)..."
CHROME_P1="$HOME/Library/Application Support/Google/Chrome/Profile 1/Preferences"
if [ -f "$CHROME_P1" ]; then
  python3 -c "
import json, sys
p = '$CHROME_P1'
with open(p, 'r', encoding='utf-8') as f:
    d = json.load(f)
d.setdefault('browser', {})['theme'] = d['browser'].get('theme', {})
d['browser'].setdefault('color_scheme2', 0)
d['browser']['color_scheme2'] = 1  # 1 = light
with open(p, 'w', encoding='utf-8') as f:
    json.dump(d, f, separators=(',', ':'))
"
  echo "  ✓ Chrome Profile 1 -> light"
else
  echo "  ⚠ Chrome Profile 1/Preferences no encontrado"
fi

sleep 0.3

# ── CLAUDE CODE: Terminal Pro (oscuro), mitad izquierda ──────
echo "→ Abriendo Claude Code en la mitad izquierda (perfil oscuro Pro)..."
osascript <<EOF
tell application "Terminal"
  activate
  set claudeWin to do script "claude"
  delay 1.5
  set current settings of front window to settings set "Pro"
  set bounds of front window to {0, 25, ${HW}, ${SH}}
end tell
EOF

sleep 0.8

# ── CODEX: Terminal Basic (claro), mitad derecha ─────────────
echo "→ Abriendo Codex en la mitad derecha (perfil claro Basic)..."
osascript <<EOF
tell application "Terminal"
  activate
  set codexWin to do script "codex"
  delay 1.5
  set current settings of front window to settings set "Basic"
  set bounds of front window to {${HW}, 25, ${SW}, ${SH}}
end tell
EOF

echo ""
echo "✓ Workspace listo"
echo "  ┌─────────────────┬─────────────────┐"
echo "  │   CLAUDE CODE   │      CODEX      │"
echo "  │  oscuro / Pro   │  claro / Basic  │"
echo "  │   (izquierda)   │    (derecha)    │"
echo "  └─────────────────┴─────────────────┘"
echo ""
echo "  Chrome: Default=dark  |  Profile 1=light"
echo "  (recarga Chrome si ya estaba abierto)"
