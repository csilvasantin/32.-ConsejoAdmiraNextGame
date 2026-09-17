// El Highscore se muda de yokup.com a admira.live (Carlos, 17-09-2026). Fase 1: aquí
// se sirve un ESPEJO de la página de yokup —los mismos ficheros, las mismas rutas, los
// mismos datos en vivo de api.yokup.com— para poder compararlas pantalla a pantalla
// antes de apagar la de yokup.
//
// Un espejo sin vigilancia se pudre: alguien retoca la copia a mano, o el original
// cambia y nadie lo trae. Esto comprueba que la copia sigue siendo copia y que las
// ÚNICAS diferencias son las declaradas en tools/sync-yokup.sh. Sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const aqui = (f) => new URL('./' + f, import.meta.url);
const lee = (f) => readFile(aqui(f), 'utf8');

const highscore = await lee('highscore.html');
const detalle = await lee('highscoreDetail.html');
const marco = await lee('yk-frame.js');
const espejo = JSON.parse(await lee('highscore-espejo.json'));
const index = await lee('index.html');
const app = await lee('app.js');
const marcador = await lee('marcador.html');

// Páginas de yokup que todavía NO se han mudado: en el espejo tienen que enlazar al
// original absoluto, nunca a una ruta de admira.live que no existe.
const PENDIENTES = espejo.paginas_pendientes_de_migrar.split('|');

test('el espejo entra sin puerta: no carga el gate de Yokup', () => {
  // acceso.js esconde la página entera hasta validar un login de Google contra una
  // cookie de yokup.com que admira.live no puede tener. Con él puesto, aquí no se
  // vería nada.
  for (const [nombre, html] of [['highscore', highscore], ['detalle', detalle]]) {
    assert.equal(/<script[^>]+acceso\.js/.test(html), false, nombre + ' sigue cargando acceso.js');
  }
});

