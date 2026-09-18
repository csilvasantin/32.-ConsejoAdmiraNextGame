# Grok Bot: proveedor de encargos del Consejo

`grokbot-bridge.js` conecta la sesión Google autorizada de FleetControl con el
bot-inbox existente de `https://bot.yokup.com`. El worker despierta la rutina del
consejero; éste devuelve su respuesta por el MCP de Admira. No es el protocolo
interno de la app Grok Bot, ni un segundo modelo con el mismo nombre.

## Configuración del relay

- `ADMIRA_TELEGRAM_PANEL_KEY`: credencial server-only ya autorizada para bot-inbox.
- Alternativa: `ADMIRA_TELEGRAM_PANEL_KEY_FILE`, ruta **absoluta explícita** a un
  fichero regular del usuario del servicio, sin symlink y con permisos `0600`.
  Una variable directa presente tiene prioridad, incluso si es inválida.
- La credencial del proveedor es opaca: admite valores cortos existentes, no
  vacíos y de hasta 4096 bytes. Rechaza caracteres de control, incluidos saltos
  de línea; escribir el fichero sin newline final. No modifica ni rota la clave.
  La política de 32 bytes del secreto HMAC de sesiones es independiente.
- `GROKBOT_BRIDGE_STATE_FILE`: opcional; por defecto
  `~/.fleet/grokbot-bridge-state.json`. Guarda mensajes y propiedad, nunca la clave.
  El directorio debe pertenecer al servicio y no admitir escritura de grupo/otros.
- Sin credencial, capacidades devuelve `available:false`; no se hace fallback a
  una API LLM. No se registran tokens ni respuestas de error del proveedor.

Desplegar juntos `server.js` y `grokbot-bridge.js`, conservando las dependencias
de autenticación existentes de FleetControl. Reiniciar el relay mediante su servicio habitual.
El módulo no instala rutinas, no crea misiones y no configura credenciales.
Se reutilizan las rutinas de Jobs, Wozniak, Disney y Lucas ya configuradas en el
worker de Telegram. La disponibilidad de cada rutina se verifica operativamente;
la capacidad `available` significa que el relay tiene su proveedor configurado.

Usar un único relay para estos endpoints. La idempotencia persiste en el fichero
local del relay; no se debe reenviar el mismo mensaje a otro relay con otro estado.

## HTTP

Todos los endpoints exigen `gate(req,res,ip)`: sesión Google verificada, allowlist
vigente y registro de sesión activo. Las mutaciones también exigen Origin admitido
y `X-Fleet-CSRF`. Un token de máquina no da acceso. El autor se obtiene del email
verificado; no se permite declararlo en el body.

- `GET /api/grokbot/capabilities` → `{ok:true,provider:'webhook',available,...}`.
  `historyFromDesktop`, `desktop`, `attachments`, `routines` e `interrupt` son
  siempre `false`. `personas` contiene `{persona,name}` para las cuatro sillas.
- `POST /api/grokbot/messages` con `{message_id,persona,prompt}` → HTTP 202,
  `{ok:true,message}`. `message_id`: 8–120 caracteres alfanuméricos o `._:-`.
  `prompt`: 5–16000 caracteres. `persona`: alias canónico o nombre completo.
  No admite adjuntos, autor, target ni campos adicionales.
- `GET /api/grokbot/messages/:id` → `{ok:true,message}`. Solo consulta encargos
  creados por el mismo email verificado. Otros autores y IDs no registrados → 404,
  sin consultar al proveedor.
- `GET /api/grokbot/messages?persona=Steve%20Jobs` → `{ok:true,messages:[...]}`.
  Últimos 100 mensajes propios de ese consejero, ordenados por fecha de creación.
  Es historial de esta integración; no importa conversaciones de la app desktop.

Mensaje público:

```json
{"id":"gb_<48 caracteres hex>","persona":"Jobs","status":"pending","prompt":"...","text":"","createdAt":"<ISO>","updatedAt":"<ISO>"}
```

Estados: `pending`, `in_progress`, `blocked`, `done`, `failed`, `unknown`.
`unknown` significa que no se pudo confirmar la aceptación: NO equivale a error
seguro ni a éxito. El proveedor podría haber recibido el POST antes del timeout.
El frontend debe conservar el recibo y decir que la entrega no está confirmada.
Dejar de sondear no detiene el bot.

## Idempotencia y recuperación

La combinación de email verificado y `message_id` obtiene un recibo público
estable. Se reserva en disco antes del único POST, con escritura atómica, `fsync`
y modo `0600`. El mismo ID y contenido devuelve el recibo; contenido diferente
devuelve 409. Nunca se reintenta automáticamente un envío ambiguo, tampoco tras
reiniciar el proceso. El ID secuencial del bot-inbox queda privado en disco.

El lock `.lock` solo cubre la transacción local y evita reservas concurrentes entre
procesos. Si queda un lock tras una caída, el servicio falla cerrado para envíos;
el operador debe verificar que no queda un proceso escritor antes de retirarlo.
No borrar el estado para resolver errores: se perdería la memoria de idempotencia.
El almacén admite hasta 20000 recibos y 64 MiB; al llenarse deja de aceptar nuevos
datos de forma explícita. No caduca recibos automáticamente.

## Verificación sin efectos externos

```sh
node --test fleet-control/grokbot-bridge.test.js fleet-control/session-csrf.test.js
node --check fleet-control/server.js
```

Las pruebas usan un proveedor simulado y ficheros temporales: no despiertan bots,
no leen credenciales reales y no crean encargos externos.
