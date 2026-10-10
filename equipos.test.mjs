// Equipos (GrokBotBox, 10-10-2026 · regla de Carlos: dos equipos, uno por cuenta).
import test from "node:test";
import assert from "node:assert/strict";
import { EQUIPOS } from "./equipos-config.mjs";
import { idEquipo, equipo, equipoDePersona, personasDeEquipo, normalizarHoy, guardarDia, quienLlevaHoy, presupuestoCuenta, semaforoCupo,
  tokensEquipo, lineasEquipo, encargosEquipo, tarjetaEquipo } from "./equipos-lib.mjs";
import { orquestar } from "./orquestar-lib.mjs";
import { CUENTAS } from "./consumos-lecturas-lib.mjs";
import { PERSONAS } from "./orquestar-config.mjs";
import { onRequestPost } from "./functions/api/equipos/hoy.js";

const AHORA = Date.parse("2026-10-10T07:40:00Z"); // 09:40 Madrid
const S = AHORA / 1000;
const NX = equipo("admiranext"), LV = equipo("admiralive");

test("config: cada equipo con su cuenta; las cuentas existen y ninguna está en los dos", () => {
  const ids = new Set(CUENTAS.map((c) => c.id));
  for (const e of EQUIPOS) for (const c of e.cuentas) assert.ok(ids.has(c), c);
  assert.deepEqual(NX.cuentas.filter((c) => LV.cuentas.includes(c)), []);
  assert.equal(NX.cuenta, "csilva@admira.com");
  assert.equal(LV.cuenta, "csilvasantin@gmail.com");
  assert.equal(NX.orquestador, "Jobs");
  assert.equal(LV.orquestador, "Musk");
  assert.equal(LV.respaldo, "Jobs");
});

test("alias de equipo y de persona", () => {
  assert.equal(idEquipo("admira.live"), "admiralive");
  assert.equal(idEquipo("AdmiraNeXT"), "admiranext");
  assert.equal(idEquipo("Equipo admira.live"), "admiralive");
  assert.equal(idEquipo("otro"), null);
  assert.equal(equipoDePersona("NeoMBP16").id, "admiranext");
  assert.equal(equipoDePersona("Elon").id, "admiralive");
  assert.equal(equipoDePersona("Oraculo").id, "admiralive");
  assert.equal(equipoDePersona("Walt").id, "admiranext");
  assert.equal(equipoDePersona("Smith"), null);
});

test("personasDeEquipo: solo miembros con cuenta del equipo — nunca se cruzan cuentas", () => {
  const nx = personasDeEquipo(NX), lv = personasDeEquipo(LV);
  assert.deepEqual(nx.map((p) => p.persona).sort(), ["Disney", "Jobs", "Lucas", "Neo", "Trinity", "Wozniak"]);
  assert.deepEqual(lv.map((p) => p.persona).sort(), ["Huang", "Morfeo", "Musk", "Oráculo"]);
  for (const p of nx) assert.ok(NX.cuentas.includes(p.cuenta));
  for (const p of lv) assert.ok(LV.cuentas.includes(p.cuenta));
});

test("orquestar con equipo: aunque fuera haya alguien mejor, elige dentro del equipo", () => {
  const cuentas = [{ id: "neo-claude", margen: 95, semaforo: "verde" }, { id: "morfeo-claude", margen: 10, semaforo: "rojo" }, { id: "oraculo-codex", margen: 50, semaforo: "verde" }];
  const presencia = ["Neo", "Morfeo", "Oraculo"].map((persona) => ({ persona, updated: S - 30 }));
  const global = orquestar({ tipo: "codigo", cuentas, presencia, bandeja: [], ahora: AHORA });
  assert.equal(global.elegido.persona, "Neo");
  const lv = orquestar({ tipo: "codigo", cuentas, presencia, bandeja: [], ahora: AHORA, personas: personasDeEquipo(LV) });
  assert.ok(["Oráculo", "Morfeo"].includes(lv.elegido.persona));
  for (const c of lv.candidatos) assert.ok(LV.cuentas.includes(PERSONAS.find((p) => p.persona === c.persona).cuenta));
  assert.ok(lv.elegido.motivo.length > 0);
});

