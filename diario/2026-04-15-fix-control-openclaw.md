# 2026-04-15 · Fix botón CONTROL: colisión OpenClaw / Tailscale

AdmiraNext Consejo — SCUMM Interface

## Problema detectado

El botón CONTROL en `council-scumm.html` abría OpenClaw (Claude Code Gateway)
en lugar del panel AdmiraNext Control.

### Cadena de redirección

1. CONTROL → `csilvasantin.github.io/03.-ControlCodexClaude/teamwork.html`
2. `teamwork.js` (JS en GitHub Pages) → redirect a `macmini.tail48b61c.ts.net/teamwork.html`
3. El servidor macmini mostraba OpenClaw en lugar del panel
4. URL síntoma: `macmini.tail48b61c.ts.net/teamwork.html/chat?session=main`

### Causa raíz

Tailscale Serve en el Mac Mini tenía configurado un path `/teamwork.html`
apuntando al puerto de OpenClaw (Claude Code Gateway). Esto solapaba la
ruta por defecto `/` → Node.js (3030) para esa URL específica.

Configuración rota:
```
https://macmini.tail48b61c.ts.net/             → localhost:3030 (Node.js)
https://macmini.tail48b61c.ts.net/teamwork.html → localhost:OPENCLAW (OpenClaw)  ← problema
https://macmini.tail48b61c.ts.net/demo         → localhost:3032 (Demo server)
```

## Solución implementada (Opción A)

Mover OpenClaw a path `/claw-gateway` y restaurar la configuración canónica.

### Script creado

`ops/macos/reconfigure-tailscale.sh` — elimina `/teamwork.html` de Tailscale Serve
y restaura la configuración correcta. El usuario ejecuta en el Mac Mini:

```bash
# Simple (solo quita OpenClaw de /teamwork.html):
bash ops/macos/reconfigure-tailscale.sh

# Con OpenClaw en nuevo path /claw-gateway (necesita saber el puerto):
bash ops/macos/reconfigure-tailscale.sh --openclaw-port PUERTO_OPENCLAW
```

### Configuración objetivo

```
https://macmini.tail48b61c.ts.net/             → localhost:3030 (AdmiraNext Control)
https://macmini.tail48b61c.ts.net/demo         → localhost:3032 (Demo server)
https://macmini.tail48b61c.ts.net/claw-gateway → localhost:OPENCLAW (OpenClaw, opcional)
Funnel: ON
```

### Código sin cambios

`teamwork.js` no necesita cambio: el redirect a `FUNNEL_URL + "/teamwork.html"`
es correcto. Una vez que Tailscale enruta `/teamwork.html` a Node.js (3030)
en lugar de OpenClaw, el panel funciona.

## Archivos modificados

- `ops/macos/reconfigure-tailscale.sh` — nuevo script (en ambos repos)
- `03.-ControlCodexClaude/CLAUDE.md` — documentación del conflicto y fix

## Pendiente

El usuario debe ejecutar `reconfigure-tailscale.sh` en el Mac Mini para
aplicar el cambio de Tailscale Serve. El script solo necesita ejecutarse
una vez.
