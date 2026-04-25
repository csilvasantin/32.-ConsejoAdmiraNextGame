# 2026-04-25 · Verbo PRESENTAR, barra de progreso, fix cache y API funcional

AdmiraNext Consejo — SCUMM Interface · `v26.25.04.1` → `v26.25.04.7`

## Cambios implementados

### 1. Verbo PRESENTAR (reemplaza SALIR) — v26.25.04.2

El verbo **SALIR** se elimina del panel SCUMM y se sustituye por **PRESENTAR**.

#### Frontend (`public/council-scumm.html`)

- Botón cambiado: `data-verb="salir"` → `data-verb="presentar"`, texto "Salir" → "Presentar"
- `VERB_TO_PANEL`: entrada `salir` → `presentar`
- Panel de inventario PRESENTAR con sub-opciones: 🎙️ Audio · 📄 PDF · 🎙️+📄 Ambos · 📊 Slides
- Overlay `#presentar-overlay` sobre la imagen del consejo:
  - Estado INPUT: textarea de tema, selector de formato, adjuntar fichero, botón ⚡ GENERAR
  - Estado LOADING: barra de progreso + paso actual
  - Estado RESULT: reproductor de audio, enlace PDF/Slides, lista de secciones
- CSS pixel-art: fondo oscuro semitransparente, bordes dorados, fuente Press Start 2P
- `selectVerb('presentar')` llama a `triggerPresentar()` → `showPresentarOverlay()` inmediatamente
- Verbo por defecto al cargar: PREGUNTAR

#### Backend (`council-api.py`)

Nuevo endpoint `POST /api/council/presentar`:

```
PresentarRequest { prompt, file_content?, file_name?, formato }
  → Claude genera JSON estructurado { title, sections[], script }
  → _presentar_audio()  → macOS say → .aiff → ffmpeg → .mp3
  → _presentar_pdf()    → pandoc markdown → PDF (fallback .md)
  → _presentar_slides() → HTML scroll-snap estilo SCUMM
  → { title, sections, audio_url?, pdf_url?, slides_url? }
```

Archivos servidos en `presentations/` (montado en FastAPI).

---

### 2. Barra de progreso pixel-art — v26.25.04.3

Durante la generación (puede tardar 30-60 s), la pantalla de loading mostraba
texto estático que parecía un cuelgue. Se añade:

- **Barra dorada** (`#daa520`) que avanza por etapas simuladas cada 4 s:
  5% → 15% → 30% → 50% → 68% → 82% → 92% → 100%
- **Texto del paso actual** según formato elegido:
  `"🤖 Claude generando..."` · `"🎙️ Sintetizando audio..."` · `"📄 Compilando PDF..."` etc.
- **Parpadeo** en el extremo derecho de la barra (animación CSS `pp-blink`)
- Al llegar a 100%, barra vira a verde y espera 600 ms antes de mostrar resultado
- `_setProgress(pct, step)` — función global que actualiza barra + % + texto

---

### 3. Fix caché — URLs de Telegram y no-cache agresivo — v26.25.04.4

#### Problema raíz detectado

GitHub Pages legacy mode sirve desde la raíz `/` del repo `main`.
El fichero `council-scumm.html` en la raíz llevaba **3 días sin actualizarse**
(en `v26.22.04.2`) mientras todos los cambios iban a `public/council-scumm.html`.
El CDN ignoraba query params como cache key → `?v=anything` devolvía el fichero viejo.

#### Fixes aplicados

1. **Raíz sincronizada**: `council-scumm.html` (raíz) = copia de `public/council-scumm.html`
2. **Workflow auto-sync** (`.github/workflows/pages.yml`):
   ```yaml
   - name: Sync root HTML from public/
     run: cp public/council-scumm.html council-scumm.html
   ```
   Se ejecuta antes del build en cada push → nunca más desincronizado.
3. **Meta no-cache** en `<head>`:
   ```html
   <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
   <meta http-equiv="Pragma" content="no-cache">
   <meta http-equiv="Expires" content="0">
   ```
4. **Script de redirección agresivo**: redirige a `?_v=<Date.now()>` si el param
   falta o tiene más de 5 minutos de antigüedad:
   ```javascript
   var v = parseInt(p.get('_v') || '0', 10);
   if (!v || Date.now() - v > 300000)
       location.replace(location.pathname + '?_v=' + Date.now());
   ```

