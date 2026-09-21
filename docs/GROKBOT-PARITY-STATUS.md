# Paridad GrokBot: entrega y pendientes

21/09/2026 · OraculoMacMini · Hoy #270 · DCL-9445185ab9add02c4cef1215.

La paridad completa sigue abierta. Esta entrega amplía el puente existente y conserva el mismo bot nativo; no crea otra conversación por un proveedor distinto.

| Función | Estado y evidencia |
| --- | --- |
| Texto y selección | Operativos; IDs nativos separan mensajes del mismo minuto y migran los registros anteriores; Disney sincroniza desde producción. Se conservan la reserva de envío, la protección de borradores y la ausencia de reintentos ambiguos. |
| Conversación en Previos | Publicada. Conversación, Escritorio y Pong; ampliación del mismo panel, desplazamiento estable y borradores de texto por consejero. |
| Escritorio | Diagnóstico legible y Reintentar; conserva la última imagen recibida. Usa el proxy autenticado de Fleet. La fecha mostrada es de recepción, no garantiza la antigüedad de la captura nativa. |
| Adjuntos de entrada | Implementados: un archivo de hasta 4 MB, almacenamiento privado ligado al propietario, imagen pegada por la misma conversación. Pruebas de límites, aislamiento y cambios de consejero. Falta confirmar el envío completo de un adjunto desde producción con la prueba autorizada por el usuario. |
| Rutinas | Lectura real de la lista y del detalle de TelegramparaDisney comprobada en web. Pausa/reanudación exige identidad y revisión; cambios no ensayados sobre rutinas reales. Crear/editar prepara texto que el usuario revisa y envía, como en el compositor nativo. |
| Detener ejecución | Control implementado ligado al turno observado; pruebas de rechazo de turno distinto. No probado sobre un trabajo real. |
| Aprobaciones | Pendiente. Disney no mostraba solicitud pendiente; se pidió dejar una prueba abierta. No se han aprobado ni rechazado operaciones. El puente declara approvals:false. |
| Historial completo | Parcial: se conservan mensajes observados, pero el origen solo ofrece el historial visible a este adaptador. |
| Archivos de respuesta | Los enlaces HTTP(S) de los mensajes ya se pueden abrir. Los archivos que GrokBot entrega mediante tarjetas nativas siguen pendientes de su contrato de descarga autenticada. |
| Resto de consejeros / voz / cloud | Sin equivalencia certificada. El puente tiene Jobs, Wozniak, Disney y Lucas; el resto requiere correspondencia real, no alias inventados. |

## Despliegue del servicio

El backend activo contenía cambios de otro trabajo en el proxy de escritorio. Se insertaron exclusivamente las nuevas rutas de adjuntos y controles, preservando las existentes. Se guardó copia en `.fleet/backups/parity-20260921-190510` antes de instalar. El helper mantiene el identificador de firma instalado y las pruebas de la web verificaron que conserva Accesibilidad.

Los archivos de entrada se guardan en `.fleet/grokbot-uploads`, con permisos privados. No se exponen rutas locales al navegador. No se guardan capturas de conversaciones privadas como evidencia pública de esta misión.
