#!/usr/bin/env bash
# verifica-espejo.sh — ¿sirve admira.live las MISMAS páginas que yokup.com?
#
# No compara capturas ni «parece igual»: baja las dos páginas de PRODUCCIÓN, les
# quita las cinco divergencias declaradas en tools/sync-yokup.sh y compara el
# resto byte a byte. Si las huellas coinciden, las dos webs sirven exactamente la
# misma página. Si no, dice en qué fichero se han separado.
#
#   uso:  tools/verifica-espejo.sh
#
set -uo pipefail

ORIG="https://www.yokup.com"
ESPEJO="https://www.admira.live"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fallos=0

# Deshace las divergencias para poder comparar el fondo, no la forma:
#  · el sello de release de cada casa (admiranext-version / yokup-espejo)
#  · el aviso de espejo
#  · el <script> de la puerta (acceso.js allí, acceso-espejo.js aquí: mismo login, flujo
#    de ventana en vez de redirección)
#  · los enlaces absolutos al original
#  · el guardián de versión (/__yokup-gate ↔ /version.json)
#  · los iconos: el gate de yokup inyecta los suyos en cada página y admira.live
#    tiene los propios. Es el escudo de cada casa, no la página.
normaliza() {
  # Los sellos se quitan EN LÍNEA: deploy.sh mete el suyo pegado al <head> y borrar
  # la línea entera se llevaría el <head> por delante. El ?v= de los assets también
  # cae: cada casa los sella con su propia versión (el gate de yokup los quita, y
  # deploy.sh los reestampa), y eso no es la página, es el envoltorio.
  sed -E \
    -e 's#<meta name="admiranext-version"[^>]*>##g' \
    -e 's#<meta name="yokup-espejo"[^>]*>##g' \
    -e '/id="yk-espejo-aviso"/d' \
    -e 's#<link[^>]*rel="(icon|apple-touch-icon)"[^>]*>##g' \
    -e '/<script src="\/acceso(-espejo)?\.js/d' \
    -e 's#https://www\.yokup\.com/#/#g' \
    -e 's#/version\.json\?frame=#/__yokup-gate?frame=#g' \
    -e 's#"/informes-flota"#"/informes"#g' \
    -e 's#\?v=[^"'\''<> ]*##g' \
    -e 's#<!-- Cloudflare Pages Analytics -->.*<!-- Cloudflare Pages Analytics -->##g' \
    -e 's#<a [^>]*__cf_email__[^>]*>\[email[^<]*</a>#EMAIL#g' \
    -e 's#<a [^>]*/cdn-cgi/l/email-protection[^>]*>[^<]*</a>#EMAIL#g' \
    -e 's#[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}#EMAIL#g' \
    -e 's#<script data-cfasync="false" src="/cdn-cgi/scripts/[^"]*email-decode[^"]*"></script>##g' \
    -e '/^[[:space:]]*$/d'
}

compara() {
  # compara <ruta>            <etiqueta>          → misma ruta en las dos webs
  # compara <ruta-allí> <ruta-aquí> <etiqueta>    → la página vive aquí con otro nombre
  local alla="$1" aca="$1" etiqueta="$2"
  if [ "$#" -eq 3 ]; then aca="$2"; etiqueta="$3"; fi
  curl -fsS --max-time 45 "$ORIG$alla"  | normaliza > "$TMP/orig"   || { echo "✗ $etiqueta · no baja de yokup.com"; fallos=$((fallos+1)); return; }
  curl -fsS --max-time 45 "$ESPEJO$aca" | normaliza > "$TMP/espejo" || { echo "✗ $etiqueta · no baja de admira.live"; fallos=$((fallos+1)); return; }
  local a b
  a="$(shasum -a 256 < "$TMP/orig"   | cut -c1-12)"
  b="$(shasum -a 256 < "$TMP/espejo" | cut -c1-12)"
  if [ "$a" = "$b" ]; then
    printf "✓ %-28s idénticos (%s) · %s líneas\n" "$etiqueta" "$a" "$(wc -l < "$TMP/orig" | tr -d ' ')"
  else
    printf "✗ %-28s DISTINTOS · yokup %s vs admira.live %s\n" "$etiqueta" "$a" "$b"
    diff "$TMP/orig" "$TMP/espejo" | head -12
    fallos=$((fallos+1))
  fi
}

