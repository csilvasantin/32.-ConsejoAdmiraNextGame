# Navegadores del equipo — conectar, identificar y auto-elegir

> Objetivo: cuando un agente necesite un navegador, **elige el correcto solo**, sin preguntar
> a Carlos y sin capturas. Esta guía tiene 3 partes. Sigue solo la que necesites.

Panel en vivo: **https://www.admira.live/navegadores**
Scripts: en `~/Claude/admira-vault/` (todas las máquinas los tienen vía la bóveda/repo).

---

## Parte A — Conectar la extensión en una máquina (una vez por Mac/PC)

Haz esto en la máquina cuyo Chrome quieres controlar.

1. Abre Chrome e instala/activa la extensión **Claude for Chrome**.
2. Inicia sesión con la **misma cuenta de Claude del equipo** (la extensión se empareja por cuenta).
3. Abre el candado de la extensión y confirma que dice **"Connected"** (verde).

**Verificar que está conectada (10 s):** desde un agente Claude ejecuta el tool
`list_connected_browsers`. Si tu navegador aparece en la lista, está conectado.

**Si se cae (auto-reconecta):** Chrome reconecta la extensión solo al reabrir la pestaña.
Para que sobreviva reinicios de la máquina, deja Chrome en los **elementos de inicio de sesión**
(macOS: Ajustes ▸ General ▸ Elementos de inicio). En Windows: carpeta *Inicio* (`shell:startup`).

> Nota: la extensión **no** distingue de qué máquina física es cada Chrome (todos se ven
> `isLocal:true`). Por eso existe la Parte B (identificar) y el registro en `/navegadores`.

### Para control SIN Claude (opcional, recomendado en Mac fijos)

Instala el **executor local** una vez y ese Chrome queda controlable desde el panel sin gastar
tokens de LLM (abre URL, reposo, refrescar), y se **auto-reporta** al registro:

```bash
bash ~/Claude/admira-vault/navegadores-executor/install.sh
```

Deja un LaunchAgent que sobrevive reinicios. Aparece en `/navegadores` como `local-<maquina>`.

---

## Parte B — Identificar un deviceId → máquina (sonar localhost, < 30 s)

Úsalo cuando un deviceId desconocido aparece en `list_connected_browsers` y no sabes de qué
máquina es. **Debes correrlo EN la máquina candidata** (o pedir al agente de esa máquina).

1. En la máquina candidata, levanta el sonar (bloquea ~25 s):
   ```bash
   bash ~/Claude/admira-vault/identify-browser.sh listen 25
   ```
   Imprime un `TOKEN` y una `URL` tipo `http://127.0.0.1:8799/soy?t=<TOKEN>`.

2. Con el MCP claude-in-chrome, selecciona el navegador candidato y navégalo a esa URL:
   - `select_browser <deviceId>`
   - `navigate http://127.0.0.1:8799/soy?t=<TOKEN>`

3. Lee la última línea del sonar:
   - **`RESULT=HIT`** → ese navegador corre en ESTA máquina. Etiquétalo:
     ```bash
     bash ~/Claude/admira-vault/browser-label.sh <deviceId> "$(scutil --get ComputerName)"
     ```
   - **`RESULT=MISS`** → corre en OTRA máquina (su `localhost` no es el tuyo). Prueba en otra.

Por qué funciona: solo el navegador de ESTA máquina alcanza un server que escucha en
`127.0.0.1` de ESTA máquina. Es la única señal fiable de "en qué equipo físico está este Chrome".

---

## Parte C — Auto-elegir navegador (el agente NO pregunta a Carlos)

Antes de tocar un navegador, el agente resuelve el deviceId por nombre de máquina:

```bash
did=$(bash ~/Claude/admira-vault/pick-browser.sh "MacBookAir16")   # o "Negro14", "zenbook", "Mac Mini"…
# luego, con el MCP:  select_browser  $did
```

- El nombre es difuso (mayúsculas/espacios/guiones dan igual; por subcadena).
- `pick-browser.sh --list` muestra la tabla máquina → deviceId → online.
- `pick-browser.sh --online <maquina>` falla si ese navegador no está online.
- Si no hay coincidencia, **falla en vez de adivinar** (no devuelve un navegador equivocado).

### Limitación honesta del MCP (no es un bug, es una protección)

El tool `claude-in-chrome` **siempre pide 1 confirmación** cuando hay varios navegadores
conectados (una guarda del propio tool que **no** se puede desactivar por código, y **no**
debemos intentar saltárnosla). El objetivo no es evitar la confirmación, sino que la elección
sea **automática y correcta** para que confirmar sea 1 clic obvio.

**Mitigación para cero fricción:** deja **un solo navegador conectado por sesión de trabajo**.
Con uno solo, el MCP no pregunta cuál — y `pick-browser.sh` te da el deviceId ya resuelto.

---

## Estado del registro y tareas pendientes (2026-07-06)

- El campo `machine` del worker es **sticky**: se fija en la 1.ª escritura vía `machineHint`.
  Cambiarlo después requiere `/api/label` con **login Google de owner** (Carlos) desde el panel,
  o borrado en el worker. `/api/report` (los scripts) solo fija la etiqueta la primera vez.
- Entrada **fantasma** no borrable desde CLI: `552927ea-…` (quedó como "MacBook Air 16" por error).
  `pick-browser.sh` la ignora (blacklist). Borrado real: Carlos, con su Google, en el panel.
- Verificado por sonar esta noche: `15ff2e09` y `21b83635` **NO** son este `MacBookAir16plata`
  (ambos MISS) → corren en otras máquinas. Falta identificarlos desde su máquina real (Parte B).
