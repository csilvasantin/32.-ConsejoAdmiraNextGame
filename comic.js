/* ============================================================================
 * comic.js — cómic de viñetas de una reunión del Consejo
 * ----------------------------------------------------------------------------
 * Al cerrar la Mesa, convierte la conversación en una tira de cómic. 3 calidades:
 *   • good   = SVG en la web (viñetas con avatares — SIEMPRE funciona)
 *   • better = tu ChatGPT (suscripción, sin API key): AUTO vía puente local (chatgpt-bridge);
 *              si no hay puente, cae al manual (copia prompt, abre ChatGPT, pega imagen) ← DEFECTO
 *   • best   = gpt-image-1 (OpenAI, automático vía worker — cuando haya API key)
 * Default elegible y persistido (localStorage 'comicEngine', init 'better').
 * Al terminar, se puede ENVIAR AL GRUPO de Telegram (AdmiraXP) vía el worker.
 *
 * API: AdmiraComic.open({panels, tema, names, engine?})
 *   panels: [{persona, role, text, avatarStyle, color, mod?}]
 * ========================================================================== */
(function () {
  'use strict';
  const COMIC_API = 'https://fallback.admira.store/comic';            // gpt-image-1
  const TG_API = 'https://fallback.admira.store/comic-telegram';      // envío al grupo
  const BRIDGE = 'http://127.0.0.1:9189';                             // puente local ChatGPT (suscripción, sin API key)
  const STOCK_API = 'https://api.admira.store/stock/publish';         // sube el cómic al Stock de Pixeria (emitible en DOOH)
  const MAX_PANELS = 6;
  const LABELS = { good: 'good · SVG', better: 'better · ChatGPT (auto)', best: 'best · gpt-image-1' };
  const defEngine = () => localStorage.getItem('comicEngine') || 'better';
  const setDef = e => { try { localStorage.setItem('comicEngine', e); } catch (x) {} };

  let CUR = { b64: null, data: null };  // imagen actual (dataURL) lista para enviar

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const trim = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function pickPanels(panels) {
    if (panels.length <= MAX_PANELS) return panels;
    const out = [panels[0]]; const step = (panels.length - 2) / (MAX_PANELS - 2);
    for (let i = 1; i < MAX_PANELS - 1; i++) out.push(panels[Math.round(i * step)]);
    out.push(panels[panels.length - 1]); return out;
  }
  function buildPrompt(panels, tema, names) {
    const sel = pickPanels(panels);
    const lines = sel.map((p, i) => `Viñeta ${i + 1} — ${p.persona} (${p.role}): "${trim(p.text, 140)}"`).join('\n');
    return `Crea una TIRA DE CÓMIC de ${sel.length} viñetas, estilo cómic moderno limpio y colorido, con bocadillos de diálogo EN ESPAÑOL y texto legible. Es una reunión del Consejo de Admira en una sala de control futurista (caricaturas amables de líderes tecnológicos, NO fotorrealista). Tema: "${tema}". Participantes: ${names}.\nViñetas:\n${lines}\nComposición en cuadrícula 2x2 o horizontal, líneas nítidas, bocadillos cortos. Rótulo final "ADMIRANEXT".`;
  }
  function caption(data) { return `🎨 Cómic del Consejo — «${trim(data.tema, 80)}»\n${data.names}`; }

  // ── Modal ──
  function modal() {
    let m = document.getElementById('admira-comic'); if (m) return m;
    m = document.createElement('div'); m.id = 'admira-comic';
    m.style.cssText = 'position:fixed;inset:0;background:#000c;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;font-family:system-ui,Arial,sans-serif';
    m.innerHTML = '<div id="ac-card" style="background:#11131f;border:2px solid #2a2f45;border-radius:14px;max-width:1100px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 18px 60px #000"></div>';
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m); return m;
  }
  function header(engine) {
    const opt = e => `<option value="${e}"${engine === e ? ' selected' : ''}>${LABELS[e]}</option>`;
    return `<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid #2a2f45;position:sticky;top:0;background:#11131f;z-index:2;flex-wrap:wrap">
      <b style="color:#e8eef7;font-size:15px">🎨 Cómic del Consejo</b>
      <select id="ac-engine" title="calidad" style="margin-left:auto;background:#1a2030;color:#e8eef7;border:1px solid #2a2f45;border-radius:8px;padding:6px 8px;font:inherit;font-size:12px">${opt('good')}${opt('better')}${opt('best')}</select>
      <label style="color:#8a97ab;font-size:11px;display:flex;align-items:center;gap:4px"><input type="checkbox" id="ac-def"> por defecto</label>
      <button id="ac-regen" style="background:#1a2030;color:#e8eef7;border:1px solid #2a2f45;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px">↻</button>
      <button id="ac-stock" disabled style="background:#7a5cff;color:#fff;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit;font-size:12px;font-weight:700;opacity:.5" title="Sube el cómic al Stock de Pixeria (emitible en DOOH)">📦 Stock</button>
      <button id="ac-send" disabled style="background:#2a8;color:#04231e;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit;font-size:12px;font-weight:700;opacity:.5">📤 Enviar al grupo</button>
      <button id="ac-close" style="background:#1a2030;color:#e8eef7;border:1px solid #2a2f45;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px">✕</button>
    </div>`;
  }
  function setSendable(card, on) {
    ['#ac-send', '#ac-stock'].forEach(sel => {
      const b = card.querySelector(sel); if (!b) return;
      b.disabled = !on; b.style.opacity = on ? '1' : '.5'; b.style.cursor = on ? 'pointer' : 'default';
    });
  }
  // ── Subir el cómic al Stock de Pixeria (queda emitible en la DOOH) ──
  let STOCK_DONE = false;   // evita re-subir la misma imagen (auto)
  async function uploadToStock(card, data, auto) {
    if (!CUR.b64) return;
    const b = card.querySelector('#ac-stock'); if (!b) return;
    if (auto && STOCK_DONE) return;
    const old = b.textContent; b.textContent = '⏳ subiendo…'; b.disabled = true;
    try {
      const b64 = CUR.b64.split(',').pop();
      const mime = (CUR.b64.match(/^data:([^;]+)/) || [, 'image/png'])[1];
      const r = await fetch(STOCK_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image', motor: 'consejo-comic', mime, base64: b64, quality: 'best',
          title: 'Cómic del Consejo — ' + trim(data.tema || 'reunión', 70),
          tags: ['consejo', 'comic'],
          prompt: buildPrompt(data.panels, data.tema, data.names).slice(0, 500),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { STOCK_DONE = true; CUR.stockUrl = d.url; b.textContent = '✅ en el Stock'; }
      else { b.textContent = '⚠️ ' + (d.error || ('HTTP ' + r.status)); b.disabled = false; }
    } catch (e) { b.textContent = '⚠️ ' + e.message; b.disabled = false; }
  }
  function maybeAutoStock(card, data) { try { uploadToStock(card, data, true); } catch (_) {} }

  // ── good: SVG/HTML ──
  function renderSVG(panels, tema, names) {
    const sel = pickPanels(panels);
    const cells = sel.map((p, i) => `
      <div style="position:relative;background:#fffdf5;border:3px solid #111;border-radius:6px;overflow:hidden;min-height:190px;display:flex;flex-direction:column">
        <div style="position:absolute;top:6px;left:6px;background:#ffd54a;border:2px solid #111;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#111">${i + 1}</div>
        <div style="flex:1;display:flex;align-items:flex-end;justify-content:center;background:repeating-radial-gradient(circle at 20% 20%, #e9efff 0 2px, transparent 2px 7px), linear-gradient(180deg,#dfe7ff,#f2efe0)">
          <div style="width:118px;height:118px;border-radius:50%;border:3px solid #111;margin-bottom:8px;${p.avatarStyle || ''};background-color:#ccd"></div>
        </div>
        <div style="background:#fff;border-top:3px solid #111;padding:8px 10px">
          <div style="font-weight:800;font-size:12px;color:${p.color || '#111'};text-transform:uppercase">${p.mod ? '🎙️ ' : ''}${esc(p.persona)} <span style="color:#888;font-weight:600">· ${esc(p.role)}</span></div>
          <div style="font-size:13px;color:#111;line-height:1.35;margin-top:3px">${esc(trim(p.text, 160))}</div>
        </div>
      </div>`).join('');
    return `<div id="ac-sheet" style="padding:16px">
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-weight:900;font-size:20px;color:#111;background:#ffd54a;display:inline-block;padding:6px 16px;border:3px solid #111;border-radius:8px;transform:rotate(-1deg)">EL CONSEJO DE ADMIRA</div>
        <div style="color:#cdd6e6;font-size:13px;margin-top:8px">“${esc(tema)}” · ${esc(names)}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${sel.length >= 3 ? 3 : sel.length},1fr);gap:12px">${cells}</div>
    </div>`;
  }
  function sheetToB64() {
    return new Promise((resolve, reject) => {
      const sheet = document.getElementById('ac-sheet'); if (!sheet) return reject('no sheet');
      const w = sheet.scrollWidth, h = sheet.scrollHeight;
      const html = `<div xmlns="http://www.w3.org/1999/xhtml" style="background:#11131f">${sheet.innerHTML}</div>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const x = c.getContext('2d'); x.scale(2, 2); x.fillStyle = '#11131f'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); };
      img.onerror = () => reject('export');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function imgPreview(url) {
    return `<div style="padding:14px;text-align:center">
      <img src="${url}" style="max-width:100%;border-radius:8px;border:1px solid #2a2f45">
      <div style="margin-top:8px"><a href="${url}" download="comic-consejo.png" style="color:#5bd6c0;font-size:13px">💾 Descargar</a></div></div>`;
  }
  function dropZone(prompt) {
    return `<div style="padding:16px;color:#cdd6e6;font-size:13px">
      <div style="margin-bottom:8px">1) Copia el prompt y pégalo en ChatGPT (pídele la imagen):</div>
      <div style="display:flex;gap:8px;margin-bottom:6px">
        <button id="ac-copy" style="background:#1a2030;color:#e8eef7;border:1px solid #2a2f45;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px">📋 Copiar prompt</button>
        <button id="ac-open" style="background:#1a2030;color:#e8eef7;border:1px solid #2a2f45;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px">🌐 Abrir ChatGPT</button>
      </div>
      <div style="background:#0c0e18;border:1px solid #2a2f45;border-radius:8px;padding:10px;white-space:pre-wrap;font-size:11px;color:#aeb8cc;max-height:150px;overflow:auto">${esc(prompt)}</div>
      <div style="margin:12px 0 6px">2) Cuando ChatGPT te dé la imagen, <b>pégala (⌘V) o arrástrala aquí</b>:</div>
      <div id="ac-drop" style="border:2px dashed #3a4565;border-radius:10px;padding:26px;text-align:center;color:#8a97ab;cursor:pointer">Pega o suelta la imagen aquí · luego «📤 Enviar al grupo»</div>
      <div id="ac-prev"></div>
    </div>`;
  }

  async function sendGroup(card, data) {
    if (!CUR.b64) return;
    const b = card.querySelector('#ac-send'); const old = b.textContent; b.textContent = '⏳ enviando…'; b.disabled = true;
    try {
      const r = await fetch(TG_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b64: CUR.b64.split(',').pop(), caption: caption(data) }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { b.textContent = '✅ enviado al grupo'; }
      else { b.textContent = '⚠️ ' + (d.error || ('HTTP ' + r.status)); b.disabled = false; }
    } catch (e) { b.textContent = '⚠️ ' + e.message; b.disabled = false; }
  }

  // ── Puente local de ChatGPT: genera la imagen con la suscripción (sin API key) ──
  // Devuelve {b64} si lo logró, {reason} si el puente está pero no pudo, o null si el
  // puente está apagado (→ se cae al flujo manual de toda la vida).
  async function tryBridge(prompt) {
    const T = ms => (window.AbortSignal && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined;
    try {
      const h = await fetch(BRIDGE + '/health', { signal: T(1500) }).then(r => r.json()).catch(() => null);
      if (!h || !h.ok) return null;                  // puente no detectado → fallback manual
      if (!h.loggedIn) return { reason: 'needLogin' };
      const r = await fetch(BRIDGE + '/comic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal: T(190000) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok && d.b64) return { b64: d.b64.indexOf('data:') === 0 ? d.b64 : ('data:image/png;base64,' + d.b64) };
      return { reason: d.reason || ('HTTP ' + r.status) };
    } catch (e) { return null; }
  }
  function bridgeNote(br) {
    let msg;
    if (!br) msg = '🔌 Puente local no detectado — arranca <code>chatgpt-bridge</code> (<code>npm start</code>) para que salga sola. Por ahora, manual:';
    else if (br.reason === 'needLogin') msg = '🔑 El puente está activo pero falta loguear ChatGPT: <code>npm run login</code>. Mientras, manual:';
    else if (br.reason === 'needsHuman') msg = '🧩 ChatGPT pidió verificación/captcha en la ventana del puente — resuélvelo y dale a ↻, o sigue manual:';
    else msg = '⚠️ El puente no pudo generar (' + esc(br.reason || 'error') + '). Modo manual:';
    return '<div style="padding:12px 16px 0;color:#cdd6e6;font-size:12px;line-height:1.5">' + msg + '</div>';
  }

  async function run(card, data, engine) {
    CUR = { b64: null, data }; STOCK_DONE = false; setSendable(card, false);
    const body = card.querySelector('#ac-body');
    const prompt = buildPrompt(data.panels, data.tema, data.names);

    if (engine === 'better') {
      // 1) intenta el puente local (tu suscripción de ChatGPT, sin API key)
      body.innerHTML = '<div style="padding:28px;text-align:center;color:#8a97ab">🎨 generando con tu ChatGPT (puente local)…<div style="font-size:11px;margin-top:6px;color:#5a6479">si no hay puente, pasamos al modo manual</div></div>';
      const br = await tryBridge(prompt);
      if (br && br.b64) { CUR.b64 = br.b64; body.innerHTML = imgPreview(br.b64); setSendable(card, true); maybeAutoStock(card, data); return; }
      // 2) fallback manual (copia prompt + abre ChatGPT + pega la imagen de vuelta)
      body.innerHTML = bridgeNote(br) + dropZone(prompt);
      const copy = () => { navigator.clipboard.writeText(prompt).catch(() => {}); };
      card.querySelector('#ac-copy').onclick = () => { copy(); card.querySelector('#ac-copy').textContent = '✅ copiado'; };
      card.querySelector('#ac-open').onclick = () => { copy(); window.open('https://chatgpt.com/', '_blank'); };
      const drop = card.querySelector('#ac-drop'), prev = card.querySelector('#ac-prev');
      const take = file => { if (!file || !/image/.test(file.type)) return; const fr = new FileReader(); fr.onload = () => { CUR.b64 = fr.result; prev.innerHTML = imgPreview(fr.result); setSendable(card, true); maybeAutoStock(card, data); }; fr.readAsDataURL(file); };
      drop.onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => take(i.files[0]); i.click(); };
      drop.ondragover = e => { e.preventDefault(); drop.style.borderColor = '#5bd6c0'; };
      drop.ondragleave = () => { drop.style.borderColor = '#3a4565'; };
      drop.ondrop = e => { e.preventDefault(); drop.style.borderColor = '#3a4565'; take(e.dataTransfer.files[0]); };
      const onPaste = e => { for (const it of (e.clipboardData || {}).items || []) if (it.type.indexOf('image') === 0) take(it.getAsFile()); };
      document.addEventListener('paste', onPaste);
      card._cleanup = () => document.removeEventListener('paste', onPaste);
      return;
    }

    if (engine === 'best') {
      body.innerHTML = '<div style="padding:28px;text-align:center;color:#8a97ab">🎨 generando con gpt-image-1…</div>';
      try {
        const r = await fetch(COMIC_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.b64) { const url = 'data:image/png;base64,' + d.b64; CUR.b64 = url; body.innerHTML = imgPreview(url); setSendable(card, true); maybeAutoStock(card, data); return; }
        body.innerHTML = `<div style="padding:18px;color:#ffb454">gpt-image no disponible (${esc(d.error || ('HTTP ' + r.status))}).${d.needKey ? ' Falta la API key de OpenAI en el worker. Cambia a «better» o «good».' : ''}</div>`;
      } catch (e) { body.innerHTML = '<div style="padding:18px;color:#ffb454">gpt-image error: ' + esc(e.message) + '</div>'; }
      return;
    }

    // good (SVG)
    body.innerHTML = renderSVG(data.panels, data.tema, data.names);
    try { CUR.b64 = await sheetToB64(); setSendable(card, true); } catch (e) { setSendable(card, false); }
  }

  function open(data) {
    const engine = data.engine || defEngine();
    const m = modal(); const card = m.querySelector('#ac-card');
    if (card._cleanup) card._cleanup();
    card.innerHTML = header(engine) + '<div id="ac-body"></div>';
    card.querySelector('#ac-close').onclick = () => { if (card._cleanup) card._cleanup(); m.remove(); };
    const go = eng => run(card, data, eng);
    const sel = card.querySelector('#ac-engine');
    const def = card.querySelector('#ac-def'); def.checked = (defEngine() === engine);
    sel.onchange = e => { if (def.checked) setDef(e.target.value); go(e.target.value); };
    def.onchange = () => { if (def.checked) setDef(sel.value); };
    card.querySelector('#ac-regen').onclick = () => go(sel.value);
    card.querySelector('#ac-stock').onclick = () => uploadToStock(card, data, false);
    card.querySelector('#ac-send').onclick = () => sendGroup(card, data);
    go(engine);
  }

  window.AdmiraComic = { open, buildPrompt };
})();
