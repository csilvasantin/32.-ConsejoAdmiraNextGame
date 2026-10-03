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


## Disponibilidad y plan B (FLT-101402 · 3-oct-2026)

Antes de crear el encargo se comprueba `/api/presence` de bot.yokup.com:
coincidencia exacta persona + GrokBotBox + DeepAgents, latido menor de 120 segundos.
La comprobación también aparece en capabilities. Si no hay señal, la web lo
indica y responde por `consejero_preguntar` (council-api, Grok 4.6, coetáneos,
CEO/CTO, máximo 1000 tokens). El plan B se ejecuta en segundo plano y su resultado
se conserva en el mismo turno. Grok 4.6 es API de pago; depende del presupuesto
y de que council-api esté disponible. No usa la sesión del DeepAgent.

Tras 90 segundos sin acuse se ofrece «Responder con Grok 4.6». Se activa una
sola vez; un cierre tardío del encargo original no sustituye su respuesta.
No cancela la ejecución del DeepAgent original. Si la respuesta original es
una nota interna, no se muestra ni se lee en voz alta y se ofrece el plan B.

Dos envíos con el mismo propietario, silla y texto (recortado en los extremos),
y distintos UUID, reutilizan el turno durante 120 segundos si no hay acuse
o respuesta. La UI mantiene Enviar desactivado mientras hay un turno pendiente.
El navegador espera 60 segundos; el MCP de encargos tiene un presupuesto
total de 20 segundos para inicializar y llamar, y el plan B 45 segundos.

Pruebas con respuestas simuladas, sin llamadas a modelos de pago.
Minitutorial oficial ADmira Motion: `/media/tutoriales/flt-101402-consejo.mp4`
(15 segundos, 1080×1920, audio). Es una animación explicativa, no una grabación
real de pantalla. Evidencias reales y resultados en Yokup, misión FLT-101402.
