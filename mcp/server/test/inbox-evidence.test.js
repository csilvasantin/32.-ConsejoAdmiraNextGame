import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor } from '../src/index.js';
import { identidadAgente } from '../src/yokup.js';

async function fixture(overrides = {}) {
  const calls = [];
  const row = { id: 5848, ts: 1791925022, status: 'done', target_persona: 'Oraculo', target_machine: 'macmini', task_id: 'task-web-1791925022-gmbt', project_id: null, note: 'respuesta anterior', evidencias: [], ...overrides };
  const env = { ADMIRA_TELEGRAM_PANEL_KEY: 'panel', COUNCIL_MACHINE_TOKEN: 'machine', COUNCIL_BASE: 'https://council.test', YOKUP_API: 'https://api.yokup.com', ADMIRA_TELEGRAM_URL: 'https://bot.yokup.com' };
  const fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ path, body, init });
    const ok = x => Response.json(x);
    if (path === '/api/bot-inbox/5848') return ok({ item: row });
    if (path === '/fleet/media') return ok({ url: 'https://api.yokup.com/media/fleet/capture.png' });
    if (path === '/api/council/render-transcript') return new Response(new Uint8Array([137,80,78,71]));
    if (path === '/api/bot-inbox/5848/evidence') {
      assert.equal(init.headers.authorization, 'Bearer panel');
      row.evidencias.push({ id: 'evidence-1', ...body });
      return ok({ ok: true, encargo: row.id, task_id: row.task_id, evidencia: row.evidencias.at(-1) });
    }
    if (path === '/api/presence') return ok({ ok: true });
    throw new Error(`Unexpected request ${path}`);
  };
  const server = crearServidor(env, { fetch }, identidadAgente('Oraculo', 'MacMini'));
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'inbox-evidence-test', version: '1' });
  await client.connect(a);
  return { client, calls, row };
}
const parse = r => JSON.parse(r.content[0].text);
const image = 'iVBORw0KGgoAAAAA';

test('encargo sin FLT: captura y transcripción quedan consultables sin cambiar estado ni nota', async () => {
  const { client, row, calls } = await fixture();
  const r = parse(await client.callTool({ name: 'yokup_evidencia', arguments: { encargo: 5848, momento: 'cierre', imagen_base64: image, transcripcion: 'Captura obtenida en la app de prueba.' } }));
  assert.equal(r.ok, true); assert.equal(r.mision, null); assert.equal(r.encargo, 5848);
  assert.equal(r.imagen, 'https://api.yokup.com/media/fleet/capture.png');
  const state = parse(await client.callTool({ name: 'encargo_estado', arguments: { encargo: 5848 } }));
  assert.equal(state.evidencias.length, 1); assert.equal(row.status, 'done'); assert.equal(row.note, 'respuesta anterior');
  assert.equal(row.evidencias[0].owner, 'OraculoMacMini');
  assert.ok(!calls.some(x => /fleet\/(progress|task-status|plan|sync)|\/status$/.test(x.path)));
  await client.close();
});

test('transcripción sola admite un error de captura sin inventar una imagen real', async () => {
  const { client, calls } = await fixture();
  const r = parse(await client.callTool({ name: 'yokup_evidencia', arguments: { encargo: 5848, transcripcion: 'ERROR exacto de captura: Computer Use denied.' } }));
  assert.equal(r.ok, true); assert.equal(r.evidencia.imagen, null); assert.ok(r.transcripcion_imagen);
  assert.equal(calls.filter(x => x.path === '/fleet/media').length, 1);
  await client.close();
});

test('destinatario o máquina ajenos se rechazan antes de subir o renderizar', async () => {
  for (const override of [{ target_persona: 'Trinity' }, { target_machine: 'MacBookPro16' }]) {
    const { client, calls } = await fixture(override);
    const r = await client.callTool({ name: 'yokup_evidencia', arguments: { encargo: 5848, imagen_base64: image } });
    assert.equal(r.isError, true); assert.match(r.content[0].text, /solo el destinatario/);
    assert.equal(calls.length, 1);
    await client.close();
  }
});

test('destino ausente, doble, formato inválido y paso de encargo fallan sin subir', async () => {
  const { client, calls } = await fixture();
  for (const args of [{}, { mision: 'FLT-1601', encargo: 5848 }, { mision: 'task-web-123' }, { encargo: -1 }, { encargo: 5848, paso: 'a' }]) {
    const r = await client.callTool({ name: 'yokup_evidencia', arguments: { ...args, imagen_base64: image } });
    assert.equal(r.isError, true);
  }
  assert.equal(calls.length, 0);
  await client.close();
});
