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

## Webcam de Analizar (#5856)

`GET /api/webcam/foto.jpg`, `GET /api/webcam/estado` y `POST /api/webcam/mover`
son endpoints cerrados: requieren `Origin` de Admira Live y la cookie SSO
`__Host-fleet_session` vigente. El Worker consulta la autoridad de sesión del
Mac Mini en cada petición; mover exige además el CSRF exacto de esa sesión.
Los tokens de máquinas y la sesión de agente de solo lectura no dan acceso.

Configurar **ambos como secretos de Wrangler**, nunca en `[vars]` ni en el
cliente: `WEBCAM_BASE` es la base HTTPS que termina en `/webcam/`;
`WEBCAM_KEY` es la llave del backend. El despliegue no contiene sus valores.
El proxy limita endpoints, JSON y rangos UVC, no sigue redirects, no reintenta
movimientos y elimina los metadatos y errores del upstream. Las fotos y el
estado salen con `Cache-Control: no-store, private`.

La UI recibe una foto cada 5 s mientras el panel está abierto y la pestaña
visible. Son fotos JPEG, no streaming ni audio. Tras mover espera 3,5 s por
el caché de hasta 3 s del puente UVC; ante error mantiene la última hora real
de recepción. Hay cuatro presets; el puente puede tener otros, no ofrecidos
en este panel. `/demo` es pública y solo dibuja datos simulados.

El minitutorial de `/tutoriales/webcam-5856.mp4` se exporta con el generador
oficial de AdmiraNeXT: animación de instrucciones, no grabación de pantalla.
