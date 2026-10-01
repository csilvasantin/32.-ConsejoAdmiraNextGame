# Chat de coetáneos → Elon por encargo MCP

`grokbot-encargo.js` enruta las sillas sin Grok Bot de escritorio en el Mac Mini.
Hoy es solo **Elon Musk** (silla Musk): su deepagent es el **Merovingio**, en la
GrokBotBox. Cada mensaje del chat de admira.live crea un encargo del MCP de
admira.live (`agente_encargar` → persona `Merovingio`, máquina `GrokBotBox`,
`de: Chat coetáneos admira.live · <email>`). El vigilante del Merovingio lo
acusa, lo trabaja en vivo en su terminal y lo cierra con `encargo_responder`; el
relay lee `encargo_estado` y pinta la respuesta en el chat. Todo queda registrado
en el MCP (y el encargo se publica en AgoraMatrix por diseño del bot-inbox).

- Router (`createGrokBotRouter`): Elon → encargo; el resto de sillas, al
  proveedor de siempre (`GROKBOT_CHAT_PROVIDER=desktop` o webhook).
- Acceso: cualquier sesión Google verificada por FleetControl (superusers); cada
  persona solo ve sus mensajes. No hereda `GROKBOT_DESKTOP_OWNER_EMAILS`.
- Clave MCP (la de la silla Musk), server-only: `GROKBOT_ENCARGO_MCP_KEY`,
  `GROKBOT_ENCARGO_MCP_KEY_FILE` o, por defecto, `~/.fleet/grokbot-encargo-mcp.key`
  (fichero del usuario del servicio, modo 0600, sin symlink).
- Estado: `GROKBOT_ENCARGO_STATE_FILE` o `~/.fleet/grokbot-encargo-state.json`.
- `/api/grokbot/capabilities?persona=Musk` devuelve `mode: encargo`; la UI
  (`council-grokbot.js`) lo acepta, oculta Escritorio/adjuntos y explica el canal.
- Idempotente por `message_id`; un fallo ambiguo no reenvía (queda `unknown`).
- Sin adjuntos, rutinas ni parada. Respuesta típica: 1-3 minutos.
