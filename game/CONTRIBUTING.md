# Contribuir a AdmiraNext Council (sin pisarnos)

El juego vive en un único archivo grande: [`index.html`](../index.html) (~7.700 líneas).
Para que varias personas (o sus agentes IA) lo extiendan sin chocar, seguimos este contrato.

La **fuente única de verdad** es [`game/manifest.json`](./manifest.json). El [help](https://www.admira.live/game/help) se genera de ahí, así que **si cambias el juego, actualizas el manifest** y el help queda al día solo.

---

## 1. Antes de tocar nada: reserva el área

Para evitar editar lo mismo a la vez, **reserva** tu zona antes de empezar.

**Forma recomendada — con el MCP** (ver [`game/mcp/README.md`](./mcp/README.md)):

```
list_extension_points        # ¿dónde puedo trabajar?
list_reservations            # ¿qué está ocupado?
claim_area { area:"verbs", owner:"Oráculo", branch:"feature/verbo-explorar", note:"..." }
# … trabajas …
release_area { area:"verbs", owner:"Oráculo" }
```

**A mano** — añade una entrada en `collaboration.reservations` del manifest vía Pull Request:

```json
{ "area": "verbs", "owner": "Carlos", "branch": "feature/verbo-explorar", "since": "2026-06-28", "note": "Nuevo verbo Explorar", "active": true }
```

- `area` debe ser el `id` de un punto de extensión (`verbs`, `council`, `llm-engines`, `backend`, `manifest-help`).
- Pon `active: false` o usa `release_area` cuando termines.
- El help muestra las reservas activas en su sección de desarrolladores.
- El MCP **rechaza** reservar un área ya ocupada por otra persona (ahí está el "no pisarnos").

## 2. Puntos de extensión

Cada uno define qué archivos y anclas tocar. Mira `extension_points` en el manifest
(el help los lista con detalle). Resumen:

| id | Qué extiende | Dónde |
|----|--------------|-------|
| `verbs` | Añadir un verbo | `verb-grid` (HTML) + `selectVerb()` + `VERB_LABELS` + trigger |
| `council` | Consejeros / personas | `const COUNCIL` + `NAMEPLATE_POS` + `GREETINGS` |
| `llm-engines` | Motores LLM del inventario | panel "MOTOR LLM" + `selectLLM()` + `refreshLLMAvailability()` |
| `backend` | Lógica de IA | repo externo `ConsejoAdmiraNextGame` (Render) |
| `manifest-help` | Contrato y ayuda | `game/manifest.json` + `game/help/` |

### Receta: añadir un verbo nuevo

1. Reserva `area: "verbs"`.
2. Añade el botón en `verb-grid`:
   `<button class="verb-btn" data-verb="explorar" title="..." onclick="selectVerb(this)">Explorar</button>`
3. Registra la etiqueta en `VERB_LABELS` y el caso en `selectVerb()`.
4. Implementa su `trigger`/handler.
5. Declara el verbo en `manifest.json > verbs` (id, label, status, desc).
6. Ejecuta el check (sección 4) y abre PR.

## 3. Reglas

- **No cambies datos del juego sin reflejarlos en el manifest.** Verbos y personas deben coincidir.
- Mantén el estilo SCUMM: bordes rectos (`border-radius:0`), sombras duras (`box-shadow:Npx Npx 0 #000`), fuente `Press Start 2P` en títulos, paleta marrón `#5a3a1e`/`#8b5a14`/`#daa520`.
- El sitio es estático (GitHub Pages). El **token del backend es público** por diseño; no metas secretos nuevos en el cliente.
- Cada cambio se despliega con backup + tag de rollback (ver flujo del equipo).

## 4. Comprobar que el manifest no se ha desincronizado

```bash
node game/check-manifest.cjs
```

Compara los verbos y consejeros declarados en `manifest.json` con los que hay de verdad
en `index.html` y avisa de diferencias. Sale con código ≠ 0 si hay drift
(útil para un hook o CI).

## 5. Estado de los verbos

- `stable` — funciona de punta a punta.
- `partial` — parcialmente implementado (p. ej. **Pensar**: solo el modo Audio; Texto/Vídeo/Interactivo van con 🔒).
