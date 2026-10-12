#!/bin/bash
# Arranque de Oráculo (Codex CLI) en la sesión tmux `oraculo` del MBP16 (Carlos 11-10-2026 14:18, vía GrokBot).
# CODEX_HOME propio (~/.codex-oraculo, cuenta csilvasantin@gmail.com), distinto del de Trinity (~/.codex, csilva@admira.com).
# Sin computer use ni navegador visible (config.toml de ~/.codex-oraculo): la pantalla del MBP16 es la cuadratura.
# Ojo: con cwd ~/Claude, Codex lee además ~/.codex/config.toml (el de Trinity) como config «de proyecto»;
# por eso los -c de abajo fijan esfuerzo y plugins de GUI apagados por encima de esa capa.
# Si aún no hay sesión iniciada, espera aquí (sin abrir nada en pantalla) hasta que exista auth.json.
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export CODEX_HOME=/Users/csilvasantin/.codex-oraculo
# agora-sync-codex-identity: verificar SU cuenta y no pisar la identidad Codex de la máquina (la de Trinity).
export CODEX_AUTH_FILE=$CODEX_HOME/auth.json AGORA_IDENTITY_FILE=/Users/csilvasantin/.agents-comms/identity.oraculo.json
while [ ! -s "$CODEX_HOME/auth.json" ]; do
  clear; echo; echo "  Oráculo · Codex · MacBook Pro 16"; echo "  Login pendiente (csilvasantin@gmail.com): se abre en el Mac libre, nunca aquí."; sleep 10
done
cd /Users/csilvasantin/Claude
exec env GIT_AUTHOR_NAME=OraculoMacBookPro16 GIT_COMMITTER_NAME=OraculoMacBookPro16 \
  GIT_AUTHOR_EMAIL=csilvasantin@gmail.com GIT_COMMITTER_EMAIL=csilvasantin@gmail.com \
  YOKUP_PERSONA=Oraculo YOKUP_RUNTIME=Codex AGENT_PERSONA=Oraculo ADMIRA_PERSONA=Oraculo \
  /Users/csilvasantin/.local/bin/codex --no-daemon -c check_for_update_on_startup=false \
  --disable computer_use --disable browser_use --disable browser_use_external \
  -c model_reasoning_effort=\"high\" \
  -c 'plugins."computer-use@openai-bundled".enabled=false' \
  -c 'plugins."unified-computer-use@openai-bundled".enabled=false' \
  -c 'plugins."chrome@openai-bundled".enabled=false' \
  -c 'plugins."browser@openai-bundled".enabled=false' \
  --dangerously-bypass-approvals-and-sandbox "$@"
