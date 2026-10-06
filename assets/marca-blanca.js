// Marca blanca en www.admira.live (Consejo de Silicio) · port desde admira.tv (06-oct-2026),
// que a su vez viene de admira.store (FLT-101337). Mismo comportamiento y almacenamiento que
// las plataformas: catálogo único https://www.admiranext.com/marcablanca, ?marca=<id> manda y
// se recuerda en la pestaña (sessionStorage «mb:marca», la clave del cargador común) y
// ?marca=admira | /marca off la olvida. Viste la barra de madera (.top-bar): logo del cliente
// delante del logo Admira, «powered by admira.live», tokens --mb-*, título y favicon.
//
// Enganche: index.html lo carga con defer (sin marca activa no hay red a admiranext.com).
// Lo usan el ⌘ EXPERTO · CLI de la suite (admiranext.com/suite/experto.js → AdmiraMarca) y
// la línea de órdenes SCUMM (/marca en app.flt-100529.js).
//
// Plataforma del cargador común: «store» (el catálogo no tiene «live»; los tokens --mb-*
// bastan y assets/marca-blanca.css mapea al chrome SCUMM: .top-bar, rieles y sello).
(function (root) {
  'use strict';

  const BASE = 'https://www.admiranext.com/marcablanca/';
  const PLATAFORMA = 'store';
  const SESSION_KEY = 'mb:marca';        // la misma clave que usa el cargador común
  const MODE_KEY = 'mb:modo';
  const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
  const OFF = ['off', 'admira', 'ninguna', 'ninguno', 'none', 'default', 'apagar', 'quitar', 'reset'];
  const MODES = ['marca', 'nativo', 'claro', 'oscuro', 'auto'];
  const SEED = [
    {id: 'admira', nombre: 'Admira', ejemplo: false},
    {id: 'lumbre', nombre: 'Lumbre Café', ejemplo: true},
    {id: 'brumelle', nombre: 'BRUMELLE', ejemplo: true},
    {id: 'frescaria', nombre: 'Frescaria Supermercados', ejemplo: true},
  ];
  const TIMEOUT = 8000;

  const fold = value => String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const isOff = value => OFF.includes(fold(value).replace(/[^a-z]/g, ''));

  // ─── Qué marca toca en esta carga ───
  // ?marca=<id> manda y se recuerda en la pestaña (como el cargador común); ?marca=admira
  // (u off) la olvida; sin parámetro vale la recordada. Un id mal formado se ignora.
  function decide(search, storage) {
    let q = null;
    try { q = new URLSearchParams(search || '').get('marca'); } catch (_) {}
    let stored = null;
    try { stored = storage && storage.getItem(SESSION_KEY); } catch (_) {}
    if (q != null) {
      if (isOff(q) || !fold(q)) return {id: null, forget: true};
      const id = fold(q);
      if (ID_RE.test(id)) return {id, remember: true};
    }
    if (stored && ID_RE.test(stored) && !isOff(stored)) return {id: stored};
    return {id: null};
  }
  function decideMode(search, storage) {
    let q = null;
    try { q = new URLSearchParams(search || '').get('modo'); } catch (_) {}
    if (q && MODES.includes(q)) return q;
    try { const s = storage && storage.getItem(MODE_KEY); if (s && MODES.includes(s)) return s; } catch (_) {}
    return 'marca';
  }

  // ─── /marca <web>: algo que parezca un dominio o una URL http(s) ───
  function looksLikeUrl(value) {
    const v = String(value == null ? '' : value).trim();
    if (!v || /\s/.test(v)) return false;
    if (/^https?:\/\//i.test(v)) return true;
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(v);
  }
  function normalizeUrl(value) {
    if (!looksLikeUrl(value)) return null;
    let v = String(value).trim();
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
      const u = new URL(v);
      if (!/^https?:$/.test(u.protocol) || u.username || u.password || !/\./.test(u.hostname)) return null;
      return u.href;
    } catch (_) { return null; }
  }
  const analyzerUrl = url => BASE + '?web=' + encodeURIComponent(url);
  const brandUrl = id => BASE + 'api/marcas/' + encodeURIComponent(id);

  // Lo que el usuario escribe tras /marca: '' (estado), 'off', un id del catálogo o una web.
  function parseArg(value) {
    const raw = String(value == null ? '' : value).trim().replace(/^(?:marca|brand|id|web|url)\s*=\s*/i, '');
    if (!raw) return {kind: 'status'};
    if (isOff(raw)) return {kind: 'off'};
    const url = /[.:/]/.test(raw) ? normalizeUrl(raw) : null;
    if (url) return {kind: 'web', url};
    const id = fold(raw);
    if (ID_RE.test(id)) return {kind: 'id', id};
    return {kind: 'invalid', input: raw};
  }

  // ─── Contraste: textos de la barra, los paneles y los módulos siempre AA (≥ 4,5:1) ───
  function parseColor(value) {
    const s = String(value == null ? '' : value).trim().toLowerCase();
    let m = s.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      const n = i => parseInt(h.slice(i, i + 2), 16);
      return {r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1};
    }
    m = s.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) {
      const ch = x => (x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x));
      const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return {r: ch(m[1]), g: ch(m[2]), b: ch(m[3]), a: Math.max(0, Math.min(1, a))};
    }
    return null;
  }
  const over = (fg, bg) => ({r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1});
  function luminance(c) {
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }
  function contrast(a, b) {
    const ca = typeof a === 'string' ? parseColor(a) : a, cb = typeof b === 'string' ? parseColor(b) : b;
    if (!ca || !cb) return 0;
    const bg = cb.a < 1 ? over(cb, {r: 0, g: 0, b: 0, a: 1}) : cb;
    const fg = ca.a < 1 ? over(ca, bg) : ca;
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }
  // Primer candidato legible sobre todos los fondos; si ninguno lo es, negro o blanco.
  function pick(candidates, backgrounds, min = 4.5) {
    for (const c of candidates) {
      if (!parseColor(c)) continue;
      if (backgrounds.every(bg => contrast(c, bg) >= min)) return c;
    }
    const score = c => Math.min(...backgrounds.map(bg => contrast(c, bg)));
    return score('#000000') >= score('#ffffff') ? '#000000' : '#ffffff';
  }
  // Tokens --mbx-* que usa marca-blanca.css para los textos y rellenos de XpaceOS: barra,
  // paneles Opciones / Avanzado, consola Experto y las variables de cada página.
  function shellTokens(vars, modo) {
    const g = name => (vars && vars['--mb-' + name]) || '';
    const base = modo === 'claro' ? {r: 255, g: 255, b: 255, a: 1} : {r: 0, g: 0, b: 0, a: 1};
    const solid = (value, under) => { const c = parseColor(value); return c ? (c.a < 1 ? over(c, under) : c) : under; };
    const fondo = solid(g('fondo'), base);
    const sup = solid(g('superficie'), fondo);
    const alt = solid(g('superficie-alt'), sup);
    // Los textos van sobre el fondo, la superficie o la superficie alternativa de la marca.
    const bgs = [fondo, sup, alt];
    const ink = pick([g('texto')], bgs);
    const brand = pick([g('primario'), g('secundario'), g('texto')], bgs);
    const accent = pick([g('acento'), g('primario'), g('secundario'), g('texto')], bgs);
    const ok = pick([g('ok'), g('texto')], bgs);
    const solidOk = solid(g('ok'), sup);
    return {
      '--mbx-ink': ink,
      '--mbx-mut': pick([g('texto-suave'), g('texto')], bgs),
      '--mbx-brand': brand,
      '--mbx-accent': accent,
      '--mbx-ok': ok,
      '--mbx-error': pick([g('error'), g('texto')], bgs),
      '--mbx-warn': pick([g('aviso'), g('acento'), g('texto')], bgs),
      '--mbx-on-brand': pick([g('primario-texto'), g('secundario-texto'), '#ffffff', '#000000'], [solid(brand, sup)]),
      '--mbx-on-accent': pick([g('acento-texto'), g('primario-texto'), '#ffffff', '#000000'], [solid(accent, sup)]),
      '--mbx-on-ok': pick(['#000000', '#ffffff'], [solidOk]),
      '--mbx-ok-fill': g('ok') || ok,
      '--mbx-info': pick([g('info'), g('primario'), g('texto')], bgs),
    };
  }

  const api = {BASE, PLATAFORMA, SESSION_KEY, MODE_KEY, SEED, OFF, ID_RE, TIMEOUT, fold, isOff, decide, decideMode, looksLikeUrl, normalizeUrl, analyzerUrl, brandUrl, parseArg, parseColor, contrast, pick, shellTokens};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined' || root.AdmiraMarca) return;

  // ─── Navegador ───
  const doc = document, html = doc.documentElement;
  const script = doc.currentScript;
  // Los ajustes propios viajan con el mismo sello (?v=) que este fichero.
  const LOCAL_CSS = '/assets/marca-blanca.css?v=06.10.2026.r13';
  const session = (() => { try { return root.sessionStorage; } catch (_) { return null; } })();
  const store = {
    get: k => { try { return session && session.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { session && session.setItem(k, v); } catch (_) {} },
    del: k => { try { session && session.removeItem(k); } catch (_) {} },
  };
  const lang = () => (String(html.lang || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'es');
  const T = (es, en) => (lang() === 'en' ? en : es);

  let current = null;          // {id, nombre, modo, ejemplo, propuesta}
  let known = SEED.slice();
  let loaderPromise = null, cssPromise = null, catalogPromise = null;
  let snapshot = null;         // favicon y theme-color originales
  let titleObserver = null, chromeObserver = null, chromeQueued = false;

  function timeout(promise, ms, label) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(label + ': sin respuesta')), ms))]);
  }
  const getJson = url => fetch(url, {credentials: 'omit'}).then(r => {
    if (!r.ok) throw Object.assign(new Error(String(r.status)), {status: r.status});
    return r.json();
  });

  // 1 · ¿Existe la marca? La API del catálogo único (CORS *) responde 404 si no. Si la API
  // no responde se prueba el JSON estático de respaldo, como hace el cargador común.
  function comprobar(id) {
    return timeout(getJson(brandUrl(id)), TIMEOUT, 'api/marcas')
      .catch(error => {
        if (error && error.status === 404) throw Object.assign(new Error('unknown'), {reason: 'unknown'});
        return timeout(getJson(BASE + 'clientes/' + id + '.json'), TIMEOUT, 'clientes')
          .catch(e => { throw Object.assign(new Error('network'), {reason: e && e.status === 404 ? 'unknown' : 'network'}); });
      })
      .then(m => {
        if (!m || typeof m !== 'object' || (m.id && m.id !== id)) throw Object.assign(new Error('unknown'), {reason: 'unknown'});
        return m;
      });
  }

  // 2 · Solo con la marca comprobada: estilos (común + propios) y el cargador común.
  function addLink(href) {
    return new Promise((resolve, reject) => {
      const link = doc.createElement('link');
      link.rel = 'stylesheet'; link.href = href; link.setAttribute('data-admira-marca', '');
      link.onload = () => resolve(link);
      link.onerror = () => { link.remove(); reject(new Error('no se pudo cargar ' + href)); };
      doc.head.append(link);
    });
  }
  // Si el puente común no llega, los ajustes locales bastan: llevan su propio puente store.
  function loadCss() {
    if (!cssPromise) {
      cssPromise = Promise.all([
        timeout(addLink(BASE + 'marcablanca.css'), TIMEOUT, 'marcablanca.css').catch(() => null),
        timeout(addLink(LOCAL_CSS), TIMEOUT, 'marca-blanca.css'),
      ]);
      cssPromise.catch(() => { cssPromise = null; });
    }
    return cssPromise;
  }
  function loadLoader(modo) {
    if (root.MarcaBlanca && root.MarcaBlanca.version) return Promise.resolve(root.MarcaBlanca);
    if (!loaderPromise) {
      loaderPromise = timeout(new Promise((resolve, reject) => {
        const s = doc.createElement('script');
        s.src = BASE + 'marcablanca.js';
        s.async = true;
        s.setAttribute('data-mb-plataforma', PLATAFORMA);
        s.setAttribute('data-mb-modo', modo || 'marca');
        s.setAttribute('data-mb-auto', 'false');   // la aplica XpaceOS cuando ha comprobado el catálogo
        s.setAttribute('data-admira-marca', '');
        s.onload = () => (root.MarcaBlanca ? resolve(root.MarcaBlanca) : reject(new Error('marcablanca.js sin MarcaBlanca')));
        s.onerror = () => { s.remove(); reject(new Error('no se pudo cargar marcablanca.js')); };
        doc.head.append(s);
      }), TIMEOUT, 'marcablanca.js');
      loaderPromise.catch(() => { loaderPromise = null; });
    }
    return loaderPromise;
  }
  function removeCss() {
    for (const link of doc.querySelectorAll('link[data-admira-marca]')) link.remove();
    cssPromise = null;
  }

  // Catálogo: solo se pide si hay marca o si se usa /marca (nunca en una visita normal).
  function listar() {
    if (!catalogPromise) {
      catalogPromise = timeout(getJson(BASE + 'api/marcas').catch(() => getJson(BASE + 'clientes/index.json')), TIMEOUT, 'catálogo')
        .then(index => {
          const list = (index && Array.isArray(index.clientes) ? index.clientes : [])
            .filter(c => c && ID_RE.test(c.id || ''))
            .map(c => ({id: c.id, nombre: String(c.nombre || c.id), ejemplo: !!c.ejemplo || !!(c.catalogo && c.catalogo.tipo === 'ejemplo'), propuesta: !!(c.catalogo && c.catalogo.propuesta)}));
          if (!list.length) throw new Error('catálogo vacío');
          known = list;
          doc.dispatchEvent(new CustomEvent('admira:marcas', {detail: {marcas: list}}));
          return list;
        });
      catalogPromise.catch(() => { catalogPromise = null; });
    }
    return catalogPromise;
  }

  // ─── Lo que admira.live añade a la marca: logo en la barra, «Volver a Admira», título ───
  // En la barra de madera (.top-bar) el logo del cliente va delante del logo Admira, que
  // queda atenuado como «powered by»; sin barra, detrás del icono de Opciones.
  function barAnchor() {
    // Home del Consejo: barra de madera; el logo del cliente va delante del logo Admira.
    const live = doc.querySelector('.top-bar > a.brand-logo');
    if (live) return {before: live};
    // Subpáginas con la barra común (admira-bar.js)
    const bar = doc.querySelector('.admira-bar a.brand-logo, #admira-bar a.brand-logo, .ab-brand');
    if (bar) return {before: bar};
    const opts = doc.querySelector('.top-bar #pf-ic-opcion');
    return opts ? {after: opts} : null;
  }
  function slotInPlace(slot, at) {
    if (!slot || !at) return false;
    if (at.before) return slot.nextElementSibling === at.before;
    const next = slot.nextElementSibling;
    return slot.previousElementSibling === at.after && !!next && next.classList.contains('mb-powered');
  }
  function logoSlot(create) {
    let slot = doc.getElementById('mb-bar-logo');
    if (!create) return slot;
    const at = barAnchor();
    if (!at) return slot;
    if (slotInPlace(slot, at)) return slot;
    if (!slot) {
      slot = doc.createElement('a');
      slot.id = 'mb-bar-logo';
      slot.className = 'mb-bar-logo mb-logo';
      slot.setAttribute('data-mb-logo', '');
    }
    // En las páginas, el logo lleva al inicio como la marca XpaceOS; en el gemelo no saca
    // de la escena (sin href: es solo la identidad del cliente).
    if (at.before) { slot.href = at.before.getAttribute('href') || '/'; slot.removeAttribute('role'); }
    else { slot.removeAttribute('href'); slot.setAttribute('role', 'img'); }
    if (at.before) at.before.parentNode.insertBefore(slot, at.before);
    else {
      at.after.after(slot);
      let powered = doc.getElementById('mb-powered');
      if (!powered) {
        powered = doc.createElement('span');
        powered.id = 'mb-powered';
        powered.className = 'mb-powered';
        powered.textContent = 'admira.live';
      }
      slot.after(powered);
    }
    return slot;
  }
  function backButton(create) {
    let b = doc.getElementById('mb-volver');
    if (b || !create) return b;
    const rail = doc.querySelector('#rail-opcion .rail-body, #xsOptions, nav.quad-menu.quad-left');
    if (!rail) return null;
    b = doc.createElement('button');
    b.type = 'button';
    b.id = 'mb-volver';
    b.className = 'mb-volver';
    b.textContent = T('Volver a Admira', 'Back to Admira');
    b.addEventListener('click', () => { desactivar(); const t = doc.getElementById('pfOptions'); if (t) t.focus(); });
    // Arriba del todo, bajo el título «Opciones»: a la vista sin desplazar el panel.
    const hd = rail.querySelector(':scope > .qm-title, :scope > .rail-group');
    rail.insertBefore(b, hd ? hd.nextSibling : rail.firstChild);
    return b;
  }
  function paintSlot() {
    const slot = logoSlot(true);
    if (!slot || !current) return;
    slot.hidden = false;
    slot.setAttribute('aria-label', current.nombre + (slot.hasAttribute('href') ? T(' · volver al inicio', ' · back to home') : ''));
    slot.title = current.nombre + (current.propuesta
      ? T(' · propuesta generada automáticamente, no es la marca oficial', ' · automatically generated proposal, not the official brand')
      : current.ejemplo ? T(' · marca ficticia de ejemplo', ' · fictional sample brand') : '');
    slot.toggleAttribute('data-mb-propuesta', current.propuesta);
    if (!slot.firstChild) {
      // El cargador pinta los [data-mb-logo] al aplicar; si la barra llega después, el logo se copia.
      const m = root.MarcaBlanca && root.MarcaBlanca.actual && root.MarcaBlanca.actual.marca;
      const logo = m && m.logo;
      if (logo && logo.imagen && !logo.svg) {
        const img = doc.createElement('img');
        img.src = logo.imagen; img.alt = logo.alt || current.nombre; img.className = 'mb-logo-img'; img.decoding = 'async';
        slot.append(img);
      } else if (logo && logo.svg && root.MarcaBlanca.aplicar) {
        slot.textContent = current.nombre;
        root.MarcaBlanca.aplicar(current.id, {objetivo: slot, plataforma: PLATAFORMA, modo: current.modo, favicon: false}).catch(() => {});
      } else slot.textContent = current.nombre;   // marca sin logo
    }
  }
  // ¿Falta algo? (la barra o el panel de Opciones existen, pero sin el logo o sin el botón)
  function chromeMissing() {
    const at = barAnchor();
    if (at && !slotInPlace(doc.getElementById('mb-bar-logo'), at)) return true;
    return !!doc.querySelector('#xsOptions, nav.quad-menu.quad-left') && !doc.getElementById('mb-volver');
  }
  function ensureChrome() {
    chromeQueued = false;
    if (!current) return;
    paintSlot();
    backButton(true);
  }
  function watchChrome() {
    if (chromeObserver || typeof MutationObserver === 'undefined' || !doc.body) return;
    chromeObserver = new MutationObserver(() => {
      if (chromeQueued || !current || !chromeMissing()) return;
      chromeQueued = true;
      (root.requestAnimationFrame || setTimeout)(ensureChrome);
    });
    chromeObserver.observe(doc.body, {childList: true, subtree: true});
  }
  function unwatchChrome() { if (chromeObserver) { chromeObserver.disconnect(); chromeObserver = null; } }

  function takeSnapshot() {
    if (snapshot) return;
    const theme = doc.querySelector('meta[name="theme-color"]');
    snapshot = {
      icons: [...doc.querySelectorAll('link[rel~="icon"]:not([data-mb-favicon])')].map(l => l.cloneNode(true)),
      theme: theme ? theme.getAttribute('content') : null,
    };
  }
  function restoreSnapshot() {
    if (!snapshot) return;
    for (const l of doc.querySelectorAll('link[data-mb-favicon]')) l.remove();
    // Cada icono vuelve tal cual (mismo rel y href: «icon» y «shortcut icon» pueden compartir href).
    for (const icon of snapshot.icons) {
      const sel = `link[rel="${CSS.escape(icon.getAttribute('rel') || '')}"][href="${CSS.escape(icon.getAttribute('href') || '')}"]`;
      if (!doc.querySelector(sel)) doc.head.append(icon.cloneNode(true));
    }
    const theme = doc.querySelector('meta[name="theme-color"]');
    if (snapshot.theme == null) { if (theme) theme.remove(); } else if (theme) theme.setAttribute('content', snapshot.theme);
    snapshot = null;
  }
  // Título de la pestaña: «Nombre del cliente · título de la página».
  let lastPrefix = '';
  const prefix = () => (current ? current.nombre + ' · ' : '');
  function paintTitle() {
    if (!current) return;
    let base = doc.title;
    if (lastPrefix && base.startsWith(lastPrefix)) base = base.slice(lastPrefix.length);
    lastPrefix = prefix();
    if (doc.title !== lastPrefix + base) doc.title = lastPrefix + base;
    if (!titleObserver) {
      titleObserver = new MutationObserver(() => { if (current && !doc.title.startsWith(prefix())) paintTitle(); });
      titleObserver.observe(doc.head, {subtree: true, childList: true, characterData: true});
    }
  }
  function restoreTitle() {
    if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
    if (lastPrefix && doc.title.startsWith(lastPrefix)) doc.title = doc.title.slice(lastPrefix.length);
    lastPrefix = '';
  }

  function clearRoot() {
    for (let i = html.style.length - 1; i >= 0; i--) {
      const prop = html.style[i];
      if (prop.startsWith('--mb-') || prop.startsWith('--mbx-')) html.style.removeProperty(prop);
    }
    html.style.removeProperty('color-scheme');
    for (const a of ['data-mb-marca', 'data-mb-modo', 'data-mb-plataforma', 'data-mb-ejemplo']) html.removeAttribute(a);
  }

  /**
   * Activa una marca del catálogo. Comprueba primero que existe; si no existe o
   * admiranext.com no responde, no aplica nada. → Promise<{ok, id, nombre} | {ok:false, reason}>
   */
  function activar(id, opts = {}) {
    id = fold(id);
    if (isOff(id)) return Promise.resolve(Object.assign({ok: true, off: true}, desactivar()));
    if (!ID_RE.test(id)) return Promise.resolve({ok: false, reason: 'invalid', id});
    const modo = opts.modo || decideMode(location.search, session);
    const previous = current;
    return comprobar(id)
      // Existe: se recuerda ya en la pestaña (como el cargador común), aunque se navegue antes de pintarla.
      .then(m => { store.set(SESSION_KEY, id); return m; })
      .then(m => Promise.all([loadLoader(modo), loadCss()]).then(([MB]) => ({MB, m}),
        () => { throw Object.assign(new Error('network'), {reason: 'network'}); }))
      .then(({MB, m}) => {
        takeSnapshot();
        const slot = logoSlot(true);
        if (slot && !previous) slot.hidden = true;
        else if (slot) slot.replaceChildren();
        return MB.aplicar(id, {plataforma: PLATAFORMA, modo}).then(detail => ({detail, m}));
      })
      .then(({detail, m}) => {
        const marca = detail.marca || m;
        const nombre = String(marca.nombre || id);
        const catalogo = marca.catalogo || m.catalogo || {};
        const tokens = shellTokens(detail.variables, detail.modo);
        for (const [k, v] of Object.entries(tokens)) html.style.setProperty(k, v);
        // Una propuesta automática (analizada desde la web del cliente) nunca se presenta como la marca oficial.
        const propuesta = !!catalogo.propuesta;
        current = {id: detail.id || id, nombre, modo: detail.modo, ejemplo: !!marca.ejemplo, propuesta,
          aviso: propuesta ? String(catalogo.aviso || '') : ''};
        store.set(SESSION_KEY, current.id);
        if (opts.modo || new URLSearchParams(location.search).get('modo')) store.set(MODE_KEY, modo);
        ensureChrome();
        watchChrome();
        paintTitle();
        if (!known.some(k => k.id === current.id)) known = [...known, {id: current.id, nombre, ejemplo: current.ejemplo, propuesta: current.propuesta}];
        doc.dispatchEvent(new CustomEvent('admira:marca', {detail: Object.assign({}, current)}));
        return Object.assign({ok: true}, current);
      })
      .catch(error => {
        // Nada a medias: sin marca previa se deja XpaceOS como estaba.
        if (!previous || !current) { cleanup(); current = null; }
        const reason = (error && error.reason) || 'network';
        if (reason === 'unknown' && store.get(SESSION_KEY) === id) store.del(SESSION_KEY);
        return {ok: false, reason, id};
      });
  }

  function cleanup() {
    unwatchChrome();
    clearRoot();
    const slot = logoSlot(false); if (slot) slot.remove();
    const powered = doc.getElementById('mb-powered'); if (powered) powered.remove();
    const b = backButton(false); if (b) b.remove();
    restoreTitle();
    restoreSnapshot();
    removeCss();
  }

  /** Vuelve a Admira (XpaceOS), sin recargar. */
  function desactivar() {
    const was = current;
    store.del(SESSION_KEY);
    store.del(MODE_KEY);
    try {
      const url = new URL(location.href);
      if (url.searchParams.has('marca') || url.searchParams.has('modo')) {
        url.searchParams.delete('marca'); url.searchParams.delete('modo');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      }
    } catch (_) {}
    current = null;
    cleanup();
    if (was) doc.dispatchEvent(new CustomEvent('admira:marca', {detail: null}));
    return {ok: true, changed: !!was, previous: was};
  }

  /** /marca <web>: abre el analizador de admiranext.com en otra pestaña (allí se analiza y se guarda). */
  function analizar(value) {
    const url = normalizeUrl(value);
    if (!url) return {ok: false, reason: 'invalid'};
    const href = analyzerUrl(url);
    // Con noopener el navegador devuelve null aunque abra la pestaña: el CLI enseña el enlace igualmente.
    try { root.open(href, '_blank', 'noopener'); } catch (_) {}
    return {ok: true, href, url};
  }

  root.AdmiraMarca = Object.freeze(Object.assign({}, api, {
    actual: () => (current ? Object.assign({}, current) : null),
    conocidas: () => known.slice(),
    listar, activar, desactivar, analizar,
  }));

  // Arranque: solo si esta pestaña tiene marca.
  const decision = decide(location.search, session);
  if (decision.forget) { store.del(SESSION_KEY); store.del(MODE_KEY); }
  if (decision.id) {
    activar(decision.id).then(r => {
      if (!r.ok) {
        if (root.console) console.warn('marca blanca: no se aplicó «' + decision.id + '» (' + r.reason + ')');
        doc.dispatchEvent(new CustomEvent('admira:marca-error', {detail: r}));
      }
      if (r.ok) listar().catch(() => {});
    });
  }
})(typeof window === 'undefined' ? globalThis : window);
