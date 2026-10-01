'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGrokBotEncargo, createGrokBotRouter, createMcpClient, loadMcpKey, encargoText } = require('./grokbot-encargo');

const joshua = { email: 'jsedano@admira.com', jti: 'session-j' };
const carlos = { email: 'csilva@admira.com', jti: 'session-c' };
function setup(t, mcpImpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admira-encargo-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  let clock = 1790000000000;
  const mcp = { call: async (name, args) => { calls.push({ name, args }); return mcpImpl(name, args, calls); } };
  const provider = createGrokBotEncargo({ environment: { GROKBOT_ENCARGO_STATE_FILE: path.join(dir, 'state.json') }, keyProvider: () => 'k', mcp, now: () => (clock += 10000) });
  return { provider, calls };
}
const flush = () => new Promise(r => setImmediate(r));

test('Elon y Jensen van por encargo; Jobs sigue en su proveedor', () => {
  const { provider } = setup({ after() {} }, async () => ({}));
  assert.equal(provider.handles('Elon Musk'), true);
  assert.equal(provider.handles('Musk'), true);
  assert.equal(provider.handles('Steve Jobs'), false);
  assert.equal(provider.handles('Jensen Huang'), true);
  assert.equal(provider.handles('Huang'), true);
  assert.equal(provider.handles('Walt Disney'), false);
});

test('un mensaje de Joshua crea un encargo MCP para el Merovingio y la respuesta vuelve al chat', async t => {
  let estado = 'pending';
  const { provider, calls } = setup(t, async (name) => {
    if (name === 'agente_encargar') return { ok: true, encargo: 4901, etiqueta: '#4901.10.01' };
    if (name === 'encargo_estado') return estado === 'done'
      ? { encargo: 4901, estado: 'done', respuesta: 'Hola Joshua, soy Elon.', cierre: '2026-10-01 09:00 UTC' }
      : { encargo: 4901, estado, respuesta: estado === 'ack' ? 'Merovingio lo coge' : null };
    throw new Error('unexpected');
  });
  const caps = provider.capabilities(joshua, 'Elon Musk');
  assert.equal(caps.mode, 'encargo'); assert.equal(caps.available, true); assert.equal(caps.bidirectional, true); assert.equal(caps.selectedPersona, 'Musk');
  const sent = await provider.send(joshua, { message_id: 'msg-joshua-0001', persona: 'Elon Musk', prompt: '¿Qué opinas del plan?' });
  assert.equal(sent.status, 'pending'); assert.equal(sent.encargo, 4901); assert.equal(sent.source, 'encargo'); assert.equal(sent.native, true);
  const enc = calls.find(c => c.name === 'agente_encargar').args;
  assert.equal(enc.persona, 'Merovingio'); assert.equal(enc.maquina, 'GrokBotBox');
  assert.match(enc.de, /jsedano@admira\.com/); assert.match(enc.texto, /¿Qué opinas del plan\?/); assert.match(enc.texto, /^\[chat-coetaneos\] Joshua → Elon Musk\nContexto:\n\(sin historial\)\nMensaje de Joshua <jsedano@admira\.com>:\n¿Qué opinas del plan\?$/);
  assert.equal(caps.agente, 'Merovingio');
  // El acuse no se pinta como respuesta.
  estado = 'ack';
  const acked = await provider.get(joshua, sent.id);
  assert.equal(acked.status, 'in_progress'); assert.equal(acked.text, '');
  estado = 'done';
  const done = await provider.get(joshua, sent.id);
  assert.equal(done.status, 'done'); assert.equal(done.text, 'Hola Joshua, soy Elon.');
  // Idempotente: reenviar el mismo message_id no crea otro encargo.
  await provider.send(joshua, { message_id: 'msg-joshua-0001', persona: 'Elon Musk', prompt: '¿Qué opinas del plan?' });
  assert.equal(calls.filter(c => c.name === 'agente_encargar').length, 1);
  // Cada persona ve solo lo suyo.
  assert.equal(provider.list(joshua, 'Elon Musk').length, 1);
  assert.equal(provider.list(carlos, 'Elon Musk').length, 0);
  await assert.rejects(provider.get(carlos, sent.id), e => e.code === 'message_not_found');
});

test('rechazo explícito del MCP → failed; fallo ambiguo → unknown sin reintento', async t => {
  let mode = 'reject';
  const { provider, calls } = setup(t, async (name) => {
    if (mode === 'reject') { const e = new Error('mcp_tool_error'); e.rejected = true; throw e; }
    throw new Error('network');
  });
  const a = await provider.send(carlos, { message_id: 'msg-reject-0001', persona: 'Elon Musk', prompt: 'hola Elon' });
  assert.equal(a.status, 'failed');
  mode = 'network';
  const b = await provider.send(carlos, { message_id: 'msg-network-001', persona: 'Elon Musk', prompt: 'hola Elon' });
  assert.equal(b.status, 'unknown');
  await provider.send(carlos, { message_id: 'msg-network-001', persona: 'Elon Musk', prompt: 'hola Elon' });
  assert.equal(calls.length, 2);
});

