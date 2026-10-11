/* Mesa de debate del Consejo · /debatir · /debate (GrokBotBox, 11-10-2026 · Carlos).
 * Expert mode (⌘ EXPERTO · CLI):
 *   /debatir <tema o URL>            · /debate <topic or URL>              → GRATIS (Nemotron 3 Ultra), bocadillos
 *   /debatir audio <tema o URL>      · /debate audio <…>                   → GRATIS + voz del navegador (speechSynthesis)
 *   /debatir mejor <tema o URL>      · /debate better <…>                  → PAGO (grok-4.6), bocadillos
 *   /debatir mejor audio <tema|URL>  · /debate better audio <…>            → PAGO + voces ElevenLabs (servidor)
 *   opciones: rondas=N (x3) · todos (las 8 sillas de la vista) · /debatir stop
 *   /demo debatir · /demo debate [audio] → debate de muestra.
 * DMZ: solo se activa fuera de www.admira.live (preview *.pages.dev, localhost) o con
 * localStorage["admira-dmz-debatir"]="1". En producción no intercepta nada.
 * Los consejeros salen de la vista actual del Consejo (Leyendas / Coetáneos); Jobs modera y concluye. */
(function (root) {
  'use strict';
  if (root.AdmiraDebatir) return;

  var PROD = ['www.admira.live', 'admira.live'];
  var API = '/api/consejo/debatir', API_VOZ = '/api/consejo/voz';
  var NOMBRES = {
    jobs: 'Steve Jobs', wozniak: 'Steve Wozniak', cook: 'Tim Cook', buffett: 'Warren Buffett', disney: 'Walt Disney',
    rams: 'Dieter Rams', schultz: 'Howard Schultz', lucas: 'George Lucas', musk: 'Elon Musk', huang: 'Jensen Huang',
    shotwell: 'Gwynne Shotwell', porat: 'Ruth Porat', lasseter: 'John Lasseter', ive: 'Jony Ive', ratti: 'Carlos Ratti', reynolds: 'Ryan Reynolds'
  };
  var MESA = { leyendas: ['jobs', 'wozniak', 'disney', 'lucas'], coetaneos: ['musk', 'huang', 'ive', 'reynolds'] };
  var TODOS = { leyendas: ['jobs', 'wozniak', 'cook', 'buffett', 'disney', 'rams', 'schultz', 'lucas'], coetaneos: ['musk', 'huang', 'shotwell', 'porat', 'lasseter', 'ive', 'ratti', 'reynolds'] };
  // Voz del navegador: tono y ritmo propios por consejero (y voz distinta si el sistema tiene varias).
  var TONO = {
    jobs: [1.0, 1.0], wozniak: [1.25, 1.12], cook: [0.95, 0.98], buffett: [0.8, 0.9], disney: [1.1, 0.95], rams: [0.85, 0.9],
    schultz: [1.05, 1.02], lucas: [0.75, 0.92], musk: [0.9, 1.1], huang: [1.05, 1.05], shotwell: [1.3, 1.05], porat: [1.2, 1.0],
    lasseter: [1.15, 1.08], ive: [0.9, 0.88], ratti: [1.0, 1.0], reynolds: [1.1, 1.15]
  };
  var DEMO_TEMA = { es: '¿Deben las tiendas sustituir la cartelería en papel por pantallas con IA que cambian el mensaje según quién pasa?', en: 'Should stores replace paper signage with AI screens that change the message depending on who walks by?' };

  // ── Parser (puro, cubierto por debatir.test.mjs) ──────────────────────────
  function parse(text) {
    var m = /^\/(debatir|debate)(?:\s+([\s\S]*))?$/i.exec(String(text || '').trim());
    if (!m) return null;
    var o = { lang: m[1].toLowerCase() === 'debate' ? 'en' : 'es', nivel: 'gratis', audio: false, todos: false, rondas: 2, tema: '', stop: false };
    var resto = String(m[2] || '').trim(), t;
    for (;;) {
      t = /^(\S+)\s*/.exec(resto);
      if (!t) break;
      var w = t[1].toLowerCase(), r;
      if (w === 'mejor' || w === 'better') o.nivel = 'pago';
      else if (w === 'audio' || w === 'voz' || w === 'voice') o.audio = true;
      else if (w === 'todos' || w === 'all') o.todos = true;
      else if (w === 'stop' || w === 'parar' || w === 'fin' || w === 'end') { o.stop = true; }
      else if ((r = /^(?:rondas|rounds|r)[=:](\d+)$/.exec(w)) || (r = /^x(\d+)$/.exec(w))) o.rondas = Math.max(1, Math.min(4, parseInt(r[1], 10)));
      else break;
      resto = resto.slice(t[0].length);
    }
    o.tema = resto.trim();
    return o;
  }
  function dmzActiva(loc, store) {
    loc = loc || root.location; store = store || safeStorage('localStorage');
    var host = String(loc && loc.hostname || '').toLowerCase();
    if (PROD.indexOf(host) < 0) return true;
    try { return !!store && store.getItem('admira-dmz-debatir') === '1'; } catch (e) { return false; }
  }
  // Ancla de la cabeza (en % de la escena) a partir de la silueta del consejero.
  function ancla(gen, persona, sil) {
    sil = sil || (root.COUNCIL_SILHOUETTES || {})[gen];
    var d = sil && sil.paths && sil.paths[NOMBRES[persona]];
    if (!d) return null;
    var nums = String(d).match(/-?\d+(?:\.\d+)?/g) || [], pts = [], i;
    for (i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]]);
    if (!pts.length) return null;
    var minY = Infinity; pts.forEach(function (p) { if (p[1] < minY) minY = p[1]; });
    var cab = pts.filter(function (p) { return p[1] <= minY + 30; });
    var x = cab.reduce(function (a, p) { return a + p[0]; }, 0) / cab.length;
    return { x: (x / sil.width) * 100, y: (minY / sil.height) * 100 };
  }
  function orden(gen, todos, rondas) {
    var mesa = (todos ? TODOS : MESA)[gen === 'coetaneos' ? 'coetaneos' : 'leyendas'], out = [];
    for (var r = 1; r <= rondas; r++) mesa.forEach(function (p) { out.push({ persona: p, ronda: r }); });
    return out;
  }

  // ── Utilidades de navegador ───────────────────────────────────────────────
  function safeStorage(k) { try { return root[k] || null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function token() {
    var ss = safeStorage('sessionStorage');
    try {
      var q = new URLSearchParams(root.location.search), k = q.get('debatir_token');
      if (k && ss) {
        ss.setItem('debatir-token', k); q.delete('debatir_token');
        root.history.replaceState(null, '', root.location.pathname + (q.toString() ? '?' + q : '') + root.location.hash);
      }
      var t = ss && ss.getItem('debatir-token'); if (t) return t;
      var g = ss && JSON.parse(ss.getItem('chat-hilo-google') || 'null');
      if (g && g.jwt && g.exp * 1000 > Date.now() + 30000) return g.jwt;
    } catch (e) {}
    return '';
  }
  function cabecerasApi() { var t = token(), h = { 'content-type': 'application/json' }; if (t) h.Authorization = 'Bearer ' + t; return h; }
  function api(body, signal) {
    return fetch(API, { method: 'POST', cache: 'no-store', headers: cabecerasApi(), body: JSON.stringify(body), signal: signal })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; }).then(function (d) { d.status = r.status; return d; }); });
  }
  function espera(ms, st) { return new Promise(function (res) { var t = setTimeout(res, ms); if (st) st.timers.push(t); }); }

  // ── Estilos (mismo lenguaje que .speech-bubble del Consejo: tinta oscura + oro) ──
  function estilos() {
    if (document.getElementById('debatir-css')) return;
    var s = document.createElement('style'); s.id = 'debatir-css';
    s.textContent =
      '.debate-layer{position:absolute;inset:0;z-index:30;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}' +
      '.debate-tema{position:absolute;left:50%;top:1.6%;transform:translateX(-50%);width:min(70%,880px);box-sizing:border-box;background:rgba(10,10,20,.94);border:2px solid #daa520;border-radius:10px;padding:8px 40px 8px 14px;color:#f3e6c0;box-shadow:0 0 18px rgba(218,165,32,.25);pointer-events:auto}' +
      '.debate-tema .dt-cab{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:clamp(7px,.62vw,10px)/1.6 "Press Start 2P",monospace;color:#daa520;text-transform:uppercase}' +
      '.debate-tema .dt-txt{margin-top:4px;font-size:clamp(11px,.95vw,15px);line-height:1.4;color:#fff6dc;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.debate-tema .dt-ctx{margin-top:3px;font-size:clamp(10px,.78vw,12.5px);line-height:1.35;color:#c9ba9c;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.debate-tema .dt-nota{margin-top:3px;font-size:11px;color:#ffb35c}' +
      '.dt-badge{padding:2px 6px;border-radius:4px;border:1px solid currentColor;letter-spacing:.5px}' +
      '.dt-badge.gratis{color:#7CFC9B}.dt-badge.pago{color:#ff8a5c}.dt-badge.audio{color:#8cf}.dt-badge.ronda{color:#ffdf73}' +
      '.debate-x{position:absolute;top:6px;right:8px;width:22px;height:22px;line-height:18px;padding:0;background:transparent;border:1px solid rgba(218,165,32,.6);border-radius:4px;color:#daa520;font-size:15px;cursor:pointer}' +
      '.debate-x:hover{background:#daa520;color:#0a0a14}' +
      '.debate-bubble{position:absolute;box-sizing:border-box;width:clamp(200px,25%,360px);background:rgba(10,10,20,.95);border:2px solid #daa520;border-radius:10px;padding:8px 12px 9px;color:#eee8d8;box-shadow:0 0 16px rgba(218,165,32,.3);opacity:0;transform:translateY(6px);transition:opacity .25s ease,transform .25s ease}' +
      '.debate-bubble.on{opacity:1;transform:none}' +
      '.debate-bubble .db-quien{font:clamp(7px,.6vw,9.5px)/1.5 "Press Start 2P",monospace;color:#daa520;text-transform:uppercase;margin-bottom:5px;display:flex;justify-content:space-between;gap:6px}' +
      '.debate-bubble .db-quien span{opacity:.7}' +
      '.debate-bubble .db-txt{font-size:clamp(11.5px,1vw,15.5px);line-height:1.42;min-height:1.4em}' +
      '.debate-bubble::after{content:"";position:absolute;bottom:-10px;left:var(--tail,50%);margin-left:-9px;border-left:9px solid transparent;border-right:9px solid transparent;border-top:10px solid #daa520}' +
      '.debate-bubble.pensando .db-txt{color:#c9ba9c;font-style:italic}' +
      '.debate-bubble.conclusion{border-color:#ffdf73;background:rgba(30,20,4,.96);box-shadow:0 0 24px rgba(255,223,115,.45)}' +
      '.debate-bubble.conclusion .db-quien{color:#ffdf73}' +
      '.debate-bubble.centro{left:50%!important;transform:translateX(-50%);top:24%!important;bottom:auto!important;width:clamp(260px,42%,560px)}' +
      '.debate-bubble.centro.on{transform:translateX(-50%)}.debate-bubble.centro::after{display:none}' +
      'body.debate-on #speech-bubble,body.debate-on .speech-bubble.grokbot-bubble{display:none!important}' +
      '.np.debate-habla{outline:2px solid #ffdf73;outline-offset:2px;box-shadow:0 0 12px #ffdf73}' +
      '.ax-cli-out .debatir-linea{margin:2px 0;white-space:pre-wrap}.ax-cli-out .debatir-linea b{color:#daa520}';
    document.head.appendChild(s);
  }

  // ── Estado de un debate ───────────────────────────────────────────────────
  var actual = null;
  function T(st, es, en) { return st && st.lang === 'en' ? en : es; }
  function log(html) {
    var out = document.querySelector('.ax-cli-out');
    if (!out) return;
    var d = document.createElement('div'); d.className = 'debatir-linea'; d.innerHTML = html; out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }
  function escena() { return document.querySelector('.council-image'); }
  function generacion() { var e = escena(); return (e && e.getAttribute('data-generation')) === 'coetaneos' ? 'coetaneos' : 'leyendas'; }

  function montar(st) {
    estilos();
    var sc = escena(); if (!sc) throw new Error('sin escena del Consejo');
    var old = sc.querySelector('.debate-layer'); if (old) old.remove();
    var lay = document.createElement('div'); lay.className = 'debate-layer'; lay.setAttribute('aria-live', 'polite');
    lay.innerHTML = '<div class="debate-tema"><button type="button" class="debate-x" title="' + T(st, 'Parar debate', 'Stop debate') + '">×</button>' +
      '<div class="dt-cab"><span>🗣️ ' + T(st, 'Debate', 'Debate') + '</span>' +
      '<span class="dt-badge ' + st.nivel + '">' + (st.nivel === 'pago' ? T(st, 'PAGO', 'PAID') : T(st, 'GRATIS', 'FREE')) + '</span>' +
      (st.audio ? '<span class="dt-badge audio">🔊 ' + (st.nivel === 'pago' ? 'ElevenLabs' : T(st, 'voz', 'voice')) + '</span>' : '') +
      '<span class="dt-badge ronda">…</span><span class="dt-modelo" style="opacity:.75"></span><span class="dt-coste" style="opacity:.85"></span></div>' +
      '<div class="dt-txt"></div><div class="dt-ctx" hidden></div><div class="dt-nota" hidden></div></div>';
    lay.querySelector('.dt-txt').textContent = st.tema;
    lay.querySelector('.debate-x').addEventListener('click', function () { parar(); });
    sc.appendChild(lay);
    st.layer = lay;
    document.body.classList.add('debate-on'); // el bocadillo de bienvenida del Consejo no tapa el debate
  }
  function cab(st, sel, txt) { var n = st.layer && st.layer.querySelector(sel); if (n) { n.textContent = txt; n.hidden = !txt; } }
  function nota(st, txt) { var n = st.layer && st.layer.querySelector('.dt-nota'); if (!n) return; n.textContent = (n.textContent ? n.textContent + ' · ' : '') + txt; n.hidden = false; }
  function pintaCoste(st) {
    if (st.nivel !== 'pago') { cab(st, '.dt-coste', '0 €'); return; }
    cab(st, '.dt-coste', '≈ $' + st.coste.toFixed(3));
  }

  function bocadillo(st, persona, opts) {
    opts = opts || {};
    st.layer.querySelectorAll('.debate-bubble').forEach(function (b) { b.remove(); });
    document.querySelectorAll('.np.debate-habla').forEach(function (n) { n.classList.remove('debate-habla'); });
    var b = document.createElement('div');
    b.className = 'debate-bubble' + (opts.conclusion ? ' conclusion' : '');
    b.setAttribute('data-persona', persona);
    var nombre = NOMBRES[persona] || persona;
    b.innerHTML = '<div class="db-quien"><b></b><span></span></div><div class="db-txt"></div>';
    b.querySelector('b').textContent = nombre + (opts.conclusion ? T(st, ' · conclusión', ' · conclusion') : '');
    b.querySelector('span').textContent = opts.etiqueta || '';
    var a = ancla(st.gen, persona);
    if (!a) b.classList.add('centro');
    else {
      st.layer.appendChild(b);
      var W = st.layer.clientWidth || 1, bw = b.offsetWidth / W * 100;
      var left = Math.max(1, Math.min(99 - bw, a.x - bw / 2));
      b.style.left = left + '%';
      b.style.bottom = (100 - a.y + 2.5) + '%';
      b.style.setProperty('--tail', Math.max(8, Math.min(92, (a.x - left) / bw * 100)) + '%');
    }
    st.layer.appendChild(b);
    var np = document.querySelector('.np[data-persona="' + nombre + '"]'); if (np) np.classList.add('debate-habla');
    requestAnimationFrame(function () { b.classList.add('on'); });
    return b;
  }

  // Revela el texto: máquina de escribir (texto) o sincronizado con la voz (audio).
  function revelar(st, b, texto) {
    var el = b.querySelector('.db-txt'); b.classList.remove('pensando');
    return new Promise(function (res) {
      var i = 0, paso = Math.max(1, Math.round(texto.length / 120));
      (function tick() {
        if (st.parado) return res();
        i = Math.min(texto.length, i + paso); el.textContent = texto.slice(0, i);
        if (i >= texto.length) return res();
        st.timers.push(setTimeout(tick, 22));
      })();
    });
  }
  var vocesCache = null;
  function voces(lang) {
    var ss = root.speechSynthesis; if (!ss) return [];
    var v = ss.getVoices() || [];
    var pre = lang === 'en' ? 'en' : 'es';
    var f = v.filter(function (x) { return String(x.lang || '').toLowerCase().indexOf(pre) === 0; });
    return f.length ? f : v;
  }
  function vozNavegador(st, persona, texto, el) {
    return new Promise(function (res) {
      var ss = root.speechSynthesis;
      var fin = false, termina = function () { if (fin) return; fin = true; el.textContent = texto; res(); };
      var est = 1500 + texto.length * 65;
      if (!ss || typeof root.SpeechSynthesisUtterance !== 'function') { escribirPorTiempo(st, el, texto, est).then(termina); return; }
      var u = new root.SpeechSynthesisUtterance(texto);
      u.lang = st.lang === 'en' ? 'en-US' : 'es-ES';
      var lista = voces(st.lang), mesa = (st.todos ? TODOS : MESA)[st.gen].concat(['jobs']);
      if (lista.length) u.voice = lista[Math.max(0, mesa.indexOf(persona)) % lista.length];
      var tono = TONO[persona] || [1, 1]; u.pitch = tono[0]; u.rate = tono[1];
      var vistoLimite = false;
      u.onboundary = function (e) {
        vistoLimite = true;
        var j = e.charIndex + (e.charLength || (texto.slice(e.charIndex).match(/^\S*/) || [''])[0].length);
        el.textContent = texto.slice(0, Math.min(texto.length, j));
      };
      u.onend = termina; u.onerror = termina;
      // Sin eventos de palabra (algunas voces): escribe al ritmo estimado.
      st.timers.push(setTimeout(function () { if (!vistoLimite && !fin) escribirPorTiempo(st, el, texto, est); }, 900));
      st.timers.push(setTimeout(termina, est * 2 + 4000));
      ss.speak(u);
    });
  }
  function escribirPorTiempo(st, el, texto, ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function tick() {
        if (st.parado) return res();
        var k = Math.min(1, (Date.now() - t0) / ms); el.textContent = texto.slice(0, Math.ceil(texto.length * k));
        if (k >= 1) return res();
        st.timers.push(setTimeout(tick, 60));
      })();
    });
  }
  function vozEleven(st, persona, texto, el) {
    return fetch(API_VOZ, { method: 'POST', headers: cabecerasApi(), body: JSON.stringify({ persona: persona, texto: texto, lang: st.lang }) })
      .then(function (r) {
        if (r.status === 503) return r.json().then(function (d) { throw Object.assign(new Error('falta'), { falta: d && d.falta }); });
        if (!r.ok) throw new Error('voz ' + r.status);
        var c = parseFloat(r.headers.get('X-Debatir-Coste-Usd') || '0'); if (c > 0) { st.coste += c; pintaCoste(st); }
        return r.blob();
      })
      .then(function (blob) {
        return new Promise(function (res) {
          var url = URL.createObjectURL(blob), au = new Audio(url); st.audio = au;
          var fin = function () { el.textContent = texto; URL.revokeObjectURL(url); res(); };
          au.ontimeupdate = function () { if (au.duration) el.textContent = texto.slice(0, Math.ceil(texto.length * (au.currentTime / au.duration))); };
          au.onended = fin; au.onerror = fin;
          au.play().catch(fin);
        });
      });
  }
  function decir(st, persona, b, texto) {
    var el = b.querySelector('.db-txt'); b.classList.remove('pensando'); el.textContent = '';
    if (!st.audio) return revelar(st, b, texto);
    if (st.nivel === 'pago' && !st.sinEleven) {
      return vozEleven(st, persona, texto, el).catch(function (e) {
        st.sinEleven = true;
        nota(st, e && e.falta ? T(st, 'falta clave ElevenLabs · voz del navegador', 'ElevenLabs key missing · browser voice') : T(st, 'ElevenLabs no responde · voz del navegador', 'ElevenLabs not answering · browser voice'));
        log('⚠️ ' + (e && e.falta ? 'falta clave ElevenLabs (ELEVENLABS_API_KEY)' : 'ElevenLabs: ' + esc(e && e.message)));
        return vozNavegador(st, persona, texto, el);
      });
    }
    return vozNavegador(st, persona, texto, el);
  }

  function parar() {
    var st = actual; if (!st) return;
    st.parado = true; actual = null;
    st.timers.forEach(clearTimeout);
    try { st.ctrl.abort(); } catch (e) {}
    try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) {}
    try { if (st.audio && st.audio.pause) st.audio.pause(); } catch (e) {}
    document.querySelectorAll('.np.debate-habla').forEach(function (n) { n.classList.remove('debate-habla'); });
    if (st.layer) st.layer.remove();
    document.body.classList.remove('debate-on');
  }

  async function run(opts) {
    if (actual) parar();
    var st = {
      lang: opts.lang || 'es', nivel: opts.nivel === 'pago' ? 'pago' : 'gratis', audio: !!opts.audio, todos: !!opts.todos,
      rondas: Math.max(1, Math.min(4, opts.rondas || 2)), tema: String(opts.tema || '').trim(), gen: generacion(),
      historial: [], timers: [], coste: 0, parado: false, ctrl: new AbortController(), contexto: null
    };
    if (!st.tema) { log(T(st, '⚠️ Uso: /debatir [mejor] [audio] [rondas=N] [todos] &lt;tema o URL&gt;', '⚠️ Usage: /debate [better] [audio] [rounds=N] [all] &lt;topic or URL&gt;')); return null; }
    if (st.audio && root.speechSynthesis) { try { root.speechSynthesis.cancel(); root.speechSynthesis.getVoices(); } catch (e) {} }
    actual = st;
    montar(st); pintaCoste(st);
    var turnos = orden(st.gen, st.todos, st.rondas);
    log('<b>🗣️ ' + T(st, 'Debate', 'Debate') + '</b> · ' + (st.nivel === 'pago' ? T(st, 'PAGO (grok-4.6)', 'PAID (grok-4.6)') : T(st, 'GRATIS (Nemotron 3 Ultra)', 'FREE (Nemotron 3 Ultra)')) +
      (st.audio ? ' · 🔊' : '') + ' · ' + st.rondas + ' ' + T(st, 'rondas', 'rounds') + ' · ' + turnos.length / st.rondas + ' ' + T(st, 'consejeros', 'councillors') + ' · ' + esc(st.tema));
    try {
      var prep = await api({ accion: 'preparar', tema: st.tema, lang: st.lang }, st.ctrl.signal);
      if (st.parado) return null;
      if (!prep.ok) throw new Error(prep.error || 'HTTP ' + prep.status);
      if (prep.contexto) { st.contexto = prep.contexto; cab(st, '.dt-ctx', (prep.titulo ? prep.titulo + ' — ' : '') + prep.contexto); log('🔗 ' + esc(prep.titulo || prep.url) + ': ' + esc(prep.contexto)); }
      if (prep.aviso) { nota(st, prep.aviso); log('⚠️ ' + esc(prep.aviso)); }

      var pedir = function (i) {
        var t = turnos[i];
        var body = i < turnos.length
          ? { accion: 'turno', persona: t.persona, ronda: t.ronda, rondas: st.rondas, tema: st.tema, contexto: st.contexto, historial: st.historial, lang: st.lang, nivel: st.nivel }
          : { accion: 'conclusion', tema: st.tema, contexto: st.contexto, historial: st.historial, lang: st.lang, nivel: st.nivel };
        return api(body, st.ctrl.signal);
      };
      var siguiente = null;
      for (var i = 0; i <= turnos.length; i++) {
        if (st.parado) return null;
        var esFin = i === turnos.length, persona = esFin ? 'jobs' : turnos[i].persona;
        st.layer.querySelector('.dt-badge.ronda').textContent = esFin ? T(st, 'conclusión', 'conclusion') : T(st, 'ronda ', 'round ') + turnos[i].ronda + '/' + st.rondas;
        var b = bocadillo(st, persona, { conclusion: esFin, etiqueta: '' });
        b.classList.add('pensando'); b.querySelector('.db-txt').textContent = T(st, 'pensando…', 'thinking…');
        var d = await (siguiente || pedir(i)); siguiente = null;
        if (st.parado) return null;
        if (!d.ok) throw new Error(d.error || 'HTTP ' + d.status);
        if (d.coste_usd) { st.coste += d.coste_usd; }
        pintaCoste(st); cab(st, '.dt-modelo', String(d.etiqueta || d.modelo || '').replace(/^[^·]*·\s*/, ''));
        st.historial.push({ persona: persona, texto: d.texto });
        // Mientras este habla, el siguiente ya piensa (con lo que acaba de decir este).
        if (i < turnos.length) siguiente = pedir(i + 1);
        log('<b>' + esc(NOMBRES[persona]) + (esFin ? T(st, ' (conclusión)', ' (conclusion)') : '') + ':</b> ' + esc(d.texto));
        await decir(st, persona, b, d.texto);
        if (st.parado) return null;
        if (!esFin) await espera(st.audio ? 450 : Math.max(1800, d.texto.split(/\s+/).length * 230), st);
      }
      log('✓ ' + T(st, 'Debate cerrado', 'Debate closed') + (st.nivel === 'pago' ? ' · ≈ $' + st.coste.toFixed(3) : ' · 0 €') + ' · /debatir stop ' + T(st, 'lo quita de la escena', 'removes it from the scene'));
      st.terminado = true;
      return { historial: st.historial, coste_usd: st.coste, nivel: st.nivel };
    } catch (e) {
      if (st.parado) return null;
      var msg = String(e && e.message || e);
      log('⚠️ ' + T(st, 'El debate se ha cortado: ', 'The debate stopped: ') + esc(msg));
      nota(st, msg);
      return null;
    }
  }

  function ejecutar(text) {
    var o = parse(text);
    if (!o) return false;
    log('<span style="opacity:.7">› ' + esc(text) + '</span>');
    if (o.stop) { parar(); log('⏹ ' + (o.lang === 'en' ? 'Debate stopped' : 'Debate parado')); return true; }
    run(o);
    return true;
  }
  function esDemo(text) { return /^\/?demo\s+(debatir|debate|mesa)(\s+audio)?\s*$/i.exec(String(text || '').trim()); }

  function wire() {
    document.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest && e.target.closest('form');
      if (!form || (!form.classList.contains('ax-cli-form') && !form.classList.contains('ax-own-form'))) return;
      if (!dmzActiva()) return; // producción: no se toca la experiencia pública
      var input = form.querySelector('input, textarea'), text = input && input.value, dm = esDemo(text);
      if (!dm && !parse(text)) return;
      e.preventDefault(); e.stopPropagation();
      if (input) input.value = '';
      if (dm) {
        var en = dm[1].toLowerCase() === 'debate';
        log('<span style="opacity:.7">› ' + esc(text) + '</span>');
        log('<b>/demo ' + (en ? 'debate' : 'debatir') + '</b> · ' + (en ? 'debate table: each councillor in the current view speaks in turn, Jobs closes.' : 'mesa de debate: cada consejero de la vista habla por turnos y Jobs concluye.'));
        run({ lang: en ? 'en' : 'es', nivel: 'gratis', audio: !!dm[2], rondas: 2, tema: DEMO_TEMA[en ? 'en' : 'es'] });
      } else ejecutar(text);
    }, true);
  }

  root.AdmiraDebatir = { parse: parse, dmzActiva: dmzActiva, ancla: ancla, orden: orden, run: run, stop: parar, ejecutar: ejecutar, estado: function () { return actual; } };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  }
})(typeof window !== 'undefined' ? window : globalThis);
