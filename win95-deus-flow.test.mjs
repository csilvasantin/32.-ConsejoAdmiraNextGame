import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLOW_AGENTS, COLOR_ESTADO, AVISO_SIN_DATOS, ETIQUETA_EJEMPLO,
  colorEstado, sesionVerificada, sesionTrabajando, etiquetaColor,
  buildAiFlow, guionDeus, simularOrden, wantsPildoraFromUrl, syncPildoraUrl,
  prefersReducedMotion, particleBudget, faceWeight, buildFaceCloud,
  ultimaOrdenCarlos, DEUS_PALETTE,
} from './win95-deus-lib.mjs';
import { parseRunCommand, HELP_TEXT, createMatrixRain, setMatrixTheme } from './win95-experto-lib.mjs';
import { showPills, hidePills, enterDeus, exitDeus, getDeusScene } from './win95-deus-scene.mjs';

const html = readFileSync(new URL('./windows95/index.html', import.meta.url), 'utf8');

test('comandos matrix / deus / pildora / aiflow y ayuda', () => {
  for (const raw of ['matrix', '/matrix', 'tema matrix']) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, 'matrix', raw);
  }
  for (const raw of ['deus', '/deus', 'deusexmachina', 'Deus Ex Machina', 'aiflow', 'AI flow', 'píldora roja', 'pildora roja', 'red pill']) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, 'deus', raw);
  }
  for (const raw of ['píldora azul', 'pildora azul', 'blue pill', 'win95']) {
    const r = parseRunCommand(raw);
    assert.equal(r.ok, true, raw);
    assert.equal(r.action, 'classic', raw);
  }
  assert.match(HELP_TEXT, /pildora roja/);
  assert.match(HELP_TEXT, /deus · deusexmachina · aiflow/);
  assert.match(HELP_TEXT, /píldoras roja y azul/);
});

test('?tema=matrix&pildora=roja / azul se leen y se sincronizan', () => {
  assert.equal(wantsPildoraFromUrl('?tema=matrix&pildora=roja'), 'roja');
  assert.equal(wantsPildoraFromUrl('?tema=matrix&pildora=red'), 'roja');
  assert.equal(wantsPildoraFromUrl('?pildora=azul'), 'azul');
  assert.equal(wantsPildoraFromUrl('?pill=blue'), 'azul');
  assert.equal(wantsPildoraFromUrl('?tema=matrix'), null);
  const hist = [];
  const loc = {
    href: 'https://www.admira.live/windows95/?demo=1',
    pathname: '/windows95/',
    search: '?demo=1',
    hash: '',
    history: { replaceState(_s, _t, url) { hist.push(url); loc.search = url.includes('?') ? '?' + url.split('?')[1].split('#')[0] : ''; } },
  };
  syncPildoraUrl('roja', loc);
  assert.match(hist[0], /pildora=roja/);
  assert.match(hist[0], /tema=matrix/);
  assert.match(hist[0], /demo=1/);
  loc.href = 'https://www.admira.live' + hist[0];
  syncPildoraUrl(null, loc);
  const last = hist[hist.length - 1];
  assert.equal(last.includes('pildora='), false);
  assert.match(last, /demo=1/);
});

test('colores: rojo=sesión trabajando, verde=sesión libre, amarillo=desconocido; la cola no pinta rojo', () => {
  assert.equal(colorEstado({}), 'amarillo');
  assert.equal(colorEstado({ latido: null, censoAgente: null }), 'amarillo');
  assert.equal(sesionVerificada({}), false);
  assert.equal(colorEstado({ encargo: { estado: 'pending' } }), 'amarillo');
  assert.equal(colorEstado({ encargo: { estado: 'in_progress' } }), 'amarillo');
  const vivo = { vivo: true };
  assert.equal(sesionVerificada({ latido: vivo }), true);
  assert.equal(sesionTrabajando({ latido: vivo }), false);
  assert.equal(colorEstado({ latido: vivo }), 'verde');
  assert.equal(etiquetaColor('verde'), 'libre');
  const trab = { vivo: true, modo: 'trabajando', hasta: Date.now() / 1000 + 600 };
  assert.equal(sesionTrabajando({ latido: trab }), true);
  assert.equal(colorEstado({ latido: trab }), 'rojo');
  assert.equal(etiquetaColor('rojo'), 'trabajando');
  const censo = { maquinas: ['Mac Mini'] };
  assert.equal(colorEstado({ censoAgente: censo }), 'verde');
  const tarea = { vivo: true, tarea: 'arregla el inbox' };
  assert.equal(colorEstado({ latido: tarea }), 'rojo');
  assert.equal(COLOR_ESTADO.desconocido, 'amarillo');
});

