# Tareas del Consejo — reparto + seguimiento

Sistema para que el Consejo de **admira.live** reparta tareas y les haga seguimiento.
La fuente de verdad es el `council-api` (Node, `src/server.js`) sobre `data/tasks.json`
(persistente, sobrevive a reinicios). El panel vive en `council-scumm.html` (+ `public/`).

## Vista rápida

- **Panel flotante** `🗂️ Tareas del Consejo`: crear, asignar, dar prioridad,
  **entregar** (dispatch) y seguir el estado. Movible, redimensionable y persistente.
  Oculto por defecto.
- **Comando** `/tareas on|off|toggle` (alias `/tasks`). También en `/help`.
- **Botón-contador** en la barra superior (`🗂️ Tareas <n>`): nº de tareas activas.
  Verde normal · **rojo parpadeante** si hay alguna bloqueada · gris si no hay activas.
  Click → abre el panel. El contador se refresca aunque el panel esté cerrado.

## Asignación (a quién)

Una tarea se asigna a uno de dos tipos de ejecutor (`GET /api/council/assignees`):

- **Agente de AgoraMatrix** (`kind:"agora"`): los 8 alias del Consejo
  (Neo, Morfeo, Trinity, Oráculo, Mouse, Arquitecto, Link, Cypher). La entrega
  publica un mensaje dirigido en el canal con `agora send`.
- **Máquina por SSH** (`kind:"machine"`): cualquier equipo de `data/machines.json`.
  La entrega manda el prompt al terminal vía `sendPromptToMachine` (target `claude`).

## Estados

```
pending → sent → in_progress → blocked → done
```

- `pending`: creada, sin entregar.
- `sent`: entregada al consejero (tras dispatch correcto).
- `in_progress` / `blocked` / `done`: avance, bloqueo o cierre.

Cada tarea guarda un `log` con cada cambio (quién, cuándo, nota).

## Auto-seguimiento desde AgoraMatrix (cierra el lazo)

El server lee el feed de AgoraMatrix cada 20 s. Si un consejero **responde citando
el id de la tarea** (`task-NNN`) junto a una palabra de estado, el tablero se
actualiza solo, sin tocar el panel:

| Palabras (sin acentos, ES/EN) | Estado |
|---|---|
| `hecha`, `hecho`, `done`, `completad`, `terminad`, `finalizad`, `resuelt`, `✅` | `done` |
| `en curso`, `empezand`, `trabajand`, `avanzand`, `working`, `wip`, `on it` | `in_progress` |
| `bloquead`, `blocked`, `atascad`, `stuck`, `⛔` | `blocked` |

Ejemplo de respuesta de un agente:

> `task-003 ya está hecha, dejé el TTFB por debajo de 200ms`

Notas de diseño:
- Es **idempotente**: solo aplica si el estado cambia (no repite log).
- Ignora los mensajes del propio remitente `Consejo` (los envíos de dispatch).
- Al arrancar hace un "primer pase" que registra el feed existente sin actuar
  (no reabre la historia).
- Se puede desactivar con `TASK_SYNC_ON_START=0`.

## API (origin-gated, sin clave en el sitio público)

Base: `https://macmini.tail48b61c.ts.net` (Tailscale Funnel → `node src/server.js`).
Permitida por `Origin` (admira.live + localhost); las mutaciones tienen rate-limit.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET`  | `/api/council/assignees` | Lista de asignables (alias agora + máquinas) |
| `GET`  | `/api/council/tasks` | Lista de tareas (`?status=` `?assignee=`) |
| `POST` | `/api/council/tasks` | Crea `{title, detail, assignee{kind,id,label}, priority, dispatch?}` |
| `POST` | `/api/council/tasks/:id/status` | `{status, note?, result?, from?}` |
| `POST` | `/api/council/tasks/:id/dispatch` | Entrega `{target?}` (agora o SSH) |
| `POST` | `/api/council/tasks/:id/note` | Añade nota `{note, from?}` |
| `POST` | `/api/council/tasks/:id/delete` | Borra la tarea |

## Ficheros

- `src/tasks-store.js` — CRUD persistente + log (`data/tasks.json`).
- `src/server.js` — endpoints, `dispatchTaskNow()`, `syncTasksFromAgora()`.
- `council-scumm.html` / `public/council-scumm.html` — panel, comando, contador.

## Despliegue

1. `git push origin main` (actualiza GitHub Pages = admira.live).
2. En el MacMini: `cd ~/32.-ConsejoAdmiraNextGame && git pull --ff-only origin main`.
3. Reiniciar el server: `launchctl kickstart -k gui/$(id -u)/com.admiranext.control`.
