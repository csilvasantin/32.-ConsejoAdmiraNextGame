// #7460 — ULTRADETALLE del Mac 1984: overlay DeepAgents, sin remoto inventado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEEPAGENT_SEATS, MOSAIC_SEATS, BOLA_TTL_MS, DATO_VACIO, SESION_SOLO_LECTURA,
  SESION_SIN_PANE, SESION_CAPTURA_TERMINAL, VISOR_PANE_URL, VISOR_CADENCIA_S,
  deepAgentId, etiquetaDeepAgent, capturaRealSrc, fichaDeepAgent,
  enviarOrdenDeepAgent, _resetOrdenesDeepAgent, isUltraOpen,
  tipoSesionVerificado, bolaEstado, etiquetaBola, agenteDeMision, datoActual,
  sesionVerificada, paneDeAgente, llaveVisor, maqClave,
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
  assert.equal(deepAgentId('SmithMacMini'), null, 'SmithMacMini no es el asiento Smith');
  assert.equal(deepAgentId('Smith-mapa'), 'Smith');
  assert.equal(deepAgentId('WozniakGrokBot'), null);
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
  const now = Date.parse('2026-11-08T18:12:00Z');
  const real = fichaDeepAgent(
    { agente: 'Morfeo', estado: 'verde', motivo: 'trabajando', encargo: '#7460', tarea: 'ULTRADETALLE', maquina: 'MBP16', motor: 'Claude Code', session_id: 'morfeo', host: 'cli', fuente: 'heartbeat', haceS: 8 },
    { src: 'https://shots.example/m.jpg', capturaAt: now - 8000, fuente: 'latido' },
    now,
  );
  assert.equal(real.id, 'Morfeo');
  assert.equal(real.nombre, 'Morfeo');
  assert.equal(real.bola, 'rojo');
  assert.equal(real.estado, 'trabajando');
  assert.equal(real.tipo, 'CLI');
  assert.equal(real.mision, '#7460');
  assert.equal(real.equipo, 'MBP16');
  assert.equal(real.sesion, 'morfeo');
  assert.equal(real.src, 'https://shots.example/m.jpg');
  assert.equal(real.fuente, 'latido');
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
  assert.match(openFn, /mac-ultra__session/);
  assert.match(openFn, /mac-ultra__pane/);
  assert.match(openFn, /SESION_CAPTURA_TERMINAL/);
  assert.match(openFn, /SESION_SOLO_LECTURA/);
  assert.match(src, /\['Tipo', ficha\.tipo/);
  assert.match(src, /\['Misión', datoActual\(ficha\.mision\)\]/);
  assert.match(src, /\['Última acción', datoActual\(ficha\.ultimaAccion\)\]/);
  assert.match(src, /\['Máquina', datoActual\(ficha\.equipo\)\]/);
  assert.match(src, /\['Sesión', datoActual\(ficha\.sesion\)\]/);
  assert.match(src, /\['Hora'/);
  assert.match(src, /\['Fuente', datoActual\(ficha\.fuente\)\]/);
});

test('#7460 pestaña Escritorio → DeepAgents, sin showRemote de consejero', () => {
  assert.match(preview, />DeepAgents</);
  assert.doesNotMatch(preview, />Escritorio</);
  assert.match(preview, /openUltraDetalle/);
  assert.match(preview, /DeepAgents indisponible/);
  const desktop = preview.slice(preview.indexOf("if(view==='desktop')"), preview.indexOf('else{mac?.setVisible'));
  assert.doesNotMatch(desktop, /showRemote/);
  assert.match(preview, /art.hidden=view==='conversation'\|\|view==='desktop'/);
});

test('#7460 bolas: rojo trabajando, verde libre, amarillo caducado o sin evidencia', () => {
  const now = Date.parse('2026-11-08T18:12:00Z');
  assert.equal(BOLA_TTL_MS, 10 * 60 * 1000);
  assert.equal(bolaEstado({ estado: 'verde', haceS: 12 }, {}, now), 'rojo');
  assert.equal(bolaEstado({ estado: 'gris', haceS: 20 }, {}, now), 'verde');
  assert.equal(bolaEstado({ estado: 'verde', haceS: (BOLA_TTL_MS / 1000) + 5 }, {}, now), 'amarillo');
  assert.equal(bolaEstado({ estado: 'verde' }, {}, now), 'amarillo');
  assert.equal(etiquetaBola('rojo'), 'trabajando');
  assert.equal(etiquetaBola('verde'), 'libre');
  assert.equal(etiquetaBola('amarillo'), 'no lo sabemos');
  assert.match(css, /mac-ultra__bola--rojo/);
  assert.match(css, /mac-ultra__bola--verde/);
  assert.match(css, /mac-ultra__bola--amarillo/);
  assert.match(src, /Metáfora de estado/);
});

