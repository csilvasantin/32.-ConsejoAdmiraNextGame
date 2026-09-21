# FLT-100754 · SSH + vivo Rosa (Lucas) y Crema (Disney)

SmithMacMini · encargo #3769 · Hoy #115. P0 Carlos.

## Qué se midió desde el Mini (21-sep-2026 ~13:08)

| Silla | Consejero | Tailscale | SSH Mini | Remote Login | Clave `admiranext_ed25519` |
|---|---|---|---|---|---|
| Azul | Jobs | active direct | ONLINE | sí | — |
| Plata | Wozniak | active direct | (no re-sondado ahora) | — | — |
| Rosa | Lucas | **sí SSH** `ONLINE` / `MacBookAirRosa` / `KEY_PRESENT` (2 líneas), luego el peer pasó a relay `mad` y el ping/SSH cayeron | **verificado** | **ON** (sshd activo) | **presente** |
| Crema | Disney | `active; relay mad; offline last seen 1–2h` · ping 100% loss · LAN 192.168.1.53 desde Rosa también muerto | **timeout** | no se puede comprobar sin despertar | no se puede comprobar |

WoL a Crema (MACs `1e:44:fc:df:73:41` y `b2:ad:f6:de:d7:0e`) desde Mini (sin ruta) y desde Rosa (broadcast LAN): **no despertó**.

## Gesto humano Crema (Carlos la tiene delante)

1. Abrir la tapa o pulsar el botón de encendido del **MacBook Air Crema**.
2. **Ajustes del Sistema** → **General** → **Compartir**.
3. Activar **Inicio de sesión remoto**.
4. «Permitir acceso para» → usuario **csilvasantin** (o «todos los usuarios»).
5. Si SSH sigue fallando, en Terminal de Crema pegar la clave del Mini:

```
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM4kZtaWgCQ/SrvznW9S3re5…  (la de ~/.ssh/admiranext_ed25519.pub del Mini)' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Smoke desde Mini: `ssh -i ~/.ssh/admiranext_ed25519 csilvasantin@macbookaircrema.tail48b61c.ts.net 'echo ONLINE; hostname'`

## Relay de control

- `https://fleet.admira.live/api/health` → 200 (Mac Mini)
- Funnel Mini `/fleet/api/health` → 200
- Pro16 `:10000/fleet/api/health` → 200  
El banner «Sin relay de control disponible (solo lectura)» es **honesto en el navegador** cuando el mesh no puede abrir sesión Google (hueco LNA FLT-100635). El hub **sí está vivo**. `/status` pide token; sin login el panel no afirma apagados.

## Vivo Lucas/Disney

El canal es el mismo que Azul/Plata: sonda SSH del hub (`echo ONLINE`) + presencia. Rosa **respondió ONLINE** mientras el peer estuvo en `direct`. Crema **no** está encendida en LAN ni Tailscale: no se puede pintar vivo sin mentir.

## Rollback

Ningún cambio de código en prod. Solo diagnóstico + latidos.
