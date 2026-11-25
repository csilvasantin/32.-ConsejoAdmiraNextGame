import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { presencia, senalLatido, despertar } from "./win95-presencia-lib.mjs";
import { construir } from "./functions/api/win95/presencia.js";
import { claveHilo } from "./chat-hilo-lib.mjs";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const AHORA = Date.parse("2026-11-25T19:30:00Z");
const S = Math.floor(AHORA / 1000);
const iso = (s) => new Date(s * 1000).toISOString();

test("presencia v2: latido viejo pero respuesta/encargo en 24 h = en línea; sin evidencia = fuera", () => {
  const latido = { ok: true, consejeros: {
    Jobs: { modo: "reposo", at: S - 7 * 3600 },
    Wozniak: { modo: "reposo", at: S - 60 },
    Disney: { modo: "reposo", at: S - 20 * 3600 },
    Lucas: { modo: "reposo", at: S - 40 * 3600 },
  } };
  const hilos = { jobs: [{ rol: "carlos", origen: "live", ts: iso(S - 7 * 3600 - 30), entrega: "entregado", detalle: "despertar webhook 200" }, { rol: "jobs", ts: iso(S - 7 * 3600) }] };
  const bandejas = { disney: [{ id: 1, status: "done", done_at: S - 20 * 3600 }], lucas: [{ id: 2, status: "done", done_at: S - 30 * 3600 }] };
  const r = presencia({ latido, hilos, bandejas, ahoraMs: AHORA });
  const on = Object.fromEntries(r.consejeros.map((c) => [c.persona, c.online]));
  assert.deepEqual(on, { jobs: true, wozniak: true, disney: true, lucas: false, musk: false, huang: false });
  const j = r.consejeros.find((c) => c.persona === "jobs");
  assert.equal(j.evidencia, "respuesta en su hilo"); assert.equal(j.despertar, "ok");
  assert.match(r.consejeros.find((c) => c.persona === "lucas").motivo, /sin respuestas en 24 h/);
  for (const c of r.consejeros) assert.equal(c.chat, "/chat/" + c.persona + "/");
});

test("presencia v2: webhook roto (401) deja fuera salvo que haya respondido después", () => {
  const roto = [{ rol: "huang", ts: iso(S - 3600) }, { rol: "carlos", origen: "app", ts: iso(S - 300), entrega: "entregado", detalle: "despertar 401" }];
  const h = presencia({ hilos: { huang: roto }, ahoraMs: AHORA }).consejeros.find((c) => c.persona === "huang");
  assert.equal(h.online, false); assert.equal(h.despertar, "roto"); assert.match(h.motivo, /401/);
  assert.equal(despertar(roto).codigo, "401");
  const arreglado = roto.concat([{ rol: "huang", ts: iso(S - 60) }]);
  assert.equal(presencia({ hilos: { huang: arreglado }, ahoraMs: AHORA }).consejeros.find((c) => c.persona === "huang").online, true);
});

test("presencia: mensaje de Carlos sin contestar > 10 min = fuera de línea aunque haya latido", () => {
  const latido = { ok: true, consejeros: { Musk: { at: S - 30 } } };
  const hilos = { musk: [{ rol: "musk", ts: iso(S - 4000) }, { rol: "carlos", origen: "live", ts: iso(S - 700) }] };
  const m = presencia({ latido, hilos, ahoraMs: AHORA }).consejeros.find((c) => c.persona === "musk");
  assert.equal(m.online, false);
  assert.match(m.motivo, /sin contestar/);
});

test("presencia: sin fuentes no se inventa verde (desconocido)", () => {
  const r = presencia({ latido: null, hilos: {}, bandejas: {}, ahoraMs: AHORA });
  assert.equal(r.en_linea, 0);
  for (const c of r.consejeros) assert.equal(c.online, null);
  assert.equal(senalLatido(null, S), 0);
});

test("/api/win95/presencia: junta latido, bandeja e hilos, sin textos", async () => {
  const store = { [claveHilo("jobs")]: JSON.stringify({ turnos: [{ rol: "jobs", ts: iso(S - 30), texto: "secreto" }] }) };
  const env = { CHAT_KV: { get: async (k) => store[k] ?? null } };
  const fetchImpl = async (url) => ({ ok: true, json: async () => (String(url).includes("inbox")
    ? { items: String(url).includes("Huang") ? [{ id: 9, status: "done", done_at: S - 100, text: "privado" }] : [] }
    : { ok: true, consejeros: {} }) });
  const r = await construir({ env, fetchImpl, ahoraMs: AHORA });
  assert.equal(r.consejeros.find((c) => c.persona === "huang").online, true);
  assert.equal(r.consejeros.find((c) => c.persona === "jobs").evidencia, "respuesta en su hilo");
  assert.equal(r.consejeros.find((c) => c.persona === "musk").online, false);
  assert.equal(/secreto|privado/.test(JSON.stringify(r)), false);
  const caido = await construir({ env: {}, fetchImpl: async () => { throw new Error("x"); }, ahoraMs: AHORA });
  assert.equal(caido.en_linea, 0);
  assert.ok(caido.consejeros.every((c) => c.online === null));
});

test("ICQGram: Fuera de línea = consejeros sin señal + los 3 de la demo; contadores dinámicos", () => {
  assert.match(html, /presencia:\{ url:'\/api\/win95\/presencia', cadaSeg:30 \}/);
  assert.match(html, /on=todos\.filter\(function\(c\)\{ return c\.on; \}\); off=todos\.filter\(function\(c\)\{ return !c\.on; \}\)\.concat\(off\)/);
  assert.match(html, /on:pr\.online===true/, "solo verde con online===true");
  assert.match(html, /'admira\.live\/chat\/'\+pr\.persona/);
  assert.match(html, /lk\.href=cg\.chat/);
  assert.match(html, /<script src="\/auth-gate\.js"><\/script>/);
});
