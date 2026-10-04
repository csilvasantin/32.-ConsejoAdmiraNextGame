import test from 'node:test';
import assert from 'node:assert/strict';
import { manejar } from '../src/index.js';
import { estadoSilla, tituloEncargo, MESA, TRABAJANDO_SEG, ENCARGO_VIVO_SEG } from '../src/estado.js';

// «¿En qué está cada consejero ahora?» (hover y DEBATIR de la mesa, 4-oct-2026). Sin red.
const AHORA = 1_800_000_000_000;
const S = AHORA / 1000;

function fetchFalso(peticiones, { presenciaCae = false } = {}) {
  return async (url) => {
    const u = String(url); peticiones.push(u);
    const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/api/presence')) {
      if (presenciaCae) return new Response('caído', { status: 503 });
      return ok({ ok: true, presence: [
        { persona: 'Merovingio', machine: 'GrokBotBox', runtime: 'Grok CLI', mode: 'pasivo', focus: 'mesa del consejo', updated: S - 40 },
        { persona: 'Merovingio', machine: 'MacMini', runtime: 'Grok CLI', updated: S - 5 },
        { persona: 'Cypher', machine: 'GrokBotBox', runtime: 'DeepAgents', mode: 'trabajando', updated: S - 20 },
        { persona: 'Arquitecto', machine: 'CursorCloud', runtime: 'Cursor', updated: S - 10 },
      ] });
    }
    const persona = new URL(u).searchParams.get('persona');
    if (u.includes('/api/public/inbox')) {
      const items = {
        Merovingio: [
          { id: 5001, ts: S - 7200, target_persona: 'Merovingio', target_machine: 'grokbotbox', status: 'pending', etiqueta: '#5001.10.04', text: 'Soy NeoMacBookPro14.\nRevisar el sello' },
          { id: 5000, ts: S - 9000, ack_at: S - 3600, target_persona: 'Merovingio', target_machine: 'grokbotbox', status: 'in_progress', etiqueta: '#5000.10.04', from_name: 'Carlos', text: 'Soy Carlos.\n✋ Tablero de estado del Consejo en admira.live' },
          { id: 4999, ts: S - 9999, target_persona: 'Merovingio', status: 'done', text: 'viejo' },
        ],
        Arquitecto: [{ id: 4800, ts: S - 100, target_persona: 'Arquitecto', target_machine: 'cursorcloud', status: 'in_progress', text: 'del orquestador, no de Jony' }],
      }[persona] || [];
      return ok({ ok: true, items, count: items.length });
    }
    return new Response('{}', { status: 404 });
  };
}

test('tituloEncargo: en palabras, sin «Soy X.» ni emojis de cabecera', () => {
  assert.equal(tituloEncargo('Soy Carlos.\n✋ Tablero de estado'), 'Tablero de estado');
  assert.equal(tituloEncargo('Repo: csilvasantin/x\nArreglar el hover'), 'Arreglar el hover');
  assert.equal(tituloEncargo('[Simple] 15 minutos'), '[Simple] 15 minutos', 'el corchete de cabecera se queda (Wozniak)');
  assert.equal(tituloEncargo(''), null);
});

test('GET /consejo/estado: Elon lee a Merovingio en la GrokBotBox; datos reales, sin inventar', async () => {
  const peticiones = [];
  const r = await manejar(new Request('https://mcp.test/consejo/estado'), { ADMIRA_TELEGRAM_URL: 'https://telegram.test' }, { fetch: fetchFalso(peticiones), now: () => AHORA });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.ok(!peticiones.some((u) => u.includes('/api/bot-inbox')), 'nunca la bandeja privada');
  assert.equal(d.ventana_trabajando_s, 600);
  assert.equal(d.ventana_encargo_vivo_s, 48 * 3600);
  const elon = d.mesa.coetaneos.find((s) => s.persona === 'Elon Musk');
  assert.equal(elon.estado, 'idle', 'in_progress no fuerza working sin latido trabajando (#5085)');
  assert.equal(elon.encargo.numero, 5001, 'misión = id más alto entre abiertos vivos');
  assert.equal(elon.encargo.titulo, 'Revisar el sello');
  assert.equal(elon.ultimo_latido, S - 40, 'el latido de MacMini no es el de la GrokBotBox');
  assert.equal(elon.agentes[0].maquina, 'GrokBotBox');
  assert.deepEqual(elon.cola, { pending: 1, ack: 0, in_progress: 1, blocked: 0 });
  const jensen = d.mesa.coetaneos.find((s) => s.persona === 'Jensen Huang');
  assert.equal(jensen.estado, 'working', 'trabajando por latido fresco mode=trabajando (≤10 min)');
  assert.equal(jensen.encargo, null);
  const ive = d.mesa.coetaneos.find((s) => s.persona === 'Jony Ive');
  assert.equal(ive.estado, 'idle', 'lo de ArquitectoCursorCloud no cuenta para Jony');
  assert.equal(ive.ultimo_latido, null);
  const cook = d.mesa.leyendas.find((s) => s.persona === 'Tim Cook');
  assert.equal(cook.enlazado, false); assert.equal(cook.estado, null);
  assert.equal(d.mesa.leyendas.length, MESA.leyendas.length);
});

