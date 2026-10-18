// Bandeja de conversaciones (?chat=1): lógica pura de assets/council-inbox.js + garantías de que SIN el parámetro
// la home no carga nada nuevo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('./assets/council-inbox.js', import.meta.url), 'utf8');
const clienteSrc = readFileSync(new URL('./assets/chat-hilo-client.js', import.meta.url), 'utf8');
function cargar(search = '') {
  // Sin document: el arranque automático no se dispara; con location.search=?chat=1 pero sin document tampoco.
  const ctx = vm.createContext({ Intl, Date, location: { search }, console, setTimeout, clearTimeout });
  ctx.window = ctx; vm.runInContext(src, ctx); return ctx;
}
const I = cargar().CouncilInboxApi;

test('iniciales y color estables', () => {
  assert.equal(I.iniciales('Steve Jobs'), 'SJ');
  assert.equal(I.iniciales('Elon Musk'), 'EM');
  assert.equal(I.iniciales('Cher'), 'C');
  assert.equal(I.iniciales(''), '?');
  assert.equal(I.colorDe('Steve Jobs'), I.colorDe('Steve Jobs'));
});

test('tarjetaDe: casa por apellido solo entre tarjetas de consejero (como consejo-rotulo)', () => {
  const ts = [{ agente: 'Jobs', consejero: false, grupo: 'agentes', estado: 'verde' }, { agente: 'Jobs', consejero: true, estado: 'gris' }, { agente: 'Musk', grupo: 'consejeros', estado: 'amarillo' }, null];
  assert.equal(I.tarjetaDe('Steve Jobs', ts).estado, 'gris');
  assert.equal(I.tarjetaDe('Elon Musk', ts).estado, 'amarillo');
  assert.equal(I.tarjetaDe('Tim Cook', ts), null);
  assert.equal(I.tarjetaDe('Tim Cook', null), null);
});

test('led: aviso > flota > sin dato', () => {
  assert.equal(I.led({ estado: 'verde' }, { estado: 'aviso', pendiente: { minutos: 14 } }).clase, 'aviso');
  assert.match(I.led(null, { estado: 'aviso', pendiente: { minutos: 14 } }).texto, /14 min/);
  assert.equal(I.led({ estado: 'verde', motivo: 'x' }, { estado: 'ok' }).clase, 'verde');
  assert.equal(I.led({ estado: 'amarillo' }, null).clase, 'ambar');
  assert.equal(I.led({ estado: 'gris', motivo: 'sin latido' }, null).clase, 'gris');
  assert.equal(I.led({ estado: 'gris', motivo: 'sin latido' }, null).texto, 'sin latido');
  assert.equal(I.led(null, { estado: 'ok' }).clase, 'nd');
  assert.equal(I.led(null, null).clase, 'nd');
});

test('hora: HH:MM hoy, ayer, día de la semana y fecha (Europe/Madrid)', () => {
  const ahora = Date.parse('2026-10-18T10:30:00+02:00');
  assert.equal(I.hora('2026-10-18T10:02:00+02:00', ahora), '10:02');
  assert.equal(I.hora('2026-10-17T23:50:00+02:00', ahora), 'ayer');
  assert.match(I.hora('2026-10-14T12:00:00+02:00', ahora), /^mi/);
  assert.match(I.hora('2026-10-01T12:00:00+02:00', ahora), /^1 oct/);
  assert.equal(I.hora('basura', ahora), '');
  // 23:30 UTC del día 17 ya es el 18 en Madrid (UTC+2): hoy → hora local
  assert.equal(I.hora('2026-10-17T23:30:00Z', ahora), '01:30');
});

test('fragmento: una línea, recortado, «Tú:» si es de Carlos', () => {
  assert.equal(I.fragmento({ rol: 'jobs', texto: 'Hola\n\n  mundo' }), 'Hola mundo');
  assert.equal(I.fragmento({ rol: 'carlos', texto: 'Hola' }), 'Tú: Hola');
  const largo = I.fragmento({ rol: 'jobs', texto: 'a'.repeat(200) }, 20);
  assert.equal(largo.length, 20); assert.ok(largo.endsWith('…'));
  assert.equal(I.fragmento(null), ''); assert.equal(I.fragmento({ texto: '' }), '');
});

test('sinLeer: solo si lo último es del consejero y posterior a lo visto', () => {
  const u = (rol, ts) => ({ rol, ts });
  assert.equal(I.sinLeer(u('jobs', '2026-10-18T08:00:00Z'), 0), true);
  assert.equal(I.sinLeer(u('jobs', '2026-10-18T08:00:00Z'), Date.parse('2026-10-18T09:00:00Z')), false);
  assert.equal(I.sinLeer(u('carlos', '2026-10-18T08:00:00Z'), 0), false);
  assert.equal(I.sinLeer(null, 0), false);
});

