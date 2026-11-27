// Parser/dispatcher del diálogo Ejecutar de admira.live/windows95
// (Modo Experto) y lluvia Matrix fiel a admira.studio/matrix-rain.js.
// También se carga desde windows95/index.html (window.Win95Experto).

export const MATRIX_GLYPHS =
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFｦﾞﾟ｡･ｰ';
export const MATRIX_FONT_SIZE = 16;
export const MATRIX_FONT = '16px "JetBrains Mono", ui-monospace, monospace';
/** Cabeza de la gota: color real de admira.studio/matrix-rain.js */
export const MATRIX_HEAD = '#e8ffe8';
/** Estela verde fósforo (admira.studio) */
export const MATRIX_TRAIL = '#00ff41';
export const MATRIX_TRAIL_DIM = '#00c837';
/** Negro abisal: el fade de studio es rgba(2, 6, 2, 0.07); el brief pide #020604, casi idéntico. */
export const MATRIX_BG = '#020604';
export const MATRIX_FADE = 'rgba(2, 6, 2, 0.07)';
export const MATRIX_SHADOW = '#00ff41';

export const DEFAULT_MATRIX_TITLES = [
  'ADMIRA', 'AdmiraNeXT', 'WIN95', 'MATRIX', 'NEO', 'TRINITY',
  'MORFEO', 'ORACULO', 'LUCAS', 'admira.studio', 'admira.live'
];

export const HELP_TEXT = [
  'Modo Experto de Admira 95 · comandos (con o sin /)',
  '',
  'ENTORNO',
  '  matrix                         — escritorio hipermoderno con lluvia Matrix',
  '  win95 · clasico · normal       — vuelve al Win95 clásico',
  '  matrix off                     — apaga el entorno Matrix',
  '',
  'DEMO Y AYUDA',
  '  demo                           — demostración del ratón fantasma',
  '  ayuda · help · ?               — esta lista',
  '  ayuda pagina                   — abre /help/',
  '',
  'PANTALLA (alternan ON/OFF)',
  '  monitor                        — marco CRT del monitor',
  '  computer                       — apaga o enciende el equipo',
  '  extended                       — escritorio a todo el viewport',
  '  entrelazado                    — líneas de scan CRT',
  '',
  'PROGRAMAS DE WIN95',
  '  winamp · napster · netscape · cli · cmd',
  '  icqgram · notepad · media · bandeja',
  '  mi pc · misiones · miscelanea · papelera',
  '',
  'ADMIRA.LIVE (abre la vista en Netscape, sin salir del escritorio)',
  '  consumos · control · mesa · lanzadera',
  '  mcp · comandos · highscore · diario',
  '  tareas · interface · version',
].join('\n');

export function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '');
}

