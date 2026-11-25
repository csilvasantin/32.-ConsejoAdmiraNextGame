import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { presencia, senalLatido, despertar, cupoDesdeLecturas, ultimaLecturaCupo, CUPO_MEDIDOR } from "./win95-presencia-lib.mjs";
import { construir } from "./functions/api/win95/presencia.js";
import { claveHilo } from "./chat-hilo-lib.mjs";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const AHORA = Date.parse("2026-11-25T19:30:00Z");
const S = Math.floor(AHORA / 1000);
const iso = (s) => new Date(s * 1000).toISOString();

const unaCuenta = (r) => { for (const k of ["leyendas", "actuales"]) { const e = new Set(r.consejeros.filter((c) => c.cuenta === k).map((c) => c.online)); assert.equal(e.size, 1, "estados mezclados en " + k); } };

test("presencia v3: por cuenta — si responde uno de la cuenta, en línea todos; Murati y Lasseter en Actuales sin chat", () => {
  const latido = { ok: true, consejeros: { Lucas: { at: S - 40 * 3600 } } };
  const bandejas = { disney: [{ id: 1, status: "done", done_at: S - 20 * 3600 }], huang: [{ id: 2, status: "done", done_at: S - 3600 }] };
  const r = presencia({ latido, hilos: {}, bandejas, ahoraMs: AHORA });
  unaCuenta(r);
  assert.equal(r.cuentas.leyendas.online, true); assert.equal(r.cuentas.actuales.online, true);
  assert.equal(r.consejeros.length, 8);
  const mu = r.consejeros.find((c) => c.persona === "murati"), la = r.consejeros.find((c) => c.persona === "lasseter");
  assert.equal(mu.cuenta, "actuales"); assert.equal(mu.chat, null); assert.equal(la.chat, null); assert.equal(la.online, true);
  assert.equal(r.consejeros.find((c) => c.persona === "musk").online, true, "Musk sigue a Huang: misma cuenta");
  for (const c of r.consejeros.filter((x) => x.chat)) assert.equal(c.chat, "/chat/" + c.persona + "/");
});

test("presencia v3: pregunta pendiente solo saca de línea a la cuenta si nadie respondió después", () => {
  const muskPend = [{ rol: "musk", ts: iso(S - 90000) }, { rol: "carlos", origen: "live", ts: iso(S - 3000) }];
  const huangAntes = [{ rol: "huang", ts: iso(S - 4000) }];
  let r = presencia({ hilos: { musk: muskPend, huang: huangAntes }, ahoraMs: AHORA });
  unaCuenta(r);
  assert.equal(r.cuentas.actuales.online, false); assert.match(r.cuentas.actuales.motivo, /Elon Musk sin contestar/);
  r = presencia({ hilos: { musk: muskPend, huang: [{ rol: "huang", ts: iso(S - 60) }] }, ahoraMs: AHORA });
  unaCuenta(r);
  assert.equal(r.cuentas.actuales.online, true);
  assert.equal(r.consejeros.find((c) => c.persona === "musk").pendiente_propio, true);
});

test("presencia v3: despertar roto (401) sin respuesta posterior saca a toda la cuenta", () => {
  const roto = [{ rol: "huang", ts: iso(S - 3600) }, { rol: "carlos", origen: "app", ts: iso(S - 300), entrega: "entregado", detalle: "despertar 401" }];
  const r = presencia({ hilos: { huang: roto }, ahoraMs: AHORA });
  unaCuenta(r);
  assert.equal(r.cuentas.actuales.online, false); assert.match(r.cuentas.actuales.motivo, /401/);
  assert.equal(despertar(roto).codigo, "401");
});

test("presencia v3: nunca estados distintos dentro de una cuenta (barrido)", () => {
  for (let i = 0; i < 200; i++) {
    const t = (n) => S - Math.floor(((i * 7919 + n * 104729) % 200000));
    const hilos = { jobs: [{ rol: "jobs", ts: iso(t(1)) }], musk: i % 3 ? [{ rol: "carlos", origen: "live", ts: iso(t(2)) }] : [], huang: [{ rol: "huang", ts: iso(t(3)) }] };
    const bandejas = { lucas: [{ status: "done", done_at: t(4) }] };
    unaCuenta(presencia({ latido: { ok: true, consejeros: { Wozniak: { at: t(5) } } }, hilos, bandejas, ahoraMs: AHORA }));
  }
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
  assert.equal(r.consejeros.find((c) => c.persona === "musk").online, true, "misma cuenta que Huang");
  assert.equal(/secreto|privado/.test(JSON.stringify(r)), false);
  const caido = await construir({ env: {}, fetchImpl: async () => { throw new Error("x"); }, ahoraMs: AHORA });
  assert.equal(caido.en_linea, 0);
  assert.ok(caido.consejeros.every((c) => c.online === null));
});

