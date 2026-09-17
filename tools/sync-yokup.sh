#!/usr/bin/env bash
# sync-yokup.sh — trae a www.admira.live las páginas ya mudadas de yokup.com.
#
# Migración de yokup.com → admira.live (Carlos, 17-09-2026): admira.live sirve LAS
# MISMAS páginas, en LAS MISMAS rutas, leyendo los mismos datos de api.yokup.com, para
# poder compararlas pantalla a pantalla antes de apagar las de yokup.
#
# No es una reescritura: es un espejo reproducible. Qué páginas viajan y con qué
# ficheros está en tools/migracion-yokup.txt; mudar una es añadir su línea ahí y
# relanzar esto. Las diferencias con el original son SIEMPRE las cinco de abajo y las
# aplica el guion, nunca una mano sobre la copia.
#
#   uso:  tools/sync-yokup.sh [ruta/a/yokup-site]
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$REPO/../yokup/yokup-site}"
MANIFIESTO="$REPO/tools/migracion-yokup.txt"

[ -f "$MANIFIESTO" ] || { echo "✗ falta el manifiesto $MANIFIESTO"; exit 1; }
[ -f "$SRC/highscore.html" ] || { echo "✗ no encuentro yokup-site en $SRC"; exit 1; }
SRC="$(cd "$SRC" && pwd)"

TODAS="$(sed -n 's/^TODAS *= *//p' "$MANIFIESTO" | head -1)"
[ -n "$TODAS" ] || { echo "✗ el manifiesto no declara TODAS"; exit 1; }
# Cada línea empieza por la página de yokup y, opcionalmente, «como <otra-ruta>» cuando
# aquí tiene que vivir con otro nombre porque el suyo ya está cogido por una página propia
# de admira.live que hace otra cosa (informes → informes-flota).
MIGRADAS="$(grep -v '^ *#' "$MANIFIESTO" | grep '|' | cut -d'|' -f1 | awk '{print $1}' | tr '\n' ' ')"
RENOMBRES="$(grep -v '^ *#' "$MANIFIESTO" | grep '|' | cut -d'|' -f1 | awk '/ como /{print $1":"$3}' | tr '\n' ' ')"

# Pendientes = todas menos las que ya viven aquí. De aquí sale la reescritura de enlaces:
# lo mudado se enlaza en relativo (resuelve en admira.live) y lo que sigue en yokup se
# enlaza absoluto al original, para que nada quede en 404 durante la mudanza.
PENDIENTES=""
for p in $TODAS; do
  case " $MIGRADAS " in *" $p "*) ;; *) PENDIENTES="${PENDIENTES:+$PENDIENTES|}$p" ;; esac
done

echo "· origen : $SRC"
echo "· destino: $REPO"
echo "· mudadas: $MIGRADAS"
echo "· siguen en yokup: ${PENDIENTES//|/ }"

# ── Copia ────────────────────────────────────────────────────────────────────
HTMLS=""
while IFS= read -r linea; do
  case "$linea" in \#*|"") continue ;; esac
  case "$linea" in *"|"*) ;; *) continue ;; esac
  # «(propia)» = esa página de yokup NO se copia porque admira.live ya tiene la suya,
  # que hace ese trabajo y además lee la API de Yokup por su cuenta (dashboard, status,
  # informes). Cuenta como mudada: sus enlaces dejan de apuntar a yokup y llevan a la
  # de casa. Lo que la de yokup enseñaba y la de aquí no, se anota antes de darla por
  # migrada; no se pierde en silencio.
  case "$linea" in *"(propia)"*) continue ;; esac
  clave="$(echo "$linea" | cut -d'|' -f1 | awk '{print $1}')"
  comose="$(echo "$linea" | cut -d'|' -f1 | awk '/ como /{print $3}')"
  for f in $(echo "$linea" | cut -d'|' -f2); do
    [ -f "$SRC/$f" ] || { echo "✗ falta en el origen: $f"; exit 1; }
    destino="$f"
    [ -n "$comose" ] && [ "$f" = "$clave.html" ] && destino="$comose.html"
    mkdir -p "$REPO/$(dirname "$destino")"
    cp "$SRC/$f" "$REPO/$destino"
    case "$destino" in *.html) HTMLS="$HTMLS $destino" ;; esac
  done
done < "$MANIFIESTO"
mkdir -p "$REPO/avatars"
rsync -a --delete "$SRC/avatars/" "$REPO/avatars/"