export function normalizeCommand(raw) {
  let s = stripAccents(String(raw || '')).trim().toLowerCase();
  s = s.replace(/\.exe$/i, '');
  s = s.replace(/^\/+/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

const APPS = {
  winamp: 'amp',
  amp: 'amp',
  player: 'amp',
  admiramp: 'amp',
  'admira media player': 'media',
  notepad: 'readme',
  leeme: 'readme',
  bloc: 'readme',
  'bloc de notas': 'readme',
  napster: 'p2p',
  p2p: 'p2p',
  netscape: 'browser',
  navigator: 'browser',
  browser: 'browser',
  admirascape: 'browser',
  icq: 'chat',
  icqgram: 'chat',
  chat: 'chat',
  media: 'media',
  'media player': 'media',
  inbox: 'inbox',
  bandeja: 'inbox',
  'bandeja de entrada': 'inbox',
  correo: 'inbox',
  mail: 'inbox',
  mypc: 'mypc',
  'mi pc': 'mypc',
  explorador: 'mypc',
  papelera: 'trash',
  trash: 'trash',
  reciclaje: 'trash',
  'papelera de reciclaje': 'trash',
  protector: 'ssaver',
  screensaver: 'ssaver',
  ssaver: 'ssaver',
  'protector de pantalla': 'ssaver',
};

const ROUTES = {
  consumos: '/consumos',
  velocidad: '/consumos',
  speed: '/consumos',
  control: '/control/',
  equipos: '/control/',
  fleetcontrol: '/control/',
  mesa: '/',
  consejo: '/',
  home: '/',
  lanzadera: '/lanzadera/',
  mcp: '/mcp/',
  comandos: '/comandos',
  commands: '/comandos',
  highscore: '/highscore',
  marcador: '/highscore',
  flota: '/highscore',
  fleet: '/highscore',
  scoreboard: '/highscore',
  diario: '/diario',
  journal: '/diario',
  tareas: '/tareas',
  tasks: '/tareas',
  agentes: '/tareas',
  agents: '/tareas',
  interface: '/interface/',
  interfaz: '/interface/',
  version: '/version.json',
  estado: '/status/',
};

const CLASSIC = new Set([
  'win95', 'clasico', 'classic', 'normal', 'matrix off',
  'tema clasico', 'tema win95', 'tema normal', 'matrix off',
  'matrix 0', 'matrix no', 'matrix off',
]);

export function wantsMatrixFromUrl(search) {
  const q = String(search || '');
  const params = new URLSearchParams(q.startsWith('?') || q.length === 0 ? q : '?' + q);
  const tema = String(params.get('tema') || params.get('theme') || '').toLowerCase();
  const m = String(params.get('matrix') || '').toLowerCase();
  return tema === 'matrix' || m === '1' || m === 'true' || m === 'on';
}

export function syncMatrixUrl(on, loc) {
  if (!loc || !loc.href || !loc.history || typeof loc.history.replaceState !== 'function') return;
  const u = new URL(loc.href);
  const sp = u.searchParams;
  if (on) {
    if (!wantsMatrixFromUrl(u.search)) sp.set('tema', 'matrix');
  } else {
    if (String(sp.get('tema') || '').toLowerCase() === 'matrix') sp.delete('tema');
    if (String(sp.get('theme') || '').toLowerCase() === 'matrix') sp.delete('theme');
    const mv = String(sp.get('matrix') || '').toLowerCase();
    if (mv === '1' || mv === 'true' || mv === 'on') sp.delete('matrix');
  }
  const next = u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash;
  const cur = (loc.pathname || u.pathname) + (loc.search || '') + (loc.hash || '');
  if (next !== cur) loc.history.replaceState({}, '', next);
}

export const CRT_FEATURES = ['monitor', 'computer', 'extended', 'entrelazado'];
export const CRT_LABELS = {
  monitor: 'Monitor',
  computer: 'Computer',
  extended: 'Extended',
  entrelazado: 'Entrelazado',
};

export function parseCrtCommand(cmd, original) {
  const parts = String(cmd || '').split(' ').filter(Boolean);
  if (!parts.length) return null;
  if (CRT_FEATURES.indexOf(parts[0]) < 0) return null;
  if (parts.length > 2) return null;
  let mode = 'toggle';
  if (parts.length === 2) {
    const arg = parts[1];
    if (arg === 'on' || arg === '1' || arg === 'si' || arg === 'yes') mode = 'on';
    else if (arg === 'off' || arg === '0' || arg === 'no') mode = 'off';
    else return null;
  }
  return {
    ok: true,
    action: 'crt',
    feature: parts[0],
    mode: mode,
    raw: original,
    canonical: parts[0] + (mode === 'toggle' ? '' : ' ' + mode),
  };
}

export function applyCrtCommand(parsed, api) {
  if (!parsed || parsed.action !== 'crt' || !api || typeof api.isOn !== 'function' || typeof api.set !== 'function') {
    return { ok: false, message: 'Comando no disponible.' };
  }
  const feature = parsed.feature;
  const current = !!api.isOn(feature);
  let next = current;
  if (parsed.mode === 'on') next = true;
  else if (parsed.mode === 'off') next = false;
  else next = !current;
  api.set(feature, next);
  const label = CRT_LABELS[feature] || feature;
  return {
    ok: true,
    feature: feature,
    on: next,
    message: label + ': ' + (next ? 'ON' : 'OFF'),
  };
}

export function parseRunCommand(raw) {
  const original = String(raw || '');
  const cmd = normalizeCommand(raw);
  if (!cmd) {
    return {
      ok: false,
      action: 'unknown',
      raw: original,
      message: 'Escriba un comando. Pruebe con «ayuda».',
      suggest: 'ayuda',
    };
  }
  if (cmd === 'matrix' || cmd === 'matriz' || cmd === 'matrix on' || cmd === 'tema matrix') {
    return { ok: true, action: 'matrix', raw: original, canonical: 'matrix' };
  }
  if (CLASSIC.has(cmd)) {
    return { ok: true, action: 'classic', raw: original, canonical: 'win95' };
  }
  if (cmd === 'ayuda' || cmd === 'help' || cmd === '?' || cmd === 'help?' || cmd === 'ayuda?') {
    return { ok: true, action: 'help', raw: original, text: HELP_TEXT };
  }
  if (cmd === 'help pagina' || cmd === 'ayuda pagina' || cmd === 'help page' || cmd === 'ayuda page') {
    return { ok: true, action: 'open', url: '/help/', title: 'Ayuda', raw: original };
  }
  const crt = parseCrtCommand(cmd, original);
  if (crt) return crt;
  if (cmd === 'demo' || cmd === 'demostracion') {
    return { ok: true, action: 'demo', raw: original, canonical: 'demo' };
  }
  if (cmd === 'cli' || cmd === 'deepagents' || cmd === 'command' || cmd === 'cmd' || cmd === 'terminal') {
    return { ok: true, action: 'cli', raw: original, canonical: 'cli' };
  }
  if (cmd === 'misiones' || cmd === 'mision') {
    return { ok: true, action: 'folder', folder: 'misiones', id: 'fld-misiones', raw: original };
  }
  if (cmd === 'miscelanea' || cmd === 'misc') {
    return { ok: true, action: 'folder', folder: 'miscelanea', id: 'fld-misc', raw: original };
  }
  if (APPS[cmd]) {
    return { ok: true, action: 'app', app: APPS[cmd], raw: original };
  }
  if (ROUTES[cmd]) {
    return { ok: true, action: 'open', url: ROUTES[cmd], title: cmd, raw: original };
  }
  return {
    ok: false,
    action: 'unknown',
    raw: original,
    message: 'No se encuentra «' + original.trim() + '».\nPruebe con «ayuda» para ver los comandos.',
    suggest: 'ayuda',
  };
}

function reducedMotion(opts) {
  try {
    const mm = opts && opts.matchMedia
      ? opts.matchMedia
      : (typeof window !== 'undefined' && window.matchMedia);
    return !!(mm && mm('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

/**
 * Lluvia de caracteres fiel a admira.studio/matrix-rain.js:
 * charset half-width katakana + A-F + dígitos, cabeza #e8ffe8,
 * estela #00ff41 / #00c837, fade rgba(2,6,2,0.07), JetBrains Mono 16px,
 * gotas a velocidad variable y más densas en los laterales, con
 * «writers» ocasionales si hay titles. start/stop/destroy limpios.
 */
export function createMatrixRain(canvas, options) {
  const opts = options || {};
  const getCtx = function () {
    if (opts.ctx) return opts.ctx;
    if (canvas && typeof canvas.getContext === 'function') {
      return canvas.getContext('2d', { alpha: true });
    }
    return null;
  };
  let ctx = getCtx();
  let width = 0, height = 0, sideWidth = 120, columns = 0;
  let drops = [], speeds = [], writers = [];
  let raf = 0, running = false, destroyed = false;
  let resizeHandler = null;
  const rafFn = opts.requestAnimationFrame || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
  const cafFn = opts.cancelAnimationFrame || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
  const titles = function () {
    if (typeof opts.titles === 'function') return opts.titles();
    if (Array.isArray(opts.titles) && opts.titles.length) return opts.titles;
    if (typeof window !== 'undefined' && Array.isArray(window.MATRIX_TITLES_FEED) && window.MATRIX_TITLES_FEED.length) {
      return window.MATRIX_TITLES_FEED;
    }
    return DEFAULT_MATRIX_TITLES;
  };

  function pickTitle() {
    const pool = titles();
    if (!pool || !pool.length) return null;
    let s = String(pool[Math.floor(Math.random() * pool.length)] || '').slice(0, 60).trim();
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
    return s || null;
  }
  function randomGlyph() {
    return MATRIX_GLYPHS.charAt(Math.floor(Math.random() * MATRIX_GLYPHS.length));
  }
  function glyphFor(col) {
    if (!writers[col] && Math.random() < 0.010) {
      const t = pickTitle();
      if (t) writers[col] = { title: t, pos: 0 };
    }
    const w = writers[col];
    if (w) {
      let ch = w.title.charAt(w.pos);
      w.pos += 1;
      if (w.pos >= w.title.length) writers[col] = null;
      if (!ch || !ch.trim()) ch = randomGlyph();
      return ch;
    }
    return randomGlyph();
  }
  function measure() {
    if (typeof opts.getSize === 'function') return opts.getSize();
    const parent = canvas && canvas.parentElement;
    if (parent && (parent.clientWidth || parent.clientHeight)) {
      return { w: parent.clientWidth || 640, h: parent.clientHeight || 480 };
    }
    if (typeof window !== 'undefined') {
      return { w: window.innerWidth || 640, h: window.innerHeight || 480 };
    }
    return { w: 640, h: 480 };
  }
  function resize() {
    if (destroyed || !canvas) return;
    ctx = getCtx();
    const size = measure();
    width = Math.max(1, size.w || 0);
    height = Math.max(1, size.h || 0);
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    if (canvas.style) {
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
    }
    if (ctx && typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sideWidth = Math.min(190, Math.max(72, Math.round(width * 0.115)));
    columns = Math.ceil(width / MATRIX_FONT_SIZE);
    drops = new Array(columns).fill(0).map(() => Math.random() * -height / MATRIX_FONT_SIZE);
    speeds = new Array(columns).fill(0).map(() => 0.4 + Math.random() * 0.9);
    writers = new Array(columns).fill(null);
    if (ctx) {
      ctx.fillStyle = MATRIX_BG;
      ctx.fillRect(0, 0, width, height);
    }
  }
  function sidePower(x) {
    const left = x < sideWidth ? 1 - x / sideWidth : 0;
    const right = x > width - sideWidth ? 1 - (width - x) / sideWidth : 0;
    return Math.max(0, left, right);
  }
  function paintFrame(animate) {
    if (!ctx) return;
    if (animate) {
      ctx.fillStyle = MATRIX_FADE;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = MATRIX_BG;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.font = MATRIX_FONT;
    ctx.textBaseline = 'top';
    for (let i = 0; i < columns; i++) {
      const x = i * MATRIX_FONT_SIZE;
      const y = drops[i] * MATRIX_FONT_SIZE;
      const ch = glyphFor(i);
      const head = drops[i] > 1 && Math.random() > 0.965;
      const side = sidePower(x);
      ctx.globalAlpha = side ? 0.52 + side * 0.45 : 0.30;
      if (head) {
        ctx.fillStyle = MATRIX_HEAD;
        ctx.shadowColor = MATRIX_SHADOW;
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = side ? MATRIX_TRAIL : MATRIX_TRAIL_DIM;
        ctx.shadowColor = MATRIX_SHADOW;
        ctx.shadowBlur = side * 8;
      }
      ctx.fillText(ch, x, y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      if (animate) {
        if (y > height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += speeds[i] + side * 0.22;
      }
    }
  }
  function loop() {
    if (!running || destroyed) return;
    paintFrame(true);
    if (rafFn) raf = rafFn(loop);
  }
  function clear() {
    if (ctx) {
      ctx.setTransform && ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width || width, canvas.height || height);
    }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  function start() {
    if (destroyed || running) return;
    if (!canvas) return;
    running = true;
    resize();
    if (reducedMotion(opts)) {
      // Una sola pintura estática: no hay bucle de animación.
      for (let k = 0; k < 18; k++) paintFrame(true);
      return;
    }
    if (rafFn) raf = rafFn(loop);
    else paintFrame(true);
  }
  function stop() {
    running = false;
    if (raf && cafFn) cafFn(raf);
    raf = 0;
  }
  function destroy() {
    destroyed = true;
    stop();
    if (resizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    clear();
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }
  if (typeof window !== 'undefined' && !opts.noWindowResize) {
    resizeHandler = function () { if (running && !destroyed) resize(); };
    window.addEventListener('resize', resizeHandler);
  }
  return {
    start, stop, resize, destroy,
    get running() { return running; },
    get destroyed() { return destroyed; },
    canvas,
  };
}

let rainCtl = null;

function themeTargets(doc) {
  const html = doc.documentElement;
  const body = doc.body;
  const stage = doc.getElementById('stage');
  const desk = doc.getElementById('desk') || doc.getElementById('desktop');
  const desktop = doc.getElementById('desktop');
  return [html, body, stage, desk, desktop].filter(Boolean);
}

export function isMatrixTheme(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.body) return false;
  return d.body.classList.contains('theme-matrix') ||
    !!(d.getElementById('stage') && d.getElementById('stage').classList.contains('theme-matrix')) ||
    !!(d.getElementById('desktop') && d.getElementById('desktop').classList.contains('theme-matrix'));
}

export function ensureMatrixCanvas(doc, stage) {
  let canvas = doc.getElementById('matrix-rain');
  if (canvas) return canvas;
  const host = stage || doc.getElementById('stage') || doc.getElementById('desktop') || doc.body;
  if (!host) return null;
  canvas = doc.createElement('canvas');
  canvas.id = 'matrix-rain';
  canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, host.firstChild);
  return canvas;
}

export function setMatrixTheme(on, opts) {
  const options = opts || {};
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { on: !!on, rain: rainCtl };
  const stage = doc.getElementById('stage') || doc.getElementById('desktop');
  themeTargets(doc).forEach(function (el) { el.classList.toggle('theme-matrix', !!on); });
  if (on && stage && options.cinematic !== false) {
    stage.classList.add('theme-matrix-enter');
    const t = options.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
    if (t) t(function () { stage.classList.remove('theme-matrix-enter'); }, 800);
  } else if (stage) {
    stage.classList.remove('theme-matrix-enter');
  }
  if (on) {
    const canvas = ensureMatrixCanvas(doc, stage);
    if (canvas && !rainCtl) {
      rainCtl = createMatrixRain(canvas, {
        getSize: options.getSize || function () {
          const s = doc.getElementById('stage');
          if (s) return { w: s.clientWidth || s.offsetWidth || 640, h: s.clientHeight || s.offsetHeight || 480 };
          return { w: 640, h: 480 };
        },
        titles: options.titles,
        matchMedia: options.matchMedia,
        requestAnimationFrame: options.requestAnimationFrame,
        cancelAnimationFrame: options.cancelAnimationFrame,
        ctx: options.ctx,
      });
    }
    if (rainCtl && !rainCtl.running) rainCtl.start();
    if (options.syncUrl !== false && typeof window !== 'undefined') syncMatrixUrl(true, window.location && window.history ? window : options.location);
  } else {
    if (rainCtl) { rainCtl.destroy(); rainCtl = null; }
    const leftover = doc.getElementById('matrix-rain');
    if (leftover && leftover.parentNode) leftover.parentNode.removeChild(leftover);
    if (options.syncUrl !== false && typeof window !== 'undefined') syncMatrixUrl(false, window.location && window.history ? window : options.location);
  }
  return { on: !!on, rain: rainCtl };
}

export function resizeMatrixRain() {
  if (rainCtl) rainCtl.resize();
}

export function getMatrixRain() { return rainCtl; }

const api = {
  MATRIX_GLYPHS, MATRIX_FONT_SIZE, MATRIX_FONT, MATRIX_HEAD, MATRIX_TRAIL,
  MATRIX_TRAIL_DIM, MATRIX_BG, MATRIX_FADE, MATRIX_SHADOW, DEFAULT_MATRIX_TITLES,
  HELP_TEXT, CRT_FEATURES, CRT_LABELS, stripAccents, normalizeCommand, parseRunCommand,
  parseCrtCommand, applyCrtCommand, wantsMatrixFromUrl,
  syncMatrixUrl, createMatrixRain, setMatrixTheme, resizeMatrixRain, isMatrixTheme,
  ensureMatrixCanvas, getMatrixRain,
};

export default api;

if (typeof globalThis !== 'undefined') globalThis.Win95Experto = api;
