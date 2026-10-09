// Pulso de tokens en tiempo real (GrokBotBox, 09-10-2026): consumos-pulso-lib.mjs + /api/consumos/pulso + mezcla en /velocidad.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizarPulso, aplicarPulso, medirAgente, tokensEnVentana, seriePorMinuto, mezclar, persona, picoPulso, STALE_MS, KEY_PREFIX, KEY_INDICE } from "./consumos-pulso-lib.mjs";
import { onRequestPost, onRequestGet as getPulso } from "./functions/api/consumos/pulso.js";
import { calcular } from "./functions/api/consumos/velocidad.js";

const M = 60000;
const AHORA = Date.parse("2026-10-09T11:00:00+02:00");
const s = (minAtras) => Math.floor((AHORA - minAtras * M) / 1000);
const kvMem = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const req = (body, token = "secreto") => new Request("https://www.admira.live/api/consumos/pulso", { method: "POST", headers: { "content-type": "application/json", "X-Council-Token": token }, body: JSON.stringify(body) });
const cuerpo = (tokM, tokO) => ({ maquina: "MacMini", agentes: [{ agente: "Morfeo", motor: "claude", cuenta: "csilvasantin@gmail.com", tokHoy: tokM, cacheHoy: 9, ultimoEvento: "2026-10-09T08:59:00Z" }, { agente: "Oráculo", motor: "codex", cuenta: "csilvasantin@gmail.com", tokHoy: tokO }], ts: "2026-10-09T09:00:00Z" });

test("normalizarPulso: valida motor, tokHoy y lista; limpia la máquina", () => {
  assert.equal(normalizarPulso(cuerpo(1, 2)).ok, true);
  assert.equal(normalizarPulso({ maquina: "x", agentes: [{ agente: "A", motor: "grok", tokHoy: 1 }] }).ok, false);
  assert.equal(normalizarPulso({ maquina: "x", agentes: [{ agente: "A", motor: "claude", tokHoy: -1 }] }).ok, false);
  assert.equal(normalizarPulso({ maquina: "", agentes: [] }).ok, false);
  assert.equal(normalizarPulso({ maquina: "Mac Mini<script>", agentes: [{ agente: "A", motor: "claude", tokHoy: 0 }] }).pulso.maquina, "MacMiniscript");
});

test("aplicarPulso: como mucho 1 escritura/min por máquina y poda a 26 h", () => {
  const p = normalizarPulso(cuerpo(100, 10)).pulso;
  let { doc, guardar } = aplicarPulso(null, p, AHORA - 30 * 3600e3);
  assert.equal(guardar, true);
  ({ doc, guardar } = aplicarPulso(doc, p, AHORA - 30 * 3600e3 + 20000));
  assert.equal(guardar, false);
  ({ doc } = aplicarPulso(doc, normalizarPulso(cuerpo(200, 20)).pulso, AHORA));
  assert.equal(doc.agentes.Morfeo.serie.length, 1, "el punto de hace 30 h se poda");
  assert.equal(doc.agentes.Morfeo.tokHoy, 200);
});

test("medirAgente: tokHora = últimos 15 min × 4; 5 min y última hora; reinicio de día", () => {
  const serie = [[s(70), 0], [s(60), 1000], [s(15), 5000], [s(10), 6000], [s(4), 8000], [s(0), 9000]];
  const r = medirAgente({ serie, ultimoPulso: AHORA }, AHORA);
  assert.equal(r.tokUltimos15min, 4000); // puntos con ts > ahora−15 min: 6000−5000 + 8000−6000 + 9000−8000
  assert.equal(r.tokHora, 16000);
  assert.equal(r.tokUltimos5min, 3000);
  assert.equal(r.tokUltimaHora, 8000);
  assert.equal(r.stale, false);
  assert.equal(tokensEnVentana([[s(2), 900], [s(1), 50]], AHORA - 5 * M, AHORA), 50, "bajada = día nuevo");
});

test("medirAgente: sin pulso >3 min → parado, sin velocidad (nunca inventada); ventana parcial se escala", () => {
  const parado = medirAgente({ serie: [[s(20), 0], [s(5), 100]], ultimoPulso: AHORA - STALE_MS - 1000 }, AHORA);
  assert.equal(parado.stale, true);
  assert.equal(parado.tokHora, null);
  const nuevo = medirAgente({ serie: [[s(5), 0], [s(0), 1000]], ultimoPulso: AHORA }, AHORA);
  assert.equal(nuevo.ventanaMin, 5);
  assert.equal(nuevo.tokHora, 12000);
  assert.equal(medirAgente({ serie: [[s(0), 1000]], ultimoPulso: AHORA }, AHORA).tokHora, null, "un solo punto: sin velocidad");
});

