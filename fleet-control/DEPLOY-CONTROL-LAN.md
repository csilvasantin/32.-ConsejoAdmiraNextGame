# Control LAN · 10 noviembre 2026

PR #318 reduce sólo `/live/frame`: lee `scale`, `q` y `maxWidth`, usa JPEG de hasta 1600 px/calidad 60 por defecto y adapta el panel según latencia y bytes. La captura v4 reduce en origen; agentes anteriores usan `sips` en el hub. Si el CLI no puede capturar en su contexto de permisos, se utiliza la cola gráfica. No cambia las coordenadas normalizadas de entrada.

La ruta privada requiere Tailscale Serve, sesión humana activa, CSRF y revocación. El ticket de 30 segundos es opaco, de un uso, asociado a Origin y al mismo hub. La cookie privada es HttpOnly, Secure y particionada. La identidad Tailscale por sí sola no concede acceso. El cierre espera los canjes pendientes, manda CSRF por relay y conserva cualquier cierre que falle para reintentarlo.

## Publicación

Antes de publicar se integró main, incluidas sus protecciones de archivos internos y censo. Mini y Studio ejecutan los mismos seis archivos del hub; cada host conserva configuración, claves, censo y captura de origen.

```sh
ADMIRA_RELEASE_AGENT=SubTrinityMBP16 ADMIRA_RELEASE_MACHINE=MacBookPro16 bash ./deploy.sh
```

Rutas privadas: Mini `https://macmini.tail48b61c.ts.net/fleet/api`, Studio `https://macstudio.tail48b61c.ts.net:8443/fleet/api`. La segunda se configuró con:

```sh
ssh macstudio '/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --https=8443 --set-path=/fleet http://127.0.0.1:9140'
```

El puerto 443/Funnel y las demás rutas existentes se conservan. La configuración anterior está en `/tmp/trinity-7486-serve-before.json` de Studio. El agente v4 de Studio conserva la mejora posterior «despertar al mirar»; no reinstalar la copia Python del repositorio encima sin conciliar ese cambio.

## Reversión

Etiqueta anotada publicada `pre-control-lan-2026-11-10` → main `15b70ce5480ec29e8421cfc1c3cc7c37063418ca`. Publicar el tag desde un árbol separado conserva las protecciones de main anteriores al trabajo:

```sh
git worktree add --detach /tmp/control-retorno-20261110 pre-control-lan-2026-11-10
cd /tmp/control-retorno-20261110
ADMIRA_RELEASE_AGENT=SubTrinityMBP16 ADMIRA_RELEASE_MACHINE=MacBookPro16 bash ./deploy.sh
```

Cada hub tiene una copia exacta anterior en `~/fleet-control/rollback-control-lan-2026-11-10/`. Restaurar servidor/cliente y reiniciar, en ambos hosts:

```sh
for host in macmini macstudio; do
  ssh "$host" 'set -e; cd ~/fleet-control; cp rollback-control-lan-2026-11-10/server.js .; cp rollback-control-lan-2026-11-10/capture-client.js .; launchctl kickstart -k gui/$(id -u)/com.admiranext.fleet-control'
done
ssh macstudio '/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --https=8443 off'
```

Las dependencias nuevas pueden permanecer: no se cargan desde un servidor anterior. No restaurar claves ni `fleet.json`. La copia anterior del Mini ya incluía la primera optimización del 9-nov; restaurarla revierte la intervención del 10-nov, no aquella publicación.

## Verificación

Los números del tramo Mini→SSH→Studio no sustituyen el contador completo del navegador. El criterio del encargo exige varios fps y menos de 300 KB en el panel, con Studio desbloqueado y sesión humana. Registrar esa captura y las medidas reales en Yokup antes de cerrar #7485/#7486. Nunca generar una sesión humana de prueba con las claves del hub para salvar esa comprobación.
