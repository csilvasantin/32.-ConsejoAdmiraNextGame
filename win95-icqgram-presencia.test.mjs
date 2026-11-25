import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { presencia, senalLatido, VIVO_SEG } from "./win95-presencia-lib.mjs";
import { construir } from "./functions/api/win95/presencia.js";
import { claveHilo } from "./chat-hilo-lib.mjs";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const AHORA = Date.parse("2026-11-25T19:30:00Z");
const S = Math.floor(AHORA / 1000);
const iso = (s) => new Date(s * 1000).toISOString();

test("presencia: verde solo con señal en 15 min (latido o respuesta en su hilo)", () => {
  const latido = { ok: true, consejeros: {
    Jobs: { modo: "reposo", at: S - 60, desde: S - 60 },
    Wozniak: { modo: "reposo", at: S - VIVO_SEG - 5 },
    Huang: { modo: "trabajando", caducado: false, at: S - 3000, hasta: S + 300 },
  } };
  const hilos = { disney: [{ rol: "carlos", origen: "app", ts: iso(S - 900) }, { rol: "disney", ts: iso(S - 120) }], lucas: [] };
  const r = presencia({ latido, hilos, ahoraMs: AHORA });
  const on = Object.fromEntries(r.consejeros.map((c) => [c.persona, c.online]));
  assert.deepEqual(on, { jobs: true, wozniak: false, disney: true, lucas: false, musk: false, huang: true });
  assert.equal(r.en_linea, 3);
  assert.equal(r.consejeros.find((c) => c.persona === "disney").fuente, "hilo");
  for (const c of r.consejeros) assert.equal(c.chat, "/chat/" + c.persona + "/");
});

test("presencia: mensaje de Carlos sin contestar > 10 min = fuera de línea aunque haya latido", () => {
  const latido = { ok: true, consejeros: { Musk: { at: S - 30 } } };
  const hilos = { musk: [{ rol: "musk", ts: iso(S - 4000) }, { rol: "carlos", origen: "live", ts: iso(S - 700) }] };
  const m = presencia({ latido, hilos, ahoraMs: AHORA }).consejeros.find((c) => c.persona === "musk");
  assert.equal(m.online, false);
  assert.match(m.motivo, /sin contestar/);
});

test("presencia: sin fuentes no se inventa verde (desconocido)", () => {
  const r = presencia({ latido: null, hilos: {}, ahoraMs: AHORA });
  assert.equal(r.en_linea, 0);
  for (const c of r.consejeros) assert.equal(c.online, null);
  assert.equal(senalLatido(null, S), 0);
});

test("/api/win95/presencia: junta latido y hilos, sin textos de mensajes", async () => {
  const store = { [claveHilo("jobs")]: JSON.stringify({ turnos: [{ rol: "jobs", ts: iso(S - 30), texto: "secreto" }] }) };
  const env = { CHAT_KV: { get: async (k) => store[k] ?? null } };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true, consejeros: { Huang: { at: S - 10 } } }) });
  const r = await construir({ env, fetchImpl, ahoraMs: AHORA });
  assert.equal(r.consejeros.find((c) => c.persona === "huang").online, true);
  assert.equal(r.consejeros.find((c) => c.persona === "jobs").online, true);
  assert.equal(r.consejeros.find((c) => c.persona === "jobs").fuente, "hilo");
  assert.equal(JSON.stringify(r).includes("secreto"), false);
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
