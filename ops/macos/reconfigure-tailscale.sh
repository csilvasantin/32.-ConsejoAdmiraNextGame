#!/bin/bash
# ══════════════════════════════════════════════════════════════
# reconfigure-tailscale.sh — Restaurar Tailscale Serve AdmiraNext
# ══════════════════════════════════════════════════════════════
#
# Problema: OpenClaw (Claude Code Gateway) fue configurado en
# Tailscale Serve con path /teamwork.html, solapando el panel
# AdmiraNext Control que Node.js (3030) sirve en ese path.
#
# Solución (Opción A): Mover OpenClaw a /claw-gateway y restaurar
# la configuración canónica del Funnel.
#
# Configuración objetivo:
#   https://macmini.tail48b61c.ts.net/           → localhost:3030  (AdmiraNext Control)
#   https://macmini.tail48b61c.ts.net/demo       → localhost:3032  (Demo server)
#   https://macmini.tail48b61c.ts.net/claw-gateway → localhost:OPENCLAW_PORT (OpenClaw)
#
# Uso:
#   bash ops/macos/reconfigure-tailscale.sh
#   bash ops/macos/reconfigure-tailscale.sh --openclaw-port 8080
#
# ══════════════════════════════════════════════════════════════

set -euo pipefail

ADMIRA_PORT=3030
DEMO_PORT=3032
OPENCLAW_PORT=""

# Tailscale binary — macOS App first, then PATH fallback
if [[ -x "/Applications/Tailscale.app/Contents/MacOS/Tailscale" ]]; then
  TAILSCALE="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
elif command -v tailscale >/dev/null 2>&1; then
  TAILSCALE="tailscale"
else
  echo "❌  tailscale no encontrado."
  echo "    Instala Tailscale desde https://tailscale.com/download/mac"
  exit 1
fi

# Parsear argumentos
while [[ $# -gt 0 ]]; do
  case "$1" in
    --openclaw-port)
      OPENCLAW_PORT="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo ""
echo "AdmiraNext — Reconfiguración Tailscale Serve (Opción A)"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Tailscale: $TAILSCALE"
echo ""

# Estado actual
echo "→ Estado actual de Tailscale Serve:"
"$TAILSCALE" serve status 2>/dev/null || echo "  (no hay configuración activa o error al leer)"
echo ""

# Eliminar el path conflictivo /teamwork.html de Tailscale Serve
echo "→ Eliminando path /teamwork.html de Tailscale Serve (OpenClaw)..."
"$TAILSCALE" serve https /teamwork.html off 2>/dev/null && echo "  ✓ /teamwork.html eliminado" || echo "  (no estaba configurado — ok)"

# Restaurar configuración canónica
echo ""
echo "→ Restaurando configuración canónica..."

# AdmiraNext Control (Node.js en 3030)
"$TAILSCALE" serve https / "http://127.0.0.1:${ADMIRA_PORT}"
echo "  ✓ / → localhost:${ADMIRA_PORT} (AdmiraNext Control)"

# Demo server en 3032 (si está corriendo)
if curl -sf "http://127.0.0.1:${DEMO_PORT}/ping" >/dev/null 2>&1; then
  "$TAILSCALE" serve https /demo "http://127.0.0.1:${DEMO_PORT}"
  echo "  ✓ /demo → localhost:${DEMO_PORT} (Demo server)"
else
  echo "  ⚠ Demo server no responde en :${DEMO_PORT} — /demo no configurado"
fi

# OpenClaw en /claw-gateway (si se especificó puerto)
if [[ -n "${OPENCLAW_PORT}" ]]; then
  echo ""
  echo "→ Configurando OpenClaw en /claw-gateway (puerto ${OPENCLAW_PORT})..."
  "$TAILSCALE" serve https /claw-gateway "http://127.0.0.1:${OPENCLAW_PORT}"
  echo "  ✓ /claw-gateway → localhost:${OPENCLAW_PORT} (OpenClaw)"
  echo ""
  echo "  ⚠ Cambia la ruta base de OpenClaw de /teamwork.html a /claw-gateway"
  echo "    en su configuración (normalmente ~/.claude/settings.json)"
else
  echo ""
  echo "  ℹ Para configurar OpenClaw en /claw-gateway, añade:"
  echo "    --openclaw-port PUERTO_DE_OPENCLAW"
fi

# Activar Funnel
echo ""
echo "→ Activando Tailscale Funnel..."
"$TAILSCALE" funnel 443 on 2>/dev/null || \
"$TAILSCALE" funnel https on 2>/dev/null || \
"$TAILSCALE" serve --funnel 2>/dev/null || {
  echo "  ⚠ No se pudo activar Funnel automáticamente."
  echo "    Actívalo manualmente en el menú de Tailscale > Serve > Enable Funnel"
}

echo ""
echo "→ Configuración final:"
"$TAILSCALE" serve status 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✓ Tailscale Serve reconfigurado"
echo ""
echo "  Panel Control:  https://macmini.tail48b61c.ts.net/teamwork.html"
echo "  API:            https://macmini.tail48b61c.ts.net/api/teamwork/history"
if [[ -n "${OPENCLAW_PORT}" ]]; then
  echo "  OpenClaw:       https://macmini.tail48b61c.ts.net/claw-gateway"
fi
echo ""
echo "  Prueba local primero:"
echo "    curl http://127.0.0.1:${ADMIRA_PORT}/api/teamwork/history | python3 -m json.tool | head"
echo ""
