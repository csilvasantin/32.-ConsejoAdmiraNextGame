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
    assert.ok(c.rate >= 0.8 && c.rate <= 1.25, c.persona);
    assert.ok(c.pitch >= 0.7 && c.pitch <= 1.35, c.persona);
    assert.ok(c.prefer.length >= 3 && c.timbre && c.frase, c.persona);
  }
  assert.equal(V.casting('Mira Murati').genero, 'f');
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
  // se usan las voces españolas de un Mac de serie (Jobs femenina suma una más que cuando era Jorge)
  const nVoces = new Set(perf.map(p => p.voiceName)).size;
  assert.ok(nVoces >= 9 && nVoces <= 11, 'voces distintas: ' + nVoces);
  assert.equal(V.profile('Walt Disney').voiceName, 'Grandpa (Español (España))');
  assert.equal(V.profile('George Lucas').voiceName, 'Rocko (Español (España))');
  assert.equal(V.profile('Steve Jobs').voiceName, 'Mónica');
  assert.equal(V.generoDe(V.profile('Steve Jobs').voice), 'f');
  assert.notEqual(V.profile('Mira Murati').voiceName, 'Mónica', 'Murati cede Mónica a Jobs (prioridad 1)');
  const usos = {}; for (const p of perf) usos[p.voiceName] = (usos[p.voiceName] || 0) + 1;
  assert.ok(Math.max(...Object.values(usos)) <= 4, JSON.stringify(usos));
  // las mujeres nunca caen en voz masculina conocida
  for (const n of ['Steve Jobs', 'Mira Murati', 'Ruth Porat']) assert.equal(V.generoDe(V.profile(n).voice), 'f', n);
  // nunca una voz que no sea española si hay españolas
  for (const p of perf) assert.match(p.lang, /^es/);
});

test('si no está ninguna voz de su lista, silencio: nunca la voz del sistema', () => {
  V._setVoicesForTest([v('Samantha', 'en-US'), v('Zarvox', 'en-US'), v('Spanish (Spain)', 'es'), v('Microsoft David', 'en-US')]);
  for (const c of V.CASTING) {
    const p = V.profile(c.persona);
    assert.equal(p.voice, null, c.persona);
    assert.equal(p.via, 'sin-voces', c.persona);
  }
  spoken.length = 0;
  assert.equal(V.speak('Steve Jobs', 'Hola desde Jobs'), false);
  assert.equal(V.speak('Elon Musk', 'Hola desde Elon'), false);
  assert.equal(spoken.length, 0, 'no se encola la voz del sistema');
  // Google español no está en la lista de Jobs/Elon: tampoco la usan como «sistema».
  V._setVoicesForTest([v('Google español', 'es-ES'), v('Samantha', 'en-US')]);
  assert.equal(V.profile('Steve Jobs').voice, null);
  assert.equal(V.profile('Elon Musk').voice, null);
  spoken.length = 0;
  assert.equal(V.speak('Steve Jobs', 'Hola'), false);
  assert.equal(spoken.length, 0);
  V._setVoicesForTest([]);
  assert.equal(V.profile('Steve Jobs').voice, null);
  assert.equal(V.profile('Steve Jobs').lang, 'es-ES');
  spoken.length = 0;
  assert.equal(V.speak('Steve Jobs', 'Hola'), false);
  assert.equal(spoken.length, 0);
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
  assert.equal(p.custom, false); assert.equal(p.rate, 0.95);
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
  assert.equal(V.tieneVozAsignada('Steve Jobs'), true);
  assert.equal(V.tieneVozAsignada('Nadie Conocido'), false);
});

