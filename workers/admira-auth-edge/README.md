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
