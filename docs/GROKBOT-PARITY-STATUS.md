# Paridad GrokBot: entrega y pendientes

21/09/2026 · OraculoMacMini · Hoy #270 · DCL-9445185ab9add02c4cef1215.

La paridad completa sigue abierta. Esta entrega amplía el puente existente y conserva el mismo bot nativo; no crea otra conversación por un proveedor distinto.

| Función | Estado y evidencia |
| --- | --- |
| Texto y selección | Operativos; IDs nativos separan mensajes del mismo minuto y migran los registros anteriores; Disney sincroniza desde producción. Se conservan la reserva de envío, la protección de borradores y la ausencia de reintentos ambiguos. |
| Conversación en Previos | Publicada. Conversación, Escritorio y Pong; ampliación del mismo panel, desplazamiento estable y borradores de texto por consejero. |
| Escritorio | Diagnóstico legible y Reintentar; conserva la última imagen recibida. Usa el proxy autenticado de Fleet. La fecha mostrada es de recepción, no garantiza la antigüedad de la captura nativa. |
| Adjuntos de entrada | Parcial: subida web privada de un archivo de hasta 4 MB, aislamiento y conservación del borrador comprobados. La prueba autorizada con Disney falla antes de pulsar Enviar en GrokBot: el selector nativo se abre, pero no se encuentra el campo de ruta (`attachment_path_unavailable`). No se ha recibido ADJUNTO OK. |
| Rutinas | Lectura real de la lista y del detalle de TelegramparaDisney comprobada en web. Pausa/reanudación exige identidad y revisión; cambios no ensayados sobre rutinas reales. Crear/editar prepara texto que el usuario revisa y envía, como en el compositor nativo. |
| Detener ejecución | Control implementado ligado al turno observado; pruebas de rechazo de turno distinto. No probado sobre un trabajo real. |
| Aprobaciones | Pendiente. Disney no mostraba solicitud pendiente; se pidió dejar una prueba abierta. No se han aprobado ni rechazado operaciones. El puente declara approvals:false. |
| Historial completo | Parcial: se conservan mensajes observados, pero el origen solo ofrece el historial visible a este adaptador. |
| Archivos de respuesta | Los enlaces HTTP(S) de los mensajes ya se pueden abrir. Los archivos que GrokBot entrega mediante tarjetas nativas siguen pendientes de su contrato de descarga autenticada. |
| Resto de consejeros / voz / cloud | Sin equivalencia certificada. El puente tiene Jobs, Wozniak, Disney y Lucas; el resto requiere correspondencia real, no alias inventados. |

## Despliegue del servicio

El backend activo contenía cambios de otro trabajo en el proxy de escritorio. Se insertaron exclusivamente las nuevas rutas de adjuntos y controles, preservando las existentes. Se guardó copia en `.fleet/backups/parity-20260921-190510` antes de instalar. El helper mantiene el identificador de firma instalado y las pruebas de la web verificaron que conserva Accesibilidad.

Los archivos de entrada se guardan en `.fleet/grokbot-uploads`, con permisos privados. No se exponen rutas locales al navegador. No se guardan capturas de conversaciones privadas como evidencia pública de esta misión.

## Prueba autorizada con Disney

El usuario autorizó enviar `admira-parity-test.txt`, un texto benigno de 80 bytes, para obtener ADJUNTO OK sin ejecutar tareas ni crear rutinas. Los intentos quedaron registrados como fallidos antes del envío nativo. La versión web `a63698b` conserva texto y adjunto cuando la preparación falla; los resultados ambiguos siguen sin reintentarse automáticamente.

El adaptador acepta el control AXMenuButton de adjuntos, activa temporalmente la ventana sin cambiar su geometría y recorre los controles del selector sin depender de filas de archivos ilegibles. Rechaza controles ambiguos. Estas mejoras no certifican el recorrido completo: sigue pendiente resolver la introducción de la ruta. La inspección nativa de CUA dejó de funcionar con ScreenCaptureKit -3811 incluso tras reiniciar su sesión; no se sustituyó por otro mecanismo de control del Mac. El servicio Fleet local responde HTTP 200, aunque la web mostró posteriormente “ningún relay disponible”. No se aprobaron acciones ni se alteraron rutinas.
