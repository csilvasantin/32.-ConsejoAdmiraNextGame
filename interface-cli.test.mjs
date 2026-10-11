// /interface (r29 · Jensen Huang): parser del modo experto y órdenes del móvil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('./assets/interface-cli.js');
const I = globalThis.AdmiraInterface;
const { normalizarOrden } = await import('./functions/api/interface.js');

test('parse: terminal 4/2 con y sin dispositivo', () => {
  assert.deepEqual(I.parse('/interface terminal 4'), { ok: true, accion: 'terminal', grid: 4, dispositivo: null });
  assert.deepEqual(I.parse('/interface terminal 2 Fold'), { ok: true, accion: 'terminal', grid: 2, dispositivo: 'fold' });
  assert.equal(I.parse('/interface terminal 2 Iphone').dispositivo, 'iphone');
  assert.equal(I.parse('/interface terminal 4 MBP16').dispositivo, 'mbp16');
  assert.equal(I.parse('/interface terminal 4 mbp14').dispositivo, 'mbp14');
  assert.equal(I.parse('/interfaz terminal 2 Air').dispositivo, 'air');
});
test('parse: off, help y errores', () => {
  assert.deepEqual(I.parse('/interface off'), { ok: true, accion: 'off', grid: 0, dispositivo: null });
  assert.deepEqual(I.parse('/interface off fold'), { ok: true, accion: 'off', grid: 0, dispositivo: 'fold' });
  assert.deepEqual(I.parse('/interface off 2 air'), { ok: true, accion: 'off', grid: 2, dispositivo: 'air' });
  assert.equal(I.parse('/interface').accion, 'help');
  assert.equal(I.parse('/interface help').accion, 'help');
  assert.equal(I.parse('/interface terminal 3').error, 'grid');
  assert.equal(I.parse('/interface terminal 2 tostadora').error, 'dispositivo');
  assert.equal(I.parse('/interfaces terminal 2'), null);
  assert.equal(I.parse('/help'), null);
});
test('Mac: la orden es el script local, sin claves ni URLs', () => {
  assert.equal(I.ordenMac({ accion: 'terminal', grid: 2 }), '$HOME/Claude/vista/admira-interface.sh terminal 2');
  assert.equal(I.ordenMac({ accion: 'off', grid: 0 }), '$HOME/Claude/vista/admira-interface.sh off');
});
test('móvil: solo fold/iphone, terminal 2|4 u off', () => {
  assert.equal(normalizarOrden({ dispositivo: 'Fold', accion: 'terminal', grid: 2 }).orden.grid, 2);
  assert.equal(normalizarOrden({ dispositivo: 'air', accion: 'terminal', grid: 2 }).ok, false);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 3 }).ok, false);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'off' }).orden.accion, 'off');
  assert.equal(normalizarOrden({ dispositivo: 'iphone', accion: 'rm -rf' }).ok, false);
});
test('seguridad: la web pública no lleva claves ni IPs privadas del ttyd', () => {
  for (const f of ['assets/interface-cli.js', 'interface/index.html', 'functions/api/interface.js']) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /192\.168\.|100\.\d+\.\d+\.\d+|:7681|carlos:/, f);
  }
});
test('home: /interface registrado, en /help y despachado antes que /help', () => {
  const APP = readFileSync('app.flt-100529.js', 'utf8');
  assert.match(APP, /'\/interface', '\/interfaz'/);
  assert.match(APP, /<strong>\/interface terminal 4 \| 2/);
  assert.ok(APP.indexOf('AdmiraInterface.run') < APP.indexOf('const helpMatch'));
  assert.match(readFileSync('index.html', 'utf8'), /assets\/interface-cli\.js/);
});

