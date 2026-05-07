# HANDOFF — Consejo AdmiraNext

Actualizado: 2026-05-07  
Proyecto: `32.-ConsejoAdmiraNextGame`

## Punto de entrada

- URL pública: [https://www.admira.live](https://www.admira.live)
- Versión visible: `Admira v.26.05.07.r6`
- Rama: `main`
- Commit actual: ver último commit publicado en `main`

## Qué comprobar al retomar

1. Abrir la URL pública.
2. Verificar arriba que pone `Admira v.26.05.07.r6`.
3. Si se va a desarrollar, clonar y actualizar:

```bash
git clone https://github.com/csilvasantin/32.-ConsejoAdmiraNextGame.git
cd 32.-ConsejoAdmiraNextGame
git checkout main
git pull
git rev-parse --short HEAD
```

El hash debe coincidir con el commit publicado indicado arriba o ser posterior.

## Estado operativo actual

### Consejo

- La build pública y la copia local del HTML suelen mantenerse sincronizadas.
- La referencia principal para probar el producto es siempre GitHub Pages.
- Al final de cada mejora hay que actualizar la release pública, verificar GitHub Pages y pasar al usuario la URL pública con versión visible.
- El formato de release visible es: `Admira v.AA.MM.DD.rN` (año, mes, día y número de release del día).
- El aviso de publicación debe enviarse por Telegram al chat `AdmiraXP` (`TELEGRAM_CHAT_ID=-1003841065210`) con URL pública cache-busted, versión visible y commit.

### Yarig.AI

- CLI disponible con alias equivalentes:
  - `/yarig on` y `/yarig.ai on`
  - `/yarig off` y `/yarig.ai off`
  - `/yarig login` y `/yarig.ai login`
  - `/yarig logout` y `/yarig.ai logout`
  - `/yarig sincro` y `/yarig.ai sincro`
  - `/yarig estado` y `/yarig.ai estado`
- `/help` es toggle y usa las 3 ventanas superiores.
- La mesa de Yarig reparte:
  - izquierda: `Finalizadas`
  - centro: `En proceso`
  - derecha: `Pendientes`
- La ventana central ya incluye controles para la tarea en curso:
  - `Finalizar`
  - `Pausar`
  - `Cancelar`

## Últimos cambios relevantes

### `Admira v.26.05.07.r6`

- Fix: mixed-content. Cuando la página se sirve por HTTPS
  (`https://www.admira.live`), el navegador bloquea cualquier `fetch`
  a `http://` (incluido `localhost:8420` y el puerto 8420 directo
  del MacMini). Eso producía el error "Failed to fetch — animación
  local" del HACKEO aunque hubiese backends UP.
- `COUNCIL_API_URLS` en `council-scumm.html` ahora se construye
  según `location.protocol`:
  - HTTPS (producción): solo `https://macmini.tail48b61c.ts.net/council`
    (Funnel) y `https://three2-...onrender.com` (Render).
  - HTTP (operador en local): `http://localhost:8420`,
    `http://macmini.tail48b61c.ts.net:8420` (requiere Tailscale en el
    host) y Render como red de seguridad.

### `Admira v.26.05.07.r5`

- Fix: el comando SSH del HACKEO (función `_hk_ssh_launch` en
  `council-api.py`) ahora antepone `caffeinate -u -t 2 && sleep 1 &&`
  antes del `osascript`. Si el MacBook tiene el screensaver activo o
  el display dormido, la GUI está bloqueada y `Terminal.app` no acepta
  AppleEvents → la simulación de hackeo no aparecía. `caffeinate -u -t 2`
  despierta el display y lo mantiene 2 s; el `sleep 1` da margen al
  WindowServer para procesar el unlock antes de pedir activate de
  Terminal. Coste: +3 s en el SSH a cada Mac vivo (entra dentro del
  margen del subprocess timeout `_HK_SSH_TIMEOUT + 2`).

### `Admira v.26.05.07.r4`

- Backup de runtime de `council-api.py` arrancado en el Mac de Carlos
  (`localhost:8420`, Python 3.13). Deps instaladas globalmente con
  `pip3 install -r requirements.txt --break-system-packages`. Daemon
  lanzado con `nohup python3 council-api.py > /tmp/council-api-local.log 2>&1 &`.
- `COUNCIL_API_URLS` en `council-scumm.html` mantiene `localhost:8420`
  como tercer fallback (después de MacMini Funnel y Render). El
  comentario se reescribe: ya no se considera "dev only", sino backup
  legítimo de runtime para cuando MacMini y Render fallan.
- ✅ **Macmini desbloqueado y al día.** El `launchd` agent
  `com.csilvasantin.council-api` ahora apunta a:
  - `WorkingDirectory = /Users/csilvasantin/32.-ConsejoAdmiraNextGame`
  - `ProgramArguments[0] = /opt/homebrew/bin/python3.12`
  Backup del plist anterior: `~/Library/LaunchAgents/com.csilvasantin.council-api.plist.bak.20260507-114630`.
  Backup del `.env` anterior del repo nuevo:
  `~/32.-ConsejoAdmiraNextGame/.env.bak.20260507-114845` (el `.env`
  nuevo es ahora copia del que usaba el daemon viejo, con todas las
  API keys + `COUNCIL_API_TOKEN`).
  Deps instaladas: `pip3.12 install fastapi uvicorn anthropic
  python-dotenv requests --break-system-packages` (en
  `~/Library/Python/3.12/`).
  Reinstalación del agente: `launchctl bootout gui/$UID … && launchctl
  bootstrap gui/$UID …`; tras `git pull` un `launchctl kickstart -k`
  basta para recargar.
- **3 backends en `v.26.05.07.r4`:** MacMini Funnel + Render + local
  Mac de Carlos. La cadena de fallback del frontend es operativa de
  punta a punta.

### `Admira v.26.05.07.r3`

- Autodescubrimiento de MAC addresses: el backend ya no necesita que se
  rellenen manualmente las MAC en `machines.json`. Para cada Mac
  encendido del consejo:
  1. ARP local — ping a `host_local` (mDNS `.local`) o `ip_local` y
     lectura de `arp -n`. Solo aplica a máquinas en la MISMA LAN que el
     Mac Mini que sirve la API (las IPs Tailscale `100.x.x.x` no
     aparecen en ARP).
  2. SSH `ifconfig` — fallback que cubre el resto: el Mac remoto se
     contesta a sí mismo con la MAC de su interfaz por defecto.
  3. Persistencia atómica en `data/machines.json` (campo `mac_address`
     + `mac_discovered_at`).
- Nuevo endpoint: `POST /api/council/hackeo/discover-macs` — solo
  descubre y guarda; no lanza la simulación.
- `POST /api/council/hackeo` ahora descubre la MAC on-the-fly cuando
  encuentra un consejero encendido y sin MAC registrada, así que tras
  el primer `HACKEO` con todos encendidos, los apagados se podrán
  despertar por WoL en próximas pulsaciones.

### `Admira v.26.05.07.r2`

- Nuevo endpoint backend: `POST /api/council/hackeo` (y `…/hackeo/stop`) en
  `council-api.py`. Para cada máquina del consejo (`unitType=="council"` con
  SSH habilitado en `data/machines.json`):
  1. Hace ping por Tailscale (`hostname.tail48b61c.ts.net`).
  2. Si responde → SSH y abre `Terminal.app` con un script Python embebido
     que pinta líneas tipo "hackeo en curso".
  3. Si NO responde → envía paquete Wake-on-LAN (UDP 7/9 broadcast) al
     `mac_address` de la máquina.
- `data/machines.json` ahora incluye campo `mac_address` (vacío por defecto).
  **HAY QUE RELLENAR las MAC** para que WoL funcione de verdad; mientras
  estén vacías el backend devuelve `action: "wol_skipped"`.
- El frontend (botón `HACKEO` en la barra inferior) llama al nuevo endpoint
  vía `COUNCIL_API_URLS` con `X-Council-Token: admira2026`. La animación
  local se mantiene; encima del overlay se pinta:
  - Banner con resumen `total / online / ssh_ok / wol_sent / failed`.
  - Badge por panel: `● HACKED`, `◐ WoL`, `✗ no MAC`, `○ offline`, `✗ FAIL`.
- Versión visible bumpeada a `Admira v.26.05.07.r2`.

### `v26.30.04.1`

- `Yarig.AI` gana `login` y `logout` desde CLI.
- `/help` pasa a ser toggle y se pinta en las 3 ventanas superiores.

### `v26.30.04.2`

- Ventanas laterales superiores más altas.
- Ventana central más ancha y algo más alta.
- La cota superior de las tres se mantiene.

### `Admira v.26.05.03.r1`

- Publicación de la última versión del Consejo con formato de release pública normalizado.
- URL pública verificada: `https://www.admira.live`.

### `Admira v.26.05.03.r2`

- Corregido el destino por defecto de Telegram al chat `AdmiraXP`.
- Documentada la rutina de publicación con URL cache-busted y envío obligatorio a Telegram.

### `Admira v.26.05.03.r3`

- Añadido comando `/google` para abrir la hoja `Consejo AdmiraNext - Backup Entrenar Links` en Google Drive.
- `/help` documenta el nuevo acceso directo a la hoja de enlaces guardados desde Entrenar.

### `Admira v.26.05.03.r4`

- Añadido comando `/importar <url>` para descargar un vídeo con `yt-dlp` y copiarlo a Google Drive Desktop.
- Nuevo endpoint `POST /api/council/importar-video`, pensado para ejecutarse en el backend MacMini/local con Drive Desktop activo.
- La carpeta de destino por defecto es `AdmiraNext/Importados` dentro de Google Drive.

### `Admira v.26.05.03.r5`

- `/importar <url>` pasa a trabajar con jobs y feedback de progreso: preparación, descarga, copia a Drive y registro del entreno.
- Nuevo endpoint `GET /api/council/importar-video/{job_id}` para consultar el estado de la descarga desde el frontend.
- Tras importar, el backend intenta dar de alta el entreno en la hoja `Entrenar Links` con estado, fecha, ruta, URL de Drive y peso; si Google Sheets no está autenticado, deja una cola CSV/JSONL en la carpeta de Drive para no perder el alta.

### `Admira v.26.05.07.r1`

- Añadido estado operativo de Yarig con `GET /api/council/yar-status` y comando `/yarig estado`.
- El worker de Yarig lanzado por el backend del Mac Mini sincroniza ahora contra `http://127.0.0.1:8420` en vez de Render, evitando que el contexto local quede desactualizado.
- El watcher de Yarig intenta recuperarse si la página/contexto de Chrome se cierra durante el bucle persistente.

## Riesgos y notas abiertas

- La sincronización de Yarig puede no corresponderse exactamente con una pestaña manual de Chrome si la sesión automatizada no está alineada.
- La lectura directa de una pestaña normal de Chrome puede verse limitada si no está activado:
  - `Ver > Opciones para desarrolladores > Permitir JavaScript desde Eventos de Apple`
- Cuando haya watcher persistente de Yarig, las acciones de control temporalmente pueden necesitar liberar/reusar el perfil de automatización.

## Siguiente foco recomendado

1. Afinar la bidireccionalidad real con Yarig para que `Pendientes`, `En proceso` y `Finalizadas` reflejen exactamente la sesión visible del usuario.
2. Validar a fondo los controles de tarea de la ventana central sobre casos reales de Yarig.
3. Seguir puliendo geometría/legibilidad de overlays solo después de asegurar la sincronización.

## Archivos clave

- [`/tmp/council-publish/public/council-scumm.html`](/tmp/council-publish/public/council-scumm.html)
- [`/tmp/council-publish/council-api.py`](/tmp/council-publish/council-api.py)
- [`/tmp/council-publish/tools/yarig-tasks-sync.mjs`](/tmp/council-publish/tools/yarig-tasks-sync.mjs)
- [`/tmp/council-publish/CLAUDE.md`](/tmp/council-publish/CLAUDE.md)

## Convención para futuros handoff

Cuando el usuario escriba `handoff`, actualizar este archivo con:

- fecha
- URL pública
- versión visible en formato `Admira v.AA.MM.DD.rN`
- URL directa de este `HANDOFF.md`
- commit
- últimos cambios
- estado real de Yarig
- riesgos abiertos
- siguiente paso recomendado

Y además enviar Telegram con:

- URL pública del Consejo
- versión visible
- URL directa del `HANDOFF.md`
- commit publicado
