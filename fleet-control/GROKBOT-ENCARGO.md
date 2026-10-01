# Chat de coetáneos → Elon y Jensen por encargo MCP

`grokbot-encargo.js` enruta las sillas sin Grok Bot de escritorio en el Mac Mini:

| Silla | Consejero | Deepagent (máquina) |
|---|---|---|
| Musk | Elon Musk (CEO) | **Merovingio** (GrokBotBox) |
| Huang | Jensen Huang (CTO) | **Cypher** (GrokBotBox) |

Cada mensaje del chat de admira.live crea un encargo del MCP de admira.live
(`agente_encargar` → persona del deepagent, máquina `GrokBotBox`,
`de: Chat coetáneos admira.live · <email>`) con la **marca común de chat**:

```
[chat-coetaneos] <remitente> → <consejero>
Contexto:
<últimos turnos ya contestados, «Nombre: texto»> | (sin historial)
Mensaje de <nombre <email>>:
<mensaje nuevo>
```

- El vigilante genérico de la GrokBotBox (`/workspace/flota/vigilante`, bloque
  `chat` de `conf/<agente>.json`) reconoce la marca y contesta en un hilo aparte:
  persona como prompt de sistema, corto, sin herramientas ni entregable, con un
  «Estado real» barato; ack («escribiendo…») y `done` con el texto tal cual.
  Se ve en vivo en el panel del deepagent. Respuesta típica: 5-20 s.
- El worker `admira-telegram` no publica en el Ágora/Telegram los encargos con
  esa marca (ni el alta, ni el acuse, ni el cierre); quedan registrados en el MCP.
- Conversación continua: viajan como `Contexto` hasta 6 turnos contestados de esa
  persona con ese consejero (máx. ~1600 caracteres; el texto total ≤ 3900).
- Router (`createGrokBotRouter`): Elon y Jensen → encargo; el resto de sillas, al
  proveedor de siempre (`GROKBOT_CHAT_PROVIDER=desktop` o webhook).
- Acceso: cualquier sesión Google verificada por FleetControl (superusers); cada
  persona solo ve sus mensajes. No hereda `GROKBOT_DESKTOP_OWNER_EMAILS`.
- Clave MCP (la de la silla Musk), server-only: `GROKBOT_ENCARGO_MCP_KEY`,
  `GROKBOT_ENCARGO_MCP_KEY_FILE` o, por defecto, `~/.fleet/grokbot-encargo-mcp.key`
  (fichero del usuario del servicio, modo 0600, sin symlink).
- Estado: `GROKBOT_ENCARGO_STATE_FILE` o `~/.fleet/grokbot-encargo-state.json`.
- `/api/grokbot/capabilities?persona=Musk|Huang` devuelve `mode: encargo` y
  `agente`; la UI (`council-grokbot.js`) oculta Escritorio/adjuntos, explica el
  canal y muestra «pensando… / escribiendo…» hasta que llega la respuesta.
- Idempotente por `message_id`; un fallo ambiguo no reenvía (queda `unknown`).
- Sin adjuntos, rutinas ni parada.
