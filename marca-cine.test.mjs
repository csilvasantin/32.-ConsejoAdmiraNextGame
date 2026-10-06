// Pieles de cine 81–89 en admira.live (FLT-101666 c).
// · /81 … /89 en la línea de órdenes = /marca 81 … /marca 89, en app.js y en la copia servida.
// · Bloques [data-mb-marca="81"] … "89" en assets/marca-blanca.css (y su ?v= en marca-blanca.js).
// · Contraste: >= 4.5:1 en general (tokens --mbx-* que calcula marca-blanca.js) y >= 7:1 en la
//   línea de órdenes SCUMM (texto y texto suave sobre el fondo y la superficie de la marca).
// · Palabras prohibidas: la misma lista que admira-next-web/test/marca-cine.test.mjs.
// Las paletas vienen de marca-cine.fixture.json, copia del catálogo único de admiranext.com.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const leer = f => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const FIX = JSON.parse(leer('marca-cine.fixture.json'));
const IDS = ['81', '82', '83', '84', '85', '86', '87', '88', '89'];
const PROHIBIDO = new RegExp(FIX.prohibidas.join('|'), 'i');
const MB = (() => {
  const module = { exports: {} };
  vm.runInNewContext(leer('assets/marca-blanca.js'), { module, URLSearchParams, URL });
  return module.exports;
})();
const APP = leer('app.js');
const SERVIDA = leer('app.flt-100529.js');
const CSS = leer('assets/marca-blanca.css');
const kebab = k => k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const vars = paleta => Object.fromEntries(Object.entries(paleta).map(([k, v]) => ['--mb-' + kebab(k), v]));
const r2 = x => Math.round(x * 100) / 100;

test('fixture: las nueve pieles y la lista de palabras prohibidas de admiranext', () => {
  assert.deepEqual(Object.keys(FIX.pieles), IDS);
  assert.ok(FIX.prohibidas.length > 50);
  for (const id of IDS) for (const modo of ['claro', 'oscuro']) {
    const p = FIX.pieles[id].colores[modo];
    for (const k of ['primario', 'primarioTexto', 'fondo', 'superficie', 'superficieAlt', 'texto', 'textoSuave'])
      assert.ok(MB.parseColor(p[k]), `${id}/${modo}: falta ${k}`);
  }
});

test('la lista prohibida atrapa títulos y personajes, y deja pasar lo nuestro', () => {
  for (const malo of ['Terminator', 'Back to the Future', 'DeLorean', 'Top Gun', 'RoboCop', 'Roger Rabbit', 'Batman', 'Gotham', 'Indiana Jones', 'Blade Runner', 'E.T.'])
    assert.match(malo, PROHIBIDO, malo);
  for (const bueno of ['Cine 84', 'piel de cine', 'neón bajo la lluvia', 'gótico nocturno'])
    assert.doesNotMatch(bueno, PROHIBIDO, bueno);
});

test('/81 … /89: atajos de /marca en el intérprete, autocompletado y /help (app.js ≡ copia servida)', () => {
  assert.equal(APP, SERVIDA, 'app.js y app.flt-100529.js deben ser idénticos');
  const lista = SERVIDA.match(/const CLI_COMMANDS = \[([\s\S]*?)\];/)[1];
  for (const id of IDS) assert.ok(lista.includes(`'/${id}'`), `falta '/${id}' en CLI_COMMANDS`);
  assert.match(SERVIDA, /const pielCine = text\.match\(\/\^\\\/\(8\[1-9\]\)\$\/\);/);
  assert.match(SERVIDA, /runMarcaCommand\(pielCine\[1\]\)/);
  const re = /^\/(8[1-9])$/;
  for (const id of IDS) assert.equal(('/' + id).match(re)[1], id);
  for (const no of ['/80', '/90', '/8', '/811', '/84 x', '84']) assert.equal(no.match(re), null, no);
  const ayuda = SERVIDA.slice(SERVIDA.indexOf('function showCliHelp()'), SERVIDA.indexOf('function showAgoraMatrixHelp'));
  assert.ok(ayuda.includes('/81 · /82 · /83 · /84 · /85 · /86 · /87 · /88 · /89'));
  // el script servido es el que index.html carga
  assert.match(leer('index.html'), /<script defer src="app\.flt-100529\.js\?v=20261006-r19-bilingue"><\/script>/);
});

