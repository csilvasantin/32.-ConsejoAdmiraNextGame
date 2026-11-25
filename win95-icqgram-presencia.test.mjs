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
  assert.match(html, /off=todos\.filter\(function\(c\)\{ return !c\.on; \}\)\.concat\(off\); html=grp\('Leyendas',de\('leyendas'\)\)\+grp\('Actuales',de\('actuales'\)\)/);
  assert.match(html, /\{id:'c-murati',persona:'murati',name:'Mira Murati',cuenta:'actuales',sinChat:true\}/);
  assert.match(html, /\{id:'c-lasseter',persona:'lasseter',name:'John Lasseter',cuenta:'actuales',sinChat:true\}/);
  assert.match(html, /no tiene línea directa todavía/);
  assert.match(html, /on:pr\.online===true/, "solo verde con online===true");
  assert.match(html, /'admira\.live\/chat\/'\+pr\.persona/);
  assert.match(html, /lk\.href=cg\.chat/);
  assert.match(html, /<script src="\/auth-gate\.js"><\/script>/);
});
