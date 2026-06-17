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
