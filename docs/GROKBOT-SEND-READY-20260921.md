# Envío web que dejaba texto en GrokBot

21/09/2026 · OraculoMacMini · Hoy #344 · DCL-33cdbde99d839c1eb44d3656.

El borrador original se comprobó mediante CUA: seguía en el compositor de Steve Jobs y no aparecía como tarjeta de usuario. Se completó una sola vez con el botón nativo, y la respuesta quedó sincronizada en admira.live. No se reenvió la pregunta.

El helper aceptaba el texto exacto como compositor listo aunque Enviar estuviera deshabilitado. Ahora enfoca el compositor antes de escribir, espera texto compatible y botón habilitado, y vuelve a comprobar el estado habilitado inmediatamente antes de una única pulsación. Si la preparación agota la espera, devuelve `send_not_ready`: texto conservado como borrador y no enviado. Una pulsación sin confirmación sigue siendo ambigua; no se añade un Enter de respaldo ni reintento automático.

La prueba autorizada «Prueba de conexión de admira.live: responde solo CONEXIÓN OK, sin ejecutar ninguna tarea» se envió una vez desde el formulario web tras instalar el helper. CUA confirmó una nueva tarjeta nativa, compositor vacío y respuesta CONEXIÓN OK. No hizo falta pulsar manualmente en GrokBot para esta prueba.

Se observó un segundo defecto de confirmación: GrokBot reemplaza la clave provisional del mensaje al persistirlo, dejando el recibo web pendiente junto a otra fila respondida. El adaptador conserva el recibo solo cuando la secuencia visible de mensajes de usuario coincide exactamente salvo esa clave, con texto, hora nativa y posición iguales. La observación se persiste para soportar un reinicio. No se unen preguntas iguales por su texto ni se acepta un historial desplazado como prueba.

El único recibo duplicado de esta prueba se reconcilió con la tarjeta nativa comprobada mediante CUA, conservando el ID web y su protección de idempotencia. Hay copia privada recuperable del estado anterior; no se publican conversaciones ni capturas privadas. No se migraron duplicados históricos de otros turnos.

Validación: 90 pruebas JavaScript (puente, adjuntos, interfaz y compositor), 28 pruebas puras Swift; incluyen botón deshabilitado, borrador ajeno, idempotencia, reinicio y rechazo de reconciliaciones ambiguas. La transición de identificador se cubre con pruebas deterministas; la verificación nativa real acredita el envío y la respuesta.

Esto corrige el envío de texto y su recibo. Los pendientes de paridad completa (adjuntos nativos, aprobaciones, archivos de respuesta y otros consejeros) siguen descritos en GROKBOT-PARITY-STATUS.md.