test("quién lo lleva hoy: semilla del 10-oct = Carlos admira.live; Jobs AdmiraNeXT; Elon sin latido → respaldo Jobs", () => {
  const h = quienLlevaHoy({ ahora: AHORA, presencia: [{ persona: "Jobs", updated: S - 60 }] });
  assert.equal(h.fecha, "2026-10-10");
  assert.equal(h.fijado, "inicial");
  assert.equal(h.equipos.admiralive.lleva, "Carlos");
  assert.equal(h.equipos.admiralive.respaldoActivo, true);
  assert.equal(h.equipos.admiralive.orquestaHoy, "Jobs");
  assert.equal(h.equipos.admiranext.lleva, "Jobs");
  assert.match(h.equipos.admiranext.motivo, /Carlos supervisa/);
  const conElon = quienLlevaHoy({ ahora: AHORA, presencia: [{ persona: "Elon", updated: S - 60 }] });
  assert.equal(conElon.equipos.admiralive.respaldoActivo, false);
  // Otro día sin fijar: cada equipo con su orquestador.
  const otro = quienLlevaHoy({ ahora: AHORA + 86400000, presencia: [] });
  assert.equal(otro.fijado, null);
  assert.equal(otro.equipos.admiranext.lleva, "Jobs");
  assert.equal(otro.equipos.admiralive.lleva, "Jobs"); // Elon sin latido → Jobs de respaldo
  assert.match(otro.equipos.admiralive.motivo, /Sin fijar/);
  // Fijado por POST para mañana: Carlos lleva AdmiraNeXT.
  const { dia } = normalizarHoy({ carlos: "admiranext", fecha: "2026-10-11", autor: "Carlos" }, AHORA);
  const man = quienLlevaHoy({ doc: guardarDia(null, dia), ahora: AHORA + 86400000, presencia: [{ persona: "Musk", updated: S + 86400 - 10 }] });
  assert.equal(man.fijado, "post");
  assert.equal(man.equipos.admiranext.lleva, "Carlos");
  assert.equal(man.equipos.admiralive.lleva, "Musk");
  assert.equal(man.equipos.admiralive.llevaNombre, "Elon");
});

test("normalizarHoy: valida equipo, fecha y autor", () => {
  assert.match(normalizarHoy({ carlos: "x", autor: "C" }, AHORA).error, /admiranext/);
  assert.match(normalizarHoy({ carlos: "live" }, AHORA).error, /autor/);
  assert.match(normalizarHoy({ carlos: "live", autor: "C", fecha: "2026-11-30" }, AHORA).error, /±7/);
  assert.equal(normalizarHoy({ carlos: "admira.live", autor: "Carlos" }, AHORA).dia.fecha, "2026-10-10");
});

test("POST /api/equipos/hoy: sin token 401; con token guarda", async () => {
  const store = new Map();
  const env = { CONSUMOS_LECTURAS_TOKEN: "secreto", CONSUMOS_KV: { get: async (k) => store.get(k) ?? null, put: async (k, v) => store.set(k, v) } };
  const fetchImpl = async () => ({ ok: false });
  const req = (tok) => new Request("https://x/api/equipos/hoy", { method: "POST", headers: tok ? { "X-Council-Token": tok } : {}, body: JSON.stringify({ carlos: "admiralive", autor: "Carlos" }) });
  assert.equal((await onRequestPost({ request: req(null), env, fetchImpl })).status, 401);
  assert.equal((await onRequestPost({ request: req("malo"), env, fetchImpl })).status, 401);
  const r = await onRequestPost({ request: req("secreto"), env, fetchImpl });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.equipos.admiralive.esCarlos, true);
  assert.ok(store.get("equipos:hoy:v1"));
});