test('validación: sin sesión, adjuntos, campos extra, prompt vacío y conflictos', async t => {
  const { provider } = setup(t, async () => ({ ok: true, encargo: 1 }));
  await assert.rejects(provider.send({ email: 'x@y.z' }, { message_id: 'msg-000000001', persona: 'Elon Musk', prompt: 'hola' }), e => e.code === 'authenticated_session_required');
  await assert.rejects(provider.send(carlos, { message_id: 'msg-000000001', persona: 'Elon Musk', prompt: 'hola', attachments: ['a'] }), e => e.code === 'desktop_attachments_unavailable');
  await assert.rejects(provider.send(carlos, { message_id: 'msg-000000001', persona: 'Elon Musk', prompt: 'hola', from: 'otro' }), e => e.code === 'unsupported_message_field');
  await assert.rejects(provider.send(carlos, { message_id: 'msg-000000001', persona: 'Elon Musk', prompt: ' ' }), e => e.code === 'invalid_prompt');
  await assert.rejects(provider.send(carlos, { message_id: 'msg-000000001', persona: 'Steve Jobs', prompt: 'hola' }), e => e.code === 'unsupported_persona');
  await provider.send(carlos, { message_id: 'msg-000000001', persona: 'Elon Musk', prompt: 'hola' });
  await assert.rejects(provider.send(carlos, { message_id: 'msg-000000001', persona: 'Elon Musk', prompt: 'otra cosa' }), e => e.code === 'message_id_conflict');
});

test('el router manda Elon al encargo y el resto al proveedor base', async t => {
  const { provider } = setup(t, async () => ({ ok: true, encargo: 7, etiqueta: '#7.10.01' }));
  const seen = [];
  const base = {
    capabilities: () => ({ mode: 'desktop' }), list: (s, p) => { seen.push(['list', p]); return []; },
    select: (s, p) => { seen.push(['select', p]); return { selectedPersona: 'Jobs' }; },
    send: async (s, b) => { seen.push(['send', b.persona]); return { id: 'gb_x' }; }, get: async () => ({ id: 'base' }),
    controls: () => ({ ok: true }), start() { seen.push(['start']); },
  };
  const router = createGrokBotRouter({ base, encargo: provider });
  assert.equal(router.capabilities(carlos, 'Elon Musk').mode, 'encargo');
  assert.equal(router.capabilities(carlos, 'Steve Jobs').mode, 'desktop');
  assert.equal(router.capabilities(carlos, null).mode, 'desktop');
  assert.deepEqual(router.select(carlos, 'Elon Musk'), { selectedPersona: 'Musk', status: 'idle' });
  router.select(carlos, 'Steve Jobs'); router.list(carlos, 'Steve Jobs');
  await router.send(carlos, { persona: 'Steve Jobs', prompt: 'x', message_id: 'msg-00000001' });
  const elon = await router.send(carlos, { persona: 'Elon Musk', prompt: 'hola', message_id: 'msg-00000002' });
  assert.equal(elon.encargo, 7);
  assert.equal((await router.get(carlos, elon.id)).encargo, 7);
  assert.equal((await router.get(carlos, 'gb_' + 'a'.repeat(48))).id, 'base');
  assert.throws(() => router.controls(carlos, { persona: 'Elon Musk', action: 'routines' }), e => e.code === 'desktop_controls_unavailable');
  router.start();
  assert.deepEqual(seen, [['select', 'Steve Jobs'], ['list', 'Steve Jobs'], ['send', 'Steve Jobs'], ['start']]);
});

test('la lista refresca en segundo plano los encargos abiertos', async t => {
  let n = 0;
  const { provider } = setup(t, async (name) => name === 'agente_encargar' ? { encargo: 9 } : (n++, { estado: 'done', respuesta: 'Listo.' }));
  await provider.send(carlos, { message_id: 'msg-bg-000001', persona: 'Elon Musk', prompt: 'hola' });
  provider.list(carlos, 'Elon Musk');
  await flush(); await flush();
  assert.equal(n, 1);
  assert.equal(provider.list(carlos, 'Elon Musk')[0].text, 'Listo.');
});

