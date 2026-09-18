# Chat nativo de Grok Bot mediante Accesibilidad

`grokbot-desktop.js` adapta el chat visible de la aplicación firmada de Grok Bot en
el Mac Mini. Lee sus tarjetas mediante el helper AX y escribe en su compositor.
No usa el webhook de encargos, tokens de Grok, bases de datos internas, una API de
desarrollo ni modificaciones de la aplicación. El historial anterior del webhook
permanece en su archivo y proveedor propios.

## Configuración del servidor

El proceso de Fleet necesita estas variables explícitas:

```text
GROKBOT_CHAT_PROVIDER=desktop
GROKBOT_AX_BINARY=/Users/csilvasantin/.fleet/bin/grokbot-ax
GROKBOT_DESKTOP_OWNER_EMAILS=csilvasantin@gmail.com,csilva@admira.com
```

`GROKBOT_DESKTOP_STATE_FILE` es opcional y debe ser una ruta absoluta. El valor
predeterminado es `~/.fleet/grokbot-desktop-state.json`. El archivo se crea con
modo 0600, pertenece al usuario del servicio y no admite un enlace simbólico.
El directorio debe pertenecer al usuario y no permitir escritura de grupo/otros.
Las escrituras usan bloqueo exclusivo, reemplazo atómico y fsync antes de enviar.
No se eliminan recibos para liberar espacio: al alcanzar 10.000 filas o 64 MiB
se falla de forma explícita. Un bloqueo dejado por un proceso caído requiere
verificar que ya no hay escritor antes de retirarlo manualmente.

La lista de propietarios no hereda la allowlist general de Fleet ni tiene un
valor implícito. Todas las funciones públicas requieren una sesión verificada
con `email` y `jti`, y comprueban la lista antes de capturar o leer historial.
Los dos correos configurados corresponden al propietario del mismo escritorio:
comparten su historial nativo. Otros usuarios autenticados reciben 403.

El ejecutable configurado debe ser un archivo normal ejecutable del usuario y
no permitir escritura de grupo/otros. El proceso llama `execFile(binary, [])`
sin shell. Envía únicamente JSON por stdin y no hereda secretos del servidor.
Grok Bot debe estar abierto y el proceso/helper debe tener permiso de
Accesibilidad. Sin permiso se publica `desktop_accessibility_required`, nunca
se modifica la configuración de macOS automáticamente.

## API del módulo

```js
const {createGrokBotDesktop, DesktopBridgeError} = require('./grokbot-desktop');
const provider = createGrokBotDesktop();
await provider.capabilities(verifiedSession);
await provider.list(verifiedSession, 'Steve Jobs');
await provider.select(verifiedSession, 'Steve Jobs');
await provider.send(verifiedSession, {
  persona: 'Steve Jobs', message_id: 'unique-client-id', prompt: 'Texto literal'
});
await provider.get(verifiedSession, 'gb_...');
provider.start(); // Una vez, después de que el servidor escuche.
provider.stop();  // SIGTERM/SIGINT. No interrumpe trabajo del bot.
```

`DesktopBridgeError` contiene `status` y `code`, sin diagnósticos privados del
helper. Fleet aplica además su gate Google y el CSRF existente a cada POST.
`select` corresponde al POST `/api/grokbot/selection` y recibe la persona extraída
y validada por el servidor de `{persona}`. No pasar el cuerpo como comando nativo.

`list` devuelve un array de filas; `send/get` devuelven una fila. Fleet puede
conservar los envelopes `{ok:true,messages:[...]}` y `{ok:true,message:{...}}`.
Cada fila contiene:

```text
id, persona (Jobs/Wozniak/Disney/Lucas), prompt, text,
status, createdAt, updatedAt, source: desktop, native: true
```

`capabilities` devuelve `provider/mode: desktop`, `available`, `bidirectional`,
`historyFromDesktop`, `selectedPersona`, `status`, `reason`, `lastObservedAt`,
`partialVisibleHistory:true` y `pollingIntervalMs`. Solo declara disponible el
canal después de una lectura AX válida. `desktop`, `attachments`, `routines` e
`interrupt` siguen siendo false: este módulo solo integra texto del chat y no
implementa pantalla cloud, adjuntos, gestión de rutinas ni parada del bot.

## Selección, captura y entrega

