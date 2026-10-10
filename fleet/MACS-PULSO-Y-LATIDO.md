# Qué tiene que correr en los Mac para que /consumos diga la verdad (r40, 10-10-2026)

Para que la franja «Trabajando ahora» de admira.live/consumos sepa **con quién está Carlos**, necesita dos cosas
de cada Mac. Nada de esto se ejecuta desde la web: lo instala Carlos (o un agente con su permiso) en cada Mac.

## 1. Pulso de tokens + «con Carlos» (`fleet/pulso-tokens.py`), también en **MacBookAir16plata**

Antes solo conocía `MacMini` y `MacBookPro16`. En el Air salía con «máquina no reconocida» (código 2), así que
ese Mac nunca mandó pulso y Trinity y Neo de la app de escritorio no podían salir «con Carlos».

```bash
mkdir -p ~/.fleet ~/Library/LaunchAgents
cp fleet/pulso-tokens.py ~/.fleet/pulso-tokens.py
# Token del endpoint (el mismo que en los otros Mac). Nunca se imprime:
ls -l ~/.config/admira/consumos-lecturas.token
# Prueba sin mandar nada (debe decir «MacBookAir16plata» y una línea conCarlos por agente):
PULSO_MAQUINA=MacBookAir16plata python3 ~/.fleet/pulso-tokens.py --dry-run
cat > ~/Library/LaunchAgents/com.admiranext.pulso-tokens.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.admiranext.pulso-tokens</string>
  <key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>$HOME/.fleet/pulso-tokens.py</string></array>
  <key>EnvironmentVariables</key><dict><key>PULSO_MAQUINA</key><string>MacBookAir16plata</string></dict>
  <key>StartInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>$HOME/.fleet/pulso-tokens.log</string>
  <key>StandardErrorPath</key><string>$HOME/.fleet/pulso-tokens.log</string>
</dict></plist>
PLIST
launchctl bootout gui/$(id -u)/com.admiranext.pulso-tokens 2>/dev/null; launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.admiranext.pulso-tokens.plist
```

La detección «con Carlos» lee el reposo HID con `ioreg`, la app al frente con `lsappinfo` y los clientes de tmux.
Con el Mac en reposo ≥ 5 min nunca marca «con Carlos» (a propósito). Comprueba en `--dry-run` que las líneas
`conCarlos` no dicen «reposo del Mac desconocido».
Atribución en el Air: por motor, Claude → Neo y Codex → Trinity (ver comentario en MAPA).

## 2. Latido de Merovingio desde su tmux (`fleet/latido-merovingio.sh`)

El bucle `tmux … merovingio` («sleep 20» + lista de encargos) no latía, así que Yokup no sabía que Merovingio
corría en el Mac. El script manda un latido **pasivo** (vivo, no «trabajando») cada 60 s a
`https://bot.yokup.com/api/presence`, con la clave de panel de `~/.agents-comms/panel.key`.

```bash
cp fleet/latido-merovingio.sh ~/.fleet/latido-merovingio.sh && chmod +x ~/.fleet/latido-merovingio.sh
LATIDO_MAQUINA=MacBookAir16plata ~/.fleet/latido-merovingio.sh --dry-run   # cuerpo, sin mandar
# Opción A — dentro del propio bucle de la sesión tmux «merovingio», antes del sleep 20:
#   ~/.fleet/latido-merovingio.sh >/dev/null 2>&1 &
# Opción B — LaunchAgent aparte (igual que el de arriba, Label com.admiranext.latido-merovingio,
#   ProgramArguments /bin/bash $HOME/.fleet/latido-merovingio.sh, LATIDO_MAQUINA=MacBookAir16plata, StartInterval 60).
```

## 3. (Opcional, mejora del vigilante de procesos)

El `process_snapshot` de cada Mac manda `cpu` e `idle` **de la máquina** en todas las filas. /consumos ya no los
usa para el verde. Si el vigilante añade `proc_cpu` (CPU del proceso del agente) volverá a contar, y si en el Air
manda `idle` real (hoy llega 0 con cpu 0 = sin medir), el panel podrá ver «con Carlos» también por la presencia,
sin esperar al pulso.
