# Captura en vivo — instalar y volver atrás

El escritorio remoto de admira.live/control pide cada fotograma a
`~/.fleet/fleet-capture.py` (LaunchAgent `com.admiranext.fleet-capture`,
versión 3). Cada petición es un fichero en `~/.fleet/capture-queue/`. El
vigía solo reinstala si la versión instalada es menor que la del repo: una
versión más nueva en la máquina no se pisa. No se modifica la base TCC.

Hay que hacerlo en los dos Mac con sesión gráfica abierta (el usuario
dentro, no solo por SSH). Si `launchctl print gui/$(id -u)` falla, el
instalador sale con código 2 y no arranca el agente.

## Mac Mini y Mac Studio

En cada uno, desde el clone de este repo ya actualizado y con la sesión
gráfica abierta:

```bash
bash fleet-control/deploy-capture-agent.sh local
mkdir -p ~/.fleet
cp fleet-control/fleet-input.py fleet-control/fleet-capture.py fleet-control/display_geometry.py ~/.fleet/
chmod 755 ~/.fleet/fleet-input.py ~/.fleet/fleet-capture.py
/usr/bin/python3 ~/.fleet/fleet-input.py --displays
```

Comprobar, sin conceder permisos desde el script:

```bash
cat ~/.fleet/fleet-capture.version          # 3
launchctl print "gui/$(id -u)/com.admiranext.fleet-capture" | head
# el plist debe decir /usr/bin/python3 y fleet-capture.py, no fleet-capture.sh
```

El hub (`fleet-control/server.js`) tiene que ser el de este cambio antes de
esperar fotogramas nuevos: el cliente ya no escribe `capture.req`. El vigía,
al arrancar el hub nuevo, actualiza un agente viejo o ausente. No reinstala
uno de versión mayor.

Permisos, los concede la persona en el Mac (Ajustes → Privacidad):

- Grabación de pantalla para `/usr/bin/python3` (el LaunchAgent).
- Accesibilidad para el mismo `python3`, si el ratón responde
  `ERR_NO_ACCESSIBILITY`.

Un `screencapture` con rc=1 («could not create image from display») es un
fallo de esa petición. El proceso sigue. No es, por sí solo, falta de permiso.

## Volver atrás

El instalador nuevo no degrada solo. Para dejar otra vez el agente bash del
commit anterior a este cambio, en cada Mac:

```bash
git checkout <commit-anterior> -- fleet-control/deploy-capture-agent.sh
bash fleet-control/deploy-capture-agent.sh local
git checkout -- fleet-control/deploy-capture-agent.sh
```

Ese script antiguo no mira la versión y reescribe `~/.fleet/fleet-capture.sh`.
El plist vuelve a `/bin/bash`. El hub también hay que dejarlo en ese commit:
si no, seguirá esperando `capture-queue/` y la captura no contestará.

Para reinstalar la versión 3 aunque haya un número mayor en la máquina
(solo si se quiere forzar, no es el camino de vuelta al bash):

```bash
FLEET_CAPTURE_FORCE=1 bash fleet-control/deploy-capture-agent.sh local
```