- Todas las llamadas nativas se serializan, incluidas las de polling.
- `list/get/capabilities` son pasivos: capturan al consejero seleccionado en la
  aplicación, guardan sus datos bajo su identidad real y devuelven la caché de la
  persona solicitada. Nunca cambian de chat.
- `select` se ejecuta solamente por una acción explícita. Un borrador en otro
  chat impide cambiar de consejero. Seleccionar el ya seleccionado conserva su
  borrador. `send` puede seleccionar su destinatario, pero se niega si hay un
  borrador o el helper informa actividad que impida un envío seguro.
- El polling interno lee el chat actualmente seleccionado cada 2,5 segundos;
  no recorre chats ni cambia el foco. `start` es idempotente y `stop` deja de
  programar lecturas. Una operación AX ya iniciada puede finalizar.
- Un POST reserva y persiste su ID antes del único `send` nativo. Un `ok:true`
  del helper no acredita entrega por sí solo: debe observarse una tarjeta nueva
  del usuario con el mismo texto. Una tarjeta ya presente antes del envío no
  cuenta. Sin confirmación, queda `unknown`, incluso después de reiniciar.
- El mismo `message_id` nunca se reenvía. Cambiar su texto produce 409. Tampoco
  puede enviarse el mismo texto/persona con otro ID mientras exista un envío
  idéntico sin confirmar (`desktop_previous_send_unconfirmed`). Una consulta
  posterior puede confirmar un mensaje que sí llegó tras un timeout.
- Una tarjeta de usuario confirmada sin respuesta produce `pending`; texto
  real del bot con actividad produce `in_progress`; texto real y bot inactivo
  produce `done`. La actividad/herramientas no se inventa como respuesta.

Los mensajes se agrupan por la tarjeta del usuario y las respuestas siguientes.
Las respuestas espontáneas conservan `prompt:""`. Una respuesta que llega por
partes actualiza su tarjeta estable, sin concatenar cada versión parcial ni
eliminar las otras tarjetas que estén fuera del viewport. Si el viewport empieza dentro de un turno conocido, se conserva el
contexto previamente observado. La ausencia de una tarjeta fuera del viewport
no equivale a borrado.

**Límite visible:** AX solo expone lo cargado/visible en ese momento. Este canal
no promete importar todo el historial antiguo ni observar simultáneamente los
cuatro chats. `createdAt` usa la fecha ISO de la tarjeta cuando el helper puede verificarla.
En ausencia de fecha completa usa la primera observación. Los empates se ordenan
con incrementos de un milisegundo y la posición se conserva al llegar respuestas. `lastObservedAt` indica la frescura de captura.
Las claves fallback basadas en contenido o tarjetas con marcas de tiempo
idénticas pueden ser ambiguas: en un envío ambiguo se conserva `unknown`.
El usuario puede cambiar el chat o editar el compositor entre llamadas; por eso
el helper debe volver a verificar selección y borrador justo antes de escribir.

## Contrato del helper

Entrada: `{action:"snapshot"|"select"|"send", persona?:nombreCompleto, prompt?:texto}`.
`persona` siempre procede de las cuatro identidades canónicas y el prompt se
transporta como dato literal JSON. Timeout predeterminado: 15 segundos.

Salida:

```text
{ok, selectedPersona, composerHasDraft, busy,
 messages:[{sender:"user"|"assistant"|"event",label,time,text,key}],
 observedAt, error?}
```

Las claves deben ser estables cuando la tarjeta no cambia, sin índices del
viewport. `snapshot` nunca selecciona. `select` verifica el encabezado después
de actuar. `send` comprueba borrador/selección, escribe y pulsa enviar una sola
vez, luego devuelve lo observado. Los errores conocidos incluyen
`accessibility_required`, `draft_exists`, `conversation_busy`, `bridge_busy`,
`persona_not_selected`, `selection_or_draft_changed`, `selection_unconfirmed`,
`composer_not_writable`, `application_not_running` y `unknown`; se normalizan
sin copiar texto privado. Otros errores quedan como `desktop_unavailable`. No leer credenciales ni copiar mensajes a logs.

## Verificación

```sh
node --check fleet-control/grokbot-desktop.js
node --test fleet-control/grokbot-desktop.test.js
```

Las pruebas usan un helper simulado y archivos temporales. Cubren propiedad,
permisos, serialización, borradores, selección, historial parcial, streaming,
orden, no ejecución de prompts, idempotencia, timeout, reinicio y polling.
No abren la UI, no envían mensajes reales ni leen secretos.