test("seriePorMinuto y picoPulso", () => {
  const a = { serie: [[s(3), 0], [s(2), 600], [s(1), 600], [s(0), 900]] };
  const sp = seriePorMinuto([a], AHORA, 60);
  assert.equal(sp.length, 60);
  assert.deepEqual(sp.slice(-3).map((x) => x.tok), [600, 0, 300]);
  assert.equal(picoPulso([a], AHORA), 3600);
  assert.equal(picoPulso([{ serie: [[s(0), 1]] }], AHORA), null);
});

test("mezclar: pulso preferente; Yokup solo para quien no tiene pulso; Anónimo de la misma máquina/motor descartado", () => {
  const docs = [{ maquina: "MacMini", agentes: {
    Morfeo: { motor: "claude", tokHoy: 9000, serie: [[s(15), 5000], [s(0), 9000]], ultimoPulso: AHORA - 20000 },
    "Oráculo": { motor: "codex", tokHoy: 300, serie: [[s(15), 100], [s(0), 300]], ultimoPulso: AHORA - 20000 } } }];
  const yk = { metodo: "ultima-hora", etiqueta: "última hora (medido)", ventanaMin: 60, pico24h: 9e9, porAgente: [
    { agente: "Morfeo · Claude", tokHora: 1e6, tokHoy: 4e8 }, { agente: "Oraculo · Codex", tokHora: 2e6, tokHoy: 5e7 },
    { agente: "Anónimo · Claude (MacMini)", tokHora: 3e6, tokHoy: 6e7 }, { agente: "Jobs · Claude", tokHora: 500, tokHoy: 1000 }] };
  const m = mezclar(yk, docs, AHORA);
  assert.equal(m.metodo, "tiempo real");
  assert.equal(m.etiqueta, "tiempo real + partes Yokup");
  assert.deepEqual(m.porAgente.map((a) => a.agente), ["Morfeo", "Oráculo", "Jobs · Claude"]);
  assert.equal(m.porAgente[0].tokHora, 16000);
  assert.equal(m.porAgente[0].metodo, "tiempo real");
  assert.equal(m.tokHora, 16000 + 800 + 500);
  assert.equal(m.tokUltimos15min, 4200);
  assert.equal(m.haceS, 20);
  assert.equal(m.serie60.length, 60);
  assert.equal(persona("Oraculo · Codex"), persona("Oráculo"));
});

test("mezclar: pulso parado → vuelve Yokup para esa persona; nada de nada → sinDatos", () => {
  const docs = [{ maquina: "MacMini", agentes: { Morfeo: { motor: "claude", tokHoy: 9000, serie: [[s(30), 1], [s(10), 9000]], ultimoPulso: AHORA - 10 * M } } }];
  const yk = { metodo: "media-hoy", etiqueta: "media de hoy (estimado)", ventanaMin: 600, pico24h: 5, porAgente: [{ agente: "Morfeo · Claude", tokHora: 7, tokHoy: 70 }] };
  const m = mezclar(yk, docs, AHORA);
  assert.equal(m.metodo, "media-hoy");
  assert.deepEqual(m.porAgente.map((a) => a.agente), ["Morfeo · Claude"]);
  assert.equal(m.tokHora, 7);
  assert.deepEqual(m.agentesParados, ["Morfeo"]);
  const solo = mezclar(null, docs, AHORA);
  assert.equal(solo.sinDatos, true);
  assert.equal(solo.porAgente[0].tokHora, null);
});

