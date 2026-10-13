#!/bin/bash
# tmux-edge-lanzar.sh — deja listo el arranque de Neo y Trinity DENTRO de tmux en el borde.
#
# Neo (MBP14) y Trinity (MBA16) hoy son app de escritorio: el publicador los marca
# «sin terminal, solo encargo» y no les hace capture-pane. Cuando el Mac vuelva,
# este script puede meterlos en tmux (Claude Code o Codex). Hasta entonces NO se ejecuta.
#
#   bash tools/tmux-edge-lanzar.sh                 plan: no llama a tmux
#   bash tools/tmux-edge-lanzar.sh --plan
#   EDGE_CONFIRMO=si bash tools/tmux-edge-lanzar.sh --arrancar
#
# --arrancar solo en macOS, y solo si las sesiones «neo» y «trinity» NO existen.
# Si una existe, sale sin tocarla (no attach, no send-keys, no respawn, no kill).
# En Linux (GrokBotBox) --arrancar se niega: las sesiones de la caja no son el borde.
#
# Runtime de serie: Neo = claude, Trinity = codex. Se cambia con
#   NEO_RUNTIME=codex  TRINITY_RUNTIME=claude
# y el binario con CLAUDE_BIN / CODEX_BIN. No imprime claves ni las lee.
set -euo pipefail

NEO_RT="${NEO_RUNTIME:-claude}"
TRI_RT="${TRINITY_RUNTIME:-codex}"
ACCION="plan"
case "${1:-}" in
  ""|--plan) ACCION="plan" ;;
  --arrancar) ACCION="arrancar" ;;
  *) echo "uso: tmux-edge-lanzar.sh [--plan|--arrancar]" >&2; exit 2 ;;
esac

cmd_de() {
  case "$1" in
    claude) printf '%s\n' "${CLAUDE_BIN:-claude}" ;;
    codex) printf '%s\n' "${CODEX_BIN:-codex}" ;;
    *) echo "runtime desconocido: $1 (claude o codex)" >&2; exit 2 ;;
  esac
}

NEO_CMD="$(cmd_de "$NEO_RT")"
TRI_CMD="$(cmd_de "$TRI_RT")"

if [ "$ACCION" = "plan" ]; then
  printf 'plan\nneo runtime=%s sesion=neo cmd=%s\ntrinity runtime=%s sesion=trinity cmd=%s\narranca=no\ntoca_sesiones=no\n' \
    "$NEO_RT" "$NEO_CMD" "$TRI_RT" "$TRI_CMD"
  exit 0
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "el lanzador edge solo arranca en macOS (MBP14 Neo, MBA16 Trinity). En esta máquina no toco tmux." >&2
  exit 2
fi
if [ "${EDGE_CONFIRMO:-}" != "si" ]; then
  echo "hace falta EDGE_CONFIRMO=si. Sin eso no creo sesiones." >&2
  exit 2
fi
command -v tmux >/dev/null 2>&1 || { echo "no hay tmux" >&2; exit 2; }

ocupadas=""
tmux has-session -t "=neo" 2>/dev/null && ocupadas="${ocupadas} neo"
tmux has-session -t "=trinity" 2>/dev/null && ocupadas="${ocupadas} trinity"
if [ -n "$ocupadas" ]; then
  echo "no arranco: ya existen${ocupadas}. No las toco." >&2
  exit 3
fi

# Las dos comprobaciones van ANTES de crear ninguna. Si la segunda fallara, no queda una a medias
# por un nombre ya ocupado: ambas estaban libres.
tmux new-session -d -s neo -n agente "$NEO_CMD"
tmux new-session -d -s trinity -n agente "$TRI_CMD"
echo "sesiones nuevas: neo trinity. No había ninguna que reutilizar."
echo "cuando el pane sea el CLI de verdad, cambia visor-edge.conf de sin_terminal|escritorio a edge|tmux"
