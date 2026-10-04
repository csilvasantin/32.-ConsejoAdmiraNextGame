import test from 'node:test';
import assert from 'node:assert/strict';
import { manejar } from '../src/index.js';
import { estadoSilla, tituloEncargo, MESA } from '../src/estado.js';

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
  const elon = d.mesa.coetaneos.find((s) => s.persona === 'Elon Musk');
  assert.equal(elon.estado, 'working');
  assert.equal(elon.encargo.numero, 5000);
  assert.equal(elon.encargo.titulo, 'Tablero de estado del Consejo en admira.live');
  assert.equal(elon.encargo.desde, S - 3600);
  assert.equal(elon.ultimo_latido, S - 40, 'el latido de MacMini no es el de la GrokBotBox');
  assert.equal(elon.agentes[0].maquina, 'GrokBotBox');
  assert.deepEqual(elon.cola, { pending: 1, ack: 0, in_progress: 1, blocked: 0 });
  const jensen = d.mesa.coetaneos.find((s) => s.persona === 'Jensen Huang');
  assert.equal(jensen.estado, 'working', 'trabajando por latido aunque no haya encargo in_progress');
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
