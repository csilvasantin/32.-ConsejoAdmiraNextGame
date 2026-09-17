# FLT-100529 / helper FLT-100532 · HACKEO Control

SmithMacMini · 17-sep-2026 · encargo #3426 (mismo brief que Niobe #3425).

## Qué

El botón HACKEO de Control devolvía 403 y solo animaba en local: el navegador mandaba `X-Council-Token` (o pedía `council_hack_token` en localStorage) y council-api exige `X-Council-Hack-Token` server-only.

## Cambio

1. `ops/demo-server.py` (Mac Mini :3032)
   - Al arrancar carga `COUNCIL_HACK_TOKEN` de `/Users/csilvasantin/32.-ConsejoAdmiraNextGame/.env` (fail-closed, no se imprime).
   - `POST /hackeo` y `POST /hackeo/stop` proxifican a `http://127.0.0.1:8420/api/council/hackeo[/stop]` inyectando el header.
   - Alias cortos: luna/plata/rosa/carla → ids completos.
   - Se conserva `POST /hack`.
2. UI `callCouncilHackeo`: `POST HACK_API+/hackeo` o `/hackeo/stop` (`HACK_API` = DEMO_API sin `/status`). Sin token en el navegador. Body `{only_ids:[], exclude_ip optional}`.

## Punto de retorno

- Backup: `ops/demo-server.py.bak-flt100529-20260917-111106`
- Restart: LaunchAgent `com.admiranext.demo-server` (KeepAlive). Solo se mata el PID de demo-server, no council-api :8420.

## Smoke

| Superficie | only_ids | ssh_ok |
|---|---|---|
| `http://127.0.0.1:3032/hackeo` | luna,plata,rosa,carla | 4/4 |
| Funnel `https://macmini.tail48b61c.ts.net/demo/hackeo` | luna | 1/1 |
| stop | (council-api stop recorre el consejo; las 4 OK) | ssh_stop ok |

Detalle: `docs/flt-100529-smoke.json`.

## Deploy

- demo-server: local Mac Mini, no Pages.
- UI: `32.-ConsejoAdmiraNextGame` (admira.live GH Pages) + worktree live-deploy (app.js / control).
