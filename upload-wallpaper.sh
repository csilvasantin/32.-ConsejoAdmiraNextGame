#!/usr/bin/env bash
# upload-wallpaper.sh — sube el wallpaper actual de ESTA máquina a admira.live/control.
#
# Cada equipo lo ejecuta (manual, desde el greeting o desde un LaunchAgent al cambiar el
# fondo). Su fondo aparece como icono del ordenador en admira.live/control. IDEMPOTENTE:
# si el fondo no cambió, no hace nada (guard por hash).
#
# Publica el thumbnail en wallpapers/machines/<id>.jpg del repo 32.-ConsejoAdmiraNextGame:
#   - por SSH (git push) si la máquina tiene clave SSH autorizada, o
#   - por gh (HTTPS) si no (fallback — p.ej. MacBookAirRosa).
# admira.live AUTO-DESPLIEGA desde main (CF Pages git-integration), así que basta con
# COMMITEAR: la miniatura aparece sola en ~1-2 min.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

GH_REPO="csilvasantin/32.-ConsejoAdmiraNextGame"
REPO_SSH="git@github.com:csilvasantin/ConsejoAdmiraNextGame.git"   # redirige al 32.-
WORK="$HOME/.cache/admira-wallpaper-repo"
STATE="$HOME/.fleet"; mkdir -p "$STATE"

# 1) id de máquina = slug del ComputerName (misma regla que fleet.json / el panel).
NAME="${FLEET_NAME:-$(scutil --get ComputerName 2>/dev/null || hostname -s)}"
ID="$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g;s/^-+//;s/-+$//')"
[ -n "$ID" ] || { echo "[wallpaper] no pude derivar el id de máquina"; exit 1; }

# 2) ruta del wallpaper actual (NSWorkspace; NO System Events, que cuelga por TCC en macOS 26).
SRC="$(osascript -l JavaScript -e 'ObjC.import("AppKit"); ObjC.unwrap($.NSWorkspace.sharedWorkspace.desktopImageURLForScreen($.NSScreen.mainScreen).path)' 2>/dev/null || true)"
[ -n "$SRC" ] && [ -f "$SRC" ] || { echo "[wallpaper] no encuentro el wallpaper actual ($SRC)"; exit 1; }

# 3) thumbnail jpeg (≤480px) a un temporal.
TMP="$(mktemp -t wallpaper).jpg"; trap 'rm -f "$TMP"' EXIT
sips -s format jpeg -Z 480 "$SRC" --out "$TMP" >/dev/null

# 4) guard por hash: si no cambió respecto a lo último subido, salir sin tocar nada.
HASH="$(shasum -a 256 "$TMP" | awk '{print $1}')"
HFILE="$STATE/wallpaper-$ID.sha"
if [ -f "$HFILE" ] && [ "$(cat "$HFILE" 2>/dev/null)" = "$HASH" ]; then
  echo "[wallpaper] sin cambios ($ID) — nada que subir"; exit 0
fi
echo "[wallpaper] $NAME ($ID) ← $SRC"
DEST_PATH="wallpapers/machines/$ID.jpg"

publish_gh() {   # fallback HTTPS: commit directo por API (crea o actualiza el fichero).
  local b64 sha; b64="$(base64 < "$TMP" | tr -d '\n')"
  sha="$(gh api "repos/$GH_REPO/contents/$DEST_PATH" --jq '.sha' 2>/dev/null || true)"
  local args=(--method PUT "repos/$GH_REPO/contents/$DEST_PATH"
              -f "message=wallpaper($ID): fondo de $NAME" -f "content=$b64" -f "branch=main")
  [ -n "$sha" ] && args+=(-f "sha=$sha")
  gh api "${args[@]}" --jq '.commit.sha' >/dev/null
}
publish_ssh() {  # camino original por git+SSH.
  if [ -d "$WORK/.git" ]; then git -C "$WORK" fetch -q --depth 1 origin main && git -C "$WORK" reset -q --hard origin/main
  else git clone -q --depth 1 "$REPO_SSH" "$WORK"; fi
  mkdir -p "$WORK/wallpapers/machines"; cp "$TMP" "$WORK/$DEST_PATH"
  ( cd "$WORK" && git add "$DEST_PATH" && { git diff --cached --quiet && exit 0
      git -c commit.gpgsign=false commit -q -m "wallpaper($ID): fondo de $NAME"
      for n in 1 2 3; do git pull --rebase -q && git push -q && exit 0; sleep 2; done; exit 1; } )
}

# 5) publicar: SSH si autentica; si no, gh. admira.live auto-despliega desde main.
if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 -T git@github.com 2>&1 | grep -qi "successfully authenticated"; then
  publish_ssh
else
  publish_gh
fi

printf '%s' "$HASH" > "$HFILE"
echo "[wallpaper] subido → https://www.admira.live/wallpapers/machines/$ID.jpg (auto-deploy ~1-2 min)"
