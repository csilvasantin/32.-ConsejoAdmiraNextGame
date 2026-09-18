# Puente local de Accesibilidad Grok Bot

Compilar en macOS:

```sh
swiftc -O fleet-control/grokbot-ax.swift -o /private/tmp/grokbot-ax
/private/tmp/grokbot-ax --self-test
printf '%s\n' '{"action":"snapshot"}' | /private/tmp/grokbot-ax
```

Entrada JSON por stdin: `snapshot`, `select` o `send`. `select` y `send` requieren
`persona` exacta: Steve Jobs, Steve Wozniak, Walt Disney o George Lucas. `send`
también requiere `prompt` no vacío, máximo 16.000 caracteres. Una petición por
proceso. Stdout siempre contiene JSON; no se escriben transcripciones en disco.

Salida: `ok`, `selectedPersona`, `composerHasDraft`, `busy`, `messages`,
`observedAt` y, si corresponde, `error`. Cada mensaje contiene `sender`
(`user`, `assistant` o `event`), `label`, `time`, `text`, `key`. La clave combina
persona, emisor, día, etiqueta y hora nativos; no cambia mientras crece el texto
ni depende del índice visible. Hoy/Ayer se convierten a fecha local absoluta y
`time` es ISO 8601 con el huso local cuando existe un separador de día.

`snapshot` solo lee la conversación principal actualmente seleccionada, aunque
se suministre otra persona. El backend debe contrastar `selectedPersona`; un
sondeo nunca cambia la selección. Se excluyen detalles, rutinas, sidebar,
intercambios secundarios y el compositor del contenido de mensajes.

`select` pulsa una vez el bot de la lista y verifica la cabecera. Rechaza un
borrador antes de cambiar. `send` nunca selecciona implícitamente: exige persona
exacta, compositor vacío y conversación sin generación activa, escribe mediante
AXSetValue y pulsa una sola vez `Enviar mensaje`. Solo confirma éxito cuando
observa una tarjeta `user` nueva con el prompt, y devuelve el snapshot posterior.
Cualquier resultado incierto tras escribir/pulsar devuelve `error: "unknown"`;
no reintenta ni borra el posible borrador. El backend mantiene su cola serial.
Un bloqueo de archivo por usuario impide mutaciones concurrentes de este helper.

El compositor vacío expone su placeholder como AXValue; se reconoce únicamente
si coincide exactamente con la persona y no hay botón de envío habilitado.
Un texto literal idéntico al placeholder con botón de envío sigue siendo borrador.

Requiere Grok Bot abierto (`com.anysphere.sand`) y permiso macOS de Accesibilidad.
Sin permiso devuelve `accessibility_required` sin abrir diálogos ni modificar
TCC. No usa Apple Events, tokens, APIs privadas o modo desarrollador; no mueve,
redimensiona ni activa ventanas. Las pruebas `--self-test` son parsing puro y no
consultan Accesibilidad. La validación inicial del desarrollo fue solo lectura;
el envío real corresponde a la prueba autorizada del agente principal.