test('#7460 tipo verificado: host/superficies; no inferir por motor; Woz no se mezcla', () => {
  assert.equal(tipoSesionVerificado({ host: 'cli' }), 'CLI');
  assert.equal(tipoSesionVerificado({ host: 'app' }), 'Desktop app');
  assert.equal(tipoSesionVerificado({ superficies: [{ tipo: 'cli', sesion: 'smith' }] }), 'CLI');
  assert.equal(tipoSesionVerificado({ superficies: [{ tipo: 'app' }] }), 'Desktop app');
  assert.equal(tipoSesionVerificado({ motor: 'Claude Code', modelo: 'opus' }), 'desconocido');
  assert.equal(tipoSesionVerificado({}), 'desconocido');
  assert.equal(agenteDeMision({ persona: 'SmithMacMini', assignee: 'Smith' }), null);
  assert.equal(agenteDeMision({ persona: 'Wozniak', assignee: 'Smith' }), null);
  assert.equal(agenteDeMision({ persona: 'WozniakGrokBot', proof_image: 'https://x/woz.jpg' }), null);
  assert.equal(datoActual(''), DATO_VACIO);
  const vacia = fichaDeepAgent({ agente: 'Trinity' });
  assert.equal(vacia.mision, DATO_VACIO);
  assert.equal(vacia.sesion, DATO_VACIO);
  assert.equal(vacia.tipo, 'desconocido');
  assert.equal(vacia.bola, 'amarillo');
  const fn = src.slice(src.indexOf('async function fichasDeepAgents'), src.indexOf('function pintarFichaUltra'));
  assert.doesNotMatch(fn, /EVIDENCE_URL/);
  assert.doesNotMatch(fn, /\/api\/council\/evidence/);
  assert.match(fn, /agenteDeMision/);
  assert.match(openFn, /SESION_SOLO_LECTURA/);
  assert.equal(SESION_SOLO_LECTURA.includes('solo lectura'), true);
});

test('#7460 sesión verificada: CLI con nombre en la máquina del latido; no hardcode; visor solo si coincide', () => {
  assert.equal(deepAgentId('Smith-mapa'), 'Smith');
  assert.equal(deepAgentId('Smith · Grok'), 'Smith');
  assert.equal(deepAgentId('SmithMacMini'), null);
  assert.equal(agenteDeMision({ persona: 'SmithMacMini', assignee: 'Smith' }), null);
  const elig = sesionVerificada([
    {
      agente: 'Smith',
      superficies: [
        { tipo: 'cli', maquina: 'MacBook Pro 16', sesion: null, fuente: 'latido' },
        { tipo: 'cli', maquina: 'MacMini', sesion: 'smith', fuente: 'pulso' },
      ],
    },
    {
      agente: 'Smith-mapa',
      superficies: [
        { tipo: 'cli', maquina: 'MacBookPro16', sesion: 'smith-mapa', fuente: 'pulso' },
      ],
    },
  ]);
  assert.equal(elig.sesion, 'smith-mapa');
  assert.equal(maqClave(elig.maquina), 'macbookpro16');
  const ficha = fichaDeepAgent([
    { agente: 'Smith', estado: 'gris', maquina: 'MacMini', superficies: [
      { tipo: 'cli', maquina: 'MacBook Pro 16', sesion: null, fuente: 'latido' },
      { tipo: 'cli', maquina: 'MacMini', sesion: 'smith', fuente: 'pulso' },
    ] },
    { agente: 'Smith-mapa', superficies: [
      { tipo: 'cli', maquina: 'MacBookPro16', sesion: 'smith-mapa', fuente: 'pulso' },
    ] },
  ]);
  assert.equal(ficha.tipo, 'CLI');
  assert.equal(ficha.sesion, 'smith-mapa');
  assert.equal(ficha.lectura, SESION_SIN_PANE);
  assert.equal(ficha.lineas.length, 0);
  const paneOk = paneDeAgente(
    [{ titulo: 'Smith · Grok', sesion: 'smith-mapa', host: 'macbook-pro-16', lineas: ['hello from tmux'] }],
    'Smith',
    'smith-mapa',
  );
  assert.equal(paneOk.fuente, 'visor/pane');
  assert.equal(paneOk.lineas[0], 'hello from tmux');
  assert.equal(paneOk.cadenciaS, VISOR_CADENCIA_S);
  assert.equal(paneDeAgente(
    [{ titulo: 'Smith · Grok', sesion: 'smith', host: 'grokbotbox', lineas: ['otra sesión'] }],
    'Smith',
    'smith-mapa',
  ), null, 'no mezclar el pane de otra sesión');
  assert.equal(llaveVisor({ getItem: () => '' }), '');
  assert.equal(llaveVisor({ getItem: () => 'x'.repeat(24) }).length, 24);
  assert.equal(VISOR_PANE_URL, '/api/visor/pane?g=6');
  assert.doesNotMatch(src, /smith-mbp16/);
  assert.doesNotMatch(src, /tmux:smith/);
  assert.doesNotMatch(src, /\/api\/term\/stream/);
  assert.doesNotMatch(src, /\/api\/live\/frame/);
  assert.doesNotMatch(openFn, /xterm/);
  assert.match(css, /mac-ultra__pane/);
  assert.equal(SESION_CAPTURA_TERMINAL.includes('solo lectura'), true);
});
