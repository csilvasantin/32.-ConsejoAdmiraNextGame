# Despliegue del id canónico de control remoto

Esto está en el repositorio. **No está desplegado** en el Mac Mini ni verificado como control interactivo en vivo. No copies `server.js` del repo encima del runtime.

## Dos causas distintas

1. **Id.** El hub en marcha compara el id exacto. La tarjeta degradada manda `admira-macbookairplata` y el hub responde 400. El alias del hub (`machine-id.js` dentro de `server.js`) lo acepta cuando esté desplegado. Mientras no lo esté, la página envía la forma corta (`macbookairplata`) porque es la misma ficha, no otra máquina. `?rc=macbookairplata` abre el control con ese id, aunque el censo de admira-fleet use el id largo.
2. **Ruta.** `/health` de los dos relays responde bien y no es lo mismo que el censo. `/api/status` hace SSH a toda la flota y puede pasar de 12 s. Ese tiempo marcaba la puerta pública como caída y el siguiente fotograma salía hacia `*.ts.net`, que no lleva la cookie `__Host-` de `fleet.admira.live` y, dentro del tailnet, Chrome corta. Un censo lento ya no aparta ese relay. El fotograma y el input se reintentan en el relay que tiene la sesión.

`https://admira.live/control` ya redirige a `https://www.admira.live/control/`. La página repite ese salto si el redirect no ocurrió, conservando `?rc=`.

Ninguna de las dos está desplegada. El control en vivo desde PC-COCINA no se ha verificado aquí.

## Qué divergió

| Copia | Ruta | Papel |
|---|---|---|
| Repo | `fleet-control/server.js` y `fleet-control/machine-id.js` | Fuente de este cambio |
| Runtime del Mini | `/Users/csilvasantin/fleet-control/server.js` | Proceso que atiende el funnel. Puede no coincidir con el repo |

El síntoma (HTTP 400 `máquina desconocida` al pulsar la tarjeta del Air, con el aviso de «Fleet Mesh probará otro relay») se corrige en dos sitios distintos:

1. **Hub** (`machine-id.js` + `machineById`). Sin esto, `admira-macbookairplata` sigue siendo desconocida aunque la web ya sea nueva.
2. **Página** `control/index.html` + el script de `machine-id.js`. Sin esto, el banner de solo lectura y el texto del overlay siguen mintiendo aunque el hub ya resuelva el alias.

El worker `admira-fleet-proxy` no elige máquina. Un 400 de censo ya no se reintenta; no hace falta redeploy del worker para el alias.

## No hacer

- No sustituir el `server.js` del Mini por el del repo.
- No tocar `fleet.json` para «renombrar» el Air: el id del censo sigue siendo `macbookairplata`.
- No desactivar el gate, ni aceptar un id ambiguo, ni mapear un id desconocido a otra máquina.
- No imprimir tokens, cookies ni secretos de sesión al comprobar el cambio.

## Hub del Mini (y el relay de respaldo, si corre el mismo server)

En el Mini, como el usuario del servicio:

```bash
cd /Users/csilvasantin/fleet-control
cp -p server.js server.js.bak-rc-alias-$(date +%Y%m%d%H%M%S)
# diff ANTES de editar. Si el runtime no se parece al repo, no lo reemplaces:
diff -u server.js /ruta/al/repo/fleet-control/server.js | less
```

Porta solo esto, a mano, sobre el runtime:

1. Copia `fleet-control/machine-id.js` del repo **al lado** de ese `server.js` (`/Users/csilvasantin/fleet-control/machine-id.js`).
2. Añade `const { resolveMachine, unknownMachineBody } = require('./machine-id');`.
3. Sustituye `machineById` por la versión que llama a `resolveMachine`.
4. Añade `rejectUnknownMachine` y úsalo en `/api/live/frame`, `/api/input`, `/api/action`, `/api/run`, `/api/displays`, `/api/wake`, `/api/vigia/run` y `/api/term/open`, **después** del `gate` que ya tienen.
5. En `/api/preflight`, resuelve el alias igual; si no hay máquina, mantén el 404.

Comprueba sintaxis sin arrancar el servicio:

```bash
node --check server.js
node --check machine-id.js
```

Reinicia **solo** el proceso que escucha en `127.0.0.1:9140`. El label launchd no está fijado en este repo; localízalo, no asumas `com.admiranext.control` (ese es el puerto 3030):

```bash
lsof -nP -iTCP:9140 -sTCP:LISTEN
# luego, con el label real:
# launchctl kickstart -k "gui/$(id -u)/EL_LABEL_REAL"
```

Repite el mismo parche en el relay de respaldo si su `server.js` también compara el id exacto. Si no, el failover volverá a devolver 400.

### Comprobar el hub (sin sesión no debe operar)

Sustituye el host por el funnel del relay. Sin cookie ni token:

```bash
curl -sS -o /tmp/rc-auth.txt -w '%{http_code}\n' \
  'https://macmini.tail48b61c.ts.net/fleet/api/live/frame?machine=macbookairplata'
```

Tiene que ser **401**. El cuerpo no debe traer JPEG ni ejecutar captura.

Con la sesión del navegador no se puede imitar desde curl sin copiar la cookie. No la pegues en el ticket ni en el chat. Desde el propio Mini, la prueba de resolución es el test del repo (`node --test fleet-control/machine-id.test.js`) más, ya con sesión en el navegador, abrir el control del Air.

### Rollback del hub

```bash
cd /Users/csilvasantin/fleet-control
cp -p server.js.bak-rc-alias-FECHA server.js
rm -f machine-id.js
node --check server.js
# reinicia el mismo proceso de 9140
```

La web nueva tolera un hub viejo: volverá el 400, pero el texto dirá que el id no está en el censo, no que el relay está caído.

## Página (GitHub Pages)

Al mergear a `main`, Pages publica `control/index.html` y `/fleet-control/machine-id.js`. La query `?v=20261106-r1` evita las 4 h de caché de ese script.

Hasta que Pages esté en el commit, `www.admira.live/control` sigue con el overlay viejo. Comprueba con `?_v=<commit>` y mira que el HTML pida `machine-id.js?v=20261106-r1`.

Rollback de la página: revertir el commit en `main`. No hace falta tocar el Mini para deshacer solo el texto del banner.

## Qué no queda verificado con este PR

No hay evidencia de una sesión real desde PC-COCINA: ni fotograma del Air, ni ratón, ni teclado. Un 200 de `/health` no demuestra el control. Hace falta, después del reinicio del hub y del deploy de Pages:

1. Entrar en `https://www.admira.live/control` desde PC-COCINA.
2. Pulsar «control remoto» en MacBook Air Plata (no solo `?rc=macbookairplata`).
3. Ver un JPEG que cambia y mover el puntero en esa máquina.
4. Confirmar que otra máquina (Mac Mini, otro Air) sigue abriendo con su propio id.
