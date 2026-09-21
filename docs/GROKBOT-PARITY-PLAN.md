# Paridad de admira.live con GrokBot

Propuesta de OraculoMacMini · 21/09/2026 · Hoy #266 · DCL-cab0c1389c64ba40de55130f.

Carlos pide la misma funcionalidad que GrokBot, aprovechar Previos para mostrar las conversaciones y explicar «Sin cable Lucas». Este documento propone trabajo; no afirma que las funciones pendientes estén implementadas.

## Estado comprobado

El adaptador `fleet-control/grokbot-desktop.js` permite seleccionar consejero, leer mensajes observados y enviar texto. Declara attachments, routines e interrupt como false. El helper nativo y las rutas actuales no exponen operaciones de aprobación. La lectura depende del contenido visible de GrokBot: no es una importación completa del historial. Solo Jobs, Wozniak, Disney y Lucas están mapeados al puente; las demás sillas requieren vinculación explícita a bots existentes.

En `assets/mac-hoy.js`, paintRemoteError muestra SIN CABLE más el alias tanto ante fallo de selección como de imagen. El visor utiliza una captura JPEG por un servicio distinto del chat. No puede deducirse la causa exacta de ese mensaje: puede seguir funcionando el texto aunque falle la captura. Los refrescos de imagen son pasivos para no cambiar el consejero abierto por el usuario.

## Resultado deseado

Una misma conversación identificada en web y GrokBot, con las mismas acciones, permisos, archivos, resultados y estados. La app nativa conserva su identidad; no se crea un segundo bot ni se convierte una petición de chat en una rutina independiente. Confirmar primero qué interfaz soportada permite cada operación; no prometer historial completo ni paridad apoyándose solo en capturas de pantalla.

## Orden de ejecución y aceptación

1. **Estado y recuperación.** Separar salud del chat y del visor. Sustituir SIN CABLE por una causa legible: captura no disponible, sesión caducada, borrador nativo, bot ocupado o consejero no seleccionado. Mostrar hora de última imagen y si está congelada, mantener la última válida y ofrecer Reintentar. Reconectar sin reenviar texto ni cambiar chats desde un refresco pasivo. Aceptación: cada fallo inducido muestra su causa y el chat sigue utilizable si solo falla la imagen.
2. **Conversación en Previos.** Al hablar con un consejero, mostrar mensajes legibles en el espacio completo del módulo, con nombre, estado, historial desplazable y nuevas respuestas. Conservar el compositor SCUMM y los controles de tamaño, cierre y restauración. Ofrecer vistas Conversación, Escritorio y Pong mutuamente excluyentes; ampliar Conversación abre el mismo hilo. Examinar abre Escritorio explícitamente. Al cambiar de consejero, recuperar su hilo y borrador sin mezclar mensajes. Aceptación: todos los accesos muestran el mismo hilo y las acciones llegan una vez al consejero correcto.
3. **Contrato y sincronización.** Inventariar las funciones reales de la versión instalada de GrokBot y cerrar una matriz por consejero. Añadir IDs persistentes de conversación, turno, archivo, aprobación, rutina y ejecución; estados de progreso, cancelación y resultado; paginación e historial completo cuando el origen lo permita. Preferir interfaz soportada del origen; ampliar el adaptador nativo solo donde sea necesario y verificar recepción. Proteger borradores y seleccionar bajo coordinación común. Aceptación: reinicios, dos pestañas y uso simultáneo nativo/web no duplican envíos ni mezclan hilos.
4. **Adjuntos y resultados.** Adjuntar por archivo, pegar y arrastrar; previsualizar, cancelar y mostrar progreso, límites y errores reales. Entregar al mismo turno nativo y permitir abrir/descargar los resultados con el mismo control de acceso. Aceptación: imagen y documento enviados desde web aparecen en GrokBot y el resultado vuelve al mismo hilo; fallo de subida no produce un envío vacío.
5. **Aprobaciones y control de ejecución.** Mostrar la solicitud nativa exacta, su operación y alcance; aceptar/rechazar una vez, con resultado sincronizado y registro. No sustituir la aprobación por un mensaje «sí» ni ampliar permisos automáticamente. Incorporar detener/cancelar y las acciones equivalentes que ofrezca GrokBot. Aceptación: aprobar en una superficie actualiza la otra; una aprobación caducada, revocada o duplicada no ejecuta nada adicional.
6. **Rutinas y resto del inventario.** Listar, crear, editar, ejecutar, pausar y consultar ejecuciones según lo que ofrezca realmente GrokBot. Sincronizar horario, zona horaria, destino y resultados usando la misma rutina del origen. Incluir en la matriz las funciones de conversaciones, modelos, herramientas, voz y escritorio cloud si existen en la versión instalada. Aceptación: una rutina creada en web es la misma visible en GrokBot y una ejecución produce un único resultado.
7. **Paridad de extremo a extremo.** Repetir casos equivalentes en ambas superficies: texto, historial, adjuntos, aprobación/rechazo, interrupción, rutinas, recuperación tras desconexión y varias sesiones. Marcar cada función como equivalente, parcial o bloqueada. No dar la paridad por terminada con funciones parciales o bloqueadas.

## Dependencias y alcance

Previos y los estados del visor pueden resolverse sobre el puente actual. El historial completo, adjuntos, aprobaciones y rutinas requieren comprobar y ampliar la integración con GrokBot; no son solo cambios visuales. La dependencia del Mac Mini se mantiene mientras sea el ejecutor nativo. Evitar plazos cerrados hasta completar el inventario y una prueba de cada interfaz necesaria.
