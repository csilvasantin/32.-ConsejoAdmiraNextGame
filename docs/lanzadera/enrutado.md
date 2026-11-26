# Enrutado de la lanzadera (sala de reuniones de Terminator)

La lanzadera elige cada pantalla por `machineId` y por el nombre EDID del monitor. No se adivina por posición ni por índice. Si el monitor no está conectado, se muestra un error y no se abre la demo en otra pantalla.

## Reparto fijo

- **Consejeros Leyendas** (tema AdmiraNeXT o el que se pida): siempre en la pantalla externa del MacBook Air Rosa, Philips `86BDL3650Q`. En macOS es el único externo, a la derecha del portátil.
- **Consumos**: siempre en la pantalla extendida grande de arriba del MacBook Air Crema, EDID `PC Monitor` (4K). El portátil del Crema puede quedar en negro.
- **MacBook Air Plata**: queda fuera mientras no esté conectado. No se sustituye por otro equipo.

## Marca

La caja inferior de las Leyendas autónomas pone siempre **LEYENDAS AUTÓNOMAS · ADMIRANEXT**, en cualquier demo o tema. El botón Pausar está en el menú superior; Opciones, en la caja inferior (quitar a Carlos de la mesa, hablar en inglés, silenciar, idea, Carlo Bonomi, ir a Coetáneos).

## Comprobación

Antes de marcar una demo como en marcha se hace una captura de cada pantalla destino. Sin esa captura, el plan no se da por bueno.

## Sala en negro

El botón «Sala en negro» (voz: «sala en negro», CLI: `/sala negro`, `/demo negro`) abre una página negra a pantalla completa en la Philips del Rosa y en el PC Monitor del Crema. No apaga los equipos, no oculta el cursor (`cursor: auto`) y no desactiva ningún dispositivo.


## Apagado por zona (t454u)

Cada apagado pide confirmación en la propia lanzadera. Reutiliza [Sala en negro](/lanzadera/negro.html). No se duermen las pantallas, para que el cursor siga viéndose.

- **Apagar sala de reuniones Terminator** (`/apagar reuniones`): Philips 86BDL3650Q del Rosa, PC Monitor de arriba del Crema, pantalla del portátil del Crema y el Plata si está conectado. No se toca el portátil del Rosa (ojos remotos ni sesiones).
- **Apagar sala de interactivos Terminator** (`/apagar interactivos`): players de AdmiraNeXT01–05 y las verticales 01V, 03V y 05V, más AdmiraDesk (se cierra o se pone en negro el control, no se apaga el equipo). 03 y 04 quedan pendientes hasta confirmar su machineId.
- **Apagar todo** (`/apagar todo`): las dos zonas.

Nunca se apaga ni se reinicia el Mac Studio ni el Mac Mini. El cursor no se oculta. No se cierran los ojos remotos ni las sesiones de Grok Bot o de los agentes.

**Encender / Restaurar:** `/encender reuniones` relanza la demo por defecto AdmiraNeXT.com; `/encender interactivos`, la Demo AdmiraNeXT con AdmiraDesk; `/restaurar todo`, las dos.