const L = (ts, cuenta, agente, pct, reset) => ({ ts, cuenta, agente, pct, reset });

test("presupuesto: cupo = margen a las 00:00 ÷ días al reset; gasto = última − 00:00", () => {
  const c = { id: "leyendas", nombre: "Leyendas", cuenta: "csilva@admira.com", manda: "Grok Bot semanal", pct: 30, reset: "2026-10-15T22:00:00Z", proyeccion: { ritmoDia: 4 } };
  const ls = [L("2026-10-09T22:10:00Z", "csilva@admira.com", "Grok Bot semanal", 20, "2026-10-15T22:00:00Z"), L("2026-10-10T07:00:00Z", "csilva@admira.com", "Grok Bot semanal", 30, "2026-10-15T22:00:00Z")];
  const p = presupuestoCuenta(c, ls, AHORA);
  assert.equal(p.estado, "medido");
  assert.equal(p.margen00, 80);
  assert.equal(p.cupoDia, 13.33); // 80 / 6 días
  assert.equal(p.usadoHoy, 10);
  assert.equal(p.pctCupo, 75);
  assert.equal(p.semaforo, "amarillo");
  assert.equal(p.prevision, null); // medido: sin previsión
});

test("presupuesto: sin lectura desde las 00:00 → no medido (previsión al ritmo); sin reset → se dice", () => {
  const c = { id: "coetaneos", nombre: "Coetáneos", cuenta: "g", manda: "Grok Bot semanal", pct: 39, reset: "2026-10-14T18:46:00Z", proyeccion: { ritmoDia: 3 } };
  const p = presupuestoCuenta(c, [L("2026-10-09T22:16:00Z", "g", "Grok Bot semanal", 39, "2026-10-14T18:46:00Z")], AHORA);
  assert.equal(p.estado, "sin-lectura-hoy");
  assert.equal(p.usadoHoy, null);
  assert.equal(p.pctCupo, null);
  assert.ok(p.prevision > 0);
  assert.match(p.texto, /sin lectura desde las 00:00/);
  const sr = presupuestoCuenta({ ...c, reset: null }, [L("2026-10-09T22:16:00Z", "g", "Grok Bot semanal", 39, null)], AHORA);
  assert.equal(sr.estado, "sin-reset");
  assert.equal(sr.cupoDia, null);
  assert.match(sr.texto, /reset desconocida/);
  assert.equal(presupuestoCuenta({ id: "m", nombre: "M", pct: null }, [], AHORA).estado, "sin-lectura");
  assert.equal(semaforoCupo(50), "verde"); assert.equal(semaforoCupo(90), "amarillo"); assert.equal(semaforoCupo(120), "rojo"); assert.equal(semaforoCupo(null), "sin");
});

test("tokens del equipo: pulso de ayer no cuenta; el Consejo Grok Bot va con AdmiraNeXT", () => {
  const ag = [
    { agente: "Neo", tokHoy: 3_800_000, ultimoPulso: "2026-10-09T21:35:00Z" },
    { agente: "Trinity", tokHoy: 1000, ultimoPulso: "2026-10-10T07:39:00Z" },
    { agente: "Oráculo", tokHoy: 500, ultimoPulso: "2026-10-10T07:39:00Z" },
    { agente: "Smith", tokHoy: 9999, ultimoPulso: "2026-10-10T07:39:00Z" },
    { agente: "Grok Bot (Consejo)", tokHoy: 200, ultimoPulso: "2026-10-10T07:10:00Z", conRetraso: true, cubre: ["Jobs", "Wozniak", "Lucas", "Disney"] },
  ];
  const nx = tokensEquipo(NX, ag, AHORA), lv = tokensEquipo(LV, ag, AHORA);
  assert.equal(nx.total, 1200);
  assert.equal(nx.filas.find((f) => f.quien === "Neo").nota, "sin pulso hoy");
  assert.deepEqual(nx.sinMedida, []);
  assert.equal(lv.total, 500);
  assert.deepEqual(lv.sinMedida, ["Elon", "Jensen", "Morfeo"]);
});

