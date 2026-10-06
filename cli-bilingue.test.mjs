// Verbos bilingües en admira.live (Carlos, 06-10-2026 10:58) y línea de órdenes del EXPERTO de
// Yokup visible sin PTY (Carlos, 11:01). assets/cli-bilingue.js, app.flt-100529.js, yk-frame.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const leer = f => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const plano = x => JSON.parse(JSON.stringify(x));
function cargarB(extra = {}) {
  const sb = { module: { exports: {} }, ...extra };
  sb.globalThis = sb;
  vm.runInNewContext(leer('assets/cli-bilingue.js'), sb);
  return sb.module.exports;
}
const B = cargarB();
const APP = leer('app.flt-100529.js');
const YK = leer('yk-frame.js');
const CONOCIDOS = [...APP.match(/const CLI_COMMANDS = \[([\s\S]*?)\];/)[1].matchAll(/'(\/[^']+)'/g)].map(m => m[1]);

test('/marca = /brand y las formas compactas; el idioma del verbo', () => {
  const casos = {
    '/brand84': ['/marca 84', 'en'], '/marca84': ['/marca 84', 'es'],
    '/brand 84': ['/marca 84', 'en'], '/marca 84': ['/marca 84', 'es'],
    '/marcaoff': ['/marca off', 'es'], '/brandoff': ['/marca off', 'en'],
    '/marca off': ['/marca off', 'es'], '/brand off': ['/marca off', 'en'],
    '/brand list': ['/marca lista', 'en'], '/BRAND85': ['/marca 85', 'en'],
  };
  for (const [t, [texto, idioma]] of Object.entries(casos)) {
    const n = B.normalizar(t, CONOCIDOS);
    assert.equal(n.texto, texto, t); assert.equal(n.idioma, idioma, t);
  }
});

test('lo que no se toca: atajos /NN, verbos iguales en los dos idiomas, /marcador, /marcablanca, /idioma, texto libre', () => {
  for (const t of ['/84', '/menu on', '/mac', '/google', '/idioma ENG', '/language', '/marcablanca 84']) {
    const n = B.normalizar(t, CONOCIDOS);
    assert.equal(n.idioma, null, t); assert.equal(n.texto, t, t);
  }
  assert.equal(B.normalizar('/marcador', CONOCIDOS).texto, '/marcador');
  assert.equal(B.normalizar('/scoreboard', CONOCIDOS).texto, '/marcador');
  assert.equal(B.normalizar('/task all hands', CONOCIDOS).texto, '/tarea all hands', 'el texto libre no se traduce');
  assert.equal(B.normalizar('/forget all', CONOCIDOS).texto, '/olvidar todo');
});

test('cada pareja ES/EN: el castellano pone castellano y el inglés inglés; las dos llevan al mismo verbo', () => {
  for (const [es, en, canon] of B.PARES) {
    assert.deepEqual(plano(B.normalizar('/' + es, CONOCIDOS)).idioma, 'es', es);
    assert.deepEqual(plano(B.normalizar('/' + en, CONOCIDOS)).idioma, 'en', en);
    assert.equal(B.normalizar('/' + es, CONOCIDOS).verbo, canon);
    assert.equal(B.normalizar('/' + en, CONOCIDOS).verbo, canon);
    // el intérprete SCUMM entiende el verbo canónico
    const huella = { coetaneos: 'coet[a', recorte: 'recort(e|ar)', recortar: 'recort(e|ar)', sites: 'sites?' }[canon] || canon;
    assert.ok(APP.slice(APP.indexOf('function handleCliCommandBase')).includes(huella), canon);
  }
});

test('ponerIdioma usa AdmiraIdioma (/idioma ENG|ESP) y no repite si ya está', () => {
  const llamadas = [];
  let actual = 'es';
  const B2 = cargarB({ AdmiraIdioma: { lang: () => actual, run: (t) => { llamadas.push(t); actual = /ENG/.test(t) ? 'en' : 'es'; return { ok: true, message: t }; } } });
  B2.ponerIdioma('en'); B2.ponerIdioma('en'); B2.ponerIdioma('es');
  assert.deepEqual(llamadas, ['/idioma ENG', '/idioma ESP']);
});

