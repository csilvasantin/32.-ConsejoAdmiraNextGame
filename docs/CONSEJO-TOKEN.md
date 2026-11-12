# Token del Consejo

El token de escritura del Consejo no se comparte por chat ni se pega en la
documentacion. La fuente canonica es la boveda Cloudflare `admira-vault`.

## Secreto

- Nombre facil: `TOKEN_CONSEJO_SILICIO`
- Boveda: `https://admira-vault.csilvasantin.workers.dev` (tambien `https://vault.yokup.com`)
- Lectura: `GRID_KEY` local en `~/.agents-comms/.synckey`
- Escritura: exige ademas `VAULT_ADMIN` (`vault-set.sh` de admira-vault) o
  `wrangler kv key put` en el KV de la boveda con la cuenta de Cloudflare de Carlos.

### Cambio del 12-nov-2026 (aprobado por Carlos)

`TOKEN_CONSEJO_SILICIO` tiene ahora el mismo valor que el token que acepta el
Worker de www.admira.live para escribir (`CONSUMOS_LECTURAS_TOKEN` /
`COUNCIL_MACHINE_TOKEN`, el de `~/.config/admira/consumos-lecturas.token` en la
caja). Antes daba 401 en `POST /api/consejo/objetivos-abc` y las rutinas de las
00:00 de los consejeros no podian escribir sus a/b/c en el cartel.

- `TOKEN_CONSEJO_SILICIO_ANTERIOR`: el valor de antes, guardado para quien lo use
  en otra ruta (el prompt `Token del Consejo` del servidor Node, `src/server.js`).
- `COUNCIL_WRITE_TOKEN` (boveda): NO se ha cambiado. Es el nombre de la variable
  de entorno que valida `src/server.js` (token legado del servidor del Consejo) y
  sigue con el valor anterior, igual que `TOKEN_CONSEJO_SILICIO_ANTERIOR`.

Resumen de usos:

| Para que | Entrada de la boveda |
| --- | --- |
| `GET/POST https://www.admira.live/api/consejo/objetivos-abc`, `/api/consejo/*` del Worker | `TOKEN_CONSEJO_SILICIO` |
| Token legado del servidor Node del Consejo (`src/server.js`, prompt `Token del Consejo`) | `COUNCIL_WRITE_TOKEN` (= `TOKEN_CONSEJO_SILICIO_ANTERIOR`) |

## Recuperar desde una maquina agente

```bash
python3 - <<'EOF'
import json, pathlib, urllib.parse, urllib.request

vault = "https://admira-vault.csilvasantin.workers.dev"
grid = pathlib.Path("~/.agents-comms/.synckey").expanduser().read_text().strip()
url = f"{vault}/secret/TOKEN_CONSEJO_SILICIO?" + urllib.parse.urlencode({"key": grid})
req = urllib.request.Request(url, headers={"User-Agent": "AdmiraAgent"})

with urllib.request.urlopen(req, timeout=20) as r:
    token = json.loads(r.read().decode())["value"].strip()

# Usalo directamente como cabecera; no lo imprimas.
headers = {"X-Council-Token": token, "Content-Type": "application/json"}
EOF
```

Usalo solo para rellenar el prompt `Token del Consejo` o para enviarlo como
cabecera `X-Council-Token` en llamadas automatizadas. No lo publiques en
AgoraMatrix, logs, commits, capturas ni respuestas de agentes.

## Login con Google

El backend tambien puede aceptar un `id_token` de Google en lugar del token
legado. Esto permite iniciar sesion desde la web del Consejo sin compartir la
clave de escritura.

Variables necesarias en el servidor:

- `GOOGLE_CLIENT_ID`: OAuth Web Client ID autorizado para el dominio real de la web.
- `GOOGLE_ALLOWED_EMAILS`: lista separada por comas con las cuentas permitidas.
- `GOOGLE_ALLOWED_DOMAIN`: alternativa por dominio si no se usan emails concretos.

Notas operativas:

- El frontend descubre esta configuracion via `GET /api/council/auth/google-config`.
- Se mantiene compatibilidad con `COUNCIL_WRITE_TOKEN` mientras dure la transicion.
- Si `GOOGLE_CLIENT_ID` no esta autorizado para `admira.live`, el boton de Google
  aparecera pero el login fallara con error de origen en Google.
