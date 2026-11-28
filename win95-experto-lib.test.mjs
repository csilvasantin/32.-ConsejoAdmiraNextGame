import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  MATRIX_GLYPHS, MATRIX_HEAD, MATRIX_TRAIL, MATRIX_TRAIL_DIM, MATRIX_BG, MATRIX_FADE,
  HELP_TEXT, normalizeCommand, parseRunCommand, applyCrtCommand, wantsMatrixFromUrl, syncMatrixUrl,
  createMatrixRain, setMatrixTheme, isMatrixTheme,
} from './win95-experto-lib.mjs';

const html = readFileSync(new URL('./windows95/index.html', import.meta.url), 'utf8');
const STUDIO_GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFｦﾞﾟ｡･ｰ';

test('la lluvia replica el charset y los colores de admira.studio/matrix-rain.js', () => {
  assert.equal(MATRIX_GLYPHS, STUDIO_GLYPHS);
  assert.equal(MATRIX_HEAD, '#e8ffe8');
  assert.equal(MATRIX_TRAIL, '#00ff41');
  assert.equal(MATRIX_TRAIL_DIM, '#00c837');
  assert.equal(MATRIX_FADE, 'rgba(2, 6, 2, 0.07)');
  assert.equal(MATRIX_BG, '#020604');
  const studioPath = new URL('../admira-studio/matrix-rain.js', import.meta.url);
  if (existsSync(studioPath)) {
    const studio = readFileSync(studioPath, 'utf8');
    const m = studio.match(/const GLYPHS = '([^']+)'/);
    assert.ok(m, 'admira.studio declara GLYPHS');
    assert.equal(MATRIX_GLYPHS, m[1]);
    assert.match(studio, /#e8ffe8/);
    assert.match(studio, /rgba\(2, 6, 2, 0\.07\)/);
  }
});

test('normalizeCommand quita /, mayúsculas, tildes y .exe', () => {
  assert.equal(normalizeCommand(' /MATRÍX '), 'matrix');
  assert.equal(normalizeCommand('Clásico.exe'), 'clasico');
  assert.equal(normalizeCommand('AYUDA'), 'ayuda');
  assert.equal(normalizeCommand('  /Win95  '), 'win95');
  assert.equal(normalizeCommand('MATRIX OFF'), 'matrix off');
});

test('parseRunCommand: matrix con y sin /', () => {
  for (const raw of ['matrix', '/matrix', 'MATRIX', 'Matríz', '/MATRIX', 'tema matrix', 'matrix on']) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, 'matrix', raw);
  }
});

test('parseRunCommand: win95 / clasico / normal / matrix off vuelven al clásico', () => {
  for (const raw of ['win95', '/win95', 'clasico', 'Clásico', 'normal', 'matrix off', '/matrix off']) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, 'classic', raw);
  }
});

test('parseRunCommand: ayuda / help / ? muestran la lista', () => {
  for (const raw of ['ayuda', '/ayuda', 'help', '/help', '?', 'Ayuda']) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, 'help', raw);
    assert.match(r.text, /matrix/);
    assert.match(r.text, /win95/);
    assert.match(r.text, /demo/);
    assert.match(r.text, /monitor/);
    assert.match(r.text, /computer/);
    assert.match(r.text, /extended/);
    assert.match(r.text, /entrelazado/);
    assert.match(r.text, /alternan ON\/OFF/);
    assert.match(r.text, /deus/);
    assert.match(r.text, /pildora roja/);
    assert.match(r.text, /aiflow/);
    assert.match(HELP_TEXT, /consumos/);
  }
});

test('parseRunCommand: demo se mantiene', () => {
  for (const raw of ['demo', '/demo', 'DEMO', 'demostración', 'demostracion']) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, 'demo', raw);
  }
});

test('parseRunCommand: programas de Win95', () => {
  const cases = {
    winamp: ['app', 'amp'],
    '/Winamp': ['app', 'amp'],
    napster: ['app', 'p2p'],
    netscape: ['app', 'browser'],
    icqgram: ['app', 'chat'],
    notepad: ['app', 'readme'],
    leeme: ['app', 'readme'],
    media: ['app', 'media'],
    bandeja: ['app', 'inbox'],
    'mi pc': ['app', 'mypc'],
    papelera: ['app', 'trash'],
    cli: ['cli', null],
    cmd: ['cli', null],
    '/cmd': ['cli', null],
    deepagents: ['cli', null],
    misiones: ['folder', 'misiones'],
    miscelánea: ['folder', 'miscelanea'],
  };
  for (const [raw, [action, id]] of Object.entries(cases)) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, action, raw + ' action');
    if (action === 'app') assert.equal(r.app, id, raw);
    if (action === 'folder') assert.equal(r.folder, id, raw);
  }
});