test('sin fuentes no se inventan datos: todos amarillo y aviso sin datos verificados', () => {
  const f = buildAiFlow({});
  assert.equal(f.ok, false);
  assert.equal(f.ejemplo, false);
  assert.equal(f.aviso, AVISO_SIN_DATOS);
  assert.equal(f.orden, null);
  assert.equal(f.resultados.length, 0);
  assert.equal(f.agentes.length, 6);
  assert.deepEqual(f.agentes.map((a) => a.nombre), FLOW_AGENTS.map((a) => a.nombre));
  for (const a of f.agentes) {
    assert.equal(a.color, 'amarillo');
    assert.equal(a.estado, 'desconocido');
    assert.equal(a.mision, null);
    assert.equal(a.sesion, false);
  }
  const guion = guionDeus(f).join('\n');
  assert.match(guion, /sin datos verificados/i);
  assert.doesNotMatch(guion.toLowerCase(), /encargo #76/);
});

test('flujo real: orden de Carlos, consejo, estados de sesión y resultados hechos', () => {
  const ahora = 1_700_000_000_000;
  const fuentes = {
    censo: {
      ok: true, sinFuente: false,
      agentes: [
        { persona: 'Neo', maquinas: ['Mac Studio'], app: 'Claude' },
        { persona: 'Trinity', maquinas: [], app: 'Codex' },
      ],
    },
    latidos: {
      Neo: { vivo: true, tarea: 'Screen sync', maquina: 'Mac Studio' },
      Trinity: { vivo: true, maquina: 'Air Rosa' },
    },
    comunicaciones: {
      ok: true,
      comunicaciones: [
        { tipo: 'encargo', encargo: 7769, etiqueta: '#7769.11.28', estado: 'in_progress', estadoEs: 'en curso', de: 'Lucas (por orden de Carlos)', para: 'Neo', persona: 'Neo', texto: 'Píldoras Matrix y AI flow Deus Ex Machina', cuandoMs: ahora - 1000 },
        { tipo: 'encargo', encargo: 7759, etiqueta: '#7759.11.27', estado: 'done', estadoEs: 'hecho', de: 'Lucas', para: 'Neo', persona: 'Neo', texto: 'Logo Winamp y toggles de Ejecutar', cuandoMs: ahora - 8000, cierreMs: ahora - 4000 },
      ],
      activos: [
        { persona: 'Neo', titulo: 'Píldoras Matrix y AI flow Deus Ex Machina', etiqueta: '#7769.11.28', estado: 'in_progress', estadoEs: 'en curso', consejero: 'Lucas' },
      ],
    },
  };
  const f = buildAiFlow(fuentes, ahora);
  assert.equal(f.ok, true);
  assert.equal(f.ejemplo, false);
  assert.ok(f.orden);
  assert.equal(f.orden.encargo, 7769);
  assert.equal(f.orden.deCarlos, true);
  assert.match(f.orden.titulo, /Píldoras Matrix/);
  assert.equal(f.consejo, 'Lucas (por orden de Carlos)');
  const neo = f.agentes.find((a) => a.persona === 'Neo');
  const trinity = f.agentes.find((a) => a.persona === 'Trinity');
  const smith = f.agentes.find((a) => a.persona === 'Smith');
  assert.equal(neo.color, 'rojo');
  assert.equal(neo.mision.titulo.includes('Píldoras'), true);
  assert.equal(trinity.color, 'verde');
  assert.equal(smith.color, 'amarillo');
  assert.equal(f.resultados.length, 1);
  assert.equal(f.resultados[0].encargo, 7759);
  const g = guionDeus(f).join('\n');
  assert.match(g, /#7769/);
  assert.match(g, /Lucas/);
  assert.doesNotMatch(g, /Datos de ejemplo/);
});

test('datos de ejemplo van etiquetados y no se presentan como reales', () => {
  const f = buildAiFlow({ usarEjemplo: true });
  assert.equal(f.ok, false);
  assert.equal(f.ejemplo, true);
  assert.match(f.aviso, /ejemplo/i);
  assert.equal(f.orden.ejemplo, true);
  assert.equal(f.agentes[0].mision.ejemplo, true);
  assert.equal(f.agentes[0].color, 'amarillo');
  const g = guionDeus(f).join(' ');
  assert.match(g, /ejemplo/);
  assert.ok(ETIQUETA_EJEMPLO);
});

test('simularOrden es modo demo y nunca marca envío', () => {
  const vacio = simularOrden('  ');
  assert.equal(vacio.envia, false);
  assert.equal(vacio.ok, false);
  const s = simularOrden('Prioriza el sync de las ultrawide');
  assert.equal(s.ok, true);
  assert.equal(s.envia, false);
  assert.equal(s.modo, 'demo');
  assert.match(s.mensaje, /no se envía/);
  assert.match(s.mensaje, /solo lectura/);
});

test('reduced motion y presupuesto de partículas; el rostro tiene masa', () => {
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false);
  const mobile = particleBudget(640, 360, 2, false);
  const desk = particleBudget(1280, 800, 1, false);
  const reduced = particleBudget(1280, 800, 1, true);
  assert.ok(mobile <= 1800);
  assert.ok(desk > mobile);
  assert.ok(reduced < 800);
  assert.ok(faceWeight(0, 0.14) >= 0);
  assert.ok(faceWeight(2, 2) === 0);
  const cloud = buildFaceCloud(80, () => Math.random());
  assert.ok(cloud.length >= 40);
  assert.ok(cloud.every((p) => p.w > 0));
});

test('la lluvia admite setPace para la transición al túnel', () => {
  const ctx = {
    fillStyle: '', font: '', textBaseline: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
    setTransform() {}, fillRect() {}, fillText() {}, clearRect() {},
  };
  const canvas = { width: 0, height: 0, style: {}, parentElement: { clientWidth: 64, clientHeight: 48 }, parentNode: { removeChild() {} }, getContext: () => ctx };
  const rain = createMatrixRain(canvas, {
    ctx, noWindowResize: true, matchMedia: () => ({ matches: true }),
    requestAnimationFrame: () => 1, getSize: () => ({ w: 64, h: 48 }),
  });
  rain.start();
  assert.equal(rain.pace, 1);
  rain.setPace(6);
  assert.equal(rain.pace, 6);
  rain.destroy();
});

function miniDom() {
  const listeners = new Map();
  const nodes = {};
  function node(tag, id) {
    const n = {
      tag, id: id || '', className: '', textContent: '', style: {}, _html: '',
      children: [], parentNode: null, _attrs: {},
      classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);}, toggle(c,on){if(on)this._s.add(c);else this._s.delete(c);} },
      setAttribute(k, v) { this._attrs[k] = v; if (k === 'id') { this.id = v; nodes[v] = this; } },
      getAttribute(k) { return this._attrs[k]; },
      appendChild(c) { this.children.push(c); c.parentNode = this; if (c.id) nodes[c.id] = c; return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; if (c.id) delete nodes[c.id]; },
      querySelector(sel) {
        const all = collect(this);
        if (sel.startsWith('#')) return all.find((x) => x.id === sel.slice(1)) || null;
        if (sel.startsWith('.')) return all.find((x) => (x.className || '').split(/\s+/).includes(sel.slice(1))) || null;
        if (sel.startsWith('[')) {
          const m = sel.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);
          return all.find((x) => m && x._attrs[m[1]] === (m[2] || '') || (m && m[2] == null && m[1] in x._attrs)) || null;
        }
        return all.find((x) => x.tag === sel) || null;
      },
      addEventListener(ev, fn) { const k = ev; if (!this._ls) this._ls = {}; (this._ls[k] || (this._ls[k] = [])).push(fn); },
      removeEventListener(ev, fn) { if (!this._ls || !this._ls[ev]) return; this._ls[ev] = this._ls[ev].filter((f) => f !== fn); },
      focus() {},
      get clientWidth() { return 640; },
      get clientHeight() { return 480; },
      getContext() {
        return {
          fillStyle: '', font: '', textBaseline: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
          strokeStyle: '', lineWidth: 1, textAlign: 'left',
          setTransform() {}, fillRect() {}, clearRect() {}, fillText() {}, strokeRect() {},
          beginPath() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
          quadraticCurveTo() {}, save() {}, restore() {}, translate() {},
          createRadialGradient() { return { addColorStop() {} }; },
          createLinearGradient() { return { addColorStop() {} }; },
          measureText(s) { return { width: String(s).length * 7 }; },
        };
      },
    };
    if (id) nodes[id] = n;
    Object.defineProperty(n, 'innerHTML', {
      get() { return this._html || ''; },
      set(html) {
        this._html = String(html || '');
        const re = /<([a-z0-9]+)([^>]*)>/gi;
        let m;
        while ((m = re.exec(this._html))) {
          const attrs = m[2] || '';
          const idm = attrs.match(/\bid=["']([^"']+)["']/);
          const cls = attrs.match(/\bclass=["']([^"']+)["']/);
          const pill = attrs.match(/\bdata-pill=["']([^"']+)["']/);
          const exit = /data-deus-exit/.test(attrs);
          if (!idm && !pill && !exit && !(cls && /deus-/.test(cls[1]))) continue;
          const child = node(m[1].toLowerCase(), idm && idm[1]);
          if (cls) child.className = cls[1];
          if (pill) child.setAttribute('data-pill', pill[1]);
          if (exit) child.setAttribute('data-deus-exit', '');
          n.appendChild(child);
        }
      },
    });
    return n;
  }
  function collect(root, acc = []) {
    acc.push(root);
    (root.children || []).forEach((c) => collect(c, acc));
    return acc;
  }
  const stage = node('div', 'stage');
  const body = node('body', 'body');
  body.appendChild(stage);
  const doc = {
    body,
    documentElement: node('html', 'html'),
    getElementById(id) { return nodes[id] || null; },
    createElement(tag) { return node(tag); },
    addEventListener(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); },
    removeEventListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    _listeners: listeners,
  };
  return { doc, stage, body, nodes, listeners };
}

