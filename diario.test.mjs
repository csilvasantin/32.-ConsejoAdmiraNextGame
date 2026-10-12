// #5796 /diario: histórico de partes horarios (preview). Sin red.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { parseFecha, normalizarParte, anadirParte, formatear, fechaMadrid } from "./diario-lib.mjs";
import { onRequestPost, onRequestGet } from "./functions/api/diario.js";
const require = createRequire(import.meta.url);
require("./assets/diario-cli.js"); const cli = globalThis.AdmiraDiario;

const NOW = Date.UTC(2026, 9, 12, 10, 0); // 12-oct-2026 12:00 Madrid
const kvMem = () => ({ m: new Map(), async get(k) { return this.m.get(k) ?? null; }, async put(k, v) { this.m.set(k, v); } });

test("fechas: hoy, ayer y DD.MM.AA", () => {
  assert.equal(parseFecha("", NOW).fecha, "2026-10-12");
  assert.equal(parseFecha("hoy", NOW).fecha, "2026-10-12");
  assert.equal(parseFecha("ayer", NOW).fecha, "2026-10-11");
  assert.equal(parseFecha("12.10.26", NOW).fecha, "2026-10-12");
  assert.equal(parseFecha("1.2.2026", NOW).fecha, "2026-02-01");
  assert.equal(parseFecha("31.02.26", NOW).ok, false);
  assert.equal(parseFecha("mañana", NOW).ok, false);
  assert.equal(fechaMadrid(Date.UTC(2026, 9, 12, 22, 30)), "2026-10-13"); // 00:30 Madrid
});

test("parte: valida agente/hora, tapa secretos y reemplaza el mismo agente+hora", () => {
  assert.equal(normalizarParte({ agente: "Cypher", texto: "x" }, NOW).ok, false);
  assert.equal(normalizarParte({ agente: "Neo", texto: " " }, NOW).ok, false);
  assert.equal(normalizarParte({ agente: "Neo", texto: "x", hora: "25:00" }, NOW).ok, false);
  const a = normalizarParte({ agente: "oraculo", texto: "ok sk-proj-abcdefghijklmnopqrstuv", hora: "9:05" }, NOW);
  assert.equal(a.parte.agente, "Oráculo"); assert.equal(a.parte.hora, "09:05"); assert.ok(!a.parte.texto.includes("sk-proj"));
  let doc = anadirParte(null, a.fecha, normalizarParte({ agente: "Neo", texto: "b", hora: "10:00" }, NOW).parte);
  doc = anadirParte(doc, a.fecha, a.parte);
  doc = anadirParte(doc, a.fecha, normalizarParte({ agente: "Neo", texto: "b2", hora: "10:00" }, NOW).parte);
  assert.deepEqual(doc.partes.map((p) => p.hora + p.agente + p.texto.slice(0, 2)), ["09:05Oráculook", "10:00Neob2"]);
  assert.match(formatear(doc, "2026-10-12")[0], /^📓 Diario 12\.10\.26 · 2 partes$/);
});

test("API: POST con token del Consejo, GET con llave del visor, cronológico y por fecha", async () => {
  const env = { RECORTE_KV: kvMem(), CONSUMOS_LECTURAS_TOKEN: "maquina-123", VISOR_VIEW_TOKEN: "v".repeat(43) };
  const post = (b, t) => onRequestPost({ request: new Request("https://www.admira.live/api/diario", { method: "POST", headers: t ? { "X-Council-Token": t } : {}, body: JSON.stringify(b) }), env });
  assert.equal((await post({ agente: "Neo", texto: "x" })).status, 401);
  assert.equal((await post({ agente: "Neo", texto: "x" }, "mal")).status, 401);
  assert.equal((await post({ agente: "Neo", texto: "tarde", hora: "15:00", fecha: "12.10.26" }, "maquina-123")).status, 200);
  assert.equal((await post({ agente: "Smith", texto: "mañana", hora: "08:00", fecha: "12.10.26" }, "maquina-123")).status, 200);
  assert.equal((await post({ agente: "Trinity", texto: "otro día", hora: "09:00", fecha: "11.10.26" }, "maquina-123")).status, 200);
  assert.equal((await post({ agente: "Nadie", texto: "x" }, "maquina-123")).status, 400);
  const get = (q, k) => onRequestGet({ request: new Request("https://www.admira.live/api/diario" + q, { headers: k ? { "X-Visor-Key": k } : {} }), env });
  assert.equal((await get("?fecha=12.10.26")).status, 401);
  const d = await (await get("?fecha=12.10.26", "v".repeat(43))).json();
  assert.deepEqual(d.partes.map((p) => p.hora + " " + p.agente), ["08:00 Smith", "15:00 Neo"]);
  const ayer = await (await get("?fecha=11.10.26", "v".repeat(43))).json();
  assert.equal(ayer.partes.length, 1);
  assert.equal((await (await get("?fecha=31.02.26", "v".repeat(43))).json()).ok, false);
});

test("CLI: argumento de /diario", () => {
  assert.equal(cli.argumento([]), "");
  assert.equal(cli.argumento(["ayer"]), "ayer");
  assert.equal(cli.argumento(["12.10.26"]), "12.10.26");
  assert.equal(cli.argumento(["foo"]), null);
  assert.equal(cli.argumento(["ayer", "x"]), null);
});
