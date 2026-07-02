#!/usr/bin/env bash
# Despliega www.admira.live a Cloudflare Pages (proyecto: admira-live).
# Deploys casi instantáneos (vs 6-20 min de GitHub Pages).
# Uso:  ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
TMP="$(mktemp -d)"
# Solo el contenido versionado de HEAD (sin .git ni basura del working tree)
git archive --format=tar HEAD | tar -x -C "$TMP"
npx --yes wrangler pages deploy "$TMP" --project-name=admira-live --branch=main --commit-dirty=true
rm -rf "$TMP"
echo "✓ desplegado en https://admira-live.pages.dev (y www.admira.live si el dominio ya apunta aquí)"
