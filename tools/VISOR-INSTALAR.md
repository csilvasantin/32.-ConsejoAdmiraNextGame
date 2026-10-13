# Visor: publicador, instalador y lanzador edge

Encargo #5822 · misión FLT-102038. El MBP16 está caído. Esto se puede dejar preparado
en la nube y se instala en el Mac cuando vuelva. No despliega a producción.

## Qué hace cada pieza

| Pieza | Ruta | Cuándo |
| --- | --- | --- |
| Publicador | `tools/visor-publicar.py` | Cada Mac (y la caja) manda sus paneles a `POST /api/visor/pane` |
| Instalador | `tools/visor-instalar.sh` | Una vez por Mac, idempotente, con copia previa |
| Lanzador edge | `tools/tmux-edge-lanzar.sh` | Solo cuando Neo (MBP14) y Trinity (MBA16) deban entrar en tmux. No lo lanza el instalador |

La máquina, el modo y la etiqueta no salen del hardware. Salen de
`~/.config/admiranext/visor-maquina.conf`:

```
maquina=macbook-pro-16
modo=hibrido
terminal=MBP16
```

| Modo | Etiqueta | Dónde |
| --- | --- | --- |
| `nube` | GrokBot | GrokBotBox (Smith, Merovingio) |
| `hibrido` | GrokBot → MBP16 | MBP16 |
| `edge` | MBP14 o MBA16 | MBP14 (Neo), MBA16 (Trinity), cuando ya hay tmux |
| `sin_terminal` | sin terminal, solo encargo | App de escritorio: no se hace `capture-pane` |

Una línea de agente puede afinar el modo. Siete campos, los tres últimos opcionales:

```
Título|host|sesión|skin|modo|terminal|superficie
```

`superficie=escritorio` fuerza `sin_terminal` aunque el modo de la máquina sea `edge`.

## Ver el perfil sin instalar

No hace falta el Mac. No lee claves.

```bash
bash tools/visor-instalar.sh --plan --equipo MacBookPro16
bash tools/visor-instalar.sh --plan --equipo MacBookProNegro14
bash tools/visor-instalar.sh --plan --equipo MacBookAir16Plata
bash tools/tmux-edge-lanzar.sh --plan
```

## MBP16 (híbrido), cuando vuelva

```bash
bash tools/visor-instalar.sh
```

Escribe `visor-maquina.conf` con `modo=hibrido` y `terminal=MBP16`.
Si `cuadratura.conf` ya existe, no la pisa. Si no existe, deja la lista de cuatro
de la cuadrícula. Copia lo que vaya a sustituir en `~/.fleet/backup/visor-<fecha>/`.
La segunda pasada, si nada cambió, no vuelve a copiar ni reescribe el plist
(reescribirlo saca el aviso de actividad en segundo plano de macOS).

El token de máquina sigue en `~/.config/admira/consumos-lecturas.token` o en
`COUNCIL_MACHINE_TOKEN`. El instalador no lo abre y no lo imprime.

## MBP14 y MBA16 (edge)

El mismo comando. El perfil sale del nombre del Mac.

- MBP14 → máquina `macbookpronegro14`, etiqueta `MBP14`, sesión `neo`.
- MBA16 → máquina `macbookair16plata`, etiqueta `MBA16`, sesión `trinity`.

Mientras Neo y Trinity sean la app de escritorio, `visor-edge.conf` los deja en
`sin_terminal|escritorio`. El visor enseña «sin terminal, solo encargo» y el número
de encargo si el estado lo trae. No se publica una terminal falsa.

## Lanzador (no ejecutado en este encargo)

Cuando el Mac del borde esté delante y se quiera el CLI dentro de tmux:

```bash
bash tools/tmux-edge-lanzar.sh --plan
EDGE_CONFIRMO=si bash tools/tmux-edge-lanzar.sh --arrancar
```

De serie Neo arranca con `claude` y Trinity con `codex`. Se cambia con
`NEO_RUNTIME` / `TRINITY_RUNTIME` (`claude` o `codex`) y `CLAUDE_BIN` / `CODEX_BIN`.

El arranque se niega si no es macOS, si falta `EDGE_CONFIRMO=si`, o si la sesión
`neo` o `trinity` ya existe. En ese caso no hace attach, no manda teclas y no
reinicia el pane. En GrokBotBox se niega siempre: `trinity-box` de la caja no es
la Trinity del MBA16.

Después de arrancar, y solo cuando el pane sea el CLI, cambia la línea de
`visor-edge.conf` a modo `edge` y superficie `tmux` para que el publicador mande
la terminal con la etiqueta MBP14 o MBA16.

## Probar en la caja, contra preview

`VISOR_URL` elige el destino. Sin esa variable el publicador habla con
`https://www.admira.live/api/visor/pane` (lo que usará el Mac). La prueba de
GrokBotBox lleva `VISOR_SOLO_PREVIEW=1` y una URL de preview: si alguien apunta
a www, el proceso sale y no publica.

Un preview de Pages no escribe el KV de producción. Las claves llevan prefijo
`visor:preview:<host>:`. www sigue en `visor:v1:`.

## Pendiente del MBP16

Instalar allí y ver el panel híbrido en el visor de producción queda para cuando
el Mac vuelva. Este encargo no lo toca.
