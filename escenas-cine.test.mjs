// Escenas ilustradas de las pieles 81–89 en admira.live (06-10-2026 · Carlos, parte 2).
// La escena es el fondo de la página: viene del catálogo único de admiranext.com (fondos.escena →
// --mb-escena y data-mb-escena, que pone marcablanca.js) y aquí solo se pinta con var(--mb-escena).
// La línea de órdenes SCUMM sigue opaca (>= 7:1, marca-cine.test.mjs).
// Producción: ESCENAS_PROD=1 node --test escenas-cine.test.mjs comprueba que cada escena se sirve (200).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CSS = leer('assets/marca-blanca.css');
const IDS = ['81', '82', '83', '84', '85', '86', '87', '88', '89'];
const ESCENAS = CSS.slice(CSS.indexOf('Escenas ilustradas de las pieles 81–89'));

test('la escena de la piel es el fondo de la página (var(--mb-escena)), por encima de los degradados de cada piel', () => {
  assert.ok(CSS.indexOf('Escenas ilustradas de las pieles 81–89') > CSS.indexOf(':root[data-mb-marca="89"] body'), 'va detrás de las reglas de cada piel: gana a igual especificidad');
  assert.match(ESCENAS, /:root\[data-mb-escena\] body\{[^}]*background-image:linear-gradient\([^}]*\),var\(--mb-escena\)!important/);
  assert.match(ESCENAS, /background-size:cover!important/);
  assert.doesNotMatch(ESCENAS, /url\(/, 'la URL la trae el catálogo; aquí no hay imágenes externas fijas');
  assert.doesNotMatch(ESCENAS, /scumm-bar|action-line|action-input|sentence-line|verb-btn/, 'la línea de órdenes no cambia');
  // La línea de órdenes de las pieles sigue con fondos opacos de la marca (no transparentes sobre la escena).
  assert.ok(CSS.includes('.scumm-bar{background:var(--cine-cli-panel)!important'));
  assert.ok(CSS.includes('.scumm-bar .action-line{background:var(--cine-cli-fondo)!important'));
});

test('/marca off quita la escena y el cargador común se pide con sello nuevo', () => {
  const mb = leer('assets/marca-blanca.js');
  assert.match(mb, /'data-mb-ejemplo', 'data-mb-escena'\]\) html\.removeAttribute/);
  assert.match(mb, /BASE \+ 'marcablanca\.js\?v=20261006-escenas-1'/);
  assert.match(mb, /const BASE = 'https:\/\/www\.admiranext\.com\/marcablanca\/'/);
  assert.match(leer('yk-frame.js'), /\/assets\/marca-blanca\.js\?v=06\.10\.2026\.r20-escenas/);
});

test('producción: cada escena se sirve con 200, image/svg+xml y CORS abierto (ESCENAS_PROD=1)', { skip: process.env.ESCENAS_PROD ? false : 'solo con ESCENAS_PROD=1' }, async () => {
  for (const id of IDS) {
    const r = await fetch(`https://www.admiranext.com/marcablanca/escenas/${id}.svg`, { cache: 'no-store' });
    assert.equal(r.status, 200, id);
    assert.match(r.headers.get('content-type') || '', /image\/svg\+xml/);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    const m = await (await fetch(`https://www.admiranext.com/marcablanca/api/marcas/${id}`)).json();
    assert.equal(m.fondos.escena.svg, `/marcablanca/escenas/${id}.svg`);
  }
  const live = await fetch('https://www.admira.live/assets/marca-blanca.css', { cache: 'no-store' });
  assert.equal(live.status, 200);
  assert.match(await live.text(), /:root\[data-mb-escena\] body\{/);
});
