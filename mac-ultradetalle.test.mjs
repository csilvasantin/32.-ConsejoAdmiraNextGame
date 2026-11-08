// #7460 — ULTRADETALLE del Mac 1984: overlay DeepAgents, sin remoto inventado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEEPAGENT_SEATS, MOSAIC_SEATS,
  deepAgentId, etiquetaDeepAgent, capturaRealSrc, fichaDeepAgent,
  enviarOrdenDeepAgent, _resetOrdenesDeepAgent, isUltraOpen,
} from './assets/mac-hoy.js';

const src = fs.readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./assets/mac-remote.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const preview = fs.readFileSync(new URL('./council-preview.js', import.meta.url), 'utf8');
const remote = fs.readFileSync(new URL('./assets/mac-remote.js', import.meta.url), 'utf8');
const openFn = src.slice(src.indexOf('export function openUltraDetalle'), src.indexOf('export function closeUltraDetalle'));
const mouseFn = src.slice(src.indexOf("root.querySelectorAll('.mac-hoy-mouse, .mac-hoy-front-mouse')"), src.indexOf("mando('.mac-hoy-keys"));

test('#7460 DeepAgents: 6 asientos, separados de consejeros, Oráculo con tilde', () => {
  assert.deepEqual(DEEPAGENT_SEATS, ['Neo', 'Trinity', 'Oraculo', 'Morfeo', 'Smith', 'Merovingio']);
  assert.deepEqual(MOSAIC_SEATS, ['Jobs', 'Wozniak', 'Lucas', 'Disney', 'Musk', 'Huang']);
  const consejeros = new Set(MOSAIC_SEATS.map((n) => n.toLowerCase()));
  DEEPAGENT_SEATS.forEach((id) => assert.equal(consejeros.has(id.toLowerCase()), false, id));
  assert.equal(deepAgentId('Oráculo'), 'Oraculo');
  assert.equal(etiquetaDeepAgent('Oraculo'), 'Oráculo');
  assert.equal(deepAgentId('Smith'), 'Smith');
  assert.equal(deepAgentId('Neo'), 'Neo');
  assert.equal(deepAgentId('Cypher'), null, 'Cypher no está en la rejilla de 6');
  assert.equal(deepAgentId('Jobs'), null);
  assert.equal(deepAgentId('Walt Disney'), null);
  assert.equal(deepAgentId('Elon'), null);
  assert.equal(deepAgentId('Jensen'), null);
  assert.equal(fichaDeepAgent({ agente: 'Jobs', estado: 'verde' }), null);
});

test('#7460 captura real: jpeg/https sí; SVG placard no', () => {
  assert.equal(capturaRealSrc('https://admira.live/shot.jpg'), 'https://admira.live/shot.jpg');
  assert.equal(capturaRealSrc('http://x/y.png'), 'http://x/y.png');
  assert.equal(capturaRealSrc('blob:https://admira.live/1'), 'blob:https://admira.live/1');
  assert.equal(capturaRealSrc('data:image/jpeg;base64,/9j/AAA'), 'data:image/jpeg;base64,/9j/AAA');
  assert.equal(capturaRealSrc('data:image/png;base64,iVBOR'), 'data:image/png;base64,iVBOR');
  assert.equal(capturaRealSrc(''), '');
  assert.equal(capturaRealSrc('data:image/svg+xml;base64,PHN2Zy'), '');
  assert.equal(capturaRealSrc('data:image/svg+xml,<svg></svg>'), '');
  assert.equal(capturaRealSrc('javascript:alert(1)'), '');
  assert.equal(fichaDeepAgent({ agente: 'Trinity' }, { src: 'data:image/svg+xml;utf8,<svg/>' }).src, '');
  const real = fichaDeepAgent(
    { agente: 'Morfeo', estado: 'verde', motivo: 'trabajando', encargo: '#7460', tarea: 'ULTRADETALLE', maquina: 'MBP16', motor: 'Claude Code', fuente: 'heartbeat' },
    { src: 'https://shots.example/m.jpg', capturaAt: Date.parse('2026-11-08T17:08:00Z'), fuente: 'evidencia' },
  );
  assert.equal(real.id, 'Morfeo');
  assert.equal(real.nombre, 'Morfeo');
  assert.equal(real.estado, 'verde');
  assert.equal(real.mision, '#7460');
  assert.equal(real.equipo, 'MBP16');
  assert.equal(real.sesion, 'Claude Code');
  assert.equal(real.src, 'https://shots.example/m.jpg');
  assert.equal(real.fuente, 'evidencia');
  assert.ok(real.capturaAt);
});

