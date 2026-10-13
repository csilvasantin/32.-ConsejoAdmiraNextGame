# Evidencia de encargos / Assignment evidence

Servidor / Server: https://mcp.admira.live/mcp. Ayuda / Help: https://www.admira.live/mcp/.

## Español · tutorial MCP y CLI

`yokup_evidencia` admite exactamente un destino: `mision: "FLT-123"` o `encargo: 5848` (el número del encargo #5848.10.13 · buzón MCP en Mac mini). No se acepta un `task-web-…` como misión. La llamada exige identidad por clave; la clave compartida del Consejo exige `como`.

1. Acusar con `encargo_responder({numero:5848, estado:"ack", nota:"Prueba buzón MCP"})`.
2. Adjuntar con `yokup_evidencia({encargo:5848, momento:"proceso", imagen_base64:"…", titulo:"Prueba buzón MCP"})`. También admite `imagen_url` HTTPS de una captura o `transcripcion` (20–12000 caracteres). La imagen se valida y sube a `https://api.yokup.com/media/fleet/…`; una URL ya subida se reutiliza.
3. Leer `encargo_estado({encargo:5848})`: `evidencias` incluye ID, propietario, fecha, momento, título, captura y transcripción. Cerrar con `encargo_responder({numero:5848, estado:"done", nota:"OK o error exacto"})`.

Antes de subir se comprueban destinatario y máquina. Un encargo no tiene pasos: omite `paso`. El registro independiente en el buzón no cambia el estado ni sobrescribe la nota; permanece tras el cierre y no crea misión ni puntos FLT. La transcripción sola se pinta en el Mac Mini y se identifica como transcripción, no como captura real. Si Computer Use bloquea una captura, registra el error exacto; esta mejora no cambia ese permiso.

Desde un cliente CLI MCP se usa el mismo nombre y JSON; no hay un nuevo comando del CLI Experto. El esquema actualizado se consulta con `tools/list`; un cliente con esquema en caché debe recargar su conexión. La ruta de las misiones conserva `/fleet/progress` y `/fleet/task-status` y sus reglas de inicio/cierre.

## English · MCP and CLI tutorial

`yokup_evidencia` accepts exactly one destination: `mision: "FLT-123"` or `encargo: 5848` (the integer assignment number). A `task-web-…` identifier is not an FLT mission. Identity comes from the MCP key; shared Council keys require `como`.

Acknowledge with `encargo_responder`, call `yokup_evidencia` with the assignment number and `imagen_base64`, `imagen_url` or `transcripcion`, read back with `encargo_estado`, then close with `encargo_responder` and OK or the exact error. The recipient and machine are checked before uploading. Omit `paso` for assignments.

The authenticated inbox stores a separate evidence record, including owner, timestamp, image URL and transcript. It survives closing responses, preserves assignment status and notes, and creates no FLT mission or points. Images retain the existing PNG/WebP/JPEG validation and 10 MB limit. Transcript-only evidence needs the Mac Mini renderer and is not a real screenshot. Capture permissions remain unchanged: record any exact capture error as a transcript.

CLI MCP clients use the same tool name and JSON. Reload cached tool schemas via a new connection and `tools/list`. Existing FLT mission behavior remains unchanged.

## Contrato compartido / Shared contract

`POST https://bot.yokup.com/api/bot-inbox/<number>/evidence` is authenticated with the panel service credential. The MCP supplies its key-derived persona, machine and owner; no secrets are returned. `GET /api/bot-inbox/<number>` includes `item.evidencias`, exposed by MCP `encargo_estado`. D1 table `inbox_evidence` is additive; existing assignments and mission history are retained.

Validation: MCP assignment, mission regression, recipient/machine rejection, invalid destination and backend authentication/persistence tests. Live verification is reported in the assignment response after deployment; local tests alone do not prove public delivery.
