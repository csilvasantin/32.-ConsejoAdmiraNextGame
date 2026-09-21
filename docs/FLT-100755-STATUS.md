# FLT-100755 · SSH + vivo Rosa/Crema (urgente Jobs TG#3768)

SmithMacMini · encargo #3773 · Hoy #116. Sigue a FLT-100754.

## Smoke ahora (Mini)

| Equipo | Resultado |
|---|---|
| **Rosa / Lucas** `100.75.118.75` | `ONLINE` · `MacBookAirRosa` · clave flota **1** match en `authorized_keys` · Tailscale **direct** · ping 60 ms |
| **Crema / Disney** `100.110.80.2` | OFFLINE · ping 0 · SSH timeout · WoL desde Rosa a LAN 192.168.1.53 sin efecto |
| Relay control | `fleet.admira.live/api/health` **ok** · relay MacMini.local |

Rosa usa el **mismo canal vivo** que Azul/Plata: sonda SSH `echo ONLINE` del hub. Con el peer en `direct`, `/control` puede marcarla online (hace falta sesión Google; el banner «solo lectura» es el navegador sin sesión, no el hub).

## Crema — gesto (Carlos la tiene delante)

1. Encender / abrir tapa del **MacBook Air Crema**.
2. **Ajustes del Sistema → General → Compartir**.
3. **Inicio de sesión remoto** → ON.
4. Permitir **csilvasantin**.
5. Avisar a Smith; smoke:  
   `ssh -i ~/.ssh/admiranext_ed25519 csilvasantin@macbookaircrema.tail48b61c.ts.net 'echo ONLINE; hostname'`

## Rollback

Sin cambio de runtime en el hub. Doc only.