test("endpoint POST /api/consumos/pulso: token obligatorio, guarda una clave por máquina + índice, 202 si <50 s", async () => {
  const kv = kvMem();
  const env = { RECORTE_KV: kv, CONSUMOS_LECTURAS_TOKEN: "secreto" };
  assert.equal((await onRequestPost({ request: req(cuerpo(1, 1), "malo"), env })).status, 401);
  assert.equal((await onRequestPost({ request: req(cuerpo(1, 1)), env: { RECORTE_KV: kv } })).status, 503);
  const r1 = await onRequestPost({ request: req(cuerpo(100, 10)), env });
  assert.equal(r1.status, 200);
  assert.deepEqual(JSON.parse(kv.m.get(KEY_INDICE)), ["MacMini"]);
  assert.ok(kv.m.get(KEY_PREFIX + "MacMini"));
  const r2 = await onRequestPost({ request: req(cuerpo(200, 20)), env });
  assert.equal(r2.status, 202);
  const g = await (await getPulso({ request: new Request("https://www.admira.live/api/consumos/pulso"), env })).json();
  assert.deepEqual(g.agentes.map((a) => [a.agente, a.tokHoy, a.metodo]), [["Morfeo", 100, "tiempo real"], ["Oráculo", 10, "tiempo real"]]);
});

test("velocidad: con pulso y Yokup caído sigue respondiendo (tiempo real); sin nada → sinDatos", async () => {
  const kv = kvMem();
  const ahora = Date.now();
  kv.m.set(KEY_INDICE, JSON.stringify(["MacBookPro16"]));
  kv.m.set(KEY_PREFIX + "MacBookPro16", JSON.stringify({ maquina: "MacBookPro16", agentes: { Neo: { motor: "claude", tokHoy: 5000, serie: [[Math.floor((ahora - 15 * M) / 1000), 1000], [Math.floor(ahora / 1000), 5000]], ultimoPulso: ahora - 5000 } } }));
  const caido = async () => { throw new Error("caída"); };
  const d = await calcular({ env: { RECORTE_KV: kv }, fetchImpl: caido });
  assert.equal(d.ok, true);
  assert.equal(d.metodo, "tiempo real");
  assert.equal(d.yokup, "sin respuesta");
  assert.equal(d.porAgente[0].agente, "Neo");
  assert.ok(d.tokHora > 0);
  const vacio = await calcular({ env: { RECORTE_KV: kvMem() }, fetchImpl: caido });
  assert.equal(vacio.sinDatos, true);
  assert.equal(vacio.tokHora, null);
});

// r19 — por proyecto
import { proyectosDePulso, valorProyecto } from "./consumos-pulso-lib.mjs";

test("normalizarPulso: porProyecto opcional, limpio (texto, enteros ≥ 0)", () => {
  const c = cuerpo(10, 5);
  c.agentes[0].porProyecto = { "admira.live": 7, "otros": 3, "malo": -1 };
  const p = normalizarPulso(c).pulso;
  assert.deepEqual(p.agentes[0].porProyecto, { "admira.live": 7, otros: 3 });
  assert.equal(p.agentes[1].porProyecto, null);
});

test("proyectosDePulso: tokHoy = suma de agentes, tokHora = 15 min × 4 del desglose; parado → sin velocidad; ordenado por tokHoy", () => {
  const docs = [
    { maquina: "MacMini", agentes: { Morfeo: { motor: "claude", ultimoPulso: AHORA - 10000, porProyecto: { "admira.live": 9000, otros: 100 },
      serie: [[s(16), 0, 0, { "admira.live": 0 }], [s(15), 1000, 0, { "admira.live": 1000 }], [s(0), 9100, 0, { "admira.live": 9000, otros: 100 }]] } } },
    { maquina: "MacBookPro16", agentes: { Neo: { motor: "claude", ultimoPulso: AHORA - 20000, porProyecto: { "admira.live": 500, "yokup.com": 20000 },
      serie: [[s(15), 0, 0, { "yokup.com": 20000 }], [s(0), 20500, 0, { "admira.live": 500, "yokup.com": 20000 }]] },
      Trinity: { motor: "codex", ultimoPulso: AHORA - 10 * M, porProyecto: { "pixeria.com": 50 }, serie: [[s(20), 0, 0, {}], [s(10), 50, 0, { "pixeria.com": 50 }]] } } },
  ];
  const p = proyectosDePulso(docs, AHORA);
  assert.deepEqual(p.map((x) => x.proyecto), ["yokup.com", "admira.live", "otros", "pixeria.com"]);
  const live = p.find((x) => x.proyecto === "admira.live");
  assert.equal(live.tokHoy, 9500);
  assert.equal(live.tokUltimos15min, 8000 + 500);
  assert.equal(live.tokHora, 34000);
  assert.deepEqual(live.maquinas, ["MacMini", "MacBookPro16"]);
  assert.equal(p.find((x) => x.proyecto === "yokup.com").tokHora, 0, "con pulso fresco y sin actividad: 0 medido");
  assert.equal(p.find((x) => x.proyecto === "pixeria.com").tokHora, null, "solo agentes parados: sin datos");
  assert.equal(valorProyecto("x")([1, 2, 3]), undefined, "punto sin desglose: desconocido");
  const m = mezclar(null, docs, AHORA);
  assert.equal(m.proyectoTop, "yokup.com");
  assert.equal(m.porProyecto.length, 4);
});