test('píldoras roja/azul se montan y se limpian', () => {
  const { doc, stage } = miniDom();
  let red = 0, blue = 0;
  const wrap = showPills({ document: doc, host: stage, onRed() { red += 1; }, onBlue() { blue += 1; } });
  assert.ok(wrap);
  assert.equal(doc.getElementById('mx-pills'), wrap);
  assert.match(wrap.innerHTML, /data-pill="roja"/);
  assert.match(wrap.innerHTML, /data-pill="azul"/);
  wrap.querySelector('[data-pill="roja"]')._ls.click[0]();
  wrap.querySelector('[data-pill="azul"]')._ls.click[0]();
  assert.equal(red, 1);
  assert.equal(blue, 1);
  hidePills(doc);
  assert.equal(doc.getElementById('mx-pills'), null);
  assert.equal((doc._listeners.keydown || []).length, 0);
});

test('enterDeus / exitDeus limpian canvas, timers y listeners (también en reduced motion)', () => {
  const { doc, stage } = miniDom();
  let raf = 0, caf = 0;
  const ids = [];
  const scene = enterDeus({
    document: doc,
    host: stage,
    flow: buildAiFlow({}),
    reducedMotion: true,
    syncUrl: false,
    requestAnimationFrame(fn) { raf += 1; ids.push(fn); return raf; },
    cancelAnimationFrame() { caf += 1; },
    getSize: () => ({ w: 640, h: 480 }),
  });
  assert.ok(scene);
  assert.ok(doc.getElementById('deus-root'));
  assert.ok(doc.getElementById('deus-canvas'));
  assert.equal(scene.destroyed, false);
  assert.equal(scene.phase, 'flow');
  const beforeListeners = (doc._listeners.keydown || []).length;
  assert.ok(beforeListeners >= 1);
  exitDeus();
  assert.equal(doc.getElementById('deus-root'), null);
  assert.equal(getDeusScene(), null);
  assert.equal((doc._listeners.keydown || []).length, 0);
});

