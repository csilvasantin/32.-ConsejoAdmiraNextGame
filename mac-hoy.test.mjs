import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todayMadrid, isHoy, linesFor, seatOf, envolver, ultimaMision, ultimasMisiones, detalleLineas, DETALLE_ANCHO, MODOS } from './assets/mac-hoy.js';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('Mac 1984 está en la mesa y MOSTRAR bajo Analizar', () => {
  assert.match(html, /id="mac-hoy-prop"/);
  assert.match(html, /assets\/mac-1984-mesa\.png/);
  assert.match(html, /id="btn-mostrar"/);
  const analizar = html.indexOf('data-verb="analizar"');
  const mostrar = html.indexOf('id="btn-mostrar"');
  assert.ok(analizar > 0 && mostrar > analizar, 'MOSTRAR debe ir después de Analizar');
  assert.ok(fs.existsSync(new URL('./assets/mac-1984-mesa.png', import.meta.url)));
});

test('CRT: HOY fecha + 3 últimas completadas (#FLT + persona)', () => {
  const day = '2026-09-19';
  const blob = linesFor([
    { id: 'FLT-100670', display_day: day, status: 'resolved', persona: 'SmithMacMini', updated_at: 3 },
    { id: 'FLT-100669', display_day: day, status: 'resolved', persona: 'DisneyGrokBot', updated_at: 2 },
    { id: 'FLT-100667', display_day: day, status: 'resolved', persona: 'SmithMacMini', updated_at: 1 },
    { id: 'FLT-100666', display_day: day, status: 'resolved', persona: 'WozniakGrokBot', updated_at: 0 },
    { id: 'FLT-9', display_day: '2020-01-01', status: 'resolved', persona: 'Neo' },
    { id: 'FLT-100655', display_day: day, status: 'in_progress', persona: 'Wozniak' },
  ], day);
  assert.equal(blob[0], 'HOY 19-09');
  assert.equal(blob.length, 4);
  assert.match(blob[1], /#100670 Smith/);
  assert.match(blob[2], /#100669 Disney/);
  assert.match(blob[3], /#100667 Smith/);
  assert.ok(!blob.some((l) => l.includes('100666') || l.includes('100655')));
  assert.equal(isHoy({ display_day: day, status: 'resolved' }, day), true);
  assert.equal(seatOf({ persona: 'SmithMacMini' }).includes('Smith'), true);
  assert.equal(todayMadrid(Date.parse('2026-09-19T15:00:00+02:00')), '2026-09-19');
});

test('on-demand: oculto por defecto, chip MOSTRAR, /mac en CLI', () => {
  assert.match(html, /mac-hoy-prop\.on/);
  const css = html.slice(html.indexOf('.mac-hoy-prop {'), html.indexOf('.mac-hoy-prop.on'));
  assert.match(css, /display:\s*none/);
  const app = fs.readFileSync(new URL('./app.flt-100529.js', import.meta.url), 'utf8');
  assert.match(app, /\/mac/);
  assert.match(app, /MacHoy/);
});

// --- Mandos del Mac: teclado -> logo, ratón -> última misión con detalle -----
const HOY = '2026-09-19';
const MISIONES = [
  { id: 'FLT-100673', status: 'resolved', display_day: HOY, updated_at: 1758280000, persona: 'Jobs', subject: 'Cablear el generador de presentaciones' },
  { id: 'FLT-100678', status: 'resolved', display_day: HOY, updated_at: 1758290000, persona: 'Smith', subject: 'Macintosh 1984 en la mesa del Consejo' },
  { id: 'FLT-100690', status: 'in_progress', display_day: HOY, updated_at: 1758299999, persona: 'Neo', subject: 'Sin terminar' },
];

test('detalle: una ficha por misión, navegable, con su posición', () => {
  assert.equal(ultimasMisiones(MISIONES, HOY).length, 2);           // solo las RESUELTAS
  assert.equal(ultimaMision(MISIONES, HOY).id, 'FLT-100678');       // la más reciente
  const a = detalleLineas(MISIONES, HOY, 0);
  assert.equal(a[0], 'MISION 1/2', 'la cabecera dice por cuál vas');
  assert.match(a[1], /^#100678/);
  assert.equal(a[2], 'Smith');
  assert.ok(a.slice(4).join(' ').includes('Macintosh'), 'debe contar DE QUÉ iba');
  const b = detalleLineas(MISIONES, HOY, 1);
  assert.equal(b[0], 'MISION 2/2');
  assert.match(b[1], /^#100673/);
  // el índice da la vuelta por los dos lados: el ratón y el teclado no se atascan
  assert.deepEqual(detalleLineas(MISIONES, HOY, 2), a);
  assert.deepEqual(detalleLineas(MISIONES, HOY, -1), b);
  [a, b].forEach(l => l.forEach(x => assert.ok(x.length <= DETALLE_ANCHO, 'cabe en el tubo: ' + x)));
});

test('sin nada cerrado: lo dice, no inventa', () => {
  const l = detalleLineas([{ id: 'FLT-1', status: 'in_progress', display_day: HOY }], HOY);
  assert.deepEqual(l, ['SIN MISIONES', '', 'cerradas hoy']);
});

test('envolver parte por palabras y respeta el máximo', () => {
  assert.deepEqual(envolver('uno dos tres cuatro', 8, 3), ['uno dos', 'tres', 'cuatro']);
  assert.equal(envolver('a b c d e f g h i j', 3, 2).length, 2);
  assert.deepEqual(envolver('', 10, 3), []);
  assert.equal(envolver('supercalifragilistico', 8, 2)[0].length, 8, 'una palabra larga se recorta');
});

test('teclado y ratón son mandos, y existe el logo retro en pantalla', () => {
  assert.deepEqual(MODOS, ['hoy', 'detalle', 'logo', 'pong']);
  assert.match(html, /<button[^>]+class="mac-hoy-keys"/);
  assert.match(html, /<button[^>]+class="mac-hoy-mouse"/);
  assert.ok(!/class="mac-hoy-(keys|mouse)"[^>]*href=/.test(html), 'ya no son enlaces a yokup');
  assert.match(html, /class="mac-hoy-logo"/);
  assert.match(html, /admira-logo-retro\.svg/);
  assert.ok(fs.existsSync(new URL('./admira-logo-retro.svg', import.meta.url)));
});

test('el Mac arranca con el logo, y Mac 1984 es un botón como los demás', () => {
  const src = fs.readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
  assert.match(src, /let modo = 'logo'/, "el modo inicial debe ser el logo de Admira");
  assert.ok(!/let modo = 'hoy'/.test(src));
  // El botón pierde la píldora dorada y se llama Mac 1984
  assert.match(html, /id="btn-mostrar"[^>]*>Mac 1984</);
  assert.ok(!/class="verb-btn mac-hoy-chip"/.test(html), 'ya no lleva el estilo de chip');
});

test('noveno objeto: el motor devuelve la elección de modelo', () => {
  assert.match(html, /data-obj="motor"/);
  assert.match(html, /assets\/iconos\/motor\.svg/);
  assert.ok(fs.existsSync(new URL('./assets/iconos/motor.svg', import.meta.url)));
  // la lista de motores sigue en el DOM (oculta), no borrada: selectedLLM depende de ella
  assert.match(html, /data-panel="llm"/);
  assert.match(html, /\.inventory\.motor-abierto .inv-panel\[data-panel="llm"\]/);
});

test('paintCrt: la última escritura manda (no se pisan al navegar rápido)', async () => {
  const { paintCrt } = await import('./assets/mac-hoy.js');
  const el = { textContent: '', scrollTop: 0, scrollHeight: 0 };
  const primera = paintCrt(el, 'AAAAAAAAAAAAAAAAAAAAAAAA');
  const segunda = paintCrt(el, 'BBB');                 // releva a la anterior
  await Promise.all([primera, segunda]);
  await new Promise(r => setTimeout(r, 120));
  assert.equal(el.textContent, 'BBB', 'no debe quedar rastro de la primera');
});

test('paintCrt: una ficha larga tiene techo de tiempo', async () => {
  const { paintCrt } = await import('./assets/mac-hoy.js');
  const mide = async (n) => {
    const el = { textContent: '', scrollTop: 0, scrollHeight: 0 };
    const t = Date.now();
    await paintCrt(el, 'x'.repeat(n));
    assert.equal(el.textContent.length, n, 'debe escribirla entera');
    return Date.now() - t;
  };
  // Lo que importa no es que tarden lo mismo —una pantalla corta acaba antes a
  // propósito— sino que una ficha larga no se eternice: a dos caracteres fijos,
  // 240 caracteres eran 1,4 s y en segundo plano no acababa nunca.
  const larga = await mide(240);
  assert.ok(larga < 1000, `una ficha larga tardó ${larga}ms; debe quedar por debajo de 1 s`);
});

test('paintCrt: si los temporizadores van estrangulados, escribe entera igual', async () => {
  const { paintCrt } = await import('./assets/mac-hoy.js');
  const real = globalThis.setTimeout;
  // Simula una pestaña de fondo: un tic por segundo (comprimido a 20 ms de reloj
  // falso no se puede, así que estiramos el retardo real lo justo para cruzar el
  // plazo de 3 s con pocos tics).
  globalThis.setTimeout = (fn) => real(fn, 700);
  try {
    const el = { textContent: '', scrollTop: 0, scrollHeight: 0 };
    await paintCrt(el, 'y'.repeat(300));
    assert.equal(el.textContent.length, 300, 'debe acabar la pantalla pese al estrangulamiento');
  } finally {
    globalThis.setTimeout = real;
  }
});

test('el asunto ya no se recorta a lo que cabe: se escribe entero', () => {
  const largo = 'Cablear el generador de presentaciones AdmiraNeXT con la galeria publica y el sello de version para que el equipo lo vea';
  const l = detalleLineas([{ id: 'FLT-1', status: 'resolved', display_day: HOY, updated_at: 1, persona: 'Neo', subject: largo }], HOY, 0);
  const cuerpo = l.slice(4).join(' ');
  assert.ok(cuerpo.includes('el equipo lo vea'), 'debe llegar hasta el final del asunto');
  assert.ok(l.length > 9, 'y ocupar mas lineas de las que caben, para que la pantalla lo pasee');
  l.forEach(x => assert.ok(x.length <= DETALLE_ANCHO, 'cada linea cabe en el tubo: ' + x));
});

test('disquetera: hay Pong y su propio modo de pantalla', () => {
  assert.ok(MODOS.includes('pong'));
  assert.match(html, /id="mac-hoy-floppy"/);
  assert.match(html, /id="mac-hoy-pong"[^>]*width="512"[^>]*height="342"/);
  assert.match(html, /\.modo-pong \.mac-hoy-pong \{ display: block; \}/);
  const src = fs.readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
  assert.match(src, /export function alternaPong/);
  assert.match(src, /requestAnimationFrame/);
});

test('pong: los periféricos juegan y no navegan mientras está puesto', async () => {
  const src = fs.readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
  // navegar sólo fuera del pong
  assert.match(src, /if \(!visible \|\| modo === 'pong'\) return;\s*\/\/ jugando no se navega/);
  // mantener pulsado mueve la pala, soltar la para
  assert.match(src, /pointerdown/);
  assert.match(src, /pointerup/);
  assert.match(src, /el\.addEventListener\('pointerleave', suelta\)/, 'soltar fuera del botón no debe dejar la pala lanzada');
  // la pala izquierda la mueve el jugador, no la máquina
  assert.match(src, /izq \+ jugador \* \(TOPE \+ 1\.6\)/);
  // teclado de verdad, pero nunca mientras se escribe en un campo
  assert.match(src, /ArrowUp/);
  assert.match(src, /t\.tagName === 'INPUT'/);
});

test('pong: salir del juego suelta la pala', async () => {
  const { paraPong, mandoPong, estadoPong } = await import('./assets/mac-hoy.js');
  mandoPong(-1);
  assert.equal(estadoPong().jugador, -1);
  paraPong();
  assert.equal(estadoPong().jugador, 0, 'al sacar el disco la pala no puede quedarse subiendo sola');
});

test('la vista frontal tiene sus propios mandos de misión', () => {
  assert.match(html, /id="mac-hoy-front-keys"/);
  assert.match(html, /id="mac-hoy-front-mouse"/);
  const src = fs.readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
  assert.match(src, /mando\('#mac-hoy-front-mouse', \+1\)/);
  assert.match(src, /mando\('#mac-hoy-front-keys', -1\)/);
  // y al abrirla, la ficha se pasea igual que en la mesa
  assert.match(src, /paintCrt\(front, lastText\)\.then\(\(\) => paseaTexto\(front\)\)/);
});

test('los puntos sensibles no se delatan al pasar por encima', () => {
  assert.ok(!/\.mac-hoy-keys:hover/.test(html), 'nada de realce en hover sobre el dibujo');
  assert.ok(!/box-shadow: 0 0 12px rgba\(120,255,160/.test(html));
  // el foco de teclado SÍ deja marca: hace falta para navegar sin ratón
  assert.match(html, /\.mac-hoy-keys:focus-visible[^{]*\{[^}]*outline/);
});