test('presencia caída → latido null («sin datos»), no un cero inventado', async () => {
  const r = await manejar(new Request('https://mcp.test/consejo/estado'), { ADMIRA_TELEGRAM_URL: 'https://telegram.test' }, { fetch: fetchFalso([], { presenciaCae: true }), now: () => AHORA });
  const d = await r.json();
  const jensen = d.mesa.coetaneos.find((s) => s.persona === 'Jensen Huang');
  assert.equal(jensen.ultimo_latido, null);
  assert.equal(jensen.sin_datos.presencia, true);
  assert.ok(d.errores.presencia);
});

test('OPTIONS /consejo/estado responde CORS', async () => {
  const r = await manejar(new Request('https://mcp.test/consejo/estado', { method: 'OPTIONS' }), {}, { fetch: fetchFalso([]) });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('estadoSilla: silla sin agente → «sin agente enlazado»', () => {
  const s = estadoSilla({ persona: 'Ryan Reynolds', rol: 'CSO', fuentes: [] }, { presencia: [], bandejas: {} }, AHORA);
  assert.equal(s.motivo, 'sin agente enlazado');
});

test('estadoSilla #5085: in_progress antiguo no fuerza working; working solo con latido trabajando ≤10 min', () => {
  const def = { persona: 'Steve Jobs', rol: 'CEO', fuentes: [{ persona: 'Jobs', tipo: 'silla', etiqueta: 'JobsGrokBot', maquina: 'GrokBot' }], maquina_silla: 'GrokBot' };
  const bandejas = { Jobs: { items: [
    { id: 3754, ts: S - ENCARGO_VIVO_SEG - 100, target_persona: 'Jobs', status: 'in_progress', text: 'misión del 21-sep' },
    { id: 5080, ts: S - 3600, target_persona: 'Jobs', status: 'pending', text: 'encargo fresco' },
  ] } };
  // Latido hace 11 h, mode trabajando → idle (ventana trabajando = 10 min, no VIVO_SEG)
  const s1 = estadoSilla(def, {
    presencia: [{ persona: 'Jobs', machine: 'GrokBot', mode: 'trabajando', updated: S - 11 * 3600, focus: '#3754' }],
    bandejas,
  }, AHORA);
  assert.equal(s1.estado, 'idle');
  assert.equal(s1.encargo.numero, 5080, 'el 3754 >48h no cuenta; gana el fresco');
  assert.deepEqual(s1.cola, { pending: 1, ack: 0, in_progress: 0, blocked: 0 });

  // Latido hace 11 min + mode trabajando → idle (umbral 10 min)
  const s2 = estadoSilla(def, {
    presencia: [{ persona: 'Jobs', machine: 'GrokBot', mode: 'trabajando', updated: S - (TRABAJANDO_SEG + 60), focus: 'x' }],
    bandejas,
  }, AHORA);
  assert.equal(s2.estado, 'idle', '11 min > TRABAJANDO_SEG');

  // Latido hace 2 min + mode trabajando → working
  const s3 = estadoSilla(def, {
    presencia: [{ persona: 'Jobs', machine: 'GrokBot', mode: 'trabajando', updated: S - 120, focus: 'x' }],
    bandejas,
  }, AHORA);
  assert.equal(s3.estado, 'working');

  // Latido fresco pero mode pasivo + in_progress vivo → idle (nunca working por bandeja)
  const s4 = estadoSilla(def, {
    presencia: [{ persona: 'Jobs', machine: 'GrokBot', mode: 'pasivo', updated: S - 30 }],
    bandejas: { Jobs: { items: [
      { id: 5090, ts: S - 100, target_persona: 'Jobs', status: 'in_progress', text: 'en curso' },
      { id: 5089, ts: S - 200, target_persona: 'Jobs', status: 'ack', text: 'aceptado' },
    ] } },
  }, AHORA);
  assert.equal(s4.estado, 'idle');
  assert.equal(s4.encargo.numero, 5090, 'id más alto gana aunque haya varios abiertos');
  assert.deepEqual(s4.cola, { pending: 0, ack: 1, in_progress: 1, blocked: 0 });

  // Sin ts ni ack_at → excluido de cola/misión
  const s5 = estadoSilla(def, {
    presencia: [{ persona: 'Jobs', machine: 'GrokBot', mode: 'pasivo', updated: S - 30 }],
    bandejas: { Jobs: { items: [
      { id: 1, target_persona: 'Jobs', status: 'in_progress', text: 'sin fecha' },
    ] } },
  }, AHORA);
  assert.equal(s5.encargo, null);
  assert.deepEqual(s5.cola, { pending: 0, ack: 0, in_progress: 0, blocked: 0 });
});

test('estadoSilla #5085: entre abiertos vivos gana el id más reciente', () => {
  const def = { persona: 'Walt Disney', rol: 'CCO', fuentes: [{ persona: 'Disney', tipo: 'silla', etiqueta: 'DisneyGrokBot' }] };
  const s = estadoSilla(def, {
    presencia: [{ persona: 'Disney', mode: 'pasivo', updated: S - 10 }],
    bandejas: { Disney: { items: [
      { id: 100, ts: S - 50, target_persona: 'Disney', status: 'in_progress', text: 'viejo id' },
      { id: 200, ts: S - 500, target_persona: 'Disney', status: 'pending', text: 'nuevo id' },
    ] } },
  }, AHORA);
  assert.equal(s.estado, 'idle');
  assert.equal(s.encargo.numero, 200);
  assert.equal(s.encargo.titulo, 'nuevo id');
});
