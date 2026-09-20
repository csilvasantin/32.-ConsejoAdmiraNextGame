import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  claveDe, limpiaTexto, encajaPunto, nuevaIdea, saneaLista,
  puntosRuta, inclinacion, temaParaConsejo, leeIdeas, guardaIdeas,
  MAX_IDEAS, MAX_LARGO,
} from './assets/mapa-ideas.js';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const svg = fs.readFileSync(new URL('./assets/mapa-tesoro.svg', import.meta.url), 'utf8');

test('CREAR abre el mapa y NO se lleva por delante la generación de imágenes', () => {
  const app = fs.readFileSync(new URL('./app.flt-100529.js', import.meta.url), 'utf8');
  assert.match(app, /function enterCrearMode\(\) \{[\s\S]*window\.MapaTesoro[\s\S]*\.abre\(\)/);
  // El camino viejo sigue entero: prompt + Enviar sigue encolando la imagen.
  assert.match(app, /if \(currentVerb === 'crear'\) \{\s*\n\s*executeCrear\(text\);/);
  assert.match(app, /_crearApiFetch\('\/api\/council\/crear'/);
});

test('una idea se lleva al Consejo sin pasar por el window.prompt que congela', () => {
  const app = fs.readFileSync(new URL('./app.flt-100529.js', import.meta.url), 'utf8');
  assert.match(app, /window\.debateIdea = function \(tema\)/);
  // Fija el tema ANTES de pedir el verbo: así DEBATIR no llega a preguntarlo.
  const cuerpo = app.slice(app.indexOf('window.debateIdea = function'));
  const fijar = cuerpo.indexOf('currentProject = t;');
  const pedir = cuerpo.indexOf("querySelector('[data-verb=\"debatir\"]')");
  assert.ok(fijar > 0 && pedir > fijar, 'el tema se fija antes de lanzar el verbo');
});

test('el pergamino es dibujo propio, no una imagen de terceros', () => {
  assert.match(svg, /<svg[^>]*viewBox="0 0 1200 900"/);
  assert.ok(!/<image\b/.test(svg), 'nada de mapas de bits incrustados');
  assert.ok(!/xlink:href="(https?:)?\/\//.test(svg), 'nada traído de fuera');
  // Las piezas que hacen que parezca un mapa y no un folio.
  for (const pieza of ['mt-monte', 'mt-palma', 'mt-ola', 'mt-pez', 'MAPA DEL TESORO']) {
    assert.ok(svg.includes(pieza), 'falta ' + pieza);
  }
});

test('el texto se limpia y se recorta, venga de donde venga', () => {
  assert.equal(limpiaTexto('  hola   que    tal \n aquí '), 'hola que tal aquí');
  assert.equal(limpiaTexto(null), '');
  assert.equal(limpiaTexto(undefined), '');
  assert.equal(limpiaTexto('x'.repeat(MAX_LARGO + 50)).length, MAX_LARGO);
});

test('una idea nunca se sale del pergamino', () => {
  assert.deepEqual(encajaPunto(-40, 400), { x: 4, y: 92 });
  assert.deepEqual(encajaPunto(50, 50), { x: 50, y: 50 });
  // Un clic que no da número (elemento sin medir todavía) cae al centro, no a NaN%.
  assert.deepEqual(encajaPunto(NaN, undefined), { x: 50, y: 50 });
});

test('nuevaIdea exige texto', () => {
  assert.equal(nuevaIdea('   ', 10, 10), null);
  const i = nuevaIdea('cobrar por la API de Yokup', 30, 40, 1000);
  assert.equal(i.texto, 'cobrar por la API de Yokup');
  assert.deepEqual([i.x, i.y], [30, 40]);
  // Dos ideas seguidas en el mismo milisegundo NO comparten id: si lo hicieran,
  // borrar una borraría la otra.
  assert.notEqual(nuevaIdea('a', 1, 1, 1000).id, nuevaIdea('b', 1, 1, 1000).id);
});

test('lo guardado es dato de fuera: se sanea, no se confía', () => {
  assert.deepEqual(saneaLista('esto no es json'), []);
  assert.deepEqual(saneaLista('{"no":"es lista"}'), []);
  assert.deepEqual(saneaLista(null), []);
  const s = saneaLista([
    { id: 'a', texto: '  una idea  ', x: 10, y: 20 },
    { id: 'a', texto: 'repetida con el mismo id', x: 1, y: 1 },
    { id: 'b', texto: '   ', x: 5, y: 5 },
    { texto: 'sin id', x: 'no', y: null },
    'basura',
  ]);
  assert.equal(s.length, 2);
  assert.equal(s[0].texto, 'una idea');
  assert.deepEqual([s[1].x, s[1].y], [50, 50], 'coordenadas ilegibles caen al centro');
  // Y no se traga un mapa infinito.
  assert.equal(saneaLista(Array.from({ length: 200 }, (_, n) => ({ id: 'x' + n, texto: 'i' + n, x: 5, y: 5 }))).length, MAX_IDEAS);
});

test('la ruta une las ideas en el orden en que se escribieron', () => {
  assert.deepEqual(puntosRuta([]), []);
  assert.deepEqual(puntosRuta([{ x: 1, y: 2 }]), [], 'una idea suelta no es un camino');
  assert.deepEqual(puntosRuta([{ x: 1, y: 2 }, { x: 3, y: 4 }]), [[1, 2], [3, 4]]);
});

test('la inclinación de una nota no baila al repintar', () => {
  assert.equal(inclinacion('abc'), inclinacion('abc'));
  assert.notEqual(inclinacion('abc'), inclinacion('abd'));
  for (const id of ['a', 'bb', 'ccc', 'i9z3', 'zzzzzz']) {
    assert.ok(Math.abs(inclinacion(id)) <= 2.2, 'nada de notas volcadas');
  }
});

test('al Consejo va la idea con el resto del mapa como contexto', () => {
  const uno = { id: 'a', texto: 'cobrar por la API' };
  const dos = { id: 'b', texto: 'abrir Pixeria a terceros' };
  assert.equal(temaParaConsejo(uno, [uno]), 'cobrar por la API');
  assert.equal(
    temaParaConsejo(uno, [uno, dos]),
    'cobrar por la API (otras ideas del mapa: abrir Pixeria a terceros)',
  );
  assert.equal(temaParaConsejo({ texto: '  ' }, []), '');
});

test('cada generación tiene su propio pergamino', () => {
  assert.notEqual(claveDe('leyendas'), claveDe('coetaneos'));
  const almacen = (() => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  })();
  guardaIdeas('leyendas', [{ id: 'a', texto: 'idea de leyendas', x: 10, y: 10 }], almacen);
  assert.equal(leeIdeas('leyendas', almacen).length, 1);
  assert.equal(leeIdeas('coetaneos', almacen).length, 0);
});

test('un almacén que falla no tumba el mapa', () => {
  const roto = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); } };
  assert.deepEqual(leeIdeas('leyendas', roto), [], 'modo privado: mapa vacío, no excepción');
  assert.equal(guardaIdeas('leyendas', [{ id: 'a', texto: 'x', x: 1, y: 1 }], roto), false);
});

test('el mapa se pinta sobre el lienzo y con la letra legible del encargo', () => {
  assert.match(html, /<div class="mt-overlay" id="mapa-tesoro" hidden>/);
  assert.match(html, /assets\/mapa-tesoro\.svg\?v=/);
  assert.match(html, /class="mt-ruta" viewBox="0 0 100 100" preserveAspectRatio="none"/);
  // Pirata pero legible: IM Fell para las ideas; Pirata One sólo en rótulos.
  assert.match(html, /family=IM\+Fell\+English/);
  assert.match(html, /\.mt-texto \{[^}]*'IM Fell English'/);
  assert.ok(!/\.mt-texto \{[^}]*Pirata One/.test(html), 'la idea no se escribe en la decorativa');
  // El trazo de la ruta no se deforma con el escalado no uniforme.
  assert.match(html, /\.mt-ruta-linea \{[^}]*vector-effect: non-scaling-stroke/);
});
