# Respaldo y failover del Consejo (Mac Mini → este Mac → Cloudflare)

El **Mac Mini** es el hub que sirve, por su Tailscale Funnel, el backend del Consejo y de
FleetControl. Es un *single point of failure*: si su Tailscale cae (o el Mini se apaga), la web
se queda sin backend. Este sistema da **3 niveles de failover automático**.

## Cascada (la web conmuta sola)

| # | Nivel | URL base | Sirve |
|---|---|---|---|
| 1 | **Mac Mini** (primario) | `https://macmini.tail48b61c.ts.net` (+`:8443` optoken) | todo |
| 2 | **Respaldo local** (MacBook-Pro-16) | `https://macbook-pro-16.tail48b61c.ts.net:10000` | node Consejo + fleet (pasivos) |
| 3 | **Cloudflare degradado** | `https://fallback.admira.store` | solo-lectura (roster + último estado conocido) |

`failover.js` (raíz del repo, incluido en todas las páginas) envuelve `fetch`: si una llamada a
`macmini.tail48b61c.ts.net` falla/timeout(6s)/5xx/530, reintenta en orden contra el nivel 2 y
luego el 3, y recuerda el cambio. Reprueba el Mini cada 30s y vuelve a él al recuperarse.

## Piezas en ESTE Mac (MacBook-Pro-16)

LaunchAgents (en `~/Library/LaunchAgents/com.admiranext.*`, KeepAlive/StartInterval):

| Agente | Qué hace | Puerto/cadencia |
|---|---|---|
| `backup-node` | node del Consejo en modo PASIVO (sin pollers de despacho) | 3030 |
| `backup-fleet` | fleet-control | 9140 |
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
3. La web vuelve sola al Mini (failover.js reprueba cada 30s). No hay que tocar la web.
4. Si quieres el `/council` (chat/reunión) y optoken también en el respaldo: con el `.env` ya traído,
   `pip install fastapi uvicorn python-dotenv` y lanzar `council-api.py` (uvicorn :8420) + el optoken.

## Comandos útiles

```bash
# estado de los respaldos
for L in backup-node backup-fleet backup-gateway mini-monitor snap-push mini-recover; do \
  echo -n "$L: "; launchctl print gui/$(id -u)/com.admiranext.$L | grep -m1 'state ='; done
# salud por nivel
curl -s https://macmini.tail48b61c.ts.net/fleet/api/health           # nivel 1 (Mini)
curl -s https://macbook-pro-16.tail48b61c.ts.net:10000/__gw/health   # nivel 2 (este Mac)
curl -s https://fallback.admira.store/__fallback/health              # nivel 3 (Cloudflare)
# estado remoto del monitor
curl -s https://fleet-monitor.csilvasantin.workers.dev/
```
