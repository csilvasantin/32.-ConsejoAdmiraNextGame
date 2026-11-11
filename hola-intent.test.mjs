import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('./hola-intent.js');
const H = globalThis.HolaIntent;

test('despertar: «Hola Admira» y lo que suele transcribir el reconocimiento', () => {
  for (const t of ['Hola Admira', 'hola, admira', 'Ola Admira', 'hola almira', 'Hola Admiral', 'oye admira', 'hey Admira', 'Admira', 'hola ad mira', 'HOLA ADMIRA quiero hablar con Jobs'])
    assert.equal(H.despertar(t).ok, true, t);
  for (const t of ['hola', 'admiro tu trabajo', 'la mira del rifle', 'quiero hablar con Jobs', 'hola amigo', 'me admira mucho'])
    assert.equal(H.despertar(t).ok, false, t);
});

test('consejero: Jobs y Elon por nombre, apellido y como suenan', () => {
  for (const t of ['quiero hablar con Jobs', 'con Steve Jobs', 'Steve', 'pásame a yobs', 'ponme con Steve', 'jobs'])
    assert.equal(H.consejero(t), 'Steve Jobs', t);
  for (const t of ['quiero hablar con Elon', 'con Elon Musk', 'Musk', 'ilon', 'pásame con elon mask', 'Elon por favor'])
    assert.equal(H.consejero(t), 'Elon Musk', t);
  assert.equal(H.consejero('quiero hablar con Steve Wozniak'), 'Steve Wozniak');
  assert.equal(H.consejero('con Woz'), 'Steve Wozniak');
  assert.equal(H.consejero('quiero hablar con nadie'), null);
});

test('los 16 consejeros se pueden pedir por su nombre', () => {
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const personas = [...app.matchAll(/persona: "([^"]+)",\s+side:/g)].map(m => m[1]);
  assert.equal(personas.length, 16);
  for (const p of personas) {
    assert.equal(H.consejero('quiero hablar con ' + p), p, p);
    assert.equal(H.consejero(p.split(' ').pop()), p, 'apellido de ' + p);
  }
  assert.equal(H.consejero('con Disney'), 'Walt Disney');
  assert.equal(H.consejero('con Jensen'), 'Jensen Huang');
  assert.equal(H.consejero('con Lasseter'), 'John Lasseter');
});

test('despedidas y cambios', () => {
  for (const t of ['gracias', 'muchas gracias', 'adiós', 'hasta luego', 'nada más']) assert.ok(H.despedida(t), t);
  assert.equal(H.despedida('cuéntame del mercado'), false);
  assert.equal(H.cambio('cambia a Elon'), 'Elon Musk');
  assert.equal(H.cambio('pásame con Jobs'), 'Steve Jobs');
  assert.equal(H.cambio('ahora con Disney'), 'Walt Disney');
  assert.equal(H.cambio('qué opinas de la estrategia de Elon con Tesla'), null);
});

test('máquina de estados de /hola', () => {
  const I = H.interpretar;
  assert.deepEqual(I({ fase: 'dormido' }, 'qué tiempo hace'), { accion: 'nada' });
  assert.deepEqual(I({ fase: 'dormido' }, 'Hola Admira'), { accion: 'despierta' });
  assert.deepEqual(I({ fase: 'dormido' }, 'Hola Admira quiero hablar con Elon'), { accion: 'conectar', persona: 'Elon Musk' });
  assert.deepEqual(I({ fase: 'eligiendo' }, 'con Jobs'), { accion: 'conectar', persona: 'Steve Jobs' });
  assert.equal(I({ fase: 'eligiendo' }, 'no sé').accion, 'no-entiendo');
  assert.deepEqual(I({ fase: 'eligiendo' }, 'gracias'), { accion: 'dormir' });
  const conv = { fase: 'conversando', persona: 'Steve Jobs' };
  assert.deepEqual(I(conv, '¿Qué producto lanzamos este año?'), { accion: 'preguntar', persona: 'Steve Jobs', texto: '¿Qué producto lanzamos este año?' });
  assert.deepEqual(I(conv, 'cambia a Elon'), { accion: 'conectar', persona: 'Elon Musk' });
  assert.deepEqual(I(conv, 'gracias Steve'), { accion: 'dormir' });
  assert.equal(I(conv, 'gracias por la idea, pero cómo lo financiamos con los bancos este trimestre').accion, 'preguntar');
  assert.equal(I(conv, 'qué piensas de Elon').accion, 'preguntar');
});

test('/hola: carga sus módulos, manifiesto instalable y enlace en la barra', () => {
  const leer = f => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  const html = leer('hola/index.html');
  for (const m of ['consejeros-voces.js', 'hola-intent.js', 'assets/chat-hilo-client.js', 'rel="manifest"', 'apple-touch-icon', 'apple-mobile-web-app-capable'])
    assert.ok(html.includes(m), m);
  assert.match(html, /r\.lang="es-ES"; r\.continuous=true; r\.interimResults=true/);
  assert.match(html, /C\.enviarTurno\(clave, texto, id\)/, 'las respuestas van por el hilo real, no inventadas');
  const man = JSON.parse(leer('hola/manifest.webmanifest'));
  assert.equal(man.start_url, '/hola/'); assert.equal(man.display, 'standalone');
  assert.match(leer('admira-bar.js'), /h: "https:\/\/www\.admira\.live\/hola\/"/);
});