test('SCUMM: handleCliCommand normaliza, cambia el idioma y llama al intérprete; los botones no cambian el idioma', () => {
  assert.equal(leer('app.js'), APP, 'app.js ≡ app.flt-100529.js');
  assert.match(APP, /const n = B \? B\.normalizar\(String\(raw \|\| ''\)\.trim\(\), CLI_COMMANDS\) : null;\n\s*if \(n && n\.idioma\) B\.ponerIdioma\(n\.idioma\);\n\s*return handleCliCommandBase\(n \? n\.texto : raw\);/);
  assert.match(APP, /handleCliCommandBase\("\/" \+ button\.dataset\.councilGeneration\)/);
  for (const [es, en] of B.PARES) {
    assert.ok(CONOCIDOS.includes('/' + en) || CONOCIDOS.includes('/' + en.replace(/s$/, '')) || ['sites', 'help'].includes(en), 'autocompletado: /' + en);
    assert.ok(CONOCIDOS.includes('/' + es) || ['coetaneos', 'oraculo', 'importar', 'diario', 'tarea', 'finalizada', 'olvidar', 'motor', 'bocas', 'nombres', 'agentes', 'tareas', 'verbos'].includes(es), 'autocompletado: /' + es);
  }
  assert.match(leer('index.html'), /<script defer src="\/assets\/cli-bilingue\.js\?v=20261006-r19-bilingue"><\/script>\n<script defer src="app\.flt-100529\.js\?v=20261006-r19-bilingue"><\/script>/);
});

test('EXPERTO de Yokup: línea de órdenes arriba, activa sin PTY', () => {
  assert.match(YK, /slotB\.appendChild\(buildExpertCommand\(\)\);\n\s*slotB\.appendChild\(buildCliConsole\(\)\);/);
  const fn = YK.slice(YK.indexOf('function buildExpertCommand()'), YK.indexOf('window.YkExpertCommand'));
  assert.doesNotMatch(fn, /disabled/);
  assert.match(fn, /placeholder", "\/ayuda · \/help · \/idioma ENG · \/language ESP · \/marca 84 · \/brand84"/);
  assert.match(leer('yk-frame.css'), /\.yk-expert-cmd\{/);
  for (const f of ['dashboard.html', 'misiones.html']) assert.match(leer(f), /yk-frame\.js\?v=r35-cmd/, f);
});

test('EXPERTO de Yokup: /language ENG, /brand84, /marcaoff y /ayuda funcionan con los módulos compartidos', async () => {
  const code = YK.slice(YK.indexOf('  var EXPERT_CMD_V'), YK.indexOf('  function buildExpertCommand()'));
  const llamadas = [];
  let lang = 'es';
  const documentElement = { get lang() { return lang; } };
  const win = {};
  const AdmiraIdioma = { lang: () => lang, run: (t) => { llamadas.push(['idioma', t]); const m = /(ENG|ESP)\s*$/.exec(t); lang = m ? (m[1] === 'ENG' ? 'en' : 'es') : (lang === 'en' ? 'es' : 'en'); return { ok: true, message: 'lang ' + lang }; } };
  const AdmiraMarca = { parseArg: (a) => !a ? { kind: 'status' } : /^off$/i.test(a) ? { kind: 'off' } : { kind: 'id', id: a.toLowerCase() }, actual: () => null, desactivar: () => llamadas.push(['off']), listar: async () => [], activar: async (id) => { llamadas.push(['activar', id]); return { ok: true, id, nombre: 'Cine ' + id }; } };
  Object.assign(win, { AdmiraIdioma, AdmiraMarca, AdmiraCliBilingue: cargarB({ AdmiraIdioma }) });
  const sb = { window: win, document: { documentElement }, Promise };
  vm.runInNewContext(code + '\nthis.expertCommand = expertCommand;', sb);
  const dichos = [];
  const say = (m) => dichos.push(m);
  await sb.expertCommand('/language ENG', say);
  assert.equal(lang, 'en');
  await sb.expertCommand('/marca84', say);
  assert.deepEqual(llamadas.at(-1), ['activar', '84']); assert.equal(lang, 'es');
  await sb.expertCommand('/brand84', say);
  assert.deepEqual(llamadas.at(-1), ['activar', '84']); assert.equal(lang, 'en');
  await sb.expertCommand('/84', say);
  assert.equal(lang, 'en', '/84 no toca el idioma');
  await sb.expertCommand('/marcaoff', say);
  assert.deepEqual(llamadas.at(-1), ['off']); assert.equal(lang, 'es');
  await sb.expertCommand('/help', say);
  assert.equal(lang, 'en'); assert.match(dichos.at(-1), /Commands:/);
  await sb.expertCommand('/foo', say);
  assert.match(dichos.at(-1), /Unknown command/);
});
