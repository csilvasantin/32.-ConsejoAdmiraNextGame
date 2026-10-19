# Admirito en WhatsApp (gafas Ray-Ban Meta)

Worker de Cloudflare que conecta WhatsApp Cloud API con Admirito: recibe texto, notas de voz (transcribe) y fotos (visión) y responde con texto corto (<400 caracteres) que las gafas leen en voz alta.

## Lo que haces tú, Carlos (≈15 min)
1. developers.facebook.com → Mis apps → Crear app (tipo Business) → añadir producto **WhatsApp**.
2. WhatsApp → API Setup: en «To» añade **tu número** y verifica el código. Copia **Phone number ID** y el **token temporal** (24 h). El número de prueba es gratis y no exige verificación de empresa (hasta 5 destinatarios).
3. App settings → Basic → copia el **App secret**.
4. En esta carpeta:
   ```
   npx wrangler kv namespace create HISTORY   # pega el id en wrangler.toml
   npx wrangler secret put WA_TOKEN
   npx wrangler secret put WA_PHONE_ID
   npx wrangler secret put WA_VERIFY      # una palabra que elijas
   npx wrangler secret put APP_SECRET
   npx wrangler secret put ALLOWED_FROM   # tu número, ej. 34600111222 (varios separados por coma)
   npx wrangler secret put XAI_API_KEY    # clave de console.x.ai
   npx wrangler deploy
   ```
5. WhatsApp → Configuration → Webhook: URL `https://admirito-wa.<tu-subdominio>.workers.dev/webhook`, token = `WA_VERIFY`. Verificar y suscribir el campo **messages**.
6. Token permanente (cuando quieras): Business Settings → System users → generar token con `whatsapp_business_messaging` y `whatsapp_business_management` y repetir `wrangler secret put WA_TOKEN`.

Los secretos van solo por Telegram privado, nunca en el chat.

## iPhone y gafas
1. Guarda el número de prueba como contacto **Admirito** y escríbele «hola» (abre la ventana de 24 h).
2. App Meta AI → Gafas → Configuración del dispositivo → Comunicación → **Conectar WhatsApp**.
3. Activa **anunciar mensajes** y **leer mensajes en voz alta**.
4. Idioma de la app Meta AI en **inglés** (los comandos de WhatsApp solo van en inglés; el mensaje puede ser en castellano).
5. Di: «Hey Meta, send a message to Admirito on WhatsApp» → dicta → «Yes». Para fotos: «Hey Meta, take a photo and send it to Admirito».

## Modelos (Grok / xAI)
Por defecto todo va con xAI (`LLM_BASE_URL=https://api.x.ai/v1`, secreto `XAI_API_KEY`):
- Chat y fotos: `grok-4.7` (`LLM_MODEL`; `VISION_MODEL` opcional). Imágenes jpg/png.
- Notas de voz: xAI sí tiene speech-to-text, `POST /v1/stt` con `grok-voice-transcribe-2.0` (`STT_MODEL`, `STT_LANGUAGE=es`).
- Si quieres otro proveedor de transcripción: `STT_BASE_URL`, `STT_API_KEY`, `STT_PATH=/audio/transcriptions`, `STT_MODEL`.

## Tests
`npm test` (node --test test/*.test.mjs): verificación del webhook, firma HMAC y parseo del payload.

## Límites
Confirmación hablada en cada mensaje; solo fotos, no vídeo en directo; respuestas libres solo dentro de las 24 h desde tu último mensaje.