# ── DIVERGENCIAS respecto al original ────────────────────────────────────────
# 1) Sin puerta. En yokup las páginas van detrás de /acceso.js (login Google + cookie
#    de sesión de api.yokup.com). Esa cookie es de yokup.com y el CORS con credenciales
#    sólo abraza a www.yokup.com: desde admira.live no se puede tener la misma sesión
#    sin tocar el worker. Lo que se lee sin sesión se ve entero; lo que no, da 401 y lo
#    canta el aviso de la divergencia 5 en vez de fallar callado.
for f in $HTMLS; do
  perl -0pi -e 's{^\s*<script src="/acceso\.js[^"]*"[^>]*>\s*</script>\s*\n}{}mg' "$REPO/$f"
done

# 2) Enlaces a lo que todavía no se ha mudado → al original absoluto.
if [ -n "$PENDIENTES" ]; then
  perl -pi -e "s{\"/($PENDIENTES)\"}{\"https://www.yokup.com/\$1\"}g" "$REPO/yk-frame.js"
  for f in $HTMLS; do
    perl -pi -e "s{href=\"/($PENDIENTES)\"}{href=\"https://www.yokup.com/\$1\"}g" "$REPO/$f"
  done
fi

# 2b) Las que viven aquí con otro nombre: sus enlaces se reescriben a la ruta nueva, para
#     que el menú lleve al sitio donde de verdad está la página en esta casa.
for par in $RENOMBRES; do
  de="${par%%:*}"; a="${par##*:}"
  perl -pi -e "s{\"/$de\"}{\"/$a\"}g" "$REPO/yk-frame.js"
  for f in $HTMLS; do perl -pi -e "s{href=\"/$de\"}{href=\"/$a\"}g" "$REPO/$f"; done
done

# 3) El espejo se identifica: de qué commit de yokup viene esta copia.
ORIGEN_COMMIT="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo desconocido)"
SELLO="$(date +%d.%m.%Y' '%H:%M)"
for f in $HTMLS; do
  perl -0pi -e "s{<head>}{<head>\n<meta name=\"yokup-espejo\" content=\"origen www.yokup.com · commit $ORIGEN_COMMIT · sincronizado $SELLO\">}" "$REPO/$f"
done

# 4) El sello del marco. yk-frame.js pregunta cada pocos segundos por /__yokup-gate, que
#    sirve el Worker yokup-site-gate y aquí no existe: eran 404 en bucle y un pie sin
#    versión. Aquí pregunta por el version.json que escribe deploy.sh, que trae el mismo
#    campo `version`: el marco enseña el sello de admira.live, que es el que manda.
perl -pi -e 's{"/__yokup-gate\?frame="}{"/version.json?frame="}g' "$REPO/yk-frame.js"

# 5) Y lo dice a la cara, no sólo en un meta: una tira arriba avisa de que esto es el
#    espejo y de qué no funciona aquí por no tener sesión de Yokup.
AVISO='<div id="yk-espejo-aviso" style="background:#0a1620;border-bottom:1px solid rgba(120,243,255,.30);color:#75aab9;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:8px 14px">Espejo en <b style="color:#78f3ff">admira.live</b> de Yokup · mismos datos en vivo de <code>api.yokup.com</code>. Aquí se <b>mira</b>: sin sesión de Yokup, lo que pide login (tareas, tickets y mandar órdenes al CLI) no responde. Para eso, <a href="https://www.yokup.com/highscore" style="color:#78f3ff">el original</a>.</div>'
for f in $HTMLS; do
  perl -0pi -e "s{(<body[^>]*>)}{\$1\n$AVISO}" "$REPO/$f"
done

python3 - "$REPO" "$ORIGEN_COMMIT" "$SELLO" "$MIGRADAS" "$PENDIENTES" <<'PY'
import json, sys
repo, commit, sello, migradas, pendientes = sys.argv[1:6]
json.dump({
  "origen": "https://www.yokup.com",
  "origen_repo": "yokup/yokup-site",
  "origen_commit": commit,
  "sincronizado": sello,
  "fase": "espejo de lectura en admira.live",
  "paginas_migradas": migradas.split(),
  "sin_sesion": ["/tasks/all", "/tickets", "acciones de escritura del CLI y del control de agentes"],
  "paginas_pendientes_de_migrar": pendientes,
}, open(repo + "/highscore-espejo.json", "w"), ensure_ascii=False, indent=2)
PY

echo "✓ espejo actualizado desde $ORIGEN_COMMIT ($SELLO)"
echo "  comprueba:  node --test highscore-espejo.test.mjs marcador-flota.test.mjs"
echo "  y en vivo:  tools/verifica-espejo.sh"