// r33 (Carlos 13:30): /interface 6 = 3x2 con los 4 de pago + Smith y Merovingio
test('parse: /interface 6 y terminal 6, aquí o en el móvil', () => {
  assert.deepEqual(I.parse('/interface 6'), { ok: true, accion: 'terminal', grid: 6, dispositivo: null });
  assert.deepEqual(I.parse('/interface terminal 6 fold'), { ok: true, accion: 'terminal', grid: 6, dispositivo: 'fold' });
  assert.equal(I.parse('/interface 6 iphone').dispositivo, 'iphone');
  assert.equal(I.parse('/interface off 6').grid, 6);
  assert.equal(I.GRID6_URL, '/visor/?g=6');
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 6 }).orden.grid, 6);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 5 }).ok, false);
});

test('forma corta: /interface 4 · /interface 2 fold · /interfaz 4 mbp16', () => {
  const I = globalThis.AdmiraInterface;
  assert.deepEqual(I.parse('/interface 4'), { ok: true, accion: 'terminal', grid: 4, dispositivo: null });
  assert.equal(I.parse('/interface 2 fold').dispositivo, 'fold');
  assert.equal(I.parse('/interfaz 4 MBP16').grid, 4);
  assert.equal(I.parse('/interface 3').ok, false);
});

test('/demo interface: help → 4 → off → 2 → off → 2 claude · codex · grok · Neo Trinity → error → off', () => {
  const I = globalThis.AdmiraInterface;
  assert.deepEqual(I.PASOS.map(p => p[0]), ['/interface help', '/interface 4', '/interface off', '/interface 2', '/interface off',
    '/interface 2 claude', '/interface 2 codex', '/interface 2 grok', '/interface 2 Neo Trinity', '/interface 2 Neo Cypher', '/interface off']);
  // todos parsean, salvo el caso de error a propósito (Cypher no tiene panel)
  I.PASOS.forEach(p => { assert.equal(I.parse(p[0]).ok, !/Cypher/.test(p[0]), p[0]); assert.ok(p[1] && p[2]); });
  assert.ok(I.RE_DEMO.test('/demo interface') && I.RE_DEMO.test('/demo interfaz') && !I.RE_DEMO.test('/demo portada'));
});

test('la barra (páginas sin CLI propia) usa la misma implementación y la home carga el dock redimensionable', async () => {
  const fs = await import('node:fs');
  const bar = fs.readFileSync(new URL('./admira-bar.js', import.meta.url), 'utf8');
  assert.match(bar, /\/assets\/interface-cli\.js\?v=/);
  assert.match(bar, /"\/interface", "\/interfaz"/);
  const home = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(home, /\/assets\/experto-dock\.js\?v=/);
  assert.match(home, /\/assets\/interface-cli\.js\?v=/);
});

test('cli-ayuda: /demo help cuenta, ordena por fecha (interface arriba) y admite antiguas / alfabético', async () => {
  await import('./assets/cli-ayuda.js');
  const A = globalThis.AdmiraCliAyuda;
  const h = A.demoHelp('', false).split('\n');
  assert.match(h[0], new RegExp('^Hay ' + A.CATALOGO.length + ' demos'));
  assert.match(h[1], /^11-10-2026 {2}\/demo interface/);
  const old = A.demoHelp('antiguas', false).split('\n');
  assert.match(old[1], /07-10-2026/);
  const az = A.demoHelp('--orden alfabetico', true).split('\n');
  assert.match(az[0], /^There are \d+ demos · by name/);
  assert.match(az[1], /\/demo app/);
  assert.ok(A.RE_DEMO_HELP.test('/demo help antiguas') && A.RE_DEMO_HELP.test('/demo ayuda') && !A.RE_DEMO_HELP.test('/demo lista'));
});

test('cli-ayuda: ¿quisiste decir…? (transposición, prefijo, nada si no se parece)', async () => {
  const A = globalThis.AdmiraCliAyuda;
  assert.equal(A.sugerir('hlep', ['help', 'ayuda']), 'help');
  assert.equal(A.sugerir('interfase', ['interface', 'idioma']), 'interface');
  assert.equal(A.sugerir('interf', ['interface', 'idioma']), 'interface');
  assert.equal(A.sugerir('zzzz', ['help', 'demo']), '');
  assert.equal(globalThis.AdmiraInterface.run('/interface termnal 4', (t) => { assert.match(t, /Did you mean terminal|Quisiste decir terminal/); }), true);
});

