// Mejora 5 (Carlos, 23-10-2026 08:29): histórico por agente o proyecto; sin datos → null, nunca inventado.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { historico, anotarHistorico, anotarEncargos, periodos, claveProyecto } from "./historico-lib.mjs";

const AHORA = Date.parse("2026-10-23T06:30:00Z"); // vie 08:30 Madrid
const S = Math.floor(AHORA / 1000);

test("mejora 6 · periodos Madrid: hoy, ayer, semana pasada (lun–dom anterior), mes pasado (mes natural)", () => {
  assert.deepEqual(periodos(AHORA).map((p) => [p.id, p.desde, p.hasta]), [["hoy", "2026-10-23", "2026-10-23"], ["ayer", "2026-10-22", "2026-10-22"], ["semanaPasada", "2026-10-12", "2026-10-18"], ["mesPasado", "2026-09-01", "2026-09-30"]]);
  // lunes 00:30 Madrid: ayer es domingo y la semana pasada acaba ese domingo; 1 de enero → mes pasado = diciembre del año anterior
  assert.deepEqual(periodos(Date.parse("2026-10-18T22:30:00Z")).slice(1).map((p) => [p.desde, p.hasta]), [["2026-10-18", "2026-10-18"], ["2026-10-12", "2026-10-18"], ["2026-09-01", "2026-09-30"]]);
  assert.deepEqual(periodos(Date.parse("2027-01-01T10:00:00Z"))[3], { id: "mesPasado", desde: "2026-12-01", hasta: "2026-12-31" });
});

test("libro histórico: máximo del día por agente y proyecto; Cursor compartido no se atribuye", () => {
  let l = anotarHistorico(null, "2026-10-23", [{ agente: "Neo", tokHoy: 100 }, { agente: "Merovingio", tokHoy: 9e6, conRetraso: true }], [{ proyecto: "www.admira.live", tokHoy: 50 }, { proyecto: "otros", tokHoy: 9 }], AHORA);
  l = anotarHistorico(l, "2026-10-23", [{ agente: "Neo", tokHoy: 80 }], [{ proyecto: "admira-live", tokHoy: 70 }], AHORA);
  assert.deepEqual(l["2026-10-23"].agentes, { neo: 100 });
  assert.deepEqual(l["2026-10-23"].proyectos, { [claveProyecto("admira.live")]: 70 });
});

test("agente: tokens de partes Yokup y libro; encargos aceptados/cerrados con título; sin cobertura → null", () => {
  const partes = [
    { owner: "NeoMBP16", machine: "MacBookPro16", dia: "2026-10-22", datos: { persona: "Neo", total: 1000, cache: 400 } },
    { owner: "NeoMBP16", machine: "MacBookPro16", dia: "2026-10-14", datos: { persona: "Neo", total: 500, cache: 0, causa: "ESTIMACIÓN (reparto)" } },
    { owner: "NeoMBP16", machine: "MacBookPro16", dia: "2026-10-13", datos: { persona: "Neo", total: 200, cache: 0 } },
  ];
  const libro = { "2026-10-23": { agentes: { neo: 300 }, proyectos: {} } };
  const encargos = [
    { id: 1, etiqueta: "#1.10.23", persona: "Neo", texto: "Arreglar X", status: "done", ts: S - 3600, ack_at: S - 3500, done_at: S - 60 },
    { id: 2, persona: "Morfeo", texto: "otro", status: "done", ts: S - 3600, ack_at: S - 3500, done_at: S - 60 },
  ];
  const h = historico({ tipo: "agente", nombre: "Neo", ahoraMs: AHORA, libro, partes, encargos, misiones: null, ventanaEncargos: S - 3600 });
  const [hoy, ayer, semana, mes] = h.periodos;
  assert.equal(hoy.tokens.total, 300);
  assert.equal(ayer.tokens.total, 600, "sin caché");
  assert.equal(semana.tokens.total, 200, "semana pasada: la ESTIMACIÓN no cuenta");
  assert.equal(mes.tokens, null, "septiembre sin partes → sin datos todavía");
  assert.deepEqual(hoy.encargos.cerrados.map((e) => e.titulo), ["Arreglar X"]);
  assert.equal(hoy.misiones, null, "sin misiones → sin datos todavía");
  assert.equal(ayer.encargos, null, "encargos solo desde hoy → ayer sin datos");
});

