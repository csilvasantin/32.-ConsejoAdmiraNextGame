# Diario - 2026-03-28

## Proyecto

AdmiraNext Control (AdmiraNext-Team) — v2.1.x

## Trabajo realizado

### Pipeline de capturas 100% en memoria

- Eliminados todos los escritos a disco en el pipeline de screenshots.
- `captureOneSnapshot` devuelve un `Buffer` almacenado en un `Map` (`imageBuffers`).
- El endpoint `/api/screenshots/:id` sirve directamente desde memoria, sin leer ficheros.
- Añadida función exportable `getImageBuffer(id)` para que `server.js` acceda al store.

### Preview multi-monitor del Mac Mini (3 pantallas)

- Identificadas las 3 pantallas del Mac Mini:
  - Display 1: Apple Studio Display 5120×2880 (horizontal, centro)
  - Display 2: ASUS PA278CFRV (vertical izquierda) — siempre Claude
  - Display 3: ASUS PA278CFRV (vertical derecha) — siempre Codex
- Nueva función `captureLocalAllDisplays`: captura los 3 displays en paralelo con `screencapture -D`.
- El snapshot del Mac Mini devuelve `type: "images"` con array de 3 imágenes y sus orientaciones.
- Orden visual izquierda→derecha: Claude (portrait) | Studio (landscape) | Codex (portrait).

### Diseño H en el preview

- El panel central (Studio Display) se muestra al 55% de altura y centrado verticalmente.
- Los paneles laterales (Claude y Codex) ocupan el 100% de altura.
- El resultado visual es una silueta en H que refleja la disposición física real de los monitores.
- Etiquetas: "Claude", "Studio", "Codex" debajo de cada panel.

### Auto-Approve mejorado

- **Claude**: reemplazado el scan lento `entire contents` (recursivo, 15-30s, timeout frecuente) por un scan directo solo de botones hijos: `every button of window/group/sheet`. Tiempo de detección <2s.
- Añadido "Allow" y otros verbos exactos (`Yes`, `OK`, `Run`, `Confirm`, `Permitir`) como señales de aprobación en Claude Desktop.
- **Codex**: la detección anterior solo miraba el título de ventana (nunca disparaba). Nueva función `detectCodexApproval` que lee text areas del proceso Codex y busca patrones de menú numerado (`1) 2) allow/deny`).
- **Cooldown**: 12s por máquina+target para evitar dobles aprobaciones mientras el diálogo se cierra.
- **Intervalo**: reducido de 30s a 15s para respuesta más rápida.

### Ajustes de interfaz

- Botones Aprobar Claude y Aprobar Codex intercambiados (Codex a la izquierda, Claude a la derecha).
- Versión final del día: v2.1.3.

## Estado actual

- Servidor local en `http://localhost:3030` con todas las mejoras activas.
- Repositorio publicado en GitHub Pages.
- Auto-Approve ON por defecto al arrancar el servidor, escaneando cada 15s todos los equipos SSH-habilitados.
- Mac Mini muestra preview de las 3 pantallas con disposición en H.
