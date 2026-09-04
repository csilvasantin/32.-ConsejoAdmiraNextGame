# Tester visual de players · misión 0158

Ruta: https://www.admira.live/tester/?machine=macbookairrosa
Entrada: Soporte de Admira.tv. El mando existente se abre en otra pestaña con
`machine` exacto y `solo=1`; mantiene su autenticación. El tester no manda órdenes.

## Prueba física

1. Conectar una webcam al ordenador que abre el tester y apuntarla a la pantalla
   de destino. No confundir la pantalla observada con la cámara del mismo portátil.
2. Activar cámara con el botón y permiso del navegador; micrófono siempre apagado.
3. Ajustar el recorte X/Y/ancho/alto (%), aplicarlo y verificar su miniatura.
4. Con el mando, seleccionar contenido conocido. Confirmar manualmente destino
   y expectativa. Movimiento solo para vídeo continuo; referencia solo para
   una imagen que deba permanecer igual.
5. Iniciar vigilancia con pestaña visible. Probar negro y transición a imagen,
   vídeo y pausa, referencia coincidente y diferente, desconexión de webcam.
   Verificar los tiempos y las falsas alarmas antes de usarlo como criterio operativo.
6. Descargar informe textual si se necesita; no contiene fotogramas ni referencia.

## Límites explícitos

Primera versión de heurísticas, no reconocimiento semántico ni certificación
de reproducción. La luminosidad, movimiento y diferencia visual pueden variar
por reflejos, autoexposición, movimiento de cámara y contenido legítimo. Una
pantalla estática no prueba congelación. La identidad del player la confirma
el operador: no se infiere mirando píxeles.

Muestras locales 160×90 a 1 Hz; persistencia elegible 15/30/60 s. El umbral de
negro es 4,5% de luminancia media, movimiento mínimo 0,8% y desviación 20%.
Son valores iniciales que requieren validación física, no umbrales universales.
La pérdida de muestras invalida continuidad; ausencia de vídeo detiene vigilancia.
Recuperación estable 10 s para reducir repeticiones. Registro acotado a 200 eventos.

No hay fetch, grabación, backend de imágenes, almacenamiento persistente ni IA
externa. La cámara requiere acción explícita y se libera al apagar/salir. Cambios
de player, encuadre o reglas invalidan la confirmación. Pestaña oculta pausa el
análisis: no es vigilancia 24/7. Notificaciones locales opcionales; Telegram,
Yokup y automatismos de recuperación no están conectados en esta versión.

## Verificación

`node --test tester/*.test.mjs` prueba heurísticas y ciclo de cámara simulado.
Estas pruebas no sustituyen una cámara real. La misión permanece abierta hasta
verificación física e informe canónico con evidencia autorizada.

Rollback: retirar acceso desde Soporte y revertir el commit del tester. No hay
migraciones, datos remotos ni configuración de players que deshacer.