test('el módulo cancela la cola al cargar y nunca locuta sin u.voice', () => {
  const src = readFileSync(new URL('./consejeros-voces.js', import.meta.url), 'utf8');
  assert.match(src, /synth\.cancel\(\)/);
  assert.match(src, /sin voz asignada/);
  assert.match(src, /NUNCA la voz por defecto del sistema/);
  assert.ok(!/if \(p\.voice\) u\.voice/.test(src), 'ya no habla sin voz asignada');
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

test('Jobs y Elon: Jobs voz femenina provisional, Elon Reed, nunca la misma voz si hay otra en español', () => {
  const J = V.casting('Steve Jobs'), E = V.casting('Elon Musk');
  assert.equal(J.genero, 'f');
  assert.equal(J.prefer[0], 'Monica');
  assert.ok(!J.prefer.some(x => /eddy/i.test(x)));
  assert.equal(J.rate, 0.95); assert.equal(J.pitch, 1.05);
  assert.ok(E.rate > J.rate && E.pitch > J.pitch);
  assert.ok((E.evita || []).includes('steve-jobs'));
  const escenarios = [
    MAC,
    [v('Jorge', 'es-ES'), v('Juan', 'es-MX')],
    [v('Google español', 'es-ES'), v('Spanish (Spain)', 'es')],
    [v('Microsoft Alvaro Online (Natural) - Spanish (Spain)', 'es-ES'), v('Microsoft Elvira Online (Natural) - Spanish (Spain)', 'es-ES')],
    [v('Rocko (Español (España))', 'es-ES'), v('Mónica', 'es-ES'), v('Paulina', 'es-MX')],
  ];
  for (const lista of escenarios) {
    V._setVoicesForTest(lista);
    const a = V.profile('Steve Jobs'), b = V.profile('Elon Musk');
    if (a.voice && b.voice) {
      assert.notEqual(a.voiceName, b.voiceName, lista.map(x => x.name).join(','));
    }
  }
  // Sin voces de su lista (solo genéricas del sistema): silencio, no se las reparten.
  V._setVoicesForTest([v('Google español', 'es-ES'), v('Spanish (Spain)', 'es')]);
  assert.equal(V.profile('Steve Jobs').voice, null);
  assert.equal(V.profile('Elon Musk').voice, null);
  V._setVoicesForTest(MAC);
  assert.equal(V.profile('Steve Jobs').voiceName, 'Mónica');
  assert.equal(V.profile('Elon Musk').voiceName, 'Reed (Español (España))');
});

test('Chrome en Mac: Jobs voz femenina (Mónica) y nunca Eddy; Elon sigue en Reed', () => {
  const nombres = ['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley'];
  const CHROME = [...nombres.map(n => v(n + ' (español (España))', 'es-ES')), ...nombres.map(n => v(n + ' (español (México))', 'es-MX')),
    v('Mónica', 'es-ES'), v('Paulina', 'es-MX'), v('Google español', 'es-ES'), v('Google español de Estados Unidos', 'es-US')];
  V._setVoicesForTest(CHROME);
  const jobs = V.profile('Steve Jobs'), elon = V.profile('Elon Musk');
  assert.equal(jobs.voiceName, 'Mónica');
  assert.equal(V.generoDe(jobs.voice), 'f');
  assert.doesNotMatch(jobs.voiceName, /Eddy/i);
  assert.notEqual(elon.voiceName, jobs.voiceName);
  assert.equal(elon.voiceName, 'Reed (español (España))');
  assert.equal(jobs.rate, 0.95); assert.equal(jobs.pitch, 1.05);
  // con Jorge instalado, Jobs se queda en Mónica (provisional), no vuelve a Jorge
  V._setVoicesForTest([v('Jorge', 'es-ES'), ...CHROME]);
  assert.equal(V.profile('Steve Jobs').voiceName, 'Mónica');
});

test('Jobs provisional: un Jorge guardado en localStorage o en prefs compartidas no pisa la voz femenina', async () => {
  V._setVoicesForTest(MAC);
  store['admira_voces_v1'] = JSON.stringify({ 'steve-jobs': { voice: 'Jorge', rate: 0.88, pitch: 0.75 } });
  assert.equal(V.profile('Steve Jobs').voiceName, 'Mónica');
  assert.equal(V.profile('Steve Jobs').via, 'casting');
  // una personalización NUEVA (con sello) sí se respeta
  V.setOverride('Steve Jobs', { voice: 'Paulina' });
  assert.equal(V.profile('Steve Jobs').voiceName, 'Paulina');
  assert.equal(V.profile('Steve Jobs').via, 'personalizada');
  const local = JSON.parse(store['admira_voces_v1']);
  assert.equal(local['steve-jobs'].sello, V.JOBS_SELLO);
  V.resetOverride('Steve Jobs');
  assert.equal(V.profile('Steve Jobs').voiceName, 'Mónica');
  // prefs compartidas antiguas (sin sello) tampoco pisan; las de otro consejero siguen
  const fakeFetch = async (url, opts) => ({
    json: async () => ({ ok: true, customize: { voices: { 'steve-jobs': { voice: 'Jorge' }, 'walt-disney': { voice: 'Rocko (Español (España))' } } } })
  });
  await V.loadShared(fakeFetch);
  assert.equal(V.profile('Steve Jobs').voiceName, 'Mónica');
  assert.equal(V.profile('Walt Disney').voiceName, 'Rocko (Español (España))');
});