test("proyecto: tokens solo del libro (desde hoy); antes → null", () => {
  const libro = { "2026-10-23": { agentes: {}, proyectos: { [claveProyecto("admira-live")]: 12345 } } };
  const misiones = [{ id: "FLT-1", subject: "Hacer Y", status: "resolved", project_id: "admira-live", assignee: "NeoMBP16", created_at: AHORA - 86400000, updated_at: AHORA - 60000 }];
  const h = historico({ tipo: "proyecto", nombre: "admira.live", ahoraMs: AHORA, libro, partes: null, encargos: [], misiones });
  assert.equal(h.periodos[0].tokens.total, 12345);
  assert.equal(h.periodos[1].tokens, null);
  assert.equal(h.periodos[0].misiones.lista[0].titulo, "Hacer Y");
  assert.equal(h.periodos[3].misiones, null, "mes pasado anterior a las misiones → sin datos todavía");
});

test("libro de encargos: une por id y conserva el estado nuevo", () => {
  const a = anotarEncargos([], [{ id: 5, text: "t", status: "pending", ts: S }], AHORA);
  const b = anotarEncargos(a, [{ id: 5, text: "t", status: "done", ts: S, done_at: S + 5 }], AHORA);
  assert.equal(b.length, 1); assert.equal(b[0].status, "done");
});

test("/consumos enlaza «Histórico» junto a Agentes y Proyectos; EN «History»", () => {
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.equal((html.match(/href="\/historico\?tipo=(agente|proyecto)"[^>]*>Histórico</g) || []).length, 2);
  assert.match(readFileSync(new URL("./admira-idioma-consumos.js", import.meta.url), "utf8"), /"Histórico": "History"/);
  assert.match(readFileSync(new URL("./historico-page.js", import.meta.url), "utf8"), /sin datos todavía/);
});

test("proyecto: encargos siempre «parcial»", () => {
  const h = historico({ tipo: "proyecto", nombre: "admira-live", ahoraMs: AHORA, encargos: [{ id: 9, proyecto: "admira-live", texto: "z", status: "done", ts: S - 9e5, done_at: S - 10 }] });
  assert.equal(h.periodos[0].encargos.cobertura, "parcial");
  assert.equal(h.periodos[0].encargos.cerrados.length, 1);
});

test("mejora 6 · el endpoint sirve de KV sin esperar a Yokup (stale-while-revalidate)", async () => {
  const { construir } = await import("./functions/api/consumos/historico.js");
  const datos = new Map([["historico:misiones:resueltas:v1", JSON.stringify({ ts: AHORA - 3600e3, datos: [{ id: "FLT-9", subject: "s", status: "resolved", project_id: "admira-live", created_at: AHORA - 1000, updated_at: AHORA - 500 }] })]]);
  const env = { CONSUMOS_KV: { get: async (k) => datos.get(k) || null, put: async (k, v) => { datos.set(k, v); } } };
  let lento = null;
  const fetchImpl = () => new Promise(() => {}); // Yokup colgado: no debe bloquear
  const t0 = Date.now();
  const r = await construir({ env, fetchImpl, tipo: "proyecto", nombre: "admira-live", ahoraMs: AHORA, enFondo: (p) => { lento = p; } });
  assert.ok(Date.now() - t0 < 500);
  assert.equal(r.fuentes.actualizando, true);
  assert.ok(lento, "refresco lanzado en segundo plano");
  assert.equal(r.periodos[0].misiones.lista[0].id, "FLT-9");
});

test("mejora 6 · cada fuente lenta se guarda en su clave en cuanto llega", async () => {
  const { refrescarFuentes, CLAVES } = await import("./functions/api/consumos/historico.js");
  const datos = new Map();
  const env = { CONSUMOS_KV: { get: async (k) => datos.get(k) || null, put: async (k, v) => { datos.set(k, v); } } };
  const fetchImpl = async (u) => String(u).includes("consumo") ? new Response(JSON.stringify({ partes: [{ owner: "o", machine: "m", dia: "2026-10-22", datos: { persona: "Neo", total: 5 } }] }))
    : String(u).includes("resolved") ? new Response(JSON.stringify({ missions: [{ id: "FLT-1", subject: "x", status: "resolved" }] }))
    : new Response("no", { status: 503 });
  await refrescarFuentes({ env, fetchImpl, ahoraMs: AHORA });
  assert.equal(JSON.parse(datos.get(CLAVES.partes)).datos.length, 1);
  assert.equal(JSON.parse(datos.get(CLAVES.resueltas)).datos[0].id, "FLT-1");
  assert.equal(datos.get(CLAVES.recientes), undefined, "la que falla no pisa nada");
});