// ── #5707 + #5729 (Morfeo): /interface 2 con selector ─────────────────────────
const S = await import('./interface-seleccion.mjs');
const { filtrarAgentes, vista } = await import('./visor-lib.mjs');
const AHORA = 1791727432;
// Presencia con la forma real de bot.yokup.com/api/presence (11-10-2026): sin proveedor ni model_spec todavía.
const fila = (persona, runtime, hace, extra = {}) => ({ persona, machine: 'MacBook Pro 16', runtime, model: '', verified: 1, source: 'process_snapshot', updated: AHORA - hace, ...extra });
const PRES = [
  fila('Neo', 'Claude', 1), fila('Morfeo', 'Claude', 5), fila('Morfeo', 'OpenCode', 3, { machine: 'MacMini', model: 'nvidia/nvidia/nemotron-3-ultra-550b-a55b' }),
  fila('Trinity', 'Codex', 2), fila('Oraculo', 'Codex', 9), fila('Trinity', 'Codex', 1, { machine: 'MacBookProNegro14' }),
  fila('Smith', 'Grok', 4),
  fila('Merovingio', 'DeepAgents', 6, { machine: 'GrokBotBox', model: 'nvidia/nemotron-3-ultra-550b-a55b:free', verified: 0, source: 'heartbeat' }),
  fila('Cypher', 'DeepAgents', 1, { machine: 'GrokBotBox', verified: 0 }),
  fila('Lucas', 'Grok', 1, { machine: 'GrokBot', verified: 0 }),
];

test('selector: parse de modelo y de dos nombres, sin mayúsculas ni tildes, con dispositivo al final', () => {
  assert.deepEqual(I.parse('/interface 2 claude'), { ok: true, accion: 'terminal', grid: 2, dispositivo: null, seleccion: { modelo: 'claude' } });
  assert.deepEqual(I.parse('/interface 2 CÓDEX fold').seleccion, { modelo: 'codex' });
  assert.equal(I.parse('/interface 2 Grok iphone').dispositivo, 'iphone');
  assert.deepEqual(I.parse('/interface terminal 2 neo TRINITY').seleccion, { agentes: ['Neo', 'Trinity'] });
  assert.deepEqual(I.parse('/interface 2 oraculo,smith Fold'), { ok: true, accion: 'terminal', grid: 2, dispositivo: 'fold', seleccion: { agentes: ['Oráculo', 'Smith'] } });
  assert.deepEqual(I.parse('/interface 2 Oráculo Merovingio mbp16').seleccion, { agentes: ['Oráculo', 'Merovingio'] });
  assert.equal(I.parse('/interface 2 Neo').error, 'selector');
  assert.equal(I.parse('/interface 2 Neo neo').error, 'selector');
  assert.equal(I.parse('/interface 2 Neo Cypher').error, 'selector');
  assert.equal(I.parse('/interface 2 gemini').error, 'dispositivo');
  assert.equal(I.parse('/interface 4 claude').error, 'dispositivo'); // el selector solo va detrás del 2
});

test('selector: /interface 2 a secas y /interface off quedan exactamente igual', () => {
  assert.deepEqual(I.parse('/interface 2'), { ok: true, accion: 'terminal', grid: 2, dispositivo: null });
  assert.deepEqual(I.parse('/interface 2 fold'), { ok: true, accion: 'terminal', grid: 2, dispositivo: 'fold' });
  assert.deepEqual(I.parse('/interface off'), { ok: true, accion: 'off', grid: 0, dispositivo: null });
  assert.equal(I.GRID2_URL, 'https://macbookair16plata.tail48b61c.ts.net/');
});

test('selector: la URL del visor lleva solo nombres ASCII, nunca la llave', () => {
  assert.equal(I.urlSeleccion(['Neo', 'Oráculo']), '/visor/?a=Neo,Oraculo');
  assert.doesNotMatch(I.urlSeleccion(['Neo', 'Trinity']), /k=|key|llave/i);
});