test('marca-blanca.css: un bloque por piel 81–89 y versión nueva en marca-blanca.js e index.html', () => {
  for (const id of IDS) {
    assert.ok(CSS.includes(`:root[data-mb-marca="${id}"] body{`), `falta el fondo de ${id}`);
    assert.ok(CSS.includes(`:root[data-mb-marca="${id}"] .top-bar{`), `falta la barra de ${id}`);
    assert.ok(CSS.includes(`[data-mb-marca="${id}"]`));
  }
  assert.ok(CSS.includes('.scumm-bar .action-input{color:var(--cine-cli-texto)!important'));
  assert.ok(CSS.includes('.scumm-bar .verb-btn{background:var(--cine-cli-tecla)!important'));
  assert.ok(CSS.includes('--cine-cli-tecla:var(--mb-superficie-alt);'));
  assert.match(leer('assets/marca-blanca.js'), /LOCAL_CSS = '\/assets\/marca-blanca\.css\?v=06\.10\.2026\.r20-escenas'/);
  assert.match(leer('index.html'), /src="\/assets\/marca-blanca\.js\?v=06\.10\.2026\.r20-escenas"/);
  // estética propia: sin imágenes externas en los bloques de cine
  const cine = CSS.slice(CSS.indexOf('Pieles de cine 81–89'));
  assert.doesNotMatch(cine, /url\(/);
});

test('sin títulos ni personajes en lo que admira.live añade (CSS, atajos y fixture)', () => {
  const cine = CSS.slice(CSS.indexOf('Pieles de cine 81–89'));
  assert.doesNotMatch(cine, PROHIBIDO);
  const ayuda = SERVIDA.slice(SERVIDA.indexOf("li('<strong>/81"), SERVIDA.indexOf("li('<strong>⌘ EXPERTO"));
  assert.doesNotMatch(ayuda, PROHIBIDO);
  for (const id of IDS) {
    const { nombre, sector } = FIX.pieles[id];
    assert.doesNotMatch(nombre + ' ' + sector, PROHIBIDO, id);
  }
});

const medidas = {};
test('contraste general >= 4.5:1 (tokens --mbx-* de marca-blanca.js, claro y oscuro)', () => {
  for (const id of IDS) for (const modo of ['claro', 'oscuro']) {
    const p = FIX.pieles[id].colores[modo];
    const t = MB.shellTokens(vars(p), modo);
    const fondos = [p.fondo, p.superficie, p.superficieAlt];
    const m = {};
    for (const k of ['--mbx-ink', '--mbx-mut', '--mbx-brand', '--mbx-accent'])
      m[k] = Math.min(...fondos.map(f => MB.contrast(t[k], f)));
    m['on-brand'] = MB.contrast(t['--mbx-on-brand'], t['--mbx-brand']);
    m['primarioTexto/primario'] = MB.contrast(p.primarioTexto, p.primario);
    for (const [k, v] of Object.entries(m)) assert.ok(v >= 4.5, `${id}/${modo} ${k} = ${r2(v)}`);
    // la marca de verdad: el primario de la piel, no un sustituto
    if (modo === FIX.pieles[id].modo) assert.equal(t['--mbx-brand'].toLowerCase(), p.primario.toLowerCase(), `${id}: --mbx-brand`);
    medidas[id + '/' + modo] = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, r2(v)]));
  }
});

test('línea de órdenes SCUMM >= 7:1 (texto y texto suave sobre fondo, superficie y teclas de verbo)', () => {
  for (const id of IDS) for (const modo of ['claro', 'oscuro']) {
    const p = FIX.pieles[id].colores[modo];
    const pares = {
      'texto/fondo': [p.texto, p.fondo], 'texto/superficie': [p.texto, p.superficie],
      'suave/fondo': [p.textoSuave, p.fondo], 'suave/superficie': [p.textoSuave, p.superficie],
      'verbos texto/superficieAlt': [p.texto, p.superficieAlt], 'flecha suave/superficieAlt': [p.textoSuave, p.superficieAlt],
    };
    for (const [k, [fg, bg]] of Object.entries(pares)) {
      const c = MB.contrast(fg, bg);
      assert.ok(c >= 7, `${id}/${modo} ${k} = ${r2(c)}`);
      (medidas[id + '/' + modo] ||= {})['cli ' + k] = r2(c);
    }
  }
  if (process.env.MARCA_CINE_INFORME) console.log(JSON.stringify(medidas));
});
