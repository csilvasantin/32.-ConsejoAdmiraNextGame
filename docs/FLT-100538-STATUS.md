# FLT-100538 · Consejeros / DeepAgent bajo HACKEO

SmithMacMini · encargo #3440 · misión Yokup **FLT-100539** (Hoy #121) · helper de FLT-100538 (Wozniak).

## Qué

En Control / Consejo, debajo de HACKEO hay dos botones:

- **CONSEJEROS** — Azul Jobs · Plata Wozniak · Rosa Lucas · Crema Disney
- **DEEPAGENT** — Azul Neo · Plata Trinity · Rosa Morfeo · Crema Oráculo

No se tocó HACKEO ni eShow/Terminator.

## Cable

`POST /wallpaper/mode {mode, only_ids?}` en demo-server (:3032, Funnel `/demo/wallpaper/mode`). Sin token en el navegador. Copia el PNG/JPG a `~/.fleet/wallpapers/` y aplica con **NSWorkspace** (Python AppKit; no System Events).

## Piloto 4 Airs (17-sep-2026)

| Silla | IP | CONSEJEROS | DEEPAGENT |
|---|---|---|---|
| Azul | 100.84.81.45 | consejero-jobs.jpg | deepagent-neo.png |
| Plata | 100.114.113.88 | consejero-wozniak.jpg | deepagent-trinity.png |
| Rosa | 100.75.118.75 | consejero-lucas.jpg | deepagent-morfeo.png |
| Crema | 100.110.80.2 | consejero-disney.jpg | deepagent-oraculo.png |

Verificado leyendo `NSWorkspace.desktopImageURLForScreen`. Capturas Quartz en `docs/flt-100538-shots/`.

## Rollback

`ops/demo-server.py.bak-flt100538-*`. Quitar botones CONSEJEROS/DEEPAGENT. Fondos anteriores se restauran a mano si hace falta.

## UI

- `32.-ConsejoAdmiraNextGame/index.html` y `public/council-scumm.html` (stack sobre HACKEO)
- `live-deploy/control/index.html` (junto a 🕶️ HACKEO)
