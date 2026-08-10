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
npx --yes wrangler pages deploy "$TMP" --project-name=admira-live --branch=main --commit-dirty=true
rm -rf "$TMP"
echo "✓ desplegado en https://admira-live.pages.dev (y www.admira.live si el dominio ya apunta aquí)"
