# Fleet Mesh: relays, failover y modo degradado

FleetControl ya no interpreta el Mac Mini como centro ni como fuente única de
verdad. Es el relay preferido, pero cualquier equipo que ejecute
`fleet-control/server.js`, tenga acceso SSH a la flota y publique su gateway
puede operar como relay alternativo.

La web separa tres dimensiones:

1. **Equipo**: accesibilidad del ordenador objetivo.
2. **Observabilidad**: heartbeat, captura, proof-of-play y acuses.
3. **Ruta de control**: relay usado para SSH, capturas y comandos.

Una ruta inaccesible nunca se presenta como «equipo caído».

## Relays iniciales

| # | Nivel | URL base | Sirve |
|---|---|---|---|
| 1 | **Mac Mini** (preferido) | `https://macmini.tail48b61c.ts.net/fleet/api` | lectura + comandos |
| 2 | **MacBook Pro 16** | `https://macbook-pro-16.tail48b61c.ts.net:10000/fleet/api` | lectura + comandos |
| 3 | **Cloudflare degradado** | `https://fallback.admira.store` | solo-lectura (roster + último estado conocido) |

`control/fleet-mesh.js` gobierna específicamente `/fleet`:

- conserva la cookie Google HttpOnly y cada relay valida la misma concesión;
- prueba el relay activo y conmuta al siguiente ante error de red o 5xx;
- recuerda temporalmente las rutas que fallan;
- indica en cada respuesta qué relay se utilizó;
- adjunta `X-Fleet-Command-Id` a las órdenes.

En macOS y Linux, el backend convierte ese identificador en un cerrojo y un
recibo dentro de `~/.admira-fleet/commands` del **equipo objetivo**. Si la
respuesta se pierde y otro relay reintenta la orden, el objetivo no la ejecuta
dos veces.

Los endpoints de estado, preflight, captura, acciones y control remoto usan la
malla. Las sesiones interactivas de terminal quedan fijadas al relay que las
abrió hasta que se cierran.

## Login y sesiones compartidas

`admira-auth-edge` crea una sola concesión (`jti`, `csrf`, `iat`, `exp`) en su
Durable Object al completar Google. Repetir el handoff dentro de sus 60 segundos
devuelve exactamente esa concesión; los dos relays producen por tanto la misma
cookie firmada. El Durable Object conserva el registro activo durante 12 horas
y los hubs lo consultan al validar. Logout elimina el registro, así que la
revocación se aplica a ambos relays y sobrevive sus reinicios.

Hay dos secretos distintos y nunca se guardan en Git:

- `FLEET_SESSION_SECRET`: firma las cookies. Tiene prioridad el env directo,
  después `FLEET_SESSION_SECRET_FILE` y finalmente
  `~/.fleet/fleet-session-secret`. El fichero debe ser regular, propiedad del
  usuario del servicio, modo `0600` y contener al menos 32 bytes. Ambos relays
  deben tener exactamente el mismo valor.
- `AUTH_EDGE_SHARED_SECRET`: autentica hub→Auth Edge para consumir handoffs,
  registrar, comprobar y revocar sesiones. Admite env directo,
  `AUTH_EDGE_SHARED_SECRET_FILE` o el fallback
  `~/.fleet/auth-edge-shared-secret`, con las mismas reglas de fichero seguro.
  Debe ser el mismo secreto Wrangler y en ambos hubs, con al menos 32 bytes.

Orden de rollout: crear y distribuir ambos secretos; publicar Auth Edge;
actualizar ambos hubs de forma coordinada —o mantener el tráfico pinneado al hub
ya actualizado— y reiniciarlos uno por uno, comprobando `/api/health` en cada
paso; publicar el proxy público sólo cuando ambos hubs estén sanos y homogéneos;
ejecutar los canarios de login y forzar la caída de cada relay. El proxy nunca
se activa frente a una mezcla de hubs antiguos y nuevos.

```bash
install -d -m 700 "$HOME/.fleet"
umask 077
openssl rand -base64 48 > "$HOME/.fleet/fleet-session-secret"
openssl rand -base64 48 > "$HOME/.fleet/auth-edge-shared-secret"
chmod 600 "$HOME/.fleet/fleet-session-secret" "$HOME/.fleet/auth-edge-shared-secret"
```

Los comandos se ejecutan una sola vez y ambos ficheros se copian por canal seguro
al segundo relay; no se generan otros valores allí ni se imprimen en terminal o
logs. El contenido de `auth-edge-shared-secret` se provisiona además como secreto
Wrangler `AUTH_EDGE_SHARED_SECRET`.

## Añadir otro relay