#### Regla establecida — Telegram

Todos los mensajes de Telegram con enlace al Consejo usan `?_v=<unix_timestamp_ms>`
para romper caché de CDN y navegador:
```
https://csilvasantin.github.io/32.-ConsejoAdmiraNextGame/council-scumm.html?_v=<TS>
```

---

---

### 4. Resultado PRESENTAR rediseñado — v26.25.04.5 y v26.25.04.6

#### Fix URLs del resultado

Los archivos (audio/PDF/slides) viven en el servidor API local. `showPresentarResult`
ahora antepone `activeApiUrl` a las rutas relativas devueltas por la API:

```javascript
const base = (activeApiUrl || '').replace(/\/$/, '');
const absUrl = u => u ? (u.startsWith('http') ? u : base + u) : null;
```

#### Resultado con tabs inline y notificación sonora

Al terminar la generación:
- **Chime Do-Mi-Sol** via Web Audio API (sin archivo externo)
- **Flash dorado** en el dialog
- **Tabs** según formatos generados: 🎙️ Audio · 📄 PDF · 📊 Slides · 📋 Índice
- **Audio**: player `<audio>` inline + botón descargar
- **PDF**: `<object>` embebido + botón abrir
- **Slides**: `<iframe>` inline + botón abrir en ventana
- Botones **NUEVA** (reinicia input) y **CERRAR**

---

### 5. Verbo PREVIO — v26.25.04.7

Nuevo botón **▶ PREVIO** en la barra de verbos SCUMM:
- **Oculto** hasta que se genera la primera presentación
- Al pulsar abre el overlay directamente con `_lastPresentarResult` (sin regenerar)
- Permite volver al audio/PDF/slides en cualquier momento sin perder el resultado

```javascript
let _lastPresentarResult = null;   // guardado en showPresentarResult
function triggerPrevio() {
    if (!_lastPresentarResult) { setActionLine("⚠️ Aún no hay presentación"); return; }
    showPresentarOverlay();
    showPresentarResult(_lastPresentarResult);
}
```

---

### 6. API operativa con fallback claude CLI — fix council-api.py

#### Problemas resueltos en council-api.py

| Bug | Fix |
|-----|-----|
| `ModuleNotFoundError: dotenv` | `pip install python-dotenv fastapi uvicorn anthropic groq` |
| `ModuleNotFoundError: admiranext` | Path multi-ubicación: `~/GitHub/` y `~/Documents/New project/...` |
| `NameError: _check_rate_limit` | Renombrado a `check_rate_limit` (nombre correcto) |
| `401 invalid x-api-key` | Clave inválida en .env — eliminada |

#### Fallback: claude CLI en lugar de ANTHROPIC_API_KEY

Sin API key en `.env`, el endpoint `/api/council/presentar` usa el CLI de Claude Code
(autenticado via OAuth) como subproceso para generar el JSON estructurado:

```python
proc = await asyncio.create_subprocess_exec(
    "claude", "-p", cli_prompt,
    env={**os.environ, "CLAUDECODE": ""},  # bypass nested session check
)
stdout, _ = await proc.communicate()
raw = stdout.decode("utf-8").strip()
```

**Resultado verificado:** "Naranjito: La Mascota del Mundial de España 1982"
con 6 secciones y MP3 de 49K generado y reproducido correctamente.

#### Arranque local

```bash
cd ~/Claude/ConsejoAdmiraNextGame
python3 council-api.py   # API en localhost:8420
./start-council.sh       # API + Cloudflare tunnel (para acceso móvil)
```

`.env` mínimo requerido:
```
COUNCIL_API_TOKEN=admira2026
TELEGRAM_BOT_TOKEN=8753533419:...
TELEGRAM_CHAT_ID=-1003841065210
```

---

---

### 7. PRESENTAR vía Groq — 100% gratis — v26.25.04.8

El endpoint `/api/council/presentar` ya no usa Claude CLI ni la API de Anthropic.
Usa **Groq (llama-3.3-70b-versatile)** — tier gratuito, sin consumir tokens de Anthropic.

#### Cambio en `council-api.py`

