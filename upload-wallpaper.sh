#!/usr/bin/env bash
# upload-wallpaper.sh — sube el wallpaper actual de ESTA máquina a admira.live/control.
#
# Cada equipo lo ejecuta (manual o desde el greeting) y su fondo aparece en el icono
# del ordenador en admira.live/control. Idempotente: si el fondo no cambió, no hace nada.
#
#   bash upload-wallpaper.sh
#
# Requiere: macOS (sips + osascript) y acceso git push al repo (SSH key de csilvasantin).
set -euo pipefail

REPO_SSH="git@github.com:csilvasantin/ConsejoAdmiraNextGame.git"
WORK="$HOME/.cache/admira-wallpaper-repo"

# 1) id de máquina = slug del ComputerName (misma regla que onboard.sh / fleet.json).
NAME="${FLEET_NAME:-$(scutil --get ComputerName 2>/dev/null || hostname -s)}"
ID="$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g;s/^-+//;s/-+$//')"
[ -n "$ID" ] || { echo "[wallpaper] no pude derivar el id de máquina"; exit 1; }

# 2) ruta del wallpaper actual (NSWorkspace; NO System Events, que cuelga por TCC en macOS 26).
SRC="$(osascript -l JavaScript -e 'ObjC.import("AppKit"); ObjC.unwrap($.NSWorkspace.sharedWorkspace.desktopImageURLForScreen($.NSScreen.mainScreen).path)' 2>/dev/null || true)"
[ -n "$SRC" ] && [ -f "$SRC" ] || { echo "[wallpaper] no encuentro el wallpaper actual ($SRC)"; exit 1; }
echo "[wallpaper] $NAME ($ID) ← $SRC"

# 3) repo de trabajo (clónalo poco profundo o actualízalo).
if [ -d "$WORK/.git" ]; then git -C "$WORK" pull --ff-only -q || git -C "$WORK" fetch -q --depth 1 origin main && git -C "$WORK" reset -q --hard origin/main
else git clone -q --depth 1 "$REPO_SSH" "$WORK"; fi
mkdir -p "$WORK/wallpapers/machines"

# 4) thumbnail jpeg (≤480px) en /wallpapers/machines/<id>.jpg.
DEST="$WORK/wallpapers/machines/$ID.jpg"
sips -s format jpeg -Z 480 "$SRC" --out "$DEST" >/dev/null

# 5) commit + push (con reintento ante carrera de varias máquinas).
cd "$WORK"
git add "wallpapers/machines/$ID.jpg"
if git diff --cached --quiet; then echo "[wallpaper] sin cambios (ya estaba subido igual)"; exit 0; fi
git -c commit.gpgsign=false commit -q -m "wallpaper($ID): fondo de $NAME"
for n in 1 2 3; do
  if git pull --rebase -q && git push -q; then echo "[wallpaper] subido → https://www.admira.live/wallpapers/machines/$ID.jpg"; exit 0; fi
  sleep 2
done
echo "[wallpaper] no pude hacer push tras varios intentos"; exit 1