test('el espejo se identifica: sello de origen en las dos páginas y en el manifiesto', () => {
  for (const html of [highscore, detalle]) {
    assert.match(html, /<meta name="yokup-espejo" content="origen www\.yokup\.com · commit [0-9a-f]{7,}/);
  }
  assert.equal(espejo.origen, 'https://www.yokup.com');
  assert.ok(espejo.paginas_migradas.includes('highscore'), 'el manifiesto no declara el highscore como mudado');
  assert.match(espejo.origen_commit, /^[0-9a-f]{7,}$/);
  assert.match(espejo.sincronizado, /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
});

test('avisa de lo que aquí no funciona en vez de fallar en silencio', () => {
  for (const html of [highscore, detalle]) {
    const aviso = html.slice(html.indexOf('id="yk-espejo-aviso"'), html.indexOf('id="yk-espejo-aviso"') + 700);
    assert.ok(aviso.includes('sin sesión de Yokup'), 'el aviso no dice que no hay sesión');
    assert.ok(/www\.yokup\.com\/highscore/.test(aviso), 'el aviso no enlaza al original');
  }
});

test('ningún enlace apunta a una página de yokup que aquí no existe', () => {
  for (const [nombre, texto] of [['highscore.html', highscore], ['highscoreDetail.html', detalle], ['yk-frame.js', marco]]) {
    for (const p of PENDIENTES) {
      assert.equal(new RegExp('"/' + p + '"').test(texto), false,
        nombre + ' enlaza a /' + p + ', que sólo existe en yokup.com');
    }
  }
  // …y una página que SIGUE en yokup (app: la descarga del técnico, producto, no viaja) sí apunta al
  // original absoluto. Antes se comprobaba con dashboard; dashboard se mudó en el tramo 4, app no.
  assert.ok(PENDIENTES.includes('app'), 'app debe seguir pendiente (no viaja)');
  assert.match(marco, /"https:\/\/www\.yokup\.com\/app"/);
});

test('el marco pregunta por el sello de esta casa, no por el guardián de yokup', () => {
  // /__yokup-gate lo sirve el Worker yokup-site-gate; aquí era un 404 cada pocos
  // segundos y un pie sin versión. version.json lo escribe deploy.sh y trae el
  // mismo campo `version`.
  assert.equal(marco.includes('/__yokup-gate'), false);
  assert.match(marco, /window\.fetch\("\/version\.json\?frame="/);
});

test('todo lo que la página pide de esta casa está en el repo', async () => {
  const pedidos = new Set();
  for (const html of [highscore, detalle]) {
    for (const m of html.matchAll(/(?:src|href)="(\/[^"?#]+)/g)) pedidos.add(m[1]);
  }
  // El favicon y el icono de la app son de admira.live y los sirve la raíz del sitio;
  // el resto tiene que existir aquí o la página sale coja.
  const ajenos = new Set(['/favicon.ico', '/favicon-32x32.png', '/apple-touch-icon.png']);
  const faltan = [];
  for (const p of pedidos) {
    if (ajenos.has(p)) continue;
    // Cloudflare Pages sirve las URLs limpias: /highscore es highscore.html.
    const hay = existsSync(new URL('.' + p, import.meta.url)) || existsSync(new URL('.' + p + '.html', import.meta.url));
    if (!hay) faltan.push(p);
  }
  assert.deepEqual(faltan, [], 'faltan ficheros del espejo: ' + faltan.join(', '));
  // Los pesados del podio y la música de la carrera viajan de verdad, no como enlace roto.
  assert.ok((await stat(aqui('img/highscore-podio-pixel.png'))).size > 100000);
  assert.ok((await stat(aqui('media/trackfield-1722.mp3'))).size > 100000);
});

test('lee los mismos datos en vivo que el original', () => {
  for (const ruta of ['/highscore/daily', '/highscore/active-work', '/highscore/history']) {
    assert.ok(highscore.includes(ruta), 'el espejo ya no pide ' + ruta);
  }
  assert.match(highscore, /https:\/\/api\.yokup\.com/);
});

test('está cableado: riel AVANZADO, CLI y salto desde el marcador', async () => {
  assert.match(index, /href="\/highscore"[^>]*title="Highscore completo/);
  assert.match(marcador, /href="\/highscore"/);
  // El CLI se comprueba en el fichero que index.html CARGA de verdad, no en app.js por
  // costumbre: hay una copia cache-busted (app.flt-100529.js) y el sitio sirve esa. Si
  // alguien vuelve a duplicar el CLI, esto canta en cuanto las copias se separen.
  const cargado = (index.match(/<script[^>]+src="(app[^"?]*\.js)/) || [])[1];
  assert.ok(cargado, 'index.html no carga ningún app*.js');
  const cli = cargado === 'app.js' ? app : await lee(cargado);
  assert.ok(cli.includes("'/highscore'"), cargado + ' no autocompleta /highscore en el CLI');
  assert.match(cli, /\^\\\/highscore\$/);
});

test('la copia sigue siendo copia del original (si el repo de yokup está al lado)', async () => {
  const origen = new URL('../yokup/yokup-site/', import.meta.url);
  if (!existsSync(origen)) return; // en una máquina sin el repo de yokup, no se juzga.
  // Los ficheros que el sync copia SIN tocar tienen que ser idénticos byte a byte.
  const intactos = ['highscore-daily-record.js', 'highscore-desktop-app.js', 'highscore-race.js',
    'highscore-race-bonus.js', 'highscore-work-clock.js', 'highscore-runner-state.css',
    'highscore-detail.js', 'highscore-detail-page.js', 'yk-frame.css', 'yk-agent-identity.js', 'yk-avatar.js'];
  const sucios = [];
  for (const f of intactos) {
    const a = await readFile(new URL(f, origen), 'utf8').catch(() => null);
    if (a === null) continue;
    if (a !== await lee(f)) sucios.push(f);
  }
  assert.deepEqual(sucios, [], 'el espejo se ha desviado a mano en: ' + sucios.join(', ') +
    ' — vuelve a lanzar tools/sync-yokup.sh en vez de editar la copia');
});