test('tras la píldora roja la paleta es ámbar/dorado y negro, no verde Matrix', () => {
  assert.match(DEUS_PALETTE.bg, /#0/);
  assert.equal(DEUS_PALETTE.amber, '#e09020');
  assert.equal(DEUS_PALETTE.gold, '#ffd078');
  assert.doesNotMatch(DEUS_PALETTE.bg + DEUS_PALETTE.amber + DEUS_PALETTE.gold, /00ff41|#9f6|#c8ffd4/i);
  assert.match(html, /\.deus-root\{[^}]*#030201/);
  assert.match(html, /\.deus-subs\{[^}]*#ffd078/);
  assert.doesNotMatch(html, /\.deus-subs\{[^}]*#00ff41/);
  assert.doesNotMatch(html, /\.deus-subs\{[^}]*#c8ffd4/);
});

test('windows95/index.html cablea píldoras, deus, URL y no envía encargos', () => {
  assert.match(html, /win95-deus-lib\.mjs/);
  assert.match(html, /win95-deus-scene\.mjs/);
  assert.match(html, /Win95DeusBoot/);
  assert.match(html, /openPills/);
  assert.match(html, /openDeus/);
  assert.match(html, /pildora=roja/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /mx-pills/);
  assert.match(html, /deus-root/);
  assert.match(html, /no se envía|solo lectura/);
  assert.doesNotMatch(html, /agente_encargar/);
  assert.match(html, /\/api\/win95\/deepagents/);
  assert.match(html, /\/api\/win95\/deepagents-comunicaciones/);
});
