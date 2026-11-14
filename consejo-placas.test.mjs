// Carlos 23:39: placas de los Coetáneos ocultas por defecto; «/consejeros placas» alterna placas ↔ objetos.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(readFileSync(new URL('./assets/consejo-cabecera.js', import.meta.url), 'utf8'), ctx);
const lib = ctx.CouncilCabeceraLib;
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; };

test('placas: ocultas por defecto, el comando alterna y persiste', () => {
  const st = mem(); const e = lib.crearEstadoPlacas(st);
  assert.equal(e.get(), false);
  assert.equal(lib.arte(e.get(), 'x'), 'assets/council-coetaneos.jpg?v=x');
  let r = lib.comandoPlacas('/consejeros placas', e);
  assert.equal(r.ok, true); assert.equal(r.visibles, true); assert.equal(st.m[lib.KEY_PLACAS], '1');
  assert.equal(lib.arte(e.get(), 'x'), 'assets/council-coetaneos-placas.jpg?v=x');
  assert.equal(lib.crearEstadoPlacas(st).get(), true, 'persiste en localStorage');
  r = lib.comandoPlacas('/consejeros placas', e); assert.equal(r.visibles, false); assert.equal(st.m[lib.KEY_PLACAS], undefined);
  assert.equal(lib.comandoPlacas('/consejero placas on', e).visibles, true);
  assert.equal(lib.comandoPlacas('/advisors plates off', e).visibles, false);
  assert.equal(lib.comandoPlacas('/consejeros placas quizá', e).ok, false);
  assert.equal(lib.comandoPlacas('/consejeros todos', e), null, 'no pisa /consejero');
  assert.equal(lib.comandoPlacas('/consejero jobs', e), null);
});

test('placas: los dos artes existen y Bonomi lleva su maqueta de Ferrari Land', async () => {
  for (const f of Object.values(lib.ARTE)) assert.ok(existsSync(new URL('./' + f, import.meta.url)), f);
  const o = lib.CABECERAS['carlo-bonomi'].objeto;
  assert.ok(o && existsSync(new URL('.' + o.foto.split('?')[0], import.meta.url)));
  const { CABECERAS } = await import('./escena0-guion.mjs');
  assert.deepEqual(JSON.parse(JSON.stringify(CABECERAS['carlo-bonomi'].objeto)), JSON.parse(JSON.stringify(o)), 'home y escena0 ponen la maqueta en el mismo sitio');
});

test('placas: la CLI y el chat de Conversación atienden /consejeros placas, y la ayuda lo cuenta', () => {
  for (const f of ['app.js', 'app.flt-100529.js']) {
    const s = readFileSync(new URL('./' + f, import.meta.url), 'utf8');
    assert.match(s, /CouncilCabecera\.comandoPlacas\(text\)/, f);
    assert.match(s, /\/consejeros placas \[on \| off\]/, f + ' /help');
    assert.match(s, /arteCoetaneos\(\)/, f);
  }
  assert.match(readFileSync(new URL('./council-integration.js', import.meta.url), 'utf8'), /comandoPlacas\(raw\)/);
  assert.match(readFileSync(new URL('./council-speech.js', import.meta.url), 'utf8'), /council-coetaneos\[\.-\]/);
});
