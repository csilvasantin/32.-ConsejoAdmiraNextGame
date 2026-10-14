# admira-fleet-proxy

Fuente canónica del Worker que sirve `fleet.admira.live` y hace failover entre
los relays privados de Fleet Control.

El proxy sólo reenvía cabeceras de una allowlist. Para el login first-party,
`Origin` se reenvía únicamente si coincide exactamente con `admira.live` o
`www.admira.live`, y `Cookie` permite transportar el challenge y la sesión
HttpOnly. La respuesta conserva todas las cabeceras `Set-Cookie` y aplica CORS
con origen exacto, credenciales y `Vary: Origin`; nunca usa `*` ni inventa un
origen para clientes headless.

El failover cubre `502`, `504` y los fallos de conectividad Cloudflare
`521/522/523/525/526`, pero sólo repite lecturas, el handoff idempotente o
`/api/run` y `/api/action` cuando llevan `X-Fleet-Command-Id`. Una mutación
ambigua nunca se reenvía a otro relay después de un timeout.

Verificación local:

```sh
npm test
```

El despliegue requiere el gate de QA y se ejecuta desde este directorio con
Wrangler. No se deben copiar tokens o secretos al repositorio.

## Webcam de Analizar (#5863)

Fleet reenvía sólo /api/webcam/* al origen fijo www.admira.live. La Pages
Function consulta la sesión SSO de Fleet en cada petición antes de usar los
secretos WEBCAM_BASE y WEBCAM_KEY de Pages production. El navegador sólo
conoce URLs públicas de fleet.admira.live; nunca recibe la llave ni la base.

Rutas: GET estado, foto.jpg (compatibilidad), video-stream.js, video-rtc.js y
ws (Upgrade: websocket); POST mover, presets/guardar {id,nombre?} y
presets/renombrar {id,nombre}. Toda mutación exige CSRF exacto. Se aceptan
sólo los seis ids fijos; nombres de 1–24 caracteres sin controles. Estado
conserva lista [{id,nombre,pan,tilt,zoom}] validada y descarta otros metadatos.
No hay redirects ni reintentos de mutaciones. Los sockets se autentican al
conectar y se transfieren en ambos saltos con Response.webSocket (Workers).

La UI carga los módulos go2rtc v1.9.14 desde el backend con fetch autenticado,
resuelve el import relativo mediante blobs y usa exclusivamente MSE,
H.264 + AAC. Esto permite conservar la cookie HttpOnly exclusiva de Fleet.
Necesita MediaSource/ManagedMediaSource y soporte H.264/AAC (Safari 17+).
El sonido entra silenciado, M o botón lo cambia. H muestra el overlay;
1–6 presets, flechas de 5° y zoom ±25. Guardar/Renombrar pide elegir un
preset y confirmar su nombre; guardar sustituye su posición en el servidor.
El búfer añade retraso; la cifra mostrada mide búfer, no latencia total.
Salir o esconder la pestaña detiene vídeo; reabrir vuelve a silenciarlo.

/demo no conecta con la cámara: imagen, posiciones y cambios simulados sólo
durante la visita. /tutoriales/webcam-5863.mp4 es un minitutorial exportado
con el generador oficial AdmiraNeXT; animación de instrucciones, no pantalla.