test('modelo: del proveedor/model_spec si existen; si no, del runtime SOLO con arranque verificado', () => {
  assert.deepEqual(S.modeloDeFila({ runtime: 'Claude', verified: 1 }), { modelo: 'claude', fuente: 'arranque verificado' });
  assert.equal(S.modeloDeFila({ runtime: 'Codex', verified: 1 }).modelo, 'codex');
  assert.equal(S.modeloDeFila({ runtime: 'Grok', verified: 1 }).modelo, 'grok');
  assert.equal(S.modeloDeFila({ runtime: 'Grok', verified: 0 }).modelo, null);          // latido sin verificar: no se supone
  assert.equal(S.modeloDeFila({ runtime: 'OpenCode', verified: 1, model: 'claude-x' }).modelo, null); // el `model` no decide
  assert.equal(S.modeloDeFila({ runtime: 'DeepAgents', verified: 1 }).modelo, null);
  // preparado para cuando el worker guarde proveedor / model_spec: mandan sobre el runtime
  assert.deepEqual(S.modeloDeFila({ runtime: 'Grok', verified: 0, proveedor: 'xAI' }), { modelo: 'grok', fuente: 'proveedor declarado' });
  assert.equal(S.modeloDeFila({ runtime: 'Claude', verified: 1, provider: 'Anthropic' }).modelo, 'claude');
  assert.equal(S.modeloDeFila({ runtime: 'Claude', verified: 1, proveedor: 'OpenRouter' }).modelo, null); // proveedor ajeno: fuera
  assert.equal(S.modeloDeFila({ runtime: 'OpenCode', model_spec: 'openai/gpt-6.1-sol' }).modelo, 'codex');
  assert.equal(S.modeloDeFila({ runtime: 'Claude', verified: 1, model_spec: 'openrouter/nvidia/nemotron' }).modelo, null);
});

test('elegir: los 2 de latido más reciente; si hay más, se dice quién queda fuera', () => {
  const c = S.elegir({ modelo: 'claude' }, PRES, AHORA);
  assert.equal(c.ok, true); assert.deepEqual(c.agentes, ['Neo', 'Morfeo']); assert.equal(c.url, '/visor/?a=Neo,Morfeo'); assert.equal(c.aviso, '');
  const x = S.elegir({ modelo: 'codex' }, [...PRES, fila('Morfeo', 'Codex', 0)], AHORA);
  assert.deepEqual(x.agentes, ['Morfeo', 'Trinity']); assert.deepEqual(x.extra, ['Oráculo']); assert.match(x.aviso, /3 vivos.*fuera: Oráculo/);
});

test('elegir: menos de 2 vivos → error con sugerencias, nunca un panel; desconocidos fuera de todos los grupos', () => {
  const g = S.elegir({ modelo: 'grok' }, PRES, AHORA);
  assert.equal(g.ok, false); assert.equal(g.error, 'pocos'); assert.deepEqual(g.encontrados, ['Smith']);
  assert.ok(!g.url && !g.agentes);
  assert.ok(g.desconocidos.includes('Merovingio')); // DeepAgents sin proveedor → desconocido, no «grok»
  assert.ok(g.sugerencias.includes('/interface 2 claude') && g.sugerencias.includes('/interface 2 codex'));
  assert.ok(!S.elegir({ modelo: 'claude' }, PRES, AHORA).agentes.includes('Lucas')); // solo los 6 del visor
  const viejo = S.elegir({ modelo: 'claude' }, PRES.map((r) => ({ ...r, updated: AHORA - 600 })), AHORA);
  assert.equal(viejo.ok, false); assert.match(viejo.mensaje, /No hay agentes vivos con claude/);
});

