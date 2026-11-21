import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fichaDe, listarConsejeros, personaCanonica, generacionDe, ENTRE_CONSEJEROS, SILLA_CLAVE } from './consejo-sillas-lib.mjs';
import { elegirModelo, modelosDisponibles, gapsDeModelos, costeEur, construirMensajes, tokenMaquinaOk, saludMotor } from './consejo-ask-lib.mjs';
import {
  nuevaSesion, siguienteSpeaker, promptDe, registrarTurno, aplicarParada, metricas,
  referenciaCruzada, identidadCorrecta, pareceEspanol, transcriptPublico, SESION_TURNOS_MAX,
} from './consejo-sesion-lib.mjs';

test('16 sillas canónicas: Murati COO, Carlo Ratti, sin Shotwell', () => {
  const todos = listarConsejeros();
  assert.equal(todos.length, 16);
  assert.equal(fichaDe('COO', 'coetaneos').persona, 'Mira Murati');
  assert.equal(fichaDe('CXO', 'coetaneos').persona, 'Carlo Ratti');
  assert.equal(personaCanonica('Carlos Ratti'), 'Carlo Ratti');
  assert.equal(personaCanonica('carlo'), 'Carlo Ratti');
  assert.ok(!todos.some((c) => /shotwell/i.test(c.persona)));
  assert.equal(generacionDe('Steve Wozniak'), 'leyendas');
  assert.equal(generacionDe('John Lasseter'), 'coetaneos');
  assert.equal(SILLA_CLAVE['Ryan Reynolds'], 'Reynolds');
  assert.equal(ENTRE_CONSEJEROS.lasseter, 'Lasseter');
  assert.equal(ENTRE_CONSEJEROS.ive, 'Ive');
  assert.equal(ENTRE_CONSEJEROS.murati, 'Murati');
  assert.equal(ENTRE_CONSEJEROS.reynolds, 'Reynolds');
});

test('elegirModelo: gratis si hay, si no el disponible de pago, si no null', () => {
  assert.equal(elegirModelo({}, 'grok-4.6'), null);
  const pago = elegirModelo({ XAI_API_KEY: 'x'.repeat(20) }, 'auto');
  assert.equal(pago.key, 'grok-4.6');
  assert.equal(pago.motivo, 'disponible_pago');
  const gratis = elegirModelo({ XAI_API_KEY: 'x'.repeat(20), NVIDIA_API_KEY: 'n'.repeat(20) }, 'auto');
  assert.equal(gratis.free, true);
  assert.equal(gratis.motivo, 'gratis');
  const pedido = elegirModelo({ XAI_API_KEY: 'x'.repeat(20), NVIDIA_API_KEY: 'n'.repeat(20) }, 'grok-4.6');
  assert.equal(pedido.key, 'grok-4.6');
  assert.ok(gapsDeModelos({ XAI_API_KEY: 'x'.repeat(20) }).includes('ANTHROPIC_API_KEY'));
  assert.ok(modelosDisponibles({ XAI_API_KEY: 'x' }).find((m) => m.key === 'grok-4.6').available);
  assert.equal(saludMotor({}).status, 'sin_backend');
  assert.equal(saludMotor({ XAI_API_KEY: 'x' }).status, 'ok');
});

test('coste y mensajes de contexto recortan a 12', () => {
  assert.equal(costeEur(1000, 0, { free: true }), 0);
  assert.ok(costeEur(1_000_000, 0, { free: false }) > 2);
  const ctx = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: 'm' + i }));
  const { messages } = construirMensajes(fichaDe('CTO', 'leyendas'), 'hola', ctx);
  assert.equal(messages.length, 13); // 12 ctx + pregunta
  assert.equal(messages[0].content, 'm8');
});

test('token de máquina compara en tiempo constante', () => {
  const env = { CONSEJERO_MENSAJES_TOKEN: 'token-de-maquina-super-largo' };
  const req = (v) => ({ headers: { get: (k) => (k.toLowerCase() === 'x-mensajes-token' ? v : '') } });
  assert.equal(tokenMaquinaOk(req('token-de-maquina-super-largo'), env), true);
  assert.equal(tokenMaquinaOk(req('otro'), env), false);
  assert.equal(tokenMaquinaOk(req(''), env), false);
});

