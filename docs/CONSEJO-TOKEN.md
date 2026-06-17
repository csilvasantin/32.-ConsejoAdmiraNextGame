# Token del Consejo

El token de escritura del Consejo no se comparte por chat ni se pega en la
documentacion. La fuente canonica es la boveda Cloudflare `admira-vault`.

## Secreto

- Nombre facil: `TOKEN_CONSEJO_SILICIO`
- Nombre tecnico compatible: `COUNCIL_WRITE_TOKEN`
- Boveda: `https://admira-vault.csilvasantin.workers.dev`
- Lectura: `GRID_KEY` local en `~/.agents-comms/.synckey`

## Recuperar desde una maquina agente

```bash
python3 - <<'PY'
import json, pathlib, urllib.parse, urllib.request

vault = "https://admira-vault.csilvasantin.workers.dev"
grid = pathlib.Path("~/.agents-comms/.synckey").expanduser().read_text().strip()
url = f"{vault}/secret/TOKEN_CONSEJO_SILICIO?" + urllib.parse.urlencode({"key": grid})
req = urllib.request.Request(url, headers={"User-Agent": "AdmiraAgent"})

with urllib.request.urlopen(req, timeout=20) as r:
    token = json.loads(r.read().decode())["value"]

print(token)
PY
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
