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

CFG_FILE="$(mktemp -t admiranext-tailscale.XXXXXX.json)"
trap 'rm -f "$CFG_FILE"' EXIT

echo "→ Leyendo configuración actual..."
"$TAILSCALE" serve get-config --all "$CFG_FILE"

python3 - "$CFG_FILE" "$ADMIRA_PORT" "$DEMO_PORT" "$OPENCLAW_PORT" <<'PY'
import json
import sys

cfg_path, admira_port, demo_port, openclaw_port = sys.argv[1:]
with open(cfg_path, "r", encoding="utf-8") as fh:
    raw = fh.read().strip()

data = json.loads(raw) if raw else {"version": "0.0.1"}
data.setdefault("TCP", {}).setdefault("443", {"HTTPS": True})
web = data.setdefault("Web", {})
host = next(iter(web.keys()), "macmini.tail48b61c.ts.net:443")
entry = web.setdefault(host, {})
handlers = entry.setdefault("Handlers", {})

handlers["/"] = {"Proxy": f"http://127.0.0.1:{admira_port}"}
handlers.pop("/teamwork.html", None)

if demo_port:
    handlers["/demo"] = {"Proxy": f"http://127.0.0.1:{demo_port}"}

if openclaw_port:
    handlers["/claw-gateway"] = {"Proxy": f"http://127.0.0.1:{openclaw_port}"}

with open(cfg_path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
PY

echo ""
echo "→ Restaurando configuración canónica..."
"$TAILSCALE" serve set-config --all "$CFG_FILE"
echo "  ✓ / → localhost:${ADMIRA_PORT} (AdmiraNext Control)"

if curl -sf "http://127.0.0.1:${DEMO_PORT}/ping" >/dev/null 2>&1; then
  echo "  ✓ /demo → localhost:${DEMO_PORT} (Demo server)"
else
  echo "  ⚠ Demo server no responde en :${DEMO_PORT}; la ruta queda configurada igualmente"
fi

if [[ -n "${OPENCLAW_PORT}" ]]; then
  echo "  ✓ /claw-gateway → localhost:${OPENCLAW_PORT} (OpenClaw)"
  echo ""
  echo "  ⚠ Cambia la ruta base de OpenClaw de /teamwork.html a /claw-gateway"
  echo "    en su configuración (normalmente ~/.claude/settings.json)"
else
  echo ""
  echo "  ℹ Para configurar OpenClaw en /claw-gateway, añade:"
  echo "    --openclaw-port PUERTO_DE_OPENCLAW"
fi

echo ""
echo "→ Activando Tailscale Funnel..."
"$TAILSCALE" funnel --bg "${ADMIRA_PORT}" >/dev/null

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
