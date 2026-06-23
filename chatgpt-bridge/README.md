# ChatGPT bridge — imágenes con tu suscripción (sin API key)

Genera las imágenes del **cómic del Consejo** usando **tu cuenta de ChatGPT** (la
suscripción), sin gastar la API key de OpenAI. Dirige tu **Chrome real** con un perfil
dedicado (la sesión de ChatGPT persiste), recibe un prompt por HTTP, lo manda a
chatgpt.com, espera la imagen y la devuelve en base64. Lo llama `comic.js` (motor
**«navegador/better»**); si el puente está apagado o falta login, el cómic cae solo al
flujo manual de siempre.

## Puesta en marcha (una vez)

```bash
cd chatgpt-bridge
npm install                 # instala playwright-core (usa tu Chrome del sistema, no descarga navegador)
npm run login               # abre chatgpt.com en un Chrome dedicado → loguéate con tu cuenta
# (cierra con Ctrl+C cuando ya veas el chat)
```

## Uso diario

```bash
cd chatgpt-bridge
npm start                   # 🟢 http://127.0.0.1:9189
```
Deja esa terminal abierta. Abre el Consejo (admira.live), haz una **Reunión**, y al
generar el **Cómic** con el motor **«navegador»** la imagen sale sola.

## Endpoints

- `GET  /health` → `{ ok, loggedIn, busy }`
- `POST /comic` `{ "prompt": "..." }` → `{ ok, b64 }` o `{ ok:false, reason }`
  - `reason: needLogin` → corre `npm run login`.
  - `reason: needsHuman` → ChatGPT pidió captcha; resuélvelo en la ventana de Chrome.

## Notas

- **Mixed content**: la web https llama a `http://127.0.0.1` — los navegadores lo permiten
  para localhost (Chrome/Firefox). En Safari puede bloquearse; usa Chrome.
- **Selectores**: si OpenAI cambia su UI y deja de salir la imagen, ajusta `SEL` en `bridge.js`.
- **Es tu cuenta**: automatizar la web de ChatGPT roza sus términos; es tu decisión. El puente
  no resuelve captchas ni introduce contraseñas (eso lo haces tú en la ventana).
- Config por env: `CHATGPT_BRIDGE_PORT`, `CHATGPT_BRIDGE_PROFILE`, `CHATGPT_BRIDGE_ORIGIN`.
