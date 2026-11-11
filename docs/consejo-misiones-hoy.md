# Recuento de misiones de hoy en el globo / Mac 1984

Unión, desde las 00:00 Europe/Madrid, de:

1. encargos `done` del inbox (`bot.yokup.com/api/public/inbox?persona=`),
2. misiones Yokup `resolved`,
3. PRs **fusionados** en `csilvasantin/32.-ConsejoAdmiraNextGame` y
   `csilvasantin/admira-next-web`.

No se inventan cifras. Si una fuente no se puede leer, no aporta; `n` es
`null` («—») solo cuando no se ha podido leer ninguna.

## PRs: atribución

En este orden:

1. **Prefijo de rama** (primer segmento):
   `woz/` → Wozniak; `jobs/` → Jobs; `disney/` o `walt/` → Disney;
   `lucas/` → Lucas; `musk/` o `elon/` → Musk; `huang/` o `jensen/` → Huang;
   `lasseter/` → Lasseter; `ive/` o `jony/` → Ive.
2. **Lista expresa de Carlos (t1212u)**, solo si la rama no lleva prefijo:
   `admira-next-web#396` y `admira-next-web#398` son de Wozniak.
3. Si no hay marca clara (`feat/`, `fix/`, …), **no se atribuye a nadie**.

El login de GitHub no se usa: en este org casi todos los PR salen como
`csilvasantin`.

## PRs: lectura (Worker)

`GET https://api.github.com/repos/<repo>/pulls?state=closed&sort=updated&direction=desc&per_page=50`
(hasta 3 páginas). Cabeceras:

```
User-Agent: admira-live-consejo
Accept: application/vnd.github+json
```

Si existe el secreto de Pages `GITHUB_TOKEN` (o `GH_TOKEN`) se envía como
`Authorization: Bearer`. **No es obligatorio**: el repo del Consejo es
público. `admira-next-web` es privado; sin token el API responde 404 y ese
repo no se cuenta desde el Worker (no se inventa).

El resultado se guarda en KV (`CONSUMOS_KV` || `RECORTE_KV`, clave
`consejo:prs-fusionados:v1`) **8 minutos**, para no pasar de 60 peticiones
por hora sin autenticar.

## PRs: job de respaldo en el box

Si el Worker sigue recibiendo 403 (datacenter) o 404 (repo privado), el
job idempotente del box lee los dos repos con `gh api` (sesión local; no
imprime tokens) y hace POST autenticado:

```
node tools/consejo-prs-hoy.mjs
node tools/consejo-prs-hoy.mjs --dry-run
node tools/consejo-prs-hoy.mjs --url https://www.admira.live
```

- **URL:** `POST https://www.admira.live/api/consejo/prs-hoy`
- **Auth:** `X-Council-Token` o Bearer = `CONSUMOS_LECTURAS_TOKEN` /
  `TOKEN_CONSEJO_SILICIO` (`~/.config/admira/consumos-lecturas.token`).
- Cuerpo: `{ prs: [{ repo, number, title, merged_at, rama }], repos_ok, fuente }`.
  Solo PRs con `merged_at`. Un vacío solo se acepta si los dos repos se
  leyeron bien. Si un repo falla, no se pisa el KV con un 0 inventado.
- Lectura: `GET https://www.admira.live/api/consejo/prs-hoy` (público).

El recuento de hoy lo sigue haciendo el Worker con `atribuirPr` (no el job).
Se puede programar cada 8 min en el box; cada pasada pisa con la lista real.

## Yokup: por qué salía 0 con yokup_ok=true

`yokup_ok` solo significa que `GET /fleet/missions?status=resolved&limit=120`
respondió 200. Ese límite es una **ventana global** (las 120 más recientes
de toda la flota), no un filtro por consejero. Las de Woz a menudo no
entran, y el recuento queda a 0 siendo la lectura «correcta».

El campo de persona sí era usable cuando la misión está en la lista:
`persona` / `assignee` vienen como `WozniakGrokBot`, y
`duplicate.agent_key` como `wozniak`. El API acepta `?agent=woz` (total
real del consejero). Ahora se pide por alias (`woz`, `jobs`, `disney`,
`lucas`, `musk`, `huang`, `lasseter`, `ive`) y, si eso falla, se cae al
listado global. No se cuentan `in_progress`. Si un agente no responde, no
se inventa su cifra.