test('lineaVacia: dice siempre por qué no hay fragmento', () => {
  assert.match(I.lineaVacia(false, null, false), /Sin hilo todavía.*aún no tiene silla en GrokBot/);
  assert.match(I.lineaVacia(true, null, true), /no disponible/);
  assert.match(I.lineaVacia(true, { ultimo: null }, true), /Sin mensajes todavía/);
  const s = { ultimo: { ts: '2026-10-18T08:00:00Z', rol: 'jobs' } };
  assert.match(I.lineaVacia(true, s, false, Date.parse('2026-10-18T10:00:00+02:00')), /Última respuesta .*entra con Google/);
  assert.doesNotMatch(I.lineaVacia(true, s, true), /entra con Google/);
  assert.match(I.lineaVacia(true, { ultimo: { ts: s.ultimo.ts, rol: 'carlos' } }, true), /Tu último mensaje/);
});

test('ordenar: con hilo (más reciente arriba) y sin hilo al final; nombres: placas primero + PERSONAS', () => {
  const it = (nombre, persona, ts, orden) => ({ nombre, persona, orden, salud: ts ? { ultimo: { ts } } : null });
  const o = I.ordenar([it('A', 'a', '2026-10-01T00:00:00Z', 0), it('B', null, null, 1), it('C', 'c', '2026-10-05T00:00:00Z', 2), it('D', 'd', null, 3), it('E', null, null, 4)]);
  assert.deepEqual([...o.con.map(x => x.nombre)], ['C', 'A', 'D']);
  assert.deepEqual([...o.sin.map(x => x.nombre)], ['B', 'E']);
  assert.deepEqual([...I.nombres(['Steve Jobs', 'Tim Cook'], { 'Steve Jobs': 'jobs', 'Elon Musk': 'musk' })], ['Steve Jobs', 'Tim Cook', 'Elon Musk']);
});

test('ROLES cubre los 16 consejeros del NAMEPLATE_POS de la home', () => {
  const app = readFileSync(new URL('./app.flt-100529.js', import.meta.url), 'utf8');
  const bloque = app.slice(app.indexOf('const NAMEPLATE_POS'), app.indexOf('const MOUTH_POS'));
  const pares = [...bloque.matchAll(/role: "(\w+)", persona: "([^"]+)"/g)];
  assert.equal(pares.length, 16);
  for (const [, role, persona] of pares) assert.equal(I.ROLES[persona], role, persona);
});

test('el arranque automático solo ocurre con ?chat=1', () => {
  assert.equal(cargar('').CouncilInbox, undefined);
  assert.equal(cargar('?otro=1').CouncilInbox, undefined);
  assert.equal(cargar('?chat=2').CouncilInbox, undefined);
});

test('index.html: la bandeja solo se referencia dentro del guard ?chat=1 (sin parámetro no se carga CSS ni JS)', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const refs = [...html.matchAll(/council-inbox/g)].length;
  const guard = html.match(/if\(\/\(\?:\^\|\[\?&\]\)chat=1\(\?:&\|\$\)\/\.test\(location\.search\)\)\{[\s\S]*?\n\}/);
  assert.ok(guard, 'guard presente');
  assert.equal([...guard[0].matchAll(/council-inbox/g)].length, 2, 'CSS y JS dentro del guard');
  // el resto de menciones son solo comentarios fuera de <link>/<script src>
  assert.doesNotMatch(html, /<(?:link|script)[^>]+council-inbox/);
  assert.ok(refs >= 2);
  // el guard acepta ?chat=1 en cualquier posición y rechaza chat=10
  const re = /(?:^|[?&])chat=1(?:&|$)/;
  assert.ok(re.test('?chat=1')); assert.ok(re.test('?a=2&chat=1&b=3')); assert.ok(!re.test('?chat=10')); assert.ok(!re.test(''));
});

test('CSS: un solo compositor en modo bandeja y todo bajo .ci / body.ci-on', () => {
  const css = readFileSync(new URL('./assets/council-inbox.css', import.meta.url), 'utf8');
  assert.match(css, /body\.ci-on \.scumm-bar \.action-input,body\.ci-on \.scumm-bar \.action-send,body\.ci-on \.council-preview \.council-composer\{display:none!important\}/);
  const plano = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const sel = [...plano.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m => m[1].split(',')).map(x => x.trim()).filter(Boolean);
  assert.ok(sel.length > 30);
  for (const s of sel) assert.match(s, /^(?:body\.ci-on|\.ci\b|\.ci__|:root|\.ci--)/, 'selector fuera de ámbito: ' + s);
});

test('mount integra el cliente: PERSONAS del cliente real tienen hilo', () => {
  const w = {}; new Function('window', clienteSrc)(w);
  assert.deepEqual(Object.values(w.ChatHiloClient.PERSONAS).sort(), ['disney', 'huang', 'jobs', 'lucas', 'musk', 'wozniak']);
});
