---
name: en-que-estamos
description: Abre y mantiene el tablero «¿En qué estamos?» (Vista Previa de AdmiraNeXT) en el panel de Preview de Claude Code — un recordatorio gráfico del estado del trabajo para el equipo (silicio ↔ carbono). Úsalo cuando alguien pregunte "¿en qué estamos?", "abre el tablero", "vista previa", "muéstrame el estado", o al empezar/retomar una sesión de trabajo en admira-live-site.
---

# ¿En qué estamos? — tablero de estado del equipo

El equipo AdmiraNeXT NO usa el panel de Preview de Claude Code para localhost (todo el
trabajo va a nube/preprod/producción, no local). Lo reutilizamos como **recordatorio
gráfico de "en qué estamos"**: el **silicio** (tú, los agentes) lo mantiene al día y el
**carbono** (las personas, con mucho en la cabeza) lo lee de un vistazo.

## Ficheros (en este repo)

- `vista-previa/index.html` — el tablero, auto-refresco cada 3s (hace *flash* al cambiar).
- `vista-previa/estado.json` — el estado del trabajo. **Es lo único que se edita** para actualizar el panel.
- `.claude/launch.json` — config `en-que-estamos` que lo sirve (python http.server, puerto 4788).

## Al invocar `/en-que-estamos`

1. Arranca el preview con la config **`en-que-estamos`** (`preview_start "en-que-estamos"`).
   Si `.claude/launch.json` no tuviera la config, créala:
   `{ "name": "en-que-estamos", "runtimeExecutable": "python3", "runtimeArgs": ["-m","http.server","4788","--directory","vista-previa"], "port": 4788 }`.
2. Si `vista-previa/estado.json` está desactualizado respecto al trabajo real de la sesión,
   **actualízalo** (ver esquema abajo) antes de enseñar el tablero.
3. Confirma con un `preview_snapshot` que carga y resume al usuario el foco + qué necesita carbono.

## Mantenerlo vivo (importante)

Cada vez que el trabajo **cambie de fase** (terminas algo, empiezas otra cosa, aparece un
bloqueo que depende de una persona), **actualiza `vista-previa/estado.json`** — sobre todo
`foco`, `pasos`, `necesita_carbono`, `actualizado` (ISO 8601) y `por` (`"silicio"` o `"carbono"`).
No hace falta reiniciar el panel: se refresca solo cada 3s.

### Esquema de `estado.json`

```json
{
  "proyecto": "AdmiraNeXT · admira.live",
  "titulo": "titular corto de lo que estamos haciendo",
  "resumen": "una frase de contexto",
  "foco": "la tarea central en curso ahora mismo",
  "progreso": 0,
  "estado_general": "en curso | bloqueado | en revisión | hecho",
  "actualizado": "2026-07-02T13:22:00Z",
  "por": "silicio",
  "pasos": { "hecho": [], "encurso": [], "siguiente": [] },
  "necesita_carbono": ["lo que depende de una persona ahora"],
  "riesgos": ["riesgos abiertos"],
  "enlaces": [{ "label": "texto", "url": "https://…" }],
  "commit": "hash corto",
  "version": "vista-previa v.AA.MM.DD.rN"
}
```

Regla de oro: el bloque **🙋 Necesita carbono** es el que resuelve el dolor del equipo —
mantén ahí, siempre claro, lo que ahora mismo depende de una persona.
