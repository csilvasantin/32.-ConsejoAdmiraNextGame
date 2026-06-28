# council-mcp — MCP del juego AdmiraNext Council

Servidor **MCP** (stdio, **sin dependencias**, solo Node) que expone el contrato del juego
([`game/manifest.json`](../manifest.json)) y un registro de **reservas** para que varios
agentes (p. ej. **Oráculo** en Codex) extiendan el juego **sin pisarse**.

## Arrancar

```bash
node game/mcp/council-mcp.cjs
```

Habla JSON-RPC 2.0 por stdio (mensajes delimitados por `\n`). stdout es solo protocolo;
los logs van a stderr.

Variable opcional: `COUNCIL_MANIFEST=/ruta/al/manifest.json` (por defecto `../manifest.json`).

## Conectar desde Codex (Oráculo)

Ya añadido en `~/.codex/config.toml`:

```toml
[mcp_servers.council]
command = "/opt/homebrew/bin/node"
args = ["/Users/csilvasantin/Claude/AdmiraNext-Estudio/repos/32.-ConsejoAdmiraNextGame/game/mcp/council-mcp.cjs"]
startup_timeout_sec = 30
```

Reinicia Codex y las tools aparecen bajo el servidor `council`.

## Conectar desde Claude Desktop / otros clientes

```json
{
  "mcpServers": {
    "council": {
      "command": "node",
      "args": ["/ruta/abs/admira-live/game/mcp/council-mcp.cjs"]
    }
  }
}
```

## Tools

| Tool | Qué hace |
|------|----------|
| `get_overview` | Resumen del juego + conteos (verbos, consejeros, extensiones, versión). |
| `list_verbs` | Verbos con estado (stable/partial) y descripción. |
| `list_council` | Consejeros (filtra por `generation`: leyendas/coetaneos). |
| `list_extension_points` | Dónde y cómo extender (archivos, anclas, receta). |
| `get_manifest` | Manifest completo (fuente única de verdad). |
| `list_reservations` | Reservas activas (`all:true` incluye inactivas). |
| `claim_area` | Reserva un área (`area`,`owner`,`branch?`,`note?`). Falla si ya está reservada por otro. |
| `release_area` | Libera tu reserva (`area`,`owner`). |
| `check_sync` | Verifica que el manifest cuadra con `index.html`. |

## Flujo "no pisarnos"

1. `list_extension_points` → elige dónde trabajar (id: `verbs`, `council`, `llm-engines`, `backend`, `manifest-help`).
2. `list_reservations` → mira qué está ocupado.
3. `claim_area { area, owner, branch, note }` → reserva. Queda escrita en el manifest y **aparece en el help** (https://www.admira.live/game/help).
4. Trabaja en `index.html` (la home raíz, el juego servido) y refleja los cambios en `manifest.json`.
5. `check_sync` → confirma que no hay drift.
6. `release_area { area, owner }` al terminar.

> Las reservas viven en `collaboration.reservations` del manifest, así que el registro
> es compartido por git y visible para todos.