test("líneas, tok/línea y encargos activos por equipo", () => {
  const lin = lineasEquipo(NX, [{ agente: "Jobs", lineas: 300 }, { agente: "Wozniak", lineas: 4 }, { agente: "Oraculo", lineas: 50 }]);
  assert.equal(lin.total, 304);
  const band = [
    { id: 1, target_persona: "Neo", status: "in_progress", ts: S - 3600 },
    { id: 2, target_persona: "Trinity", status: "pending", ts: S - 3600 },
    { id: 3, target_persona: "Trinity", status: "pending", ts: S - 72 * 3600 },
    { id: 4, target_persona: "Oraculo", status: "ack", ts: S - 60 },
    { id: 5, target_persona: "Neo", status: "done", ts: S - 60 },
  ];
  assert.deepEqual(encargosEquipo(NX, band, AHORA), { total: 2, enCurso: 1, pendientes: 1, porPersona: { Neo: 1, Trinity: 1 }, ids: [1, 2] });
  assert.equal(encargosEquipo(LV, band, AHORA).total, 1);
  const t = tarjetaEquipo(NX, { hoy: quienLlevaHoy({ ahora: AHORA }), agentes: [{ agente: "Trinity", tokHoy: 30400, ultimoPulso: "2026-10-10T07:00:00Z" }], lineasHoyPorAgente: [{ agente: "Jobs", lineas: 304 }], bandeja: band, ahora: AHORA });
  assert.equal(t.tokPorLinea, 100);
  assert.equal(t.hoy.lleva, "Jobs");
});

test("GET /api/orquestar?equipo=…: solo candidatos del equipo; ?de= infiere; cruce de cuentas → 400", async () => {
  const { onRequestGet } = await import("./functions/api/orquestar.js");
  const fetchImpl = async () => ({ ok: false });
  const pide = async (q) => onRequestGet({ request: new Request("https://x/api/orquestar?tipo=codigo" + q), env: {}, fetchImpl });
  const lv = await (await pide("&equipo=admiralive")).json();
  assert.equal(lv.equipo.id, "admiralive");
  assert.deepEqual(lv.candidatos.map((c) => c.persona).sort(), ["Huang", "Morfeo", "Musk", "Oráculo"]);
  assert.match(lv.equipo.motivo, /Nunca se cruzan cuentas/);
  assert.match(lv.elegido.motivo, /csilvasantin@gmail\.com/);
  const de = await (await pide("&de=NeoMBP16")).json();
  assert.equal(de.equipo.id, "admiranext");
  assert.ok(de.candidatos.every((c) => ["Neo", "Trinity", "Jobs", "Wozniak", "Lucas", "Disney"].includes(c.persona)));
  assert.equal((await pide("&equipo=admiranext&de=Morfeo")).status, 400);
  assert.equal((await pide("&equipo=nada")).status, 400);
  const glob = await (await pide("")).json();
  assert.equal(glob.equipo.id, null);
  assert.ok(glob.candidatos.length + glob.excluidos.length === PERSONAS.length);
});

test("/consumos: zona «Equipos» plegable, cerrada por defecto, arriba del todo y con su script", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /data-plegable="equipos"/);
  assert.match(html, /class="plg-boton" aria-expanded="false" aria-controls="equipos-cuerpo"/);
  assert.match(html, /id="equipos-resumen"/);
  assert.ok(html.indexOf('data-plegable="equipos"') < html.indexOf('data-plegable="trabajando"'));
  assert.match(html, /<script src="\/assets\/consumos-equipos\.js/);
});