test('elegir: por nombre, ambos vivos; si falta uno, lo dice', () => {
  assert.deepEqual(S.elegir({ agentes: ['neo', 'TRINITY'] }, PRES, AHORA).agentes, ['Neo', 'Trinity']);
  assert.equal(S.elegir({ agentes: ['Oraculo', 'Smith'] }, PRES, AHORA).url, '/visor/?a=Oraculo,Smith');
  const f = S.elegir({ agentes: ['Neo', 'Trinity'] }, PRES.filter((r) => r.persona !== 'Trinity'), AHORA);
  assert.equal(f.ok, false); assert.deepEqual(f.faltan, ['Trinity']);
  assert.equal(S.elegir({ agentes: ['Neo', 'Neo'] }, PRES, AHORA).error, 'nombres');
});

test('visor: ?a=Neo,Trinity filtra a esas 2 fichas en ese orden y no inventa ninguna', () => {
  const v = vista([], 0, { grupo: 6 });
  assert.deepEqual(filtrarAgentes(v, ['Trinity', 'neo']).fichas.map((f) => f.sesion), ['trinity', 'neo']);
  assert.deepEqual(filtrarAgentes(v, ['Oraculo', 'Merovingio']).fichas.map((f) => f.sesion), ['oraculo', 'merovingio']);
  assert.deepEqual(filtrarAgentes(v, ['Cypher']).fichas, []);
  assert.equal(filtrarAgentes(v, []).fichas.length, v.fichas.length);
  const html = readFileSync('visor/index.html', 'utf8');
  assert.match(html, /\.g2 #rejilla \{ grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; \}/);
  assert.match(readFileSync('functions/api/visor/pane.js', 'utf8'), /filtrarAgentes\(vista\(docs, ahora, \{ grupo \}\), a\)/);
});

test('móvil: la orden del 2 con selector lleva solo 2 nombres válidos', () => {
  assert.deepEqual(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 2, agentes: ['Neo', 'Oráculo'] }).orden.agentes, ['Neo', 'Oraculo']);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 2, agentes: ['Neo'] }).ok, false);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 2, agentes: ['Neo', 'https://x'] }).ok, false);
  assert.equal(normalizarOrden({ dispositivo: 'fold', accion: 'terminal', grid: 2 }).orden.agentes, undefined);
  assert.match(readFileSync('interface/index.html', 'utf8'), /GRID4 \+ "\?a=" \+ o\.agentes\.join/);
});

test('run: Mac con selector → aviso sin enviar nada; ayuda y ficha del verbo lo cuentan', () => {
  const dichos = [];
  assert.equal(I.run('/interface 2 claude mbp16', (t) => dichos.push(t)), true);
  assert.match(dichos[0], /aquí o en Fold\/Iphone|here or on Fold\/Iphone/);
  assert.match(I.ayuda(), /2 claude\|codex\|grok/);
  assert.match(I.ayuda(), /2 Neo Trinity/);
  assert.match(readFileSync('assets/interface-cli.js', 'utf8'), /args: '\[terminal\] 4\|2\|6 \[dispositivo\] · 2 claude\|codex\|grok · 2 <agente> <agente>/);
  assert.match(readFileSync('app.flt-100529.js', 'utf8'), /\/interface 2 claude\|codex\|grok · \/interface 2 Neo Trinity/);
});

test('run: error del selector sugiere, y la consulta se hace contra /api/visor/seleccion sin abrir panel', async () => {
  const dichos = [];
  I.run('/interface 2 Neo Trinty', (t) => dichos.push(t));
  assert.match(dichos[0], /Trinity/); // ¿Quisiste decir trinity?
  const prev = globalThis.fetch; let pedido = '';
  globalThis.fetch = async (u) => { pedido = u; return { json: async () => S.elegir({ modelo: 'grok' }, PRES, AHORA) }; };
  try {
    const out = [];
    await I.conSeleccion(I.parse('/interface 2 grok'), (t) => out.push(t));
    assert.equal(pedido, '/api/visor/seleccion?modelo=grok');
    assert.match(out.at(-1), /^⚠️ Solo hay 1 agente vivo con grok \(Smith\).*no abro un panel vacío.*prueba: \/interface 2 claude/);
  } finally { globalThis.fetch = prev; }
});
