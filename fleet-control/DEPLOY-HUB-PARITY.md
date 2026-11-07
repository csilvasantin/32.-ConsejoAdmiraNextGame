# Hub unificado (captura v3 + lo que ya corre en los Mac)

Los dos hosts arrancan una carpeta suelta `~/fleet-control`, no un clone.
Las copias del 7-nov-2026 (sin `fleet.json`, sin secretos) dicen:

| Fichero | Mac Mini (5-nov) | Mac Studio (19-oct) | Qué hacer |
|---|---|---|---|
| `agent-session.js` | igual en los dos, no estaba en main | igual | copiar el del repo |
| `machine-removal.js` | igual en los dos (es el de `fc012b2`) | igual | copiar el del repo |
| `server.js` | Mini = Studio + pantalla bloqueada en el fallback de Grok + `perifericos` | más viejo | sustituir por el `server.js` de este commit en los dos |
| `grokbot-remote.js` | tiene vista sola y `remote_screen_locked` | más viejo, sin eso | sustituir por el del repo (el de main más el aviso de bloqueo) |
| `control-vigia.js` | anterior a la captura v3 | igual de viejo | sustituir por el del repo. El de la copia reabre `capture.req` |
| `grokbot-desktop.js` | (igual a main, no vino en la copia) | sin el argumento `screenshot` | dejar el del repo. El de Studio quita el fallback de captura |
| `fleet.json`, `.env`, `.fleet-token` | vivos en cada host | vivos | no copiar nada de esto |

El `server.js` nuevo no es el del Mini ni el del Studio. Junta:

- captura v3 (cola `capture-queue`, sin reinstalación que pise un agente más nuevo),
- sesión de agente de solo lectura (`/api/auth/agente`, cookie `__Host-fleet_agent`),
- baja `DELETE /api/machines/:id` con copia en `fleet-backups/`,
- `LOCKED` si la sesión gráfica está bloqueada antes del fallback de Grok,
- el resolvedor de alias de main (`admira-macbookairplata` → `macbookairplata`). El Mini en producción lo había quitado; volver a ponerlo no cambia la lista de correos.

`FALLBACK_ALLOW` sigue siendo `csilva@admira.com` y `csilvasantin@gmail.com`. El token de agente sigue leyéndose de `ADMIRA_AGENT_LOGIN_TOKEN` o de `~/.fleet/admira-agent-login-token` (modo 0600). No se crea ni se rota desde aquí.

## Qué copiar, en cada host, después de una copia de seguridad

No se ha desplegado desde esta VM.

```bash
cd ~/fleet-control
stamp=$(date +%Y%m%d-%H%M%S)
cp server.js server.js.bak-$stamp
cp grokbot-remote.js grokbot-remote.js.bak-$stamp
cp control-vigia.js control-vigia.js.bak-$stamp
cp grokbot-desktop.js grokbot-desktop.js.bak-$stamp
# desde el clone de este commit, no desde la copia vieja:
cp <repo>/fleet-control/server.js .
cp <repo>/fleet-control/agent-session.js .
cp <repo>/fleet-control/machine-removal.js .
cp <repo>/fleet-control/grokbot-remote.js .
cp <repo>/fleet-control/grokbot-desktop.js .
cp <repo>/fleet-control/control-vigia.js .
cp <repo>/fleet-control/capture-client.js .
cp <repo>/fleet-control/fleet-capture.py <repo>/fleet-control/display_geometry.py <repo>/fleet-control/fleet-input.py .
cp <repo>/fleet-control/deploy-capture-agent.sh .
node --check server.js
node --test agent-session.test.js machine-removal.test.js capture-client.test.js control-vigia.test.js grokbot-remote.test.js
```

El agente de captura, con la sesión gráfica abierta (no por un SSH sin `gui/<uid>`):

```bash
bash deploy-capture-agent.sh local
```

Eso no toca `fleet.json`. Reiniciar el relay después:

```bash
launchctl kickstart -k gui/$(id -u)/com.admiranext.fleet-control
```

Comprobar sin borrar máquinas:

```bash
curl -s http://127.0.0.1:9140/api/health | grep machineRemoval
# DELETE ...?dryRun=1 con el token de flota, contra un id que exista
```

## Qué no copiar

- `fleet.json`, `fleet-eliminados.json`, `fleet-backups/`, `.fleet-token`, `.env`, logs.
- El `control-vigia.js` y el `grokbot-desktop.js` de las copias del 7-nov: el primero vuelve al buzón único; el segundo del Studio no acepta la captura de respaldo.
- El `server.js` del Studio (19-oct) ni el del Mini (5-nov) encima de este: les falta la cola de captura.

## Volver atrás

En cada host, con el sello de la copia:

```bash
cd ~/fleet-control
cp server.js.bak-$stamp server.js
cp grokbot-remote.js.bak-$stamp grokbot-remote.js
cp control-vigia.js.bak-$stamp control-vigia.js
cp grokbot-desktop.js.bak-$stamp grokbot-desktop.js
rm -f agent-session.js machine-removal.js capture-client.js
launchctl kickstart -k gui/$(id -u)/com.admiranext.fleet-control
```

`agent-session.js` y `machine-removal.js` ya estaban en los dos hosts: borrarlos solo si la copia de `server.js` ya no los importa. Si se restaura el `server.js` de producción, hay que dejar esos dos ficheros.

La captura v3 se deshace con el instalador anterior, como en `DEPLOY-CAPTURE.md`. `fleet.json` no se ha tocado; una baja hecha después del despliegue se deshace con el `fleet-backups/fleet-*.json` de esa operación o con `POST /api/machines/:id/restore`.

Esto no concede Grabación de pantalla ni Accesibilidad. El escritorio remoto no queda verificado hasta que alguien mire la imagen y el ratón en cada Mac.