test('cliente MCP: sesión, SSE y errores de herramienta', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body); seen.push([body.method, init.headers['mcp-session-id'] || null, init.headers.authorization]);
    const headers = { get: k => k === 'mcp-session-id' ? 'sess-1' : null };
    if (body.method === 'tools/call') {
      const payload = body.params.name === 'malo' ? { result: { isError: true, content: [{ type: 'text', text: 'no' }] } } : { result: { content: [{ type: 'text', text: '{"encargo":5}' }] } };
      return { ok: true, headers, text: async () => 'event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 2, ...payload }) + '\n\n' };
    }
    return { ok: true, headers, text: async () => '' };
  };
  const client = createMcpClient({ keyProvider: () => 'clave', fetchImpl });
  assert.deepEqual(await client.call('agente_encargar', {}), { encargo: 5 });
  assert.deepEqual(seen.map(s => s.slice(0, 2)), [['initialize', null], ['notifications/initialized', 'sess-1'], ['tools/call', 'sess-1']]);
  assert.equal(seen[0][2], 'Bearer clave');
  await assert.rejects(client.call('malo', {}), e => e.rejected === true);
});

test('la clave se lee de un fichero privado y nunca de uno abierto', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admira-encargo-key-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'k');
  fs.writeFileSync(file, 'abc123\n', { mode: 0o600 });
  assert.equal(loadMcpKey({ GROKBOT_ENCARGO_MCP_KEY_FILE: file }), 'abc123');
  fs.chmodSync(file, 0o644);
  assert.throws(() => loadMcpKey({ GROKBOT_ENCARGO_MCP_KEY_FILE: file }), e => e.code === 'encargo_not_configured');
  assert.throws(() => loadMcpKey({ GROKBOT_ENCARGO_MCP_KEY_FILE: path.join(dir, 'no') }), e => e.code === 'encargo_not_configured');
  assert.equal(encargoText('a@b.c', 'Musk', 'hola'), '[chat-coetaneos] a@b.c → Elon Musk\nContexto:\n(sin historial)\nMensaje de a@b.c:\nhola');
});

test('Jensen: encargo a Cypher con la marca común y el historial reciente como Contexto', async t => {
  let n = 4950;
  const { provider, calls } = setup(t, async (name, args) => {
    if (name === 'agente_encargar') return { ok: true, encargo: ++n, etiqueta: '#' + n + '.10.01' };
    if (name === 'encargo_estado') return { encargo: args.encargo, estado: 'done', respuesta: 'Respuesta ' + args.encargo, cierre: '2026-10-01 09:00 UTC' };
    throw new Error('unexpected');
  });
  assert.equal(provider.capabilities(joshua, 'Jensen Huang').agente, 'Cypher');
  const a = await provider.send(joshua, { message_id: 'msg-jensen-0001', persona: 'Jensen Huang', prompt: 'Hola Jensen, me llamo Joshua' });
  assert.equal((await provider.get(joshua, a.id)).text, 'Respuesta 4951');
  await provider.send(joshua, { message_id: 'msg-jensen-0002', persona: 'Jensen Huang', prompt: '¿Cómo me llamo?' });
  const encs = calls.filter(c => c.name === 'agente_encargar').map(c => c.args);
  assert.equal(encs[1].persona, 'Cypher'); assert.equal(encs[1].maquina, 'GrokBotBox');
  assert.equal(encs[1].texto, '[chat-coetaneos] Joshua → Jensen Huang\nContexto:\nJoshua: Hola Jensen, me llamo Joshua\nJensen Huang: Respuesta 4951\nMensaje de Joshua <jsedano@admira.com>:\n¿Cómo me llamo?');
  // El historial es por persona y por consejero: Elon no hereda lo hablado con Jensen.
  await provider.send(joshua, { message_id: 'msg-elon-0001', persona: 'Elon Musk', prompt: 'Hola Elon' });
  assert.match(calls.filter(c => c.name === 'agente_encargar').at(-1).args.texto, /\(sin historial\)/);
});

test('el texto del encargo nunca supera el límite del bot-inbox', () => {
  const largo = 'x'.repeat(3000);
  const history = Array.from({ length: 10 }, (_, i) => ({ prompt: 'p'.repeat(500) + i, text: 't'.repeat(900) + i }));
  const texto = encargoText('jsedano@admira.com', 'Huang', largo, { history });
  assert.ok(texto.length <= 3900, texto.length);
  assert.ok(texto.endsWith(largo));
});

test('GROKBOT_ENCARGO_SILLAS limita las sillas por encargo (p. ej. solo Elon mientras Cypher no tiene modo chat)', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admira-encargo-sillas-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = createGrokBotEncargo({ environment: { GROKBOT_ENCARGO_SILLAS: 'Musk', GROKBOT_ENCARGO_STATE_FILE: path.join(dir, 's.json') }, keyProvider: () => 'k', mcp: { call: async () => ({}) } });
  assert.equal(p.handles('Elon Musk'), true);
  assert.equal(p.handles('Jensen Huang'), false);
});
