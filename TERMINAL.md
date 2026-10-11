# /terminal · encargo #5704 · OraculoMBP16

Entrega en rama y PR para revisión de Woz. No se instala ningún publicador ni se
reinicia Fleet Control en producción como parte de este encargo.

`/terminal` muestra las sesiones de agente que cada equipo enumera realmente con
tmux: máquina, sesión, agente, runtime, encargo, estado y último latido.
El inventario viaja en `POST /api/visor/pane`, en `terminales` y `terminalesTs`.
No usa cuadratura.conf para enumerar sesiones; la cuadrícula conserva su vista.
Los procesos de todos los panes y el entorno de sesión identifican el runtime.
Los encargos se consultan en el inbox estructurado, filtrado por máquina.

Un latido o inventario con más de 120 segundos, o un publicador anterior que no
trae inventario, da «sin datos», nunca «parada». Si el equipo nunca publicó o el
registro ya caducó, la hora aparece como desconocida. Un inventario vacío reciente
sí significa que no hay terminales de agente abiertas.

## Cierre

- `/terminal kill MBP14`, `MBP16`, `MacMini`, `mini`, `Air` o nombre completo.
- `/terminal kill` prepara todos los equipos con ruta registrada en Fleet Control.
- Los alias ambiguos, como Air si hay varios, requieren el nombre completo.
- La primera petición siempre devuelve el listado exacto. `/terminal confirmar`
  confirma ese listado; `--si` permite enviar esa primera confirmación después
  de mostrarlo. `/terminal cancelar` descarta el cierre pendiente del navegador.
- Si hay un encargo `in_progress` **aunque el panel esté quieto**, o no se pudo
  consultar el encargo, se pide otra `/terminal confirmar`. `--si` no la omite.

El servidor exige una sesión administradora activa de Fleet Control y su CSRF.
La llave del visor y el token de máquina no permiten usar las rutas de cierre.
El contexto emisor procede del servidor: en la CLI del navegador no hay tmux
emisor; un cliente tmux necesita un vínculo emisor del servidor, y sin él se
bloquea. El ejecutor protege además cualquier sesión tmux de sus antecesores y
su `TMUX_PANE`. Un campo `source` enviado en el body no acredita un emisor.

Cada plan dura dos minutos, se liga a la identidad de sesión y se consume una
sola vez. Se revalidan id y fecha de creación de tmux, runtime y encargo. La web
fija el relay del plan y desactiva reintentos automáticos en confirmaciones.

Primero se guardan **todos los panes de todos los destinos** en
`~/.fleet/terminal-backups/<plan>/`, con carpeta 0700 y ficheros 0600.
Las copias quitan ANSI y ocultan secretos y enlaces de login antes de escribir.
La operación se bloquea si cambia el conjunto de panes o falla la copia.
No usa `kill-server`: sólo `kill-session -t $ID` de los destinos confirmados.
Manifiesto, recibo consumido y auditoría registran administrador, sesiones y hora.
Los resultados parciales devuelven exactamente las sesiones cerradas y la copia;
no hay garantía de atomicidad entre máquinas ante una caída durante el cierre.

Un equipo publicado sin ruta registrada se muestra y se avisa como excluido del
cierre. No se inventa una ruta SSH a partir de datos publicados.

## Preview y pruebas

`/demo terminal` es una simulación identificada que explica inventario,
confirmaciones y registro. Nunca manda órdenes de cierre a un equipo.
Las capturas de interfaz usan el mismo módulo y controlador con un relay de
prueba local y datos de ejemplo. El cierre real se prueba exclusivamente en un
servidor tmux con socket privado, sesiones `test-terminal-5704` y dos panes.

Preview interactiva: `node tools/terminal-preview.mjs` y
`http://127.0.0.1:9058/`. El servidor sólo escucha en localhost y muestra una
banda de simulación. Sus botones permiten probar ambas confirmaciones y el
registro sin ejecutar tmux ni SSH; no requiere credenciales de producción.

Pruebas reproducibles:

```sh
node --test terminal.test.mjs interface-cli.test.mjs visor.test.mjs control/fleet-mesh.test.mjs
python3 tools/terminal-inventory.test.py
python3 fleet-control/terminal-local.test.py
```

La suite adicional `idioma-experto.test.mjs` tiene un fallo previo en su contrato
de `deploy.sh`: exige una tupla ASSETS de tres elementos y main ya contiene seis.
Este cambio no modifica `deploy.sh`. Las otras pruebas de esa suite pasan.

## Instalación posterior a la autorización

El frontend nuevo necesita las rutas `/api/terminal/inventory`, `/plan` y `/confirm`
de este Fleet Control, el contrato nuevo de `/api/visor/pane` y el publicador de
cada equipo. `tools/visor-instalar.sh` instala también `terminal-inventory.py`.
El relay usa `COUNCIL_MACHINE_TOKEN` o la misma credencial local del publicador,
sin transmitirla al navegador. Requiere Python 3, tmux y el estado-agente local.
Hasta actualizar esos componentes, la interfaz debe informar «sin datos» o
«inventario no disponible»; las capturas de preview no acreditan una instalación
en producción. Restaurar los scripts de la versión anterior revierte el cambio.
