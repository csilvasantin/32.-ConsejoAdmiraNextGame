# Admira Auth Edge

Worker canónico para `www.admira.live/auth/*`. Mantiene challenges y handoffs GIS
en un Durable Object, con consumo atómico y TTL. El callback nunca pone tokens en
URL o storage: entrega un código opaco de un solo uso por POST a FleetControl.

`wrangler deploy` crea la ruta parcial sobre el mismo host que Pages. La migración
`v1` debe desplegarse antes de activar el login URI `https://www.admira.live/auth/callback`.
