import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoSilla, crearEstado, TRABAJANDO_SEG } from '../src/estado.js';
import { siguienteMarcaAgente, marcarTrabajo, leerMarcas, claveAgente, CLAVE_KV, REFRESCO_MARCA_SEG } from '../src/desde.js';

// «Desde» real (Carlos, 4-oct-2026 19:15): cuándo entró la silla en su estado actual.
const AHORA = 1_800_000_000_000;
const S = AHORA / 1000;
const WALT = { persona: 'Walt Disney', rol: 'CCO', fuentes: [{ persona: 'Disney', tipo: 'silla', maquina: 'GrokBot', etiqueta: 'DisneyGrokBot' }] };
const kvFalso = (ini = null) => { const m = new Map(ini ? [[CLAVE_KV, JSON.stringify(ini)]] : []); return { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); } }; };
const latido = (extra) => ({ persona: 'Disney', machine: 'GrokBot', updated: S - 30, ...extra });

test('libre: Desde = el más reciente entre encargo cerrado y trabajando:false', () => {
  const bandejas = { Disney: { items: [{ id: 3670, ts: S - 90000, target_persona: 'Disney', status: 'done', done_at: S - 1560 }] } };
  const marcas = { agentes: { [claveAgente('Disney', 'GrokBot')]: { working: false, desde: S - 840 } }, sillas: {} };
  const r = estadoSilla(WALT, { presencia: [latido({ mode: 'pasivo' })], bandejas, marcas }, AHORA);
  assert.equal(r.estado, 'idle');
  assert.equal(r.desde, S - 840);
  assert.equal(r.desde_fuente, 'cambio_trabajando');
  // Sin marca: el cierre del encargo.
  const r2 = estadoSilla(WALT, { presencia: [latido({ mode: 'pasivo' })], bandejas }, AHORA);
  assert.equal(r2.desde, S - 1560);
  assert.equal(r2.desde_fuente, 'encargo_cerrado');
});

test('libre por latido trabajando caducado: Desde = último latido trabajando, y se apunta la parada', () => {
  const k = claveAgente('Disney', 'GrokBot');
  const marcas = { agentes: { [k]: { working: true, desde: S - 3000 } }, sillas: {} };
  const r = estadoSilla(WALT, { presencia: [latido({ mode: 'trabajando', updated: S - TRABAJANDO_SEG - 60 })], bandejas: { Disney: { items: [] } }, marcas }, AHORA);
  assert.equal(r.estado, 'idle');
  assert.equal(r.desde, S - TRABAJANDO_SEG - 60);
  assert.equal(r.desde_fuente, 'latido_caducado');
  assert.deepEqual(r._cambios.agentes[k].working, false);
  assert.equal(r._cambios.sillas['Walt Disney'].estado, 'idle');
});

test('trabajando: Desde = inicio de la racha (el más antiguo entre presence_work y la marca), no el último latido', () => {
  const marcas = { agentes: { [claveAgente('Disney', 'GrokBot')]: { working: true, desde: S - 1200, at: S - 100 } }, sillas: {} };
  const trabajando = [{ persona: 'Disney', machine: 'GrokBot', working_since: S - 200, working_at: S - 30 }];
  const r = estadoSilla(WALT, { presencia: [latido({ mode: 'trabajando' })], bandejas: { Disney: { items: [] } }, trabajando, marcas }, AHORA);
  assert.equal(r.estado, 'working');
  assert.equal(r.desde, S - 1200);
  const r2 = estadoSilla(WALT, { presencia: [latido({ mode: 'trabajando' })], bandejas: { Disney: { items: [] } }, trabajando }, AHORA);
  assert.equal(r2.desde, S - 200);
  assert.equal(r2.desde_fuente, 'presencia_trabajando');
});

test('sin historial de verdad: Desde null (la web dice «sin datos»)', () => {
  const r = estadoSilla(WALT, { presencia: [latido({ mode: 'pasivo' })], bandejas: { Disney: { items: [] } } }, AHORA);
  assert.equal(r.estado, 'idle');
  assert.equal(r.desde, null);
});

test('marca del agente: solo cambia con el flag, no en cada latido', () => {
  assert.deepEqual(siguienteMarcaAgente(null, true, S), { working: true, desde: S, at: S });
  const m = { working: true, desde: S, at: S };
  assert.equal(siguienteMarcaAgente(m, true, S + 60), null);            // latido normal: no escribe
  assert.equal(siguienteMarcaAgente(m, true, S + REFRESCO_MARCA_SEG).desde, S); // refresca at, mismo desde
  assert.deepEqual(siguienteMarcaAgente(m, false, S + 900), { working: false, desde: S + 900, at: S + 900 });
  assert.equal(siguienteMarcaAgente({ working: false, desde: S }, false, S + 60), null);
  assert.equal(siguienteMarcaAgente({ working: true, desde: S, at: S }, true, S + 3600).desde, S + 3600); // racha rota
});

test('marcarTrabajo escribe en el KV y /consejo/estado expone desde y lo guarda', async () => {
  const kv = kvFalso();
  await marcarTrabajo(kv, { persona: 'Disney', machine: 'GrokBot' }, false, S - 840);
  assert.equal((await leerMarcas(kv)).agentes[claveAgente('Disney', 'GrokBot')].desde, S - 840);
  const ok = (o) => new Response(JSON.stringify(o), { status: 200 });
  const fetch = async (u) => {
    u = String(u);
    if (u.endsWith('/api/presence')) return ok({ presence: [latido({ mode: 'pasivo' })] });
    if (u.endsWith('/api/presence/trabajando')) return ok({ items: [] });
    if (u.includes('persona=Disney')) return ok({ items: [{ id: 3670, ts: S - 9e4, target_persona: 'Disney', status: 'done', done_at: S - 1560 }] });
    return ok({ items: [] });
  };
  const d = await crearEstado({ ADMIRA_LIVE_DESDE: kv }, { fetch, now: () => AHORA }).mesa();
  const walt = d.mesa.leyendas.find((x) => x.persona === 'Walt Disney');
  assert.equal(walt.desde, S - 840);
  assert.equal(walt._cambios, undefined);
  assert.equal(d.desde_marcas, 'ok');
  assert.equal((await leerMarcas(kv)).sillas['Walt Disney'].desde, S - 840);
});
