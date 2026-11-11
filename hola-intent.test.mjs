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
  assert.deepEqual(I({ fase: 'dormido' }, 'Hola Admira'), { accion: 'conectar', persona: 'Steve Jobs' });
  assert.deepEqual(I({ fase: 'dormido' }, 'Hola Admira quiero hablar con Elon'), { accion: 'conectar', persona: 'Elon Musk' });
  assert.deepEqual(I({ fase: 'eligiendo' }, 'con Jobs'), { accion: 'conectar', persona: 'Steve Jobs' });
  assert.deepEqual(I({ fase: 'eligiendo' }, 'no sé'), { accion: 'conectar', persona: 'Steve Jobs', pregunta: 'no sé' });
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
  for (const m of ['consejeros-voces.js', 'hola-intent.js', 'assets/chat-hilo-client.js', 'rel="manifest"', 'apple-touch-icon', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-title" content="Admira Live', 'serviceWorker', '/hola/sw.js', 'getUserMedia', 'John Lasseter', 'con=lasseter'])
    assert.ok(html.includes(m), m);
  assert.match(html, /r\.lang="es-ES"; r\.continuous=!isIOS; r\.interimResults=true/);
  assert.match(html, /C\.enviarTurno\(clave, texto, id\)/, 'las respuestas van por el hilo real, no inventadas');
  assert.match(html, /mantén pulsado|Mantén pulsado/);
  assert.match(html, /No te escucho/);
  const man = JSON.parse(leer('hola/manifest.webmanifest'));
  assert.equal(man.id, '/hola/');
  assert.equal(man.name, 'Admira Live');
  assert.equal(man.short_name, 'Admira Live');
  assert.equal(man.start_url, '/hola/');
  assert.equal(man.scope, '/hola/');
  assert.equal(man.display, 'standalone');
  assert.ok(man.icons.some(i => i.sizes === '192x192' && i.purpose === 'any'));
  assert.ok(man.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  const sw = leer('hola/sw.js');
  assert.match(sw, /addEventListener\("fetch"/);
  assert.doesNotMatch(sw, /caches\.|CacheStorage/);
  assert.match(leer('admira-bar.js'), /h: "https:\/\/www\.admira\.live\/hola\/"/);
});

test('lo que va detrás del nombre se reenvía ya como primera pregunta (bandera de Canadá)', () => {
  const I = HolaIntent.interpretar;
  assert.deepEqual(I({ fase: 'dormido' }, 'Hola Steve, quiero que dibujes una bandera de Canadá'),
    { accion: 'conectar', persona: 'Steve Jobs', pregunta: 'quiero que dibujes una bandera de Canadá' });
  assert.deepEqual(I({ fase: 'dormido' }, 'hola Elon'), { accion: 'conectar', persona: 'Elon Musk' });
  assert.deepEqual(I({ fase: 'dormido' }, 'o la admira quiero hablar con Steve Jobs'), { accion: 'conectar', persona: 'Steve Jobs' });
  assert.equal(I({ fase: 'dormido' }, 'Hola Admira, quiero hablar con Jobs para que me dibuje una bandera').pregunta, 'para que me dibuje una bandera');
  assert.equal(I({ fase: 'eligiendo' }, 'con Elon, ¿qué opinas de Marte?').pregunta, '¿qué opinas de Marte?');
  const conv = { fase: 'conversando', persona: 'Steve Jobs' };
  assert.deepEqual(I(conv, 'hola Steve quiero que dibujes una bandera de Canadá'),
    { accion: 'preguntar', persona: 'Steve Jobs', texto: 'quiero que dibujes una bandera de Canadá' });
  assert.deepEqual(I(conv, 'cambia a Elon y dime qué opinas de Marte'), { accion: 'conectar', persona: 'Elon Musk', pregunta: 'dime qué opinas de Marte' });
  assert.equal(I({ fase: 'dormido' }, 'hola, quiero saber de Elon').accion, 'nada');
});

test('respuestas con imagen: se muestran y no se leen en voz alta', () => {
  const m = HolaIntent.extraerMedios('Aquí la tienes: https://img.example.com/canada.png. Y en SVG: <svg viewBox="0 0 2 1"><rect width="2" height="1" fill="red"/></svg> ¿Te vale?');
  assert.equal(m.imagenes.length, 2);
  assert.equal(m.imagenes[0].tipo, 'svg');
  assert.equal(m.imagenes[1].src, 'https://img.example.com/canada.png');
  assert.doesNotMatch(m.texto, /svg|https/);
  assert.match(m.texto, /¿Te vale\?/);
  assert.deepEqual(HolaIntent.extraerMedios('![bandera](https://x.test/b.webp)').imagenes, [{ src: 'https://x.test/b.webp', tipo: 'url' }]);
  assert.equal(HolaIntent.extraerMedios('Mira https://apple.com y dime').imagenes.length, 0);
});

test('/hola: sigue sondeando tras la 1.ª respuesta, muestra imágenes y reenvía la pregunta al conectar', () => {
  const html = readFileSync(new URL('./hola/index.html', import.meta.url), 'utf8');
  assert.match(html, /conectar\(r\.persona, r\.pregunta\)/);
  assert.match(html, /preguntar\(c\.persona, pregunta\)/);
  assert.match(html, /p\.n-=nuevos\.length/, 'cuenta las preguntas pendientes');
  assert.doesNotMatch(html, /S\.esperando=0; estado\("💬/, 'ya no corta el sondeo en la primera respuesta');
  assert.match(html, /H\.extraerMedios\(texto\)/);
  assert.match(html, /id="media"/);
});

test('cabecera por cuenta: Jobs para csilva@admira.com, Elon para gmail, Jobs sin sesión', () => {
  assert.equal(H.cabeceraDe('csilva@admira.com'), 'Steve Jobs');
  assert.equal(H.cabeceraDe('CSILVA@admira.com'), 'Steve Jobs');
  assert.equal(H.cabeceraDe('csilvasantin@gmail.com'), 'Elon Musk');
  assert.equal(H.cabeceraDe('  csilvasantin@gmail.com  '), 'Elon Musk');
  assert.equal(H.cabeceraDe(''), 'Steve Jobs');
  assert.equal(H.cabeceraDe(null), 'Steve Jobs');
  assert.equal(H.cabeceraDe('otro@admira.com'), 'Steve Jobs');
});

test('Hola Admira dispara y conecta: variantes, Lasseter, frase sin nombre y cabecera por email', () => {
  const I = H.interpretar;
  for (const t of ['Hola Admira', 'hola, admira', 'Ola Admira', 'hola almira', 'Hola Admiral', 'HOLA ADMIRA', 'Hola Admira.'])
    assert.deepEqual(I({ fase: 'dormido' }, t), { accion: 'conectar', persona: 'Steve Jobs' }, t);
  assert.deepEqual(I({ fase: 'dormido', email: 'csilva@admira.com' }, 'Hola Admira'), { accion: 'conectar', persona: 'Steve Jobs' });
  assert.deepEqual(I({ fase: 'dormido', email: 'csilvasantin@gmail.com' }, 'Hola Admira'), { accion: 'conectar', persona: 'Elon Musk' });
  assert.deepEqual(I({ fase: 'dormido', email: 'csilvasantin@gmail.com' }, 'Hola Admira, Lasseter'), { accion: 'conectar', persona: 'John Lasseter' });
  assert.deepEqual(I({ fase: 'dormido' }, 'Hola Admira, Lasseter, dibuja un coche'), { accion: 'conectar', persona: 'John Lasseter', pregunta: 'dibuja un coche' });
  assert.deepEqual(I({ fase: 'dormido', email: 'csilva@admira.com' }, 'Hola Admira qué hora es'), { accion: 'conectar', persona: 'Steve Jobs', pregunta: 'qué hora es' });
  assert.deepEqual(I({ fase: 'dormido', email: 'csilvasantin@gmail.com' }, 'Hola Admira qué hora es'), { accion: 'conectar', persona: 'Elon Musk', pregunta: 'qué hora es' });
  assert.deepEqual(I({ fase: 'dormido' }, 'Hola Admira qué hora es'), { accion: 'conectar', persona: 'Steve Jobs', pregunta: 'qué hora es' });
  assert.deepEqual(I({ fase: 'eligiendo', email: 'csilvasantin@gmail.com' }, 'Hola Admira'), { accion: 'conectar', persona: 'Elon Musk' });
  assert.deepEqual(I({ fase: 'eligiendo', email: 'csilva@admira.com' }, 'con Lasseter'), { accion: 'conectar', persona: 'John Lasseter' });
});
