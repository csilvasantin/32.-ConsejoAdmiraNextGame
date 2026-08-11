#!/usr/bin/env bash
# Despliega www.admira.live a Cloudflare Pages (proyecto: admira-live).
# Deploys casi instantáneos (vs 6-20 min de GitHub Pages).
# Uso:  ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
TMP="$(mktemp -d)"
# Solo el contenido versionado de HEAD (sin .git ni basura del working tree)
git archive --format=tar HEAD | tar -x -C "$TMP"

# EL SELLO, ANTES DE PUBLICAR (MorfeoMacMini, 10-08-2026 · normas 07/08/09). admira.live
# no publicaba ningun /version.json, asi que admiranext.com/webmaster no podia leer que
# corre aqui ni quien lo puso: salia «sin portada». El sello se GENERA, no se teclea, y
# se firma con quien publica — no se hereda la firma anterior.
: "${ADMIRA_RELEASE_AGENT:?Define ADMIRA_RELEASE_AGENT (ej. MorfeoMacMini)}"
: "${ADMIRA_RELEASE_MACHINE:?Define ADMIRA_RELEASE_MACHINE (ej. MacMini)}"
SELLO="$(sed -n 's/.*admiranext-version" content="AdmiraNeXT \(v\.[^"]*\)".*/\1/p' control/index.html | head -1)"
[ -n "$SELLO" ] || { echo "✗ falta el <meta admiranext-version> en control/index.html" >&2; exit 1; }
GIT="$(git rev-parse HEAD)"; SUCIO=true; [ -z "$(git status --porcelain)" ] && SUCIO=false
jq -n --arg v "$SELLO" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   --arg a "$ADMIRA_RELEASE_AGENT" --arg m "$ADMIRA_RELEASE_MACHINE" \
   --arg g "$GIT" --argjson d "$SUCIO" \
   '{version:$v,deployedAt:$t,deployer:$a,machine:$m,signature:($a+" · "+$m),git:$g,gitShort:($g[0:7]),gitFull:$g,dirty:$d}' \
   > "$TMP/version.json"
echo "  ✓ $SELLO · $ADMIRA_RELEASE_AGENT · $ADMIRA_RELEASE_MACHINE"

# UN SITIO PUBLICADO, UN SOLO SELLO (MorfeoMacMini, 11-08-2026 · normas 07/09).
# El sello de /version.json se leia de control/index.html, pero quien entra en / ve el
# <meta> de index.html: dos ficheros distintos, y acabaron divergiendo. El 11-ago
# /version.json anunciaba v.11.08.2026.r11 mientras la home seguia diciendo que era la
# r1 de la vispera — es decir, produccion declarando una version que ya no era. Un sello
# que contradice a otro no sirve para volver a un punto de retorno, que es justo para lo
# que existe. Aqui se estampa el sello del despliegue en TODO el HTML que sale, y sobre
# la copia temporal: el repo no se toca (nadie pelea por 56 ficheros en cada release) y
# la divergencia deja de ser posible por construccion.
python3 - "$TMP" "$SELLO" <<'PY'
import pathlib, re, sys
raiz, sello = pathlib.Path(sys.argv[1]), sys.argv[2]
meta = '<meta name="admiranext-version" content="AdmiraNeXT %s" />' % sello
rx = re.compile(r'<meta\s+name="admiranext-version"[^>]*>', re.I)
rehecho = anadido = sin_head = 0
for f in sorted(raiz.rglob("*.html")):
    txt = f.read_text(encoding="utf-8", errors="surrogateescape")
    if rx.search(txt):
        nuevo = rx.sub(meta, txt); rehecho += 1
    else:
        cabeza = re.search(r'<head[^>]*>', txt, re.I)
        # sin <head> no hay donde colgarlo: se deja igual antes que romper el documento
        if not cabeza:
            sin_head += 1
            continue
        nuevo = txt[:cabeza.end()] + meta + txt[cabeza.end():]; anadido += 1
    if nuevo != txt:
        f.write_text(nuevo, encoding="utf-8", errors="surrogateescape")
print("  ✓ sello en %d paginas (%d reescritas, %d nuevas)%s"
      % (rehecho + anadido, rehecho, anadido,
         "" if not sin_head else " · %d sin <head>, intactas" % sin_head))
PY

npx --yes wrangler pages deploy "$TMP" --project-name=admira-live --branch=main --commit-dirty=true
rm -rf "$TMP"
echo "✓ desplegado en https://admira-live.pages.dev (y www.admira.live si el dominio ya apunta aquí)"