test("aplicarPulso guarda el desglose como 4.º campo del punto", () => {
  const c = cuerpo(10, 5);
  c.agentes[0].porProyecto = { "admira.live": 10 };
  const { doc } = aplicarPulso(null, normalizarPulso(c).pulso, AHORA);
  assert.deepEqual(doc.agentes.Morfeo.serie[0].slice(1), [10, 9, { "admira.live": 10 }]);
  assert.equal(doc.agentes["Oráculo"].serie[0].length, 3);
});

// r22 (Carlos, 12:07: flota 13,0 M tok/h y admira.studio 26,8 M): misma ventana y fórmula para flota, agentes y proyectos.
import { repartoVentana, proyectoDeAgente } from "./consumos-pulso-lib.mjs";
test("Σ proyectos == Σ agentes == flota (re-atribución del colector y dos máquinas, sin doble conteo)", () => {
  const docs = [
    // MacMini: el colector re-atribuye a mitad de ventana (admira.biz baja de 4,2 M a 1,2 M, admira.studio sube 3 M).
    { maquina: "MacMini", agentes: {
      Morfeo: { motor: "claude", ultimoPulso: AHORA - 20000, porProyecto: { "admira.biz": 1200000, "admira.studio": 3100000 },
        serie: [[s(16), 4200000, 0, { "admira.biz": 4200000 }], [s(10), 4250000, 0, { "admira.biz": 4250000 }], [s(5), 4280000, 0, { "admira.biz": 1200000, "admira.studio": 3080000 }], [s(0), 4300000, 0, { "admira.biz": 1200000, "admira.studio": 3100000 }]] },
      "Oráculo": { motor: "codex", ultimoPulso: AHORA - 20000, porProyecto: { "admira.store": 900 },
        serie: [[s(16), 0, 0, {}], [s(0), 900, 0, { "admira.store": 900 }]] } } },
    // MacBookPro16: el colector empieza a contar una sesión vieja (salto del total y del proyecto a la vez).
    { maquina: "MacBookPro16", agentes: {
      Trinity: { motor: "codex", ultimoPulso: AHORA - 10000, porProyecto: { "admira.studio": 3000000, "yokup.com": 600000 },
        serie: [[s(16), 600000, 0, { "yokup.com": 600000 }], [s(8), 3500000, 0, { "admira.studio": 2900000, "yokup.com": 600000 }], [s(0), 3600000, 0, { "admira.studio": 3000000, "yokup.com": 600000 }]] },
      Neo: { motor: "claude", ultimoPulso: AHORA - 10000, tokHoy: 5000, serie: [[s(16), 1000], [s(0), 5000]] } } },
  ];
  const m = mezclar(null, docs, AHORA);
  const sumaAg = m.porAgente.reduce((t, a) => t + (a.tokHora || 0), 0);
  const sumaPr = m.porProyecto.reduce((t, p) => t + (p.tokHora || 0), 0);
  assert.ok(Math.abs(sumaAg - m.tokHora) <= m.porAgente.length, "flota = Σ agentes");
  assert.ok(Math.abs(sumaPr - m.tokHora) <= m.porProyecto.length + 1, `Σ proyectos (${sumaPr}) = flota (${m.tokHora})`);
  for (const p of m.porProyecto) assert.ok((p.tokHora || 0) <= m.tokHora + 1, p.proyecto + " no supera a la flota");
  const st = m.porProyecto.find((p) => p.proyecto === "admira.studio");
  assert.ok(st.tokHora < m.tokHora);
  const r = repartoVentana(docs[0].agentes.Morfeo.serie, AHORA - 15 * M, AHORA);
  assert.equal(Math.round(Object.values(r.porProyecto).reduce((a, b) => a + b, 0)), r.total);
  assert.equal(proyectoDeAgente(docs[1].agentes.Trinity, AHORA), "admira.studio");
  assert.equal(proyectoDeAgente(docs[1].agentes.Neo, AHORA), "otros");
});
