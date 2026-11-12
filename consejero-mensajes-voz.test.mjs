import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('./consejeros-voces.js');
await import('./assets/consejero-mensajes.js');
const AdmiraVoces = globalThis.AdmiraVoces;
const voces = globalThis.AdmiraEntreVoces;

function store() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

const jobsElon = [
  { id: 'a1', de: 'Musk', para: 'Jobs', texto: 'Hola Jobs, soy Elon.', hora: '2026-11-12T09:00:00Z' },
  { id: 'a2', de: 'Jobs', para: 'Musk', texto: 'Hola Elon.', hora: '2026-11-12T09:01:00Z' },
];

test('textoDe usa el cuerpo completo y, si falta, el resumen', () => {
  assert.equal(voces.textoDe({ texto: 'cuerpo largo', resumen: 'corto' }), 'cuerpo largo');
  assert.equal(voces.textoDe({ texto: '   ', resumen: 'solo resumen' }), 'solo resumen');
  assert.equal(voces.textoDe({ resumen: 'solo resumen' }), 'solo resumen');
  assert.equal(voces.textoDe({ texto: '', resumen: '' }), '');
  assert.equal(voces.textoDe({}), '');
});

test('idDe prefiere el id y, si no hay, arma uno estable', () => {
  assert.equal(voces.idDe({ id: 'cm1', de: 'Musk', texto: 'hola' }), 'cm1');
  const a = voces.idDe({ de: 'Musk', para: 'Jobs', hora: 't', texto: 'hola' });
  const b = voces.idDe({ de: 'Musk', para: 'Jobs', hora: 't', texto: 'hola' });
  assert.equal(a, b);
  assert.ok(a.length > 0);
});

test('primera carga marca los existentes y no los devuelve para locutar', () => {
  const ls = store();
  assert.deepEqual(voces.iniciarOidos('Jobs', jobsElon, ls), []);
  assert.deepEqual(voces.noOidos('Jobs', jobsElon, ls).map((m) => m.id), []);
  assert.deepEqual(voces.pendientesDeLocutar('Jobs', jobsElon, ls), []);
});

test('un mensaje nuevo entrante de Elon a Jobs se locuta con Elon Musk y no se relée', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', jobsElon, ls);
  const nuevo = { id: 'a3', de: 'Musk', para: 'Jobs', texto: '¿Arrancamos la sala?', hora: '2026-11-12T09:05:00Z' };
  const pend = voces.pendientesDeLocutar('Jobs', jobsElon.concat(nuevo), ls);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].persona, 'Elon Musk');
  assert.equal(pend[0].texto, '¿Arrancamos la sala?');
  assert.deepEqual(voces.pendientesDeLocutar('Jobs', jobsElon.concat(nuevo), ls), []);
});

test('en la página de Musk, un mensaje nuevo de Jobs se locuta con Steve Jobs', () => {
  const ls = store();
  voces.iniciarOidos('Musk', jobsElon, ls);
  const nuevo = { id: 'b1', de: 'Jobs', para: 'Musk', texto: 'Menos ruido, más foco.' };
  const pend = voces.pendientesDeLocutar('Musk', jobsElon.concat(nuevo), ls);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].persona, 'Steve Jobs');
  assert.equal(pend[0].texto, 'Menos ruido, más foco.');
});

test('no locuta los mensajes propios ni los de agentes, aunque sean nuevos', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', [], ls);
  const propios = { id: 'p1', de: 'Jobs', para: 'Musk', texto: 'lo digo yo' };
  const agente = { id: 'ag1', de: 'Neo', para: 'Jobs', de_tipo: 'agente', texto: 'aviso de Neo' };
  assert.deepEqual(voces.pendientesDeLocutar('Jobs', [propios, agente], ls), []);
  // quedan oídos para no relolerlos si más tarde cambiara el criterio
  assert.deepEqual(voces.noOidos('Jobs', [propios, agente], ls), []);
});

test('si solo llega resumen, ese es el texto que se oye', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', [], ls);
  const pend = voces.pendientesDeLocutar('Jobs', [{ id: 'r1', de: 'Musk', para: 'Jobs', resumen: 'te resumo' }], ls);
  assert.equal(pend[0].texto, 'te resumo');
});

test('los oídos de Jobs y Musk no se pisan en el mismo navegador', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', jobsElon, ls);
  voces.iniciarOidos('Musk', jobsElon, ls);
  const nuevo = { id: 'x1', de: 'Jobs', para: 'Musk', texto: 'nuevo para Elon' };
  const pend = voces.pendientesDeLocutar('Musk', jobsElon.concat(nuevo), ls);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].id, 'x1');
  assert.equal(voces.pendientesDeLocutar('Jobs', jobsElon.concat(nuevo), ls).length, 0);
});

test('casting publicado: Jobs = Jorge grave/lento, Elon = Reed rápido/agudo (sin cambiar el resto)', () => {
  const v = (name, lang) => ({ name, lang, voiceURI: name, localService: true });
  AdmiraVoces._setVoicesForTest([
    v('Jorge', 'es-ES'), v('Reed (Español (España))', 'es-ES'),
    v('Pablo', 'es-ES'), v('Juan', 'es-ES'),
  ]);
  const J = AdmiraVoces.casting('Steve Jobs');
  const E = AdmiraVoces.casting('Elon Musk');
  assert.equal(J.prefer[0], 'Jorge');
  assert.equal(J.rate, 0.88);
  assert.equal(J.pitch, 0.75);
  assert.equal(E.prefer[0], 'Reed');
  assert.equal(E.rate, 1.2);
  assert.equal(E.pitch, 1.3);
  assert.equal(AdmiraVoces.profile('Steve Jobs').voiceName, 'Jorge');
  assert.equal(AdmiraVoces.profile('Elon Musk').voiceName, 'Reed (Español (España))');
});

test('las páginas de Jobs y Elon cargan consejeros-voces.js y la nueva versión de consejero-mensajes.js', () => {
  for (const who of ['jobs', 'musk']) {
    const html = readFileSync(new URL('./chat/' + who + '/index.html', import.meta.url), 'utf8');
    assert.match(html, /consejeros-voces\.js\?v=20261112-voz-entre/);
    assert.match(html, /consejero-mensajes\.js\?v=20261112-voz-entre/);
    const iVoces = html.indexOf('consejeros-voces.js');
    const iMsg = html.indexOf('consejero-mensajes.js');
    assert.ok(iVoces >= 0 && iVoces < iMsg, who + ': voces antes de mensajes');
  }
  const js = readFileSync(new URL('./assets/consejero-mensajes.js', import.meta.url), 'utf8');
  assert.match(js, /Activar voz/);
  assert.match(js, /AdmiraVoces\.speak/);
});
