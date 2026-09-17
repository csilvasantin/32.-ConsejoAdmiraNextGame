#!/usr/bin/env bash
# sync-highscore.sh — trae el Highscore de yokup.com a www.admira.live.
#
# Fase 1 de la migración de yokup.com → admira.live: admira.live sirve EL MISMO
# highscore que yokup.com, en las MISMAS rutas (/highscore, /highscoreDetail),
# leyendo los mismos endpoints públicos de api.yokup.com. Así se puede comparar
# pantalla a pantalla antes de apagar la copia de yokup.
#
# No es una reescritura: es un espejo reproducible. Se vuelve a lanzar cuando el
# original cambie y el diff canta lo que se ha movido. Las únicas diferencias
# respecto al original están declaradas abajo (DIVERGENCIAS) y se aplican aquí,
# nunca a mano sobre la copia.
#
#   uso:  tools/sync-highscore.sh [ruta/a/yokup-site]
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$REPO/../yokup/yokup-site}"

[ -f "$SRC/highscore.html" ] || { echo "✗ no encuentro highscore.html en $SRC"; exit 1; }
SRC="$(cd "$SRC" && pwd)"

# Ficheros que componen la página, tal y como los pide el <head> del original.
FICHEROS=(
  highscore.html
  highscoreDetail.html
  highscore-daily-record.js
  highscore-desktop-app.js
  highscore-race.js
  highscore-race-bonus.js
  highscore-work-clock.js
  highscore-runner-state.css
  highscore-detail.js
  highscore-detail-page.js
  yk-frame.css
  yk-frame.js
  yk-agent-identity.js
  yk-avatar.js
  img/highscore-podio-pixel.png
  img/highscore-podio-pixel.webp
  img/highscore-presite-decathlon.webp
  media/trackfield-1722.mp3
)

echo "· origen : $SRC"
echo "· destino: $REPO"

for f in "${FICHEROS[@]}"; do
  [ -f "$SRC/$f" ] || { echo "✗ falta en el origen: $f"; exit 1; }
  mkdir -p "$REPO/$(dirname "$f")"
  cp "$SRC/$f" "$REPO/$f"
done
mkdir -p "$REPO/avatars"
rsync -a --delete "$SRC/avatars/" "$REPO/avatars/"

# ── DIVERGENCIAS respecto al original ────────────────────────────────────────
# 1) Sin puerta. En yokup la página va detrás de /acceso.js (login Google +
#    cookie de sesión de api.yokup.com). Esa cookie es de yokup.com y el CORS con
#    credenciales sólo abraza a www.yokup.com: desde admira.live no se puede
#    tener la misma sesión sin tocar el worker. Los datos del marcador
#    (/highscore/daily, /highscore/history, /highscore/active-work, /projects,
#    /fleet/turnos, /decisions) son PÚBLICOS y responden con CORS abierto, así
#    que el espejo se ve entero sin login. Lo que sí pide sesión (/tasks/all y
#    las acciones de escritura) fallará en silencio con 401 → el aviso de la
#    divergencia 5 lo dice en voz alta en vez de disimularlo.
for f in highscore.html highscoreDetail.html; do
  perl -0pi -e 's{^\s*<script src="/acceso\.js[^"]*"[^>]*>\s*</script>\s*\n}{}mg' "$REPO/$f"
done

# 2) El menú del marco (yk-frame.js) enlaza al resto de páginas de yokup, que
#    todavía NO están migradas. En el espejo apuntan al original absoluto para
#    que no queden en 404. Cuando cada página se mude, se saca de esta lista.
PENDIENTES='dashboard|objetivos|decisiones|misiones|tareas|incidencias|informes|notificaciones|equipo|status|asistencia|app|admira-live|asignaciones|normativa'
perl -pi -e "s{\"/($PENDIENTES)\"}{\"https://www.yokup.com/\$1\"}g" "$REPO/yk-frame.js"
perl -pi -e "s{href=\"/($PENDIENTES)\"}{href=\"https://www.yokup.com/\$1\"}g" \
  "$REPO/highscore.html" "$REPO/highscoreDetail.html"

# 3) El espejo se identifica. Un sello en el <head> con el commit de origen para
#    saber de qué versión de yokup viene esta copia, y un aviso visible de que
#    aquí se mira pero no se toca.
ORIGEN_COMMIT="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo desconocido)"
SELLO="$(date +%d.%m.%Y' '%H:%M)"
for f in highscore.html highscoreDetail.html; do
  perl -0pi -e "s{<head>}{<head>\n<meta name=\"yokup-espejo\" content=\"origen www.yokup.com · commit $ORIGEN_COMMIT · sincronizado $SELLO\">}" "$REPO/$f"
done

# 4) El sello del marco. yk-frame.js pregunta cada pocos segundos por
#    /__yokup-gate, que sirve el Worker yokup-site-gate y aquí no existe: eran
#    404 en bucle y un pie de página sin versión. En el espejo pregunta por el
#    version.json que genera deploy.sh, que trae el mismo campo `version`: el
#    marco enseña el sello de admira.live, que es el que manda en esta casa.
perl -pi -e 's{"/__yokup-gate\?frame="}{"/version.json?frame="}g' "$REPO/yk-frame.js"

# 5) Y lo dice a la cara, no sólo en un meta: una tira arriba avisa de que esto es
#    el espejo y de qué no funciona aquí por no tener sesión de Yokup. Un fallo
#    callado (un botón que no hace nada) sería peor que no traer la página.
AVISO='<div id="yk-espejo-aviso" style="background:#0a1620;border-bottom:1px solid rgba(120,243,255,.30);color:#75aab9;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:8px 14px">Espejo en <b style="color:#78f3ff">admira.live</b> del Highscore de Yokup · mismos datos en vivo de <code>api.yokup.com</code>. Aquí se <b>mira</b>: sin sesión de Yokup, lo que pide login (tareas, tickets y mandar órdenes al CLI) no responde. Para eso, <a href="https://www.yokup.com/highscore" style="color:#78f3ff">el original</a>.</div>'
for f in highscore.html highscoreDetail.html; do
  perl -0pi -e "s{(<body[^>]*>)}{\$1\n$AVISO}" "$REPO/$f"
done

cat > "$REPO/highscore-espejo.json" <<JSON
{
  "origen": "https://www.yokup.com/highscore",
  "origen_repo": "yokup/yokup-site",
  "origen_commit": "$ORIGEN_COMMIT",
  "sincronizado": "$SELLO",
  "fase": "1 · espejo de lectura en admira.live",
  "sin_sesion": ["/tasks/all", "acciones de escritura del CLI y del control de agentes"],
  "paginas_pendientes_de_migrar": "$PENDIENTES"
}
JSON

echo "✓ espejo actualizado desde $ORIGEN_COMMIT ($SELLO)"
echo "  comprueba:  node --test marcador-flota.test.mjs highscore-espejo.test.mjs"