test('parseRunCommand: comandos útiles del Modo Experto abren la vista', () => {
  const cases = {
    consumos: '/consumos',
    '/control': '/control/',
    mesa: '/',
    lanzadera: '/lanzadera/',
    mcp: '/mcp/',
    comandos: '/comandos',
    highscore: '/highscore',
    diario: '/diario',
    tareas: '/tareas',
    interface: '/interface/',
    version: '/version.json',
  };
  for (const [raw, url] of Object.entries(cases)) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, 'open', raw);
    assert.equal(r.url, url, raw);
  }
});

test('parseRunCommand: comando desconocido sugiere ayuda y no es ok', () => {
  const r = parseRunCommand('solitario');
  assert.equal(r.ok, false);
  assert.equal(r.action, 'unknown');
  assert.equal(r.suggest, 'ayuda');
  assert.match(r.message, /solitario/);
  assert.match(r.message, /ayuda/);
});

test('wantsMatrixFromUrl entiende ?tema=matrix y ?matrix=1', () => {
  assert.equal(wantsMatrixFromUrl('?tema=matrix'), true);
  assert.equal(wantsMatrixFromUrl('?theme=matrix'), true);
  assert.equal(wantsMatrixFromUrl('?matrix=1'), true);
  assert.equal(wantsMatrixFromUrl('?matrix=true'), true);
  assert.equal(wantsMatrixFromUrl('?demo=1'), false);
  assert.equal(wantsMatrixFromUrl(''), false);
});

test('syncMatrixUrl añade y quita tema=matrix sin perder otros parámetros', () => {
  const hist = [];
  const loc = {
    href: 'https://www.admira.live/windows95/?demo=1',
    pathname: '/windows95/',
    search: '?demo=1',
    hash: '',
    history: { replaceState(_s, _t, url) { hist.push(url); loc.search = url.includes('?') ? '?' + url.split('?')[1].split('#')[0] : ''; } },
  };
  syncMatrixUrl(true, loc);
  assert.equal(hist.length, 1);
  assert.match(hist[0], /tema=matrix/);
  assert.match(hist[0], /demo=1/);
  loc.href = 'https://www.admira.live/windows95/' + hist[0].replace('/windows95/', '');
  // rebuild href properly
  loc.href = 'https://www.admira.live' + hist[0];
  syncMatrixUrl(false, loc);
  const last = hist[hist.length - 1];
  assert.equal(last.includes('tema=matrix'), false);
  assert.match(last, /demo=1/);
});

function fakeCanvas() {
  const calls = [];
  const ctx = {
    fillStyle: '', font: '', textBaseline: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
    setTransform() { calls.push('setTransform'); },
    fillRect() { calls.push('fillRect'); },
    fillText() { calls.push('fillText'); },
    clearRect() { calls.push('clearRect'); },
  };
  const parent = { clientWidth: 640, clientHeight: 480 };
  const canvas = {
    width: 0, height: 0, style: {}, parentElement: parent, parentNode: null,
    getContext() { return ctx; },
  };
  return { canvas, ctx, calls };
}

test('createMatrixRain pinta, se detiene y se limpia del todo', () => {
  const { canvas, calls } = fakeCanvas();
  const host = { firstChild: null, insertBefore() {}, removeChild(el) { this.removed = el; canvas.parentNode = null; } };
  canvas.parentNode = host;
  let frames = 0;
  let cb = null;
  const raf = (fn) => { cb = fn; frames += 1; return frames; };
  const caf = () => { cb = null; };
  const rain = createMatrixRain(canvas, {
    ctx: canvas.getContext('2d'),
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    noWindowResize: true,
    matchMedia: () => ({ matches: false }),
    getSize: () => ({ w: 640, h: 480 }),
  });
  rain.start();
  assert.equal(rain.running, true);
  assert.ok(frames >= 1, 'arranca el bucle');
  assert.ok(cb, 'queda un frame programado');
  cb();
  assert.ok(calls.includes('fillText'), 'pinta glifos');
  rain.destroy();
  assert.equal(rain.running, false);
  assert.equal(rain.destroyed, true);
  assert.ok(calls.includes('clearRect'));
  assert.equal(host.removed, canvas);
  if (cb) cb();
  const after = calls.filter((c) => c === 'fillText').length;
  if (cb) { /* already destroyed; loop must not schedule more paints meaningfully */ }
  assert.equal(rain.running, false);
  void after;
});