```python
# Antes: claude CLI con CLAUDECODE="" para bypass nested session
# Ahora:
groq_resp = http_requests.post(
    GROQ_API_URL,
    headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
    json={
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 4000,
        "temperature": 0.3,
    },
    timeout=60,
)
groq_resp.raise_for_status()
raw = groq_resp.json()["choices"][0]["message"]["content"]
```

#### `.env` actualizado

```
GROQ_API_KEY=gsk_...  # gratis en console.groq.com
```

Si no hay `GROQ_API_KEY`, el endpoint devuelve HTTP 503 con mensaje claro.

---

### 8. Deploy en Render.com — API independiente del Mac — v26.25.04.9

Para que el Consejo funcione aunque el Mac esté apagado, se despliega `council-api.py`
en **Render.com** (tier gratuito, siempre encendido).

#### Cambios para hacer la API cloud-compatible

| Dependencia macOS | Sustituto cloud | Motivo |
|---|---|---|
| `say` + ffmpeg | **gTTS** (Google TTS, gratis) | `say` es solo macOS |
| `pandoc` | **fpdf2** (Python puro) | pandoc no está en Render |
| `~/Presentations/council` | `./presentations/` (relativo) | `Path.home()` no aplica |
| `~/Audio/council-daily` | `./audio/` (relativo) | ídem |
| admiranext import | Import con try/except + stubs | No está en Render |

#### Archivos nuevos

- **`requirements.txt`** — dependencias pip para Render
- **`render.yaml`** — configuración del servicio web + disco persistente 1 GB
- **`main.py`** — entry point para uvicorn (el guión en `council-api.py` impide importarlo directamente)

#### Pasos para activar en Render

1. [render.com](https://render.com) → New → Web Service → conectar repo GitHub
2. Render detecta `render.yaml` automáticamente
3. En Environment Variables añadir:
   - `COUNCIL_API_TOKEN=admira2026`
   - `GROQ_API_KEY=gsk_...`
   - `TELEGRAM_BOT_TOKEN=...`
   - `TELEGRAM_CHAT_ID=...`
4. Deploy → copiar URL pública `https://consejo-admira-api.onrender.com`
5. En `public/council-scumm.html` añadir esa URL como `apiEndpoints[2]`

#### Arranque local (sin cambios)

```bash
cd ~/Claude/ConsejoAdmiraNextGame
python3 council-api.py   # sigue funcionando en local igual que antes
```

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `public/council-scumm.html` | Todo: PRESENTAR, barra progreso, no-cache, tabs, PREVIO, audio-stop — v26.25.04.8 |
| `council-scumm.html` (raíz) | Sincronizado con public/ en cada commit |
| `council-api.py` | PRESENTAR vía Groq, gTTS, fpdf2, rutas relativas, admiranext opcional |
| `requirements.txt` | **Nuevo** — dependencias pip para Render |
| `render.yaml` | **Nuevo** — configuración Render.com |
| `main.py` | **Nuevo** — entry point uvicorn para Render |
| `.env` | GROQ_API_KEY añadida |
| `.github/workflows/pages.yml` | Auto-sync raíz desde public/ en cada deploy |
| `diario/2026-04-25-*.md` | Esta entrada |

## Versiones

| Versión | Cambio principal |
|---------|-----------------|
| v26.25.04.1 | Verbos SCUMM activos (fondo sólido) + SALIR→PRESENTAR + assets fix |
| v26.25.04.2 | Overlay PRESENTAR completo (input + API + resultado) |
| v26.25.04.3 | Barra de progreso pixel-art durante generación |
| v26.25.04.4 | Fix cache GitHub Pages + no-cache meta tags + auto-sync raíz |
| v26.25.04.5 | Fix URLs resultado (prefijar activeApiUrl) |
| v26.25.04.6 | Tabs inline, chime Do-Mi-Sol, flash dorado, botones NUEVA/CERRAR |
| v26.25.04.7 | Verbo PREVIO — abre última presentación sin regenerar |
| v26.25.04.8 | Fix audio al cerrar overlay + PRESENTAR vía Groq (gratis, sin API key Anthropic) |
| v26.25.04.9 | Deploy Render.com: gTTS, fpdf2, rutas relativas, admiranext opcional |
