# 2026-04-25 · Verbo PRESENTAR, barra de progreso y fix cache GitHub Pages

AdmiraNext Consejo — SCUMM Interface · `v26.25.04.1` → `v26.25.04.4`

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

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `public/council-scumm.html` | PRESENTAR overlay, barra progreso, no-cache, v26.25.04.4 |
| `council-scumm.html` (raíz) | Sincronizado con public/ |
| `council-api.py` | Endpoint POST /api/council/presentar + helpers audio/PDF/slides |
| `.github/workflows/pages.yml` | Auto-sync raíz desde public/ en cada deploy |

## Versiones

| Versión | Cambio principal |
|---------|-----------------|
| v26.25.04.1 | Verbos SCUMM activos (fondo sólido) + SALIR→PRESENTAR + assets fix |
| v26.25.04.2 | Overlay PRESENTAR completo (input + API + resultado) |
| v26.25.04.3 | Barra de progreso pixel-art durante generación |
| v26.25.04.4 | Fix cache GitHub Pages + no-cache meta tags |
