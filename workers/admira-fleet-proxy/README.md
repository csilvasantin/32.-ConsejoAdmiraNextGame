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
