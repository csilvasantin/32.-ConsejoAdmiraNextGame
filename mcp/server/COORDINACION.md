# Coordinar deepagents desde el MCP de admira.live (v.01.10.2026.r3)

MuskGrokBot (CEO coetáneo, Elon Musk) · deepagent Merovingio · GrokBotBox · 1-oct-2026.
HuangGrokBot (CTO coetáneo, Jensen Huang) · deepagent Cypher · DeepAgents · GrokBotBox · 1-oct-2026.
ArquitectoCursorCloud queda como orquestador de Cursor Cloud (sin silla). Ryan Reynolds no tiene deepagent enlazado.

## Qué cambia

| Herramienta | Antes | Ahora |
|---|---|---|
| `consejo_bots` | Pasaba tal cual `/api/council/health` del proxy del Mac Mini: «en línea» = latido de 90 s, y el Mac Mini (código anterior a `6e3afaf`) publicaba **Smith · CEO / Elon Musk** | Censo único (`src/coordinacion.js`): en línea = presencia de bot.yokup.com ≤ 15 min, **la misma fuente que `agentes_vivos`**. Tabla buena de sillas coetáneas (igual que `MATRIX_LINKS` de `app.js` y `AGENTS` de `council-todo.js`): CEO Elon Musk = **Merovingio** (deepagent de **MuskGrokBot**, Grok CLI, GrokBotBox); Smith = Soporte, del otro GrokBot. Devuelve `correcciones` cuando el Mac Mini sigue sirviendo el mapeo viejo y aguanta si el Mac Mini cae. |
| `encargos_listar` (nueva) | — | Bandeja de cualquier agente/consejero: por defecto la de quien llama, abiertos (`pending`, `ack`, `in_progress`, `blocked`), filtros `persona`, `estado`, `maquina`, `limite`. |
| `encargo_responder` (nueva) | Solo `telegram_responder` (pensado para GrokBot) | Acuse/respuesta genérica: `ack`, `in_progress`, `blocked` (exige nota), `done` (exige nota o commit/url/verificación). Mismo `POST /api/bot-inbox/:id/status` que `telegram_responder`. **Solo el destinatario** puede contestar: se lee el encargo antes de escribir. |
| `agentes_vivos` | Personas y máquinas vivas | + `carga` (abiertos por estado) por agente, por máquina y por consejero, `deepagent_vivo` en las sillas con deepagent (Musk → Merovingio, Huang → Cypher) y `cola_sin_senal`. |
| `flota_estado` | Solo Claude Code (sondeo SSH) | `runtimes` por máquina: Claude Code, Codex, Grok CLI, OpenCode, DeepAgents, por sondeo (cuando el proxy publique `claude.runtimes`) y por presencia. GrokBotBox y CursorCloud entran por presencia (no hay SSH desde el Mac Mini). |
| `agente_encargar` | texto | + `deadline` y `criterio` (criterio de hecho): se añaden al texto y como metadatos `deadline` / `done_criteria`. |

## API de bot.yokup.com (worker admira-telegram) que se usa

- `GET /api/presence` — pública; latidos (persona, machine, runtime, model, updated…).
- `GET /api/public/inbox?persona=&machine=` — pública; **los 80 encargos más recientes**, texto recortado a 140 caracteres, sin filtro de estado.
- `GET /api/bot-inbox?persona=&machine=` — privada (`ADMIRA_TELEGRAM_PANEL_KEY`); vista de la bandeja de un agente, texto entero.
- `GET /api/bot-inbox/:id` — privada; un encargo.
- `POST /api/bot-inbox/:id/status` — privada; `{status, persona, machine, respuesta, commit?, url?, verification?}`.

`encargos_listar` funde la vista privada y la pública por número (manda la privada) y filtra en el MCP.

## Hueco y endpoint propuesto (no implementado: vive en el worker admira-telegram, fuera de este repo)

No existe un listado con **filtro de estado ni paginación**, ni un **resumen de carga**. Consecuencias: la carga de
`agentes_vivos` sale de la vista pública (tope 80 por persona: si una persona tiene más de 80 encargos recientes
se marca `parcial: true` y los abiertos más antiguos no cuentan) y hace una lectura por persona.

Propuesta para el worker admira-telegram:

```
GET /api/bot-inbox/list?persona=Merovingio&machine=grokbotbox&status=pending,ack,in_progress,blocked&limit=50&before=<id>
  (privada, panel key) → { ok, items:[…texto entero…], next_before }
GET /api/bot-inbox/carga?horas=720
  (pública, sin texto) → { ok, personas: { Neo: { pending, ack, in_progress, blocked, por_maquina:{…} }, … } }
```

Con ellos `encargos_listar` y `agentes_vivos` pasarían a una sola llamada y sin tope.

## Otros huecos

- El proxy del Mac Mini (`src/server.js` en `:3030`) sigue sirviendo el mapeo viejo hasta que se reinicie con
  el `main` actual; el MCP lo corrige mientras tanto.
- La detección de Codex / Grok CLI / OpenCode / DeepAgents **por procesos** está en `src/ssh-exec.js`
  (`CLAUDE_STATUS_PROBE_PY` → `runtimes`), con las mismas regex que `RUNTIMES` de `src/coordinacion.js`
  (lo comprueba un test). Entra en vigor cuando el Mac Mini reinicie su proxy; hasta entonces cuenta la presencia.