test('#7460 órdenes: un envío, sin consejero falso, sin POST; falta endpoint → indisponible', async () => {
  _resetOrdenesDeepAgent();
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, method: (opts && opts.method) || 'GET' }); return { ok: false, status: 404, json: async () => ({}) }; };
  assert.equal((await enviarOrdenDeepAgent({ agente: 'Jobs', texto: 'hola', msg_id: 'x1' }, fetchImpl)).error, 'indisponible');
  assert.equal((await enviarOrdenDeepAgent({ agente: 'Smith', texto: 'tarea', msg_id: 'm-smith-1' }, fetchImpl)).error, 'indisponible');
  const dup = await enviarOrdenDeepAgent({ agente: 'Smith', texto: 'tarea', msg_id: 'm-smith-1' }, fetchImpl);
  assert.equal(dup.ok, true);
  assert.equal(dup.duplicado, true);
  assert.equal((await enviarOrdenDeepAgent({ agente: 'Oráculo', texto: 'x', msg_id: 'm-ora-1' }, fetchImpl)).error, 'indisponible');
  assert.equal(calls.length, 0, 'no hay POST ni GET: el canal web no está verificado');
  assert.doesNotMatch(openFn, /\/api\/chat\/enviar/);
  assert.doesNotMatch(openFn, /\/api\/grokbot\/remote/);
  assert.doesNotMatch(mouseFn, /MacRemote/);
  assert.doesNotMatch(mouseFn, /mostrarProyectoAnterior/);
});

test('#7460 overlay: patrón .mac-ultra, Volver/Esc, fullscreen solo explícito', () => {
  assert.match(openFn, /className = 'mac-ultra'/);
  assert.match(openFn, /data-close>Volver al Mac · Esc/);
  assert.match(openFn, /e\.key !== 'Escape'/);
  assert.match(openFn, /\[data-full\]'\)\.onclick = fullscreen/);
  assert.match(openFn, /overlay\.requestFullscreen/);
  assert.match(css, /\.mac-ultra\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /\.mac-ultra__agents\s*\{/);
  assert.match(css, /\.mac-ultra__agent\s*\{/);
  assert.match(html, /class="mac-hoy-front-mouse"[^>]*ultradetalle DeepAgents/);
  assert.match(html, /id="mac-hoy-keys"[^>]*misión siguiente/);
  assert.match(html, /id="mac-hoy-front-keys"[^>]*misión siguiente/);
  assert.match(src, /closeFront[\s\S]*closeUltraDetalle\(\)/);
  assert.match(src, /if \(esCampo\(e\.target\) \|\| isUltraOpen\(\)\) return;/);
  assert.equal(isUltraOpen(), false);
  assert.match(remote, /mac-ultra/, 'el overlay de DeepAgents reutiliza el patrón de mac-remote, no lo sustituye');
});

test('#7460 ratón abre ultradetalle; Pong conserva pala; teclado avanza misión', () => {
  assert.match(mouseFn, /openUltraDetalle\(root, fetchImpl\)/);
  assert.match(mouseFn, /if \(modo === 'pong'\) return;/);
  assert.match(mouseFn, /jugador = \+1/);
  assert.match(src, /mando\('\.mac-hoy-keys, \.mac-hoy-front-keys', -1, 1\)/);
  assert.match(src, /e\.key === 'ArrowRight' \|\| e\.key === 'ArrowDown'/);
  assert.match(openFn, /Sin captura real/);
  assert.match(openFn, /capturaRealSrc\(ficha && ficha\.src\)/);
  assert.match(src, /\['Nombre', ficha\.nombre\]/);
  assert.match(src, /\['Estado', ficha\.estado\]/);
  assert.match(src, /\['Misión', ficha\.mision\]/);
  assert.match(src, /\['Equipo', ficha\.equipo\]/);
  assert.match(src, /\['Sesión', ficha\.sesion\]/);
  assert.match(src, /\['Captura', horaCapturaUltra\(ficha\.capturaAt\)\]/);
  assert.match(src, /\['Fuente', ficha\.fuente\]/);
});

test('#7460 pestaña Escritorio → DeepAgents, sin showRemote de consejero', () => {
  assert.match(preview, />DeepAgents</);
  assert.doesNotMatch(preview, />Escritorio</);
  assert.match(preview, /openUltraDetalle/);
  assert.match(preview, /DeepAgents indisponible/);
  const desktop = preview.slice(preview.indexOf("if(view==='desktop')"), preview.indexOf('else{mac?.setVisible'));
  assert.doesNotMatch(desktop, /showRemote/);
});