test('sesión alterna equipos aunque no haya presencia (cruce lógico)', () => {
  const s = nuevaSesion({ tema: 'prueba', turnos: 12 });
  const a = siguienteSpeaker(s);
  assert.equal(a.mesa, 'leyendas');
  assert.equal(a.persona, 'Steve Jobs');
  let d = registrarTurno(s, { persona: a.persona, texto: 'Cortemos lo que no se entienda de un vistazo.', llm: 'grok-4.6', ms: 800 });
  const b = siguienteSpeaker(d);
  assert.equal(b.mesa, 'coetaneos');
  assert.equal(b.persona, 'Elon Musk');
  d = registrarTurno(d, { persona: b.persona, texto: 'De acuerdo, Jobs: lo simulamos hoy y lo desplegamos esta semana.', llm: 'grok-4.6', ms: 900 });
  const c = siguienteSpeaker(d);
  assert.equal(c.mesa, 'leyendas');
  assert.equal(c.persona, 'Steve Wozniak');
  assert.ok(promptDe(b.persona, d).includes('Jobs'));
  assert.ok(promptDe(b.persona, d).length > 80);
});

test('duelo Jobs vs Musk y parada por vacíos o tope', () => {
  const s = nuevaSesion({ tema: 'PortAventuraNeXT', a: 'jobs', b: 'elon', turnos: 4, tope_eur: 0.5 });
  assert.equal(s.modo, 'duelo');
  assert.deepEqual(s.roster, ['Steve Jobs', 'Elon Musk']);
  let d = registrarTurno(s, { persona: 'Steve Jobs', texto: 'Empecemos por una sola idea clara.', ms: 100 });
  assert.equal(siguienteSpeaker(d).persona, 'Elon Musk');
  d = registrarTurno(d, { persona: 'Elon Musk', texto: '', vacio: true, error: 'timeout', ms: 10 });
  d = registrarTurno(d, { persona: 'Steve Jobs', texto: '', vacio: true, error: 'timeout', ms: 10 });
  assert.equal(d.estado, 'parada');
  assert.equal(d.motivo_parada, 'vacios');
  const t = nuevaSesion({ tema: 'x', turnos: 2, tope_eur: 0.01 });
  let u = registrarTurno(t, { persona: 'Steve Jobs', texto: 'Uno.', coste_eur: 0.02, ms: 50 });
  assert.equal(u.estado, 'parada');
  assert.equal(u.motivo_parada, 'tope_eur');
  const p = aplicarParada(nuevaSesion({ tema: 'x' }), { stop: true });
  assert.equal(p.motivo_parada, 'stop');
  assert.ok(SESION_TURNOS_MAX >= 20);
});

test('métricas de cruce, identidad, español y relleno 0', () => {
  let s = nuevaSesion({ tema: 'cruce', turnos: 12 });
  s = registrarTurno(s, { persona: 'Steve Jobs', texto: 'Que la otra mesa, Musk, nos diga la fricción de verdad.', ms: 200 });
  s = registrarTurno(s, { persona: 'Elon Musk', texto: 'Jobs, la simulamos hoy y la desplegamos esta semana.', ms: 300 });
  const m = metricas(s);
  assert.equal(m.relleno_pct, 0);
  assert.equal(m.identidad_pct, 100);
  assert.ok(m.espanol_pct >= 90);
  assert.ok(m.referencia_cruzada_pct >= 50);
  assert.ok(referenciaCruzada(s.turnos[1], s.turnos[0]));
  assert.ok(identidadCorrecta(s.turnos[0]));
  assert.ok(pareceEspanol('Que se vea el carácter de cada consejero.'));
  const pub = transcriptPublico(s);
  assert.equal(pub.url, 'https://www.admira.live/conversacion#sesion-' + s.id);
  assert.ok(pub.turnos[0].ts_madrid);
});
