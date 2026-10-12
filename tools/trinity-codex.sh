#!/bin/bash
# Arranque de Trinity (Codex CLI) en la sesión tmux `trinity` del MBP16.
# Sin computer use ni navegador visible: la pantalla del MBP16 es solo la cuadratura de 4 terminales.
# Webs → Playwright/Chrome headless; GUI de verdad → en el Mac libre (MAC_LIBRE, ~/.config/admiranext/mac-libre.conf).
# Perfil extra en ~/.codex/trinity.config.toml. No afecta a la app de escritorio de Codex de Carlos.
exec /Users/csilvasantin/.local/bin/codex -p trinity \
  --disable computer_use --disable browser_use --disable browser_use_external \
  -c 'plugins."computer-use@openai-bundled".enabled=false' \
  -c 'plugins."unified-computer-use@openai-bundled".enabled=false' \
  -c 'plugins."chrome@openai-bundled".enabled=false' \
  -c 'plugins."browser@openai-bundled".enabled=false' \
  "$@"