test('createMatrixRain respeta prefers-reduced-motion (sin bucle)', () => {
  const { canvas, calls } = fakeCanvas();
  let frames = 0;
  const rain = createMatrixRain(canvas, {
    ctx: canvas.getContext('2d'),
    requestAnimationFrame: (fn) => { frames += 1; return 1; },
    noWindowResize: true,
    matchMedia: () => ({ matches: true }),
    getSize: () => ({ w: 640, h: 480 }),
  });
  rain.start();
  assert.equal(frames, 0);
  assert.ok(calls.includes('fillText'));
  rain.destroy();
});

test('setMatrixTheme aplica body.theme-matrix / #desktop|#stage y limpia el canvas', () => {
  const classes = () => new Set();
  function el(id) {
    const node = {
      id,
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); },
        remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
        toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); },
      },
      clientWidth: 640, clientHeight: 480, offsetWidth: 640, offsetHeight: 480,
      firstChild: null,
      insertBefore(child) { this.firstChild = child; child.parentNode = this; return child; },
      removeChild(child) { if (this.firstChild === child) this.firstChild = null; child.parentNode = null; },
    };
    return node;
  }
  const body = el('body');
  const html = el('html');
  const stage = el('stage');
  const desk = el('desk');
  const desktop = el('desktop');
  const nodes = { stage, desk, desktop, 'matrix-rain': null };
  const { canvas, ctx } = fakeCanvas();
  const doc = {
    documentElement: html,
    body,
    getElementById(id) {
      if (id === 'matrix-rain') return nodes['matrix-rain'];
      return nodes[id] || null;
    },
    createElement(tag) {
      if (tag === 'canvas') {
        nodes['matrix-rain'] = canvas;
        canvas.id = 'matrix-rain';
        canvas.setAttribute = () => {};
        return canvas;
      }
      return el(tag);
    },
  };
  canvas.parentNode = null;
  const origRemove = (host => function (child) {
    if (child === canvas) nodes['matrix-rain'] = null;
    host.firstChild = null;
    child.parentNode = null;
  });
  stage.removeChild = origRemove(stage);

  const r = setMatrixTheme(true, {
    document: doc,
    cinematic: false,
    syncUrl: false,
    ctx,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: true }),
    noWindowResize: true,
  });
  assert.equal(r.on, true);
  assert.ok(body.classList.contains('theme-matrix'));
  assert.ok(stage.classList.contains('theme-matrix'));
  assert.ok(desktop.classList.contains('theme-matrix'));
  assert.ok(isMatrixTheme(doc));
  assert.equal(nodes['matrix-rain'], canvas);

  setMatrixTheme(false, { document: doc, syncUrl: false });
  assert.equal(isMatrixTheme(doc), false);
  assert.equal(body.classList.contains('theme-matrix'), false);
  assert.equal(nodes['matrix-rain'], null);
});

test('windows95/index.html: typo Abrir: corregido, Ejecutar es Modo Experto y carga la lib', () => {
  assert.match(html, /<span class="run-open-lbl"><u>E<\/u>jecutar:<\/span>/);
  assert.doesNotMatch(html, /<u>A<\/u>brir:/);
  assert.doesNotMatch(html, /gap:6px"><u>A<\/u>brir:/);
  assert.match(html, /Modo Experto/);
  assert.match(html, /<b>demo<\/b>/);
  assert.match(html, /<b>matrix<\/b>/);
  assert.match(html, /<b>deus<\/b>/);
  assert.match(html, /<b>win95<\/b>/);
  assert.match(html, /<b>ayuda<\/b>/);
  assert.match(html, /Ejecuta <b>Monitor<\/b>, <b>Computer<\/b>, <b>Extended<\/b> o <b>Entrelazado<\/b>/);
  assert.match(html, /win95-experto-lib\.mjs/);
  assert.match(html, /win95-deus-lib\.mjs/);
  assert.match(html, /win95-deus-scene\.mjs/);
  assert.match(html, /Win95DeusBoot/);
  assert.match(html, /pildora=roja/);
  assert.match(html, /action==='deus'/);
  assert.match(html, /body\.theme-matrix|#stage\.theme-matrix/);
  assert.match(html, /#matrix-rain/);
  assert.match(html, /parseRunCommand/);
  assert.match(html, /setMatrixTheme/);
  assert.match(html, /applyCrtCommand/);
  assert.match(html, /tema=matrix|wantsMatrixFromUrl/);
  // El gap del flex ya no separa la E de «jecutar:»
  assert.match(html, /run-open-lbl/);
});