echo "· original: $ORIG   · espejo: $ESPEJO"
# Las páginas que aquí viven con otro nombre se comparan contra el suyo de allí: el
# contenido tiene que ser el mismo aunque la ruta no lo sea.
compara "/highscore"                    "highscore"
compara "/highscoreDetail"              "highscoreDetail"
compara "/yk-frame.js"                  "yk-frame.js"
compara "/yk-frame.css"                 "yk-frame.css"
compara "/highscore-race.js"            "highscore-race.js"
compara "/highscore-detail.js"          "highscore-detail.js"
compara "/highscore-daily-record.js"    "highscore-daily-record.js"
compara "/highscore-desktop-app.js"     "highscore-desktop-app.js"
compara "/asistencia"                   "asistencia"
compara "/informes" "/informes-flota"   "informes → informes-flota"
compara "/yk-informes-view.js"          "yk-informes-view.js"
compara "/informe-pdf.js"               "informe-pdf.js"
compara "/equipo"                       "equipo"
compara "/yk-misiones.js"               "yk-misiones.js"
compara "/yk-decisions.js"              "yk-decisions.js"
# Tramo 3 · 17-09-2026 · FLT-100549: Consumos y el tablero de trabajo.
compara "/consumos"                     "consumos"
compara "/decisiones"                   "decisiones"
compara "/tareas"                       "tareas"
compara "/misiones"                     "misiones"
compara "/notificaciones"               "notificaciones"
compara "/yk-cabezal.js"                "yk-cabezal.js"
compara "/yk-adjuntos.js"               "yk-adjuntos.js"
compara "/yk-mission-duplicates.js"     "yk-mission-duplicates.js"
compara "/yk-decisiones-grid.js"        "yk-decisiones-grid.js"
compara "/yk-tareas-columns.js"         "yk-tareas-columns.js"
# Tramo 4 · 17-09-2026 · FLT-100551. status es (propia) y app no viaja: no se comparan como espejo.
compara "/objetivos"                   "objetivos"
compara "/normativa"                   "normativa"
compara "/asignaciones/"               "asignaciones/"
compara "/admira-live"                 "admira-live"
compara "/incidencias"                 "incidencias"
compara "/dashboard"                   "dashboard"
compara "/yk-objetivos-grid.js"        "yk-objetivos-grid.js"
compara "/agent-control.js"            "agent-control.js"
compara "/agent-detail.js"             "agent-detail.js"
compara "/presence-groups.js"          "presence-groups.js"

# Y que los dos miran la MISMA fuente de datos, que es lo que hace que enseñen lo
# mismo: el marcador del día sale del mismo worker para los dos orígenes.
dia_org="$(curl -fsS --max-time 30 -H "Origin: $ORIG"   https://api.yokup.com/highscore/daily | sed -E 's/.*"day":"([^"]+)".*/\1/')"
dia_esp="$(curl -fsS --max-time 30 -H "Origin: $ESPEJO" https://api.yokup.com/highscore/daily | sed -E 's/.*"day":"([^"]+)".*/\1/')"
if [ -n "$dia_org" ] && [ "$dia_org" = "$dia_esp" ]; then
  echo "✓ api.yokup.com/highscore/daily responde a los dos orígenes · día $dia_org"
else
  echo "✗ el marcador no responde igual a los dos orígenes ($dia_org / $dia_esp)"; fallos=$((fallos+1))
fi

echo
[ "$fallos" -eq 0 ] && echo "✓ las dos webs sirven las mismas páginas" || echo "✗ $fallos comprobación(es) en rojo"
exit "$fallos"