1. Instalar el mismo repositorio y `fleet-control/fleet.json`.
2. Dar al equipo acceso SSH sin contraseña a los objetivos que deba operar.
3. Arrancar el servicio indicando identidad propia:

```bash
FLEET_RELAY_ID=macbookpronegro14 \
FLEET_RELAY_LABEL="MacBook Pro 14" \
FLEET_SESSION_SECRET_FILE="$HOME/.fleet/fleet-session-secret" \
AUTH_EDGE_SHARED_SECRET_FILE="$HOME/.fleet/auth-edge-shared-secret" \
FLEET_PORT=9140 \
node fleet-control/server.js
```

4. Publicar `/fleet` mediante Tailscale Funnel/gateway.
5. Añadir su URL a `DEFAULT_RELAYS` en `control/fleet-mesh.js` o inyectar antes
   de cargarlo:

```js
window.ADMIRA_FLEET_RELAYS = [
  { id: "macmini", label: "Mac Mini", base: "https://macmini.tail48b61c.ts.net/fleet/api", priority: 10 },
  { id: "macbookpro16", label: "MacBook Pro 16", base: "https://macbook-pro-16.tail48b61c.ts.net:10000/fleet/api", priority: 20 },
  { id: "macbookpro14", label: "MacBook Pro 14", base: "https://HOST:PUERTO/fleet/api", priority: 30 }
];
```

Marcar además el equipo con `"relayCapable": true` en `fleet.json`.

## Piezas en ESTE Mac (MacBook-Pro-16)

LaunchAgents (en `~/Library/LaunchAgents/com.admiranext.*`, KeepAlive/StartInterval):

| Agente | Qué hace | Puerto/cadencia |
|---|---|---|
| `backup-node` | node del Consejo en modo PASIVO (sin pollers de despacho) | 3030 |
| `backup-fleet` | relay FleetControl | 9140 |
| `backup-gateway` | multiplexa por prefijo (`/fleet`→9140, `/council`→8420, resto→3030) | 8088 |
| `mini-monitor` | avisa por Telegram (DM Carlos 8663681) si el Mini cae/vuelve | /180s |
| `snap-push` | empuja feed+tareas reales al KV del nivel 3 | /300s |
| `mini-recover` | al volver el Mini, sincroniza datos + trae `.env`/optoken | /120s |

Funnel de este Mac: `tailscale funnel --bg --https=10000 http://127.0.0.1:8088` (el `/` ya estaba ocupado).

## Cloudflare

- **`council-fallback`** (worker, `~/Claude/council-fallback`) → `fallback.admira.store` (custom domain,
  no bloqueado por el ISP ES). KV `FALLBACK_KV`. Ingesta de snapshots: `POST /snap` con `X-Snap-Token`
  (token en `~/.fleet/.snap-token`, secreto `SNAP_TOKEN` en el worker).
- **`fleet-monitor`** (worker, `~/Claude/fleet-monitor`) → cron `*/3` que sondea el funnel del hub y
  avisa por Telegram. KV `MON_KV`. **OJO:** `wrangler kv key get/put` opera sobre el KV **LOCAL**
  (miniflare); para ver el estado REMOTO usa el endpoint del worker (`/`), no wrangler kv.

## Recuperación cuando vuelva el Mini

1. En el Xpacio: abrir Tailscale en el Mini y **reconectar** (o reiniciar la app / el Mini). Verás
   `tailscale status` con `macmini ... active` (sin "offline").
2. **Automático**: `mini-recover` (este Mac) detecta el Mini vivo y sincroniza `data/tasks.json`,
   `council-meetings.json`, y se trae `.env`/`council-api.py`/optoken a `~/.fleet/mini-sync/`; avisa por Telegram.
3. Fleet Mesh vuelve a preferir el Mini cuando su ruta se recupera. No hay que tocar la web.
4. Si quieres el `/council` (chat/reunión) y optoken también en el respaldo: con el `.env` ya traído,
   `pip install fastapi uvicorn python-dotenv` y lanzar `council-api.py` (uvicorn :8420) + el optoken.

## Comandos útiles

```bash
# estado de los respaldos
for L in backup-node backup-fleet backup-gateway mini-monitor snap-push mini-recover; do \
  echo -n "$L: "; launchctl print gui/$(id -u)/com.admiranext.$L | grep -m1 'state ='; done
# salud por nivel
curl -s https://macmini.tail48b61c.ts.net/fleet/api/health           # nivel 1 (Mini)
curl -s https://macbook-pro-16.tail48b61c.ts.net:10000/fleet/api/health # nivel 2
curl -s https://fallback.admira.store/__fallback/health              # nivel 3 (Cloudflare)
# estado remoto del monitor
curl -s https://fleet-monitor.csilvasantin.workers.dev/
```
