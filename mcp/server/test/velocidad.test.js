import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { crearServidor } from '../src/index.js';
import { resumirVelocidad, leerVelocidad, ESQUEMA } from '../src/velocidad.js';

// Datos de EJEMPLO (inventados), con la forma de /api/consumos/velocidad.
const AHORA = Date.parse('2026-11-02T11:00:00Z'); // 12:00 en Madrid
const CRUDO = {
  ok: true, tokHora: 3000000, ventanaMin: 15, metodo: 'tiempo real', tokHoy: 24000000, pico24h: 5000000, escalaMax: 10000000,
  ultimoPulso: '2026-11-02T10:59:30Z', generado: '2026-11-02T10:59:50Z', proyectoAhora: 'ejemplo.com',
  porAgente: [{ agente: 'AgenteEjemplo', maquina: 'MacEjemplo', tokHora: 2000000, tokHoy: 16000000, cuenta: 'secreta', email: 'x@ejemplo.com', stale: false }],
  porProyecto: [{ proyecto: 'ejemplo.com', tokHora: 2500000, tokHoy: 20000000, maquinas: ['MacEjemplo'] }],
  conocidos: [{ email: 'x@ejemplo.com', plan: 'Max' }], grokbotApps: [{ cuenta: 'x@ejemplo.com' }], limites: [{ pct: 100 }],
};

test('resume solo agregados y nunca expone emails, cuentas ni planes', () => {
  const r = resumirVelocidad(CRUDO, AHORA);
  assert.equal(r.esquema, ESQUEMA);
  assert.equal(r.ok, true);
  assert.equal(r.tokHoraAhora, 3000000);
  assert.equal(r.mediaHoyTokHora, 2000000); // 24 M / 12 h
  assert.equal(r.frescura.estado, 'fresco');
  assert.equal(r.frescura.edadS, 30);
  assert.deepEqual(r.porAgente, [{ agente: 'AgenteEjemplo', maquina: 'MacEjemplo', tokHora: 2000000, tokHoy: 16000000, parado: false }]);
  assert.deepEqual(r.porProyecto, [{ proyecto: 'ejemplo.com', tokHora: 2500000, tokHoy: 20000000 }]);
  const s = JSON.stringify(r);
  assert.ok(!/@|secreta|"Max"|plan|conocidos|grokbotApps|limites|cuenta/.test(s), s);
});

test('sin fuente o con ok:false devuelve sinDatos, nunca números inventados', async () => {
  assert.equal(resumirVelocidad({ ok: false, sinDatos: true }, AHORA).sinDatos, true);
  const r = await leerVelocidad({}, { fetch: async () => new Response('x', { status: 502 }), now: () => AHORA });
  assert.equal(r.ok, false); assert.equal(r.tokHoraAhora, null);
  const r2 = await leerVelocidad({}, { fetch: async () => { throw new Error('red'); }, now: () => AHORA });
  assert.equal(r2.sinDatos, true);
});

test('la herramienta MCP consumos_velocidad es de solo lectura y devuelve el resumen', async () => {
  const pedidas = [];
  const server = crearServidor({ MCP_KEY: 'k', CONSUMOS_VELOCIDAD_URL: 'https://fuente.test/api/consumos/velocidad' },
    { fetch: async (u) => { pedidas.push(String(u)); return new Response(JSON.stringify(CRUDO), { status: 200 }); }, now: () => AHORA });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 't', version: '0' }); await client.connect(a);
  const { tools } = await client.listTools();
  const t = tools.find((x) => x.name === 'consumos_velocidad');
  assert.equal(t.annotations.readOnlyHint, true);
  const r = await client.callTool({ name: 'consumos_velocidad', arguments: { detalle: false } });
  const j = JSON.parse(r.content[0].text);
  assert.equal(j.tokHoraAhora, 3000000); assert.equal(j.porAgente, undefined);
  assert.deepEqual(pedidas, ['https://fuente.test/api/consumos/velocidad']);
});
