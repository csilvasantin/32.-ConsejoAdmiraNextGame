# Instalar la baja de equipos en el relay del Mac mini (fleet-control)

Para Woz/Smith. **No lo instala el bot**: el servicio `com.admiranext.fleet-control` del Mac mini es tuyo.

## Qué añade

| Ruta (detrás de `https://macmini.tail48b61c.ts.net/fleet/api`) | Auth | Qué hace |
|---|---|---|
| `DELETE /machines/:id[?dryRun=1]` | sesión Google + CSRF **o** `X-Fleet-Token` | Quita la entrada de `fleet.json` |
| `POST /machines/:id/restore` `{machine?}` | sesión + CSRF o `X-Fleet-Token` | La vuelve a poner desde la papelera (o con la copia mínima que mande admira.live) |
| `POST /machines/:id/ticket` `{accion:"eliminar"\|"restaurar"}` | **solo** sesión + CSRF | Firma un ticket de 120 s (HMAC con el token de flota) que admira.live canjea en el servidor |

Cada baja/restauración:
1. copia `fleet.json` a `~/fleet-control/fleet-backups/fleet-AAAAMMDD-HHMMSS-mmm.json`,
2. reescribe `fleet.json` de forma atómica (tmp + rename),
3. actualiza `FLEET.machines` en memoria (no hace falta reiniciar para cada baja),
4. guarda la entrada quitada en `~/fleet-control/fleet-eliminados.json` (papelera),
5. apunta `machine_remove` / `machine_remove_dry` / `machine_restore` / `machine_ticket` en `audit.log`.

Id: exacto; si no, por host; si no, por id normalizado (`admira-macstudio` ≈ `macstudio`) solo si es único (si hay varios, 409).
`/health` anuncia `capabilities.machineRemoval: true`.

## Pasos en el Mac mini

```sh
cd ~/fleet-control
# 0) copia de seguridad del código actual
cp server.js server.js.bak-$(date +%Y%m%d-%H%M%S)
cp fleet.json fleet.json.bak-$(date +%Y%m%d-%H%M%S)

# 1) traer los ficheros del PR (rama fix/control-eliminar-equipo-rele)
BR=https://raw.githubusercontent.com/csilvasantin/32.-ConsejoAdmiraNextGame/fix/control-eliminar-equipo-rele/fleet-control
curl -fsSLo machine-removal.js      $BR/machine-removal.js
curl -fsSLo machine-removal.test.js $BR/machine-removal.test.js
curl -fsSLo /tmp/baja-equipos-server.patch $BR/baja-equipos-server.patch

# 2) aplicar el parche a server.js (si tu server.js es igual al del repo, entra limpio;
#    si no, mira el .patch: son 4 trozos pequeños — require, guardia de FLEET.machines +
#    MACHINE_REMOVAL, capability en /health y el bloque de rutas justo antes del 404 final)
patch --dry-run -p2 server.js < /tmp/baja-equipos-server.patch && patch -p2 server.js < /tmp/baja-equipos-server.patch
node --check server.js
node --test machine-removal.test.js

# 3) reiniciar SOLO el relay
launchctl kickstart -k gui/$(id -u)/com.admiranext.fleet-control   # si es un LaunchDaemon: sudo launchctl kickstart -k system/com.admiranext.fleet-control

# 4) comprobar (sin borrar nada: dryRun)
curl -s https://macmini.tail48b61c.ts.net/fleet/api/health | grep -o '"machineRemoval":true'
curl -s -X DELETE "https://macmini.tail48b61c.ts.net/fleet/api/machines/macstudio?dryRun=1" \
  -H "X-Fleet-Token: $(cat ~/fleet-control/.fleet-token)"     # → {"ok":true,"dryRun":true,...}
tail -2 ~/fleet-control/audit.log                             # → machine_remove_dry
```

Opcional: añade `fleet-backups/` y `fleet-eliminados.json` a lo que ya no subas a ningún sitio.
Si el relay de respaldo (MacBook Pro 16) también corre `fleet-control`, repite allí: si Fleet Mesh
conmuta a él, también puede firmar tickets (mismo token), pero la baja la hace admira.live en el Mac mini.

## Deshacer
`cp server.js.bak-<fecha> server.js && launchctl kickstart -k gui/$(id -u)/com.admiranext.fleet-control`.
Un equipo borrado se recupera con «↩ restaurar» en /control, con `POST /machines/:id/restore`
o copiando el `fleet-backups/fleet-*.json` adecuado sobre `fleet.json` (+ reinicio).
