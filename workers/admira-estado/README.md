# admira-estado — estado privado y live del tablero «¿En qué estamos?»

Worker + KV que guarda el JSON del estado y lo sirve **solo a usuarios autorizados**
(mismo login Google que el gate de admira.live). Así el tablero es live entre todas
las máquinas del grupo **sin `git pull`** y **sin quedar público** en Pages.

## Endpoints
- `GET /estado` — devuelve el estado (requiere auth).
- `POST /estado` — sustituye el estado (requiere auth). Lo usa el silicio.
- `GET /health` — salud (sin auth).

## Auth
- **Navegador**: `Authorization: Bearer <cred>` donde `cred = localStorage.admira_gate.cred`
  (el ID token de Google del gate). Se verifica con Google + allowlist de superusers.
- **Agente/headless**: `X-Estado-Token: <ESTADO_TOKEN>` (secreto del worker).

## Desplegar (una vez) — requiere que TÚ hagas login en Cloudflare
```bash
cd workers/admira-estado
npx wrangler login                              # abre el navegador (interactivo)
npx wrangler kv namespace create ESTADO         # copia el id que imprime…
#   …y pégalo en wrangler.toml → [[kv_namespaces]] id = "…"
npx wrangler secret put ESTADO_TOKEN            # inventa un token fuerte para los agentes
npx wrangler deploy
#   queda en https://admira-estado.csilvasantin.workers.dev
npx wrangler tail                               # (opcional) ver logs en vivo
```

## Conectar el tablero
En `vista-previa/index.html` la constante `ESTADO_API` ya apunta a
`https://admira-estado.csilvasantin.workers.dev`. En cuanto el worker responda y el
usuario tenga sesión del gate, el tablero lee del worker; si no, cae al `estado.json`
local (comportamiento actual, no se rompe nada).

## Empujar el estado desde shell (silicio)
```bash
ESTADO_TOKEN=<token> ./put.sh            # sube vista-previa/estado.json al worker
```

## Cerrar del todo la privacidad (tras desplegar)
1. Poner el gate en la página: añadir `<script src="/auth-gate.js"></script>` a
   `vista-previa/index.html` (protege la vista; ojo con el preview local).
2. Vaciar el `vista-previa/estado.json` commiteado (dejar un placeholder) para que
   Pages no exponga nada: el estado real ya vive en el worker.
