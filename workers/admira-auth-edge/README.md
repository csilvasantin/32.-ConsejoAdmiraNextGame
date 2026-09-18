# Admira Auth Edge

Worker canónico para `www.admira.live/auth/*`. Mantiene challenges y handoffs GIS
en un Durable Object con TTL. El callback nunca pone tokens de sesión en URL o
storage: entrega a FleetControl un código opaco cuyo resultado es estable durante
60 segundos, de modo que una respuesta perdida se puede recuperar por otro relay.
La concesión y su estado activo/revocado viven en el mismo Durable Object. Los
endpoints internos de consumo y sesión exigen `AUTH_EDGE_SHARED_SECRET`; debe
configurarse como secreto Wrangler con el mismo valor cargado por ambos hubs
desde `AUTH_EDGE_SHARED_SECRET`, `AUTH_EDGE_SHARED_SECRET_FILE` o
`~/.fleet/auth-edge-shared-secret`.

`wrangler deploy` crea la ruta parcial sobre el mismo host que Pages. La migración
`v1` debe desplegarse antes de activar el login URI `https://www.admira.live/auth/callback`.

## Contrato de autorización y despliegue

Desde FLT-100639 el Worker usa `WHITELIST_MACHINE_TOKEN` para leer la lista privada.
La credencial debe coincidir con la configurada en `admira-whitelist`; se conserva
solo como secreto Worker y nunca viaja al navegador. El destino queda fijado a
`https://whitelist.admira.store/list`, sin redirecciones ni fallback de usuarios.
Siguen siendo necesarios Google válido, audience, issuer, nonce, expiración,
email verificado, CSRF y pertenencia actual a `superusers`.

Publicar con `node deploy.mjs`, desde esta carpeta. Ejecuta regresiones, comprueba
la lista privada, sincroniza la credencial existente por stdin, publica y exige
que `/auth/health` responda correctamente. Puede recibir los secretos por entorno
o mediante `WHITELIST_MACHINE_TOKEN_FILE` y `AUTH_EDGE_SHARED_SECRET_FILE`.
Los valores por defecto usan los ficheros privados ya existentes del Mac Mini.
`node deploy.mjs --check-only` comprueba la integración desplegada sin modificarla.
`GET /auth/health` exige `AUTH_EDGE_SHARED_SECRET` y no expone cuentas ni secretos.

Cualquier cambio en la autenticación de whitelist debe verificar este consumidor,
el hub Fleet y Usuarios antes de considerarse terminado. Un `200` del sitio no
acredita un login: completar Google → callback → handoff → sesión en el navegador.

### Incidente del 18-09-2026

El commit `5bc623b` de admira-whitelist convirtió `/list` en privado a las 11:04
CEST. El hub adoptó la credencial pero Auth Edge continuó con una lectura anónima.
El bundle vivo `f27bebf9` convertía ese `401` en `google_not_authorized`. Las dos
cuentas de Carlos seguían autorizadas. No fue causado por los enlaces del menú.
Las pruebas anteriores simulaban una lista pública y no cubrían este contrato.

Ahora un fallo de la dependencia responde `503 authorization_unavailable`, una
caída de validación Google `503 google_validation_unavailable`, una identidad
Google inválida `401 google_not_authorized` y una cuenta fuera de `superusers`
`403 account_not_authorized`. Los navegadores reciben explicación y enlace para
reiniciar el login; los clientes JSON conservan el código de error. No se crea
sesión ante fallos de red, configuración, formato o autorización.

El fetch de Workers usa `redirect:manual` y rechaza cualquier 3xx: su runtime no
admite `redirect:error`, aunque Node sí. El health posterior al despliegue
comprueba esa diferencia real; las pruebas locales por sí solas no bastan.