test("ICQGram: Fuera de línea = consejeros sin señal + los 3 de la demo; contadores dinámicos", () => {
  assert.match(html, /presencia:\{ url:'\/api\/win95\/presencia', cadaSeg:30 \}/);
  assert.match(html, /off=todos\.filter\(function\(c\)\{ return !c\.on; \}\)\.concat\(off\); html=grp\('Leyendas',de\('leyendas'\),'leyendas'\)\+grp\('Actuales',de\('actuales'\),'actuales'\)/);
  assert.match(html, /function cupoCab\(k\)/);
  assert.match(html, /t\+' · '\+cu\.txt/);
  assert.doesNotMatch(html, /grp\('Leyendas',de\('leyendas'\)\)\+grp\('Actuales',de\('actuales'\)\)/);
  assert.match(html, /\{id:'c-murati',persona:'murati',name:'Mira Murati',cuenta:'actuales',sinChat:true\}/);
  assert.match(html, /\{id:'c-lasseter',persona:'lasseter',name:'John Lasseter',cuenta:'actuales',sinChat:true\}/);
  assert.match(html, /no tiene línea directa todavía/);
  assert.match(html, /on:pr\.online===true/, "solo verde con online===true");
  assert.match(html, /'admira\.live\/chat\/'\+pr\.persona/);
  assert.match(html, /lk\.href=cg\.chat/);
  assert.match(html, /<script src="\/auth-gate\.js"><\/script>/);
});


const LECTURAS = [
  { ts: "2026-11-25T11:09:42.354Z", grupo: "leyendas", agente: "Grok Bot semanal", pct: 71, fuente: "auto", reset: "2026-11-26T20:58:00.000Z", cuenta: "csilva@admira.com", nota: "no debe salir" },
  { ts: "2026-11-25T11:09:41.636Z", grupo: "leyendas", agente: "SuperGrok Heavy semanal", pct: 0, fuente: "auto", reset: "2026-11-27T18:31:00.000Z" },
  { ts: "2026-11-25T11:09:43.289Z", grupo: "coetaneos", agente: "Grok Bot semanal", pct: 86, fuente: "auto", reset: "2026-11-25T18:46:00.000Z", cuenta: "csilvasantin@gmail.com", nota: "privado" },
];

test("cupo: Leyendas usa Grok Bot semanal vigente; Actuales queda sin datos si el reset ya pasó", () => {
  const ahora = Date.parse("2026-11-25T21:30:00Z"); // 22:30 Madrid, después del reset de Actuales (19:46)
  const c = cupoDesdeLecturas(LECTURAS, ahora);
  assert.equal(ultimaLecturaCupo(LECTURAS, "leyendas").agente, CUPO_MEDIDOR);
  assert.equal(c.leyendas.pct, 71);
  assert.equal(c.leyendas.fuente, "auto");
  assert.equal(c.leyendas.medidor, "Grok Bot semanal");
  assert.equal(c.leyendas.origen, "/api/consumos/lecturas");
  assert.equal(c.leyendas.motivo, null);
  assert.equal(c.leyendas.ts, "2026-11-25T11:09:42.354Z");
  assert.equal(c.actuales.pct, null);
  assert.equal(c.actuales.motivo, "sin datos");
  assert.equal(c.actuales.anterior, 86);
  assert.equal(c.actuales.reset, "2026-11-25T18:46:00.000Z");
  assert.equal(/csilva@|gmail|privado|no debe salir/.test(JSON.stringify(c)), false);
});

test("cupo: sin lecturas o medidor distinto no se inventa un número", () => {
  const vacio = cupoDesdeLecturas([], Date.parse("2026-11-25T21:30:00Z"));
  assert.equal(vacio.leyendas.pct, null);
  assert.equal(vacio.actuales.pct, null);
  assert.equal(vacio.leyendas.motivo, "sin datos");
  const otro = cupoDesdeLecturas([{ ts: "2026-11-25T11:00:00Z", grupo: "leyendas", agente: "SuperGrok Heavy semanal", pct: 0, reset: "2026-11-27T18:31:00.000Z" }], Date.parse("2026-11-25T21:30:00Z"));
  assert.equal(otro.leyendas.pct, null);
});

test("cupo: Actuales también sale si su lectura sigue vigente", () => {
  const antes = Date.parse("2026-11-25T16:00:00Z"); // 17:00 Madrid, antes del reset 19:46
  const c = cupoDesdeLecturas(LECTURAS, antes);
  assert.equal(c.leyendas.pct, 71);
  assert.equal(c.actuales.pct, 86);
  assert.equal(c.actuales.motivo, null);
});

test("/api/win95/presencia: adjunta el cupo de las lecturas, sin textos ni correos", async () => {
  const env = { CHAT_KV: { get: async () => null } };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true, consejeros: {}, items: [] }) });
  const r = await construir({ env, fetchImpl, ahoraMs: Date.parse("2026-11-25T21:30:00Z"), lecturas: LECTURAS });
  assert.equal(r.cuentas.leyendas.cupo.pct, 71);
  assert.equal(r.cuentas.actuales.cupo.pct, null);
  assert.equal(r.cuentas.actuales.cupo.motivo, "sin datos");
  assert.equal(/csilva@|gmail|privado|no debe salir/.test(JSON.stringify(r)), false);
  const sin = await construir({ env: {}, fetchImpl: async () => { throw new Error("x"); }, ahoraMs: Date.parse("2026-11-25T21:30:00Z") });
  assert.equal(sin.cuentas.leyendas.cupo.pct, null);
  assert.equal(sin.cuentas.actuales.cupo.motivo, "sin datos");
});
