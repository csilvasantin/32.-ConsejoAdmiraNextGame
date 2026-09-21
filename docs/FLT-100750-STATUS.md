# FLT-100750 · Botón Consejeros → escritorio 4 MBA

SmithMacMini · encargo #3758 · dup de #3756.

## Qué

Al pulsar **Consejeros** en admira.live se abre el escritorio con los 4 MacBook Air y su consejero.

| Silla | Consejero | Fondo |
|---|---|---|
| Azul | Jobs | `/wallpapers/consejero-jobs.jpg` |
| Plata | Wozniak | `/wallpapers/consejero-wozniak.jpg` |
| Rosa | Lucas | `/wallpapers/consejero-lucas.jpg` |
| Crema | Disney | `/wallpapers/consejero-disney.jpg` |

## Dónde

- Home: rail **Navega** → 🏛️ Consejeros · también `#consejeros`
- `/control/` → botón 🏛️ CONSEJEROS
- Overlay: `consejeros-desk.js` (no alerta; POST wallpaper/mode en segundo plano)

## Punto de retorno

- Sello anterior (prod): `v.20.09.2026.r3.13:42` · git `0d57297`
- Sello nuevo: `v.21.09.2026.r1.12:36`
- Rollback: `git revert` de este commit y `./deploy.sh`, o redeploy de `0d57297`

## Incidencias

Rosa y Crema no contestan SSH (Tailscale relay / last seen ~1h). El overlay se ve igual; badge «sin SSH». Azul y Plata sí aplican fondo vivo.
