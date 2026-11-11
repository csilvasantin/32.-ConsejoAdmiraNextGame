import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Entorno de navegador mínimo: síntesis falsa con voces de serie de macOS/Edge/Chrome.
const spoken = [];
let store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
globalThis.speechSynthesis = {
  getVoices: () => [], cancel() {},
  speak(u) { spoken.push(u); setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend(); }, 0); },
};
await import('./consejeros-voces.js');
const V = globalThis.AdmiraVoces;
const v = (name, lang, uri) => ({ name, lang, voiceURI: uri || name, localService: true });
const MAC = [v('Jorge', 'es-ES'), v('Mónica', 'es-ES'), v('Juan', 'es-MX'), v('Paulina', 'es-MX'), v('Diego', 'es-AR'),
  v('Eddy (Español (España))', 'es-ES'), v('Reed (Español (España))', 'es-ES'), v('Rocko (Español (España))', 'es-ES'),
  v('Grandpa (Español (España))', 'es-ES'), v('Shelley (Español (España))', 'es-ES'), v('Sandy (Español (España))', 'es-ES'),
  v('Samantha', 'en-US')];

test('casting: los 16 consejeros del Consejo, una entrada cada uno', () => {
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const personas = [...app.matchAll(/persona: "([^"]+)",\s+side:/g)].map(m => m[1]);
  assert.equal(personas.length, 16);
  assert.deepEqual(V.CASTING.map(c => c.persona).sort(), [...personas].sort());
  for (const c of V.CASTING) {
    assert.match(c.lang, /^es-ES$/);
    assert.ok(c.rate >= 0.8 && c.rate <= 1.2, c.persona);
    assert.ok(c.pitch >= 0.7 && c.pitch <= 1.2, c.persona);
    assert.ok(c.prefer.length >= 3 && c.timbre && c.frase, c.persona);
  }
  assert.equal(V.casting('Gwynne Shotwell').genero, 'f');
  assert.equal(V.casting('ruth-porat').genero, 'f');
});

test('ritmo y tono: no hay dos consejeros con el mismo par', () => {
  const pares = new Set(V.CASTING.map(c => c.rate + '/' + c.pitch));
  assert.equal(pares.size, 16);
});

test('en un Mac con las voces de serie, cada consejero suena con una de sus voces preferidas, repartidas', () => {
  V._setVoicesForTest(MAC);
  const perf = V.CASTING.map(c => V.profile(c.persona));
  for (const p of perf) assert.equal(p.via, 'casting', p.persona);
  // las 9 voces españolas de un Mac de serie se usan todas
  assert.equal(new Set(perf.map(p => p.voiceName)).size, 9);
  assert.equal(V.profile('Walt Disney').voiceName, 'Grandpa (Español (España))');
  assert.equal(V.profile('George Lucas').voiceName, 'Rocko (Español (España))');
  assert.equal(V.profile('Gwynne Shotwell').voiceName, 'Mónica');
  assert.equal(V.profile('Steve Jobs').voiceName, 'Jorge');
  const usos = {}; for (const p of perf) usos[p.voiceName] = (usos[p.voiceName] || 0) + 1;
  assert.ok(Math.max(...Object.values(usos)) <= 3, JSON.stringify(usos));
  // las mujeres nunca caen en voz masculina conocida
  for (const n of ['Gwynne Shotwell', 'Ruth Porat']) assert.equal(V.generoDe(V.profile(n).voice), 'f', n);
  // nunca una voz que no sea española si hay españolas
  for (const p of perf) assert.match(p.lang, /^es/);
});

test('respaldo: con solo dos voces españolas, se reparten por género y no se queda nadie sin voz', () => {
  V._setVoicesForTest([v('Google español', 'es-ES'), v('Spanish (Spain)', 'es'), v('Google US English', 'en-US')]);
  for (const c of V.CASTING) assert.ok(V.profile(c.persona).voice, c.persona);
  assert.equal(V.profile('Ruth Porat').voiceName, 'Google español');
  V._setVoicesForTest([]);
  assert.equal(V.profile('Steve Jobs').voice, null);
  assert.equal(V.profile('Steve Jobs').lang, 'es-ES');
});

test('personalización local: pisa al casting y se puede deshacer', () => {
  V._setVoicesForTest(MAC);
  V.setOverride('Steve Jobs', { voice: 'Juan', rate: 1.3, pitch: 5 });
  let p = V.profile('Steve Jobs');
  assert.equal(p.voiceName, 'Juan'); assert.equal(p.via, 'personalizada');
  assert.equal(p.rate, 1.3); assert.equal(p.pitch, 2, 'tono acotado a 2');
  assert.ok(p.custom);
  V.setOverride('Steve Jobs', { voice: 'No existe aquí' });
  assert.notEqual(V.profile('Steve Jobs').voiceName, 'No existe aquí');
  V.resetOverride('Steve Jobs');
  p = V.profile('Steve Jobs');
  assert.equal(p.custom, false); assert.equal(p.rate, 0.92);
});

test('guardar para el equipo: solo cambia «voices» y conserva agentes, máquinas y tablero', async () => {
  let posted = null;
  const doc = { agents: { trinity: { img: 'x' } }, machines: {}, board: { density: 'compacta' } };
  const fakeFetch = async (url, opts) => {
    assert.equal(url, 'https://api.yokup.com/prefs/customize');
    if (opts && opts.method === 'POST') { posted = JSON.parse(opts.body); return { json: async () => ({ ok: true }) }; }
    return { json: async () => ({ ok: true, customize: JSON.parse(JSON.stringify(doc)) }) };
  };
  await V.saveShared({ 'walt-disney': { voice: 'Rocko (Español (España))', pitch: 0.9 }, 'nadie': { rate: 1 } }, fakeFetch);
  assert.deepEqual(posted.customize.agents, doc.agents);
  assert.deepEqual(posted.customize.board, doc.board);
  assert.deepEqual(posted.customize.voices, { 'walt-disney': { voice: 'Rocko (Español (España))', pitch: 0.9 } });
  assert.equal(V.profile('Walt Disney').voiceName, 'Rocko (Español (España))');
  await assert.rejects(V.saveShared({}, async () => ({ json: async () => ({ ok: false }) })));
  await V.saveShared({}, fakeFetch);
});

test('locución: trozos cortos por frases, con la voz, el ritmo y el tono del consejero', async () => {
  V._setVoicesForTest(MAC);
  spoken.length = 0;
  const largo = 'Primera frase corta. ' + 'palabra '.repeat(60) + 'final.';
  for (const t of V.chunks(largo)) assert.ok(t.length <= 220);
  await new Promise(res => V.speak('George Lucas', largo, { onend: res }));
  assert.ok(spoken.length >= 2);
  for (const u of spoken) { assert.equal(u.voice.name, 'Rocko (Español (España))'); assert.equal(u.rate, 0.9); assert.equal(u.pitch, 0.78); }
  assert.equal(V.speak('Nadie Conocido', 'hola'), false);
  assert.equal(V.speak('Steve Jobs', '   '), false);
});

test('portada: muda por defecto; las páginas cargan el módulo', () => {
  assert.equal(V.portadaOn(), false);
  V.setPortada(true); assert.equal(V.portadaOn(), true); V.setPortada(false);
  const leer = f => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  for (const f of ['index.html', 'reunion.html', 'consejero.html', 'voces/index.html'])
    assert.match(leer(f), /consejeros-voces\.js/, f);
  assert.match(leer('council-integration.js'), /V\.portadaOn\(\)/);
  assert.match(leer('reunion.html'), /AdmiraVoces\.speak\(c\.persona/);
});
