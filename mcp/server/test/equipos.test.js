import test from 'node:test';
import assert from 'node:assert/strict';
import { tablaEquipos, equipoCanonico, crearEquipos, hoyMadrid } from '../src/equipos.js';

const AHORA = () => new Date('2026-10-22T05:45:00Z'); // 07:45 Madrid

function falsos() {
  const log = { encargos: [], mensajes: [], agora: [] };
  let n = 7000;
  const flota = {
    encargar: async (a) => { log.encargos.push(a); n++; return { encargo: n, etiqueta: `#${n}.10.22` }; },
    listarEncargos: async ({ persona }) => ({ encargos: [
      { encargo: 1, etiqueta: '#1.10.22', estado: 'done', texto: `hecho por ${persona}` },
      { encargo: 2, etiqueta: '#2.10.21', estado: 'done', texto: 'ayer' },
      { encargo: 3, etiqueta: '#3.10.22', estado: 'in_progress', texto: 'en curso' },
    ] }),
  };
  const bandeja = { enviar: async (a) => { log.mensajes.push(a); return { ok: true, mensaje: { id: 'cm' + log.mensajes.length } }; } };
  const api = { agoraDecir: async (a) => { log.agora.push(a); return { ok: true }; } };
  const lat = [];
  const latir = async (p, a) => { lat.push([p, a]); return { modo: a.modo }; };
  return { log, flota, bandeja, api, latir, lat };
}

test('tabla por defecto: MacMini = Oráculo (Codex, Walt) + Morfeo (Claude Code, Lucas)', () => {
  const t = tablaEquipos();
  assert.equal(t.macmini.maquina, 'MacMini');
  assert.deepEqual(t.macmini.agentes.map((a) => [a.persona, a.runtime, a.consejero]), [['Oraculo', 'Codex', 'Disney'], ['Morfeo', 'Claude Code', 'Lucas']]);
  assert.deepEqual(t.macmini.consejeros, ['Disney', 'Lucas']);
  assert.deepEqual(t.macstudio.agentes.map((a) => a.persona).sort(), ['Neo', 'Trinity']);
  assert.deepEqual(t.macbookpro16.agentes.map((a) => [a.persona, a.consejero]), [['Smith', 'Jobs'], ['Neo', 'Jobs'], ['Trinity', 'Wozniak']]);
  assert.deepEqual(t.macbookpronegro14.consejeros.sort(), ['Jobs', 'Wozniak']);
  assert.equal(equipoCanonico('MBP16'), 'macbookpro16');
  assert.equal(equipoCanonico('MBP14'), 'macbookpronegro14');
  assert.equal(equipoCanonico('MacBook-Pro-16'), 'macbookpro16');
  assert.equal(equipoCanonico('Mac Mini'), 'macmini');
  assert.equal(equipoCanonico('MacStudio.local'), 'macstudio');
  assert.equal(equipoCanonico('MBP99'), null);
  assert.deepEqual(hoyMadrid(AHORA()), { mmdd: '10.22', iso: '2026-10-22' });
});

test('handON MacMini: encargo a Oráculo y Morfeo, mensaje a Walt y Lucas, monitores por Agora', async () => {
  const f = falsos();
  const r = await crearEquipos({ ...f, ahora: AHORA }).handon({ equipo: 'macmini' });
  assert.equal(r.ok, true);
  assert.deepEqual(f.log.encargos.map((e) => [e.persona, e.maquina]), [['Oraculo', 'MacMini'], ['Morfeo', 'MacMini']]);
  assert.ok(f.log.encargos.every((e) => e.texto.startsWith('handON: empieza la jornada')));
  assert.deepEqual(f.log.mensajes.map((m) => m.para), ['Disney', 'Lucas']);
  assert.equal(f.log.agora.length, 1);
  assert.match(f.log.agora[0].texto, /^handON MacMini · \[equipo_handon\]/);
});

test('handON en prueba no escribe nada', async () => {
  const f = falsos();
  const r = await crearEquipos({ ...f, ahora: AHORA }).handon({ equipo: 'MacMini', prueba: true });
  assert.equal(r.prueba, true);
  assert.equal(r.plan.agentes.length, 2);
  assert.equal(f.log.encargos.length + f.log.mensajes.length + f.log.agora.length, 0);
});

test('si consejero_mensaje falla, el consejero recibe un encargo de respaldo', async () => {
  const f = falsos();
  f.bandeja.enviar = async () => { throw new Error('solo a tu supervisor'); };
  const r = await crearEquipos({ ...f, ahora: AHORA }).handon({ equipo: 'macmini' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.consejeros.map((c) => c.via), ['agente_encargar (respaldo)', 'agente_encargar (respaldo)']);
  assert.deepEqual(f.log.encargos.map((e) => e.persona), ['Oraculo', 'Morfeo', 'Disney', 'Lucas']);
});

test('handOFF: resumen de hoy, cierre a todos y apagado al final; en prueba no apaga', async () => {
  const f = falsos();
  const eq = crearEquipos({ ...f, ahora: AHORA });
  const p = await eq.handoff({ equipo: 'macmini', prueba: true });
  assert.equal(p.resumen.totales.hechos_hoy, 2);
  assert.equal(p.resumen.totales.pendientes, 2);
  assert.equal(f.log.agora.length + f.log.encargos.length + f.log.mensajes.length, 0);
  const r = await eq.handoff({ equipo: 'macmini' });
  assert.equal(r.pausa_en_min, 10);
  assert.equal(r.ok, true);
  assert.equal(f.log.encargos.length, 2);
  assert.ok(f.log.encargos.every((e) => e.texto.startsWith('handOFF: cierra la jornada')));
  assert.deepEqual(f.log.mensajes.map((m) => m.para), ['Disney', 'Lucas']);
  assert.match(f.log.agora[0].texto, /^handOFF MacMini · \[equipo_handoff pausa=10\] apaga monitores/);
  assert.deepEqual(f.lat.map((x) => [x[0], x[1].modo]), [['Disney', 'reposo'], ['Lucas', 'reposo']]);
  const sin = falsos();
  await crearEquipos({ ...sin, ahora: AHORA }).handoff({ equipo: 'macmini', apagar: false });
  assert.match(sin.log.agora[0].texto, /\[equipo_handoff pausa=10 monitores=no\]/);
});

test('equipo desconocido falla legible', async () => {
  await assert.rejects(() => crearEquipos(falsos()).handon({ equipo: 'Tostadora' }), /equipo desconocido/);
});

test('setup modo ahorro: solo monitores, sin encargos ni mensajes', async () => {
  const f = falsos();
  const r = await crearEquipos({ ...f, ahora: AHORA }).ahorro({ equipo: 'MBP16' });
  assert.equal(r.ok, true);
  assert.match(f.log.agora[0].texto, /^setup modo ahorro MacBookPro16 · \[equipo_ahorro\]/);
  assert.equal(f.log.encargos.length + f.log.mensajes.length + f.lat.length, 0);
});

test('handON deja a los consejeros trabajando con su latido', async () => {
  const f = falsos();
  const r = await crearEquipos({ ...f, ahora: AHORA }).handon({ equipo: 'MacStudio' });
  assert.deepEqual(r.latido.map((x) => [x.consejero, x.modo]), [['Jobs', 'trabajando'], ['Wozniak', 'trabajando']]);
});
