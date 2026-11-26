import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { presencia, senalLatido, despertar, cupoDesdeLecturas, ultimaLecturaCupo, cupoEtiqueta, textoEdadCupo, CUPO_MEDIDOR, CUPO_FRESCO_H, CUPO_AVISO_H, intervencionesHoy, inicioDiaMadrid } from "./win95-presencia-lib.mjs";
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
  assert.match(html, /cu\.txt\?' '\+cu\.txt:''/);
  assert.match(html, /txt='\('\+Math\.round\(u\)\+' % usado\)'/, "entre paréntesis, el % usado, no lo que queda");
  assert.match(html, /sin dato fresco/, "si no hay cifra vigente se dice claro");
  assert.match(html, /k!=='leyendas'&&k!=='actuales'/, "el cupo solo sale en Leyendas y Actuales, no en DeepAgents");
  assert.doesNotMatch(html, /txt:'\('\+Math\.round\(q\)\+' %\)'/);
  assert.doesNotMatch(html, /txt='\('\+Math\.round\(q\)\+' %\)'/);
  assert.doesNotMatch(html, /txt:'— %'|class="cbar"|\.cbar/);
  assert.match(html, /c\.hoy>0\)\?' \('\+c\.hoy\+'\)'/);
  assert.match(html, /function hechasConsejero\(/);
  assert.match(html, /hn!==null\?' \('\+hn\+'\)':''/, "el (n) del consejero es hechas, también si es 0");
  assert.doesNotMatch(html, /grp\('Leyendas',de\('leyendas'\)\)\+grp\('Actuales',de\('actuales'\)\)/);
  assert.match(html, /\{id:'c-murati',persona:'murati',name:'Mira Murati',cuenta:'actuales',sinChat:true\}/);
  assert.match(html, /\{id:'c-lasseter',persona:'lasseter',name:'John Lasseter',cuenta:'actuales',sinChat:true\}/);
  assert.match(html, /no tiene línea directa todavía/);
  assert.match(html, /on:pr\.online===true/, "solo verde con online===true");
  assert.match(html, /'admira\.live\/chat\/'\+pr\.persona/);
  assert.match(html, /lk\.href=cg\.chat/);
  assert.match(html, /<script src="\/auth-gate\.js"><\/script>/);
});


const LECTURAS_VIEJAS = [
  { ts: "2026-11-25T11:09:42.354Z", grupo: "leyendas", agente: "Grok Bot semanal", pct: 71, fuente: "auto", reset: "2026-11-26T20:58:00.000Z", cuenta: "csilva@admira.com", nota: "no debe salir" },
  { ts: "2026-11-25T11:09:41.636Z", grupo: "leyendas", agente: "SuperGrok Heavy semanal", pct: 0, fuente: "auto", reset: "2026-11-27T18:31:00.000Z" },
  { ts: "2026-11-25T11:09:43.289Z", grupo: "coetaneos", agente: "Grok Bot semanal", pct: 86, fuente: "auto", reset: "2026-11-25T18:46:00.000Z", cuenta: "csilvasantin@gmail.com", nota: "privado" },
];
const LECTURAS_FRESCAS = [
  { ts: "2026-11-25T22:21:00.000Z", grupo: "leyendas", agente: "Grok Bot semanal", pct: 86.3, fuente: "auto", reset: "2026-11-26T20:58:00.000Z", nota: "no debe salir" },
  { ts: "2026-11-25T22:21:00.000Z", grupo: "coetaneos", agente: "Grok Bot semanal", pct: 12, fuente: "auto", reset: "2026-12-02T18:46:00.000Z" },
];

test("cupo: una lectura de más de 13 h no se enseña (ni el 71 % viejo ni un — %)", () => {
  const ahora = Date.parse("2026-11-26T01:30:00Z"); // 14 h después de las lecturas de las 12:09
  const c = cupoDesdeLecturas(LECTURAS_VIEJAS, ahora);
  assert.equal(CUPO_FRESCO_H, 13);
  assert.equal(ultimaLecturaCupo(LECTURAS_VIEJAS, "leyendas").pct, 71);
  assert.equal(c.leyendas.pct, null);
  assert.equal(c.leyendas.motivo, "sin datos");
  assert.equal(c.leyendas.anterior, 71);
  assert.equal(c.actuales.pct, null);
  assert.equal(/csilva@|gmail|privado|no debe salir/.test(JSON.stringify(c)), false);
});

test("cupo: sin lecturas o medidor distinto no se inventa un número", () => {
  const vacio = cupoDesdeLecturas([], Date.parse("2026-11-25T21:30:00Z"));
  assert.equal(vacio.leyendas.pct, null);
  assert.equal(vacio.actuales.pct, null);
  assert.equal(vacio.leyendas.motivo, "sin datos");
  const otro = cupoDesdeLecturas([{ ts: "2026-11-25T21:00:00Z", grupo: "leyendas", agente: "SuperGrok Heavy semanal", pct: 0, reset: "2026-11-27T18:31:00.000Z" }], Date.parse("2026-11-25T21:30:00Z"));
  assert.equal(otro.leyendas.pct, null);
});

test("cupo: una lectura fresca (< 2 h) sí se enseña; si el reset ya pasó, no", () => {
  const ahora = Date.parse("2026-11-25T22:30:00Z"); // 23:30 Madrid, 9 min después de la lectura
  const c = cupoDesdeLecturas(LECTURAS_FRESCAS, ahora);
  assert.equal(c.leyendas.pct, 86.3);
  assert.equal(c.leyendas.restante, 13.7);
  assert.equal(c.leyendas.motivo, null);
  assert.equal(c.leyendas.fuente, "auto");
  assert.equal(c.actuales.pct, 12);
  assert.equal(cupoEtiqueta(c.actuales).txt, "(12 % usado)");
  assert.equal(cupoEtiqueta(c.leyendas).txt, "(86 % usado)");
  const trasReset = cupoDesdeLecturas([
    { ts: "2026-11-25T22:21:00.000Z", grupo: "coetaneos", agente: "Grok Bot semanal", pct: 86, fuente: "auto", reset: "2026-11-25T18:46:00.000Z" },
  ], ahora);
  assert.equal(trasReset.actuales.pct, null);
});

test("/api/win95/presencia: adjunta el cupo fresco y el recuento de hoy, sin textos ni correos", async () => {
  const env = { CHAT_KV: { get: async () => null } };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true, consejeros: {}, items: [] }) });
  const r = await construir({ env, fetchImpl, ahoraMs: Date.parse("2026-11-25T22:30:00Z"), lecturas: LECTURAS_FRESCAS });
  assert.equal(r.cuentas.leyendas.cupo.pct, 86.3);
  assert.equal(r.cuentas.actuales.cupo.pct, 12);
  assert.equal(typeof r.consejeros.find((c) => c.persona === "jobs").hoy, "number");
  assert.equal(/csilva@|gmail|privado|no debe salir/.test(JSON.stringify(r)), false);
  const viejo = await construir({ env, fetchImpl, ahoraMs: Date.parse("2026-11-26T01:30:00Z"), lecturas: LECTURAS_VIEJAS });
  assert.equal(viejo.cuentas.leyendas.cupo.pct, null);
  const sin = await construir({ env: {}, fetchImpl: async () => { throw new Error("x"); }, ahoraMs: Date.parse("2026-11-25T22:30:00Z") });
  assert.equal(sin.cuentas.leyendas.cupo.pct, null);
  assert.equal(sin.cuentas.actuales.cupo.motivo, "sin datos");
});

test("inicioDiaMadrid: el día civil de Madrid empieza a las 00:00 (CET en noviembre)", () => {
  assert.equal(inicioDiaMadrid(Date.parse("2026-11-25T22:21:00Z")), Date.parse("2026-11-24T23:00:00Z"));
});

test("intervencionesHoy: encargos done + respuestas del hilo + misiones, sin doble conteo ni textos", () => {
  const ahora = Date.parse("2026-11-25T22:30:00Z");
  const ini = Math.floor(inicioDiaMadrid(ahora) / 1000);
  const items = [
    { id: 10, status: "done", done_at: ini + 3600, text: "secreto" },
    { id: 11, status: "done", done_at: ini + 7200 },
    { id: 9, status: "done", done_at: ini - 86400 }, // ayer
    { id: 12, status: "in_progress", ts: ini + 8000 },
  ];
  const turnos = [
    { rol: "jobs", ts: new Date((ini + 4000) * 1000).toISOString(), texto: "privado" },
    { rol: "jobs", ts: new Date((ini + 5000) * 1000).toISOString() },
    { rol: "carlos", ts: new Date((ini + 4500) * 1000).toISOString() },
    { rol: "jobs", ts: new Date((ini - 1000) * 1000).toISOString() }, // ayer
  ];
  const misiones = [
    { encargo: 10, cuando: ini + 3500, mision: "no debe salir" }, // ya contada como done
    { encargo: 12, cuando: ini + 8000 }, // misma que in_progress
    { encargo: null, cuando: ini + 1000 }, // latido de misión sin encargo
  ];
  const r = intervencionesHoy({ turnos, items, misiones, persona: "jobs", ahoraMs: ahora });
  assert.equal(r.encargos, 2);
  assert.equal(r.respuestas, 2);
  assert.equal(r.misiones, 2); // in_progress 12 + misión sin encargo; el 10 ya era done
  assert.equal(r.hoy, 6);
  const cero = intervencionesHoy({ turnos: [], items: [], misiones: [], persona: "jobs", ahoraMs: ahora });
  assert.equal(cero.hoy, 0);
});

test("presencia: hoy sale en cada consejero; el texto de la misión no se filtra", () => {
  const ahora = Date.parse("2026-11-25T22:30:00Z");
  const iniS = Math.floor(inicioDiaMadrid(ahora) / 1000);
  const r = presencia({
    latido: { ok: true, consejeros: { Jobs: { at: iniS + 100 } }, misiones_hoy: { Jobs: [{ encargo: null, cuando: iniS + 50, mision: "secreto-mision" }] } },
    hilos: { jobs: [{ rol: "jobs", ts: new Date((iniS + 80) * 1000).toISOString(), texto: "secreto-hilo" }] },
    bandejas: { jobs: [{ id: 70, status: "done", done_at: iniS + 200, text: "secreto-bandeja" }] },
    ahoraMs: ahora,
  });
  const j = r.consejeros.find((c) => c.persona === "jobs");
  assert.equal(j.hoy, 3);
  assert.deepEqual(j.hoy_detalle, { encargos: 1, respuestas: 1, misiones: 1 });
  assert.equal(/secreto/.test(JSON.stringify(r)), false);
  const mu = r.consejeros.find((c) => c.persona === "murati");
  assert.equal(mu.hoy, 0);
});

test("cupo: una lectura de 8 h (00:15 → 08:15) sigue valiendo; la etiqueta enseña el % usado y la edad", () => {
  const c = cupoDesdeLecturas([{ ts: "2026-11-25T23:15:16.322Z", grupo: "leyendas", agente: "Grok Bot semanal", pct: 89, fuente: "auto", reset: "2026-11-26T20:58:00.000Z" }], Date.parse("2026-11-26T07:15:00Z"));
  assert.equal(c.leyendas.pct, 89);
  assert.equal(c.leyendas.restante, 11);
  assert.equal(c.leyendas.edadH, 8);
  assert.equal(c.leyendas.edadTexto, "hace 8 h");
  const e = cupoEtiqueta(c.leyendas);
  assert.equal(e.txt, "(89 % usado · hace 8 h)");
  assert.match(e.title, /usado 89 %/);
  assert.match(e.title, /queda 11 %/);
});

test("cupoEtiqueta: % usado redondeado, igual que la app; sin dato / sin dato fresco, nunca lo que queda como cifra principal", () => {
  assert.equal(CUPO_AVISO_H, 2);
  const fresco = cupoEtiqueta({ pct: 15.3, restante: 84.7, medidor: CUPO_MEDIDOR, fuente: "manual", edadH: 0.1, edadTexto: "hace 6 min", reset: "2026-12-02T18:46:00.000Z" });
  assert.equal(fresco.txt, "(15 % usado)");
  assert.match(fresco.title, /usado 15,3 %/);
  assert.match(fresco.title, /queda 84,7 %/);
  assert.match(fresco.title, /hace 6 min/);
  assert.match(fresco.title, /manual/);
  const aviso = cupoEtiqueta({ pct: 12, restante: 88, edadH: 2.5, edadTexto: "hace 2,5 h", fuente: "auto" });
  assert.equal(aviso.txt, "(12 % usado · hace 2,5 h)");
  const viejo = cupoEtiqueta({ pct: null, anterior: 96.1, edadH: 14, edadTexto: "hace 14 h", ts: "2026-11-25T11:09:42.354Z", motivo: "sin datos" });
  assert.equal(viejo.txt, "(sin dato fresco)");
  assert.match(viejo.title, /usado 96,1 %/);
  assert.equal(cupoEtiqueta({ pct: null, motivo: "sin datos" }).txt, "(sin dato)");
  assert.equal(cupoEtiqueta(null).txt, "(sin dato)");
  assert.equal(textoEdadCupo(0.5), "hace 30 min");
  assert.equal(textoEdadCupo(14), "hace 14 h");
});

test("cupo: tras el reset o con más de 13 h, pct es null y la etiqueta no enseña el número como actual", () => {
  const ahora = Date.parse("2026-11-26T01:30:00Z");
  const c = cupoDesdeLecturas([
    { ts: "2026-11-25T11:09:42.354Z", grupo: "leyendas", agente: "Grok Bot semanal", pct: 71, fuente: "auto", reset: "2026-11-26T20:58:00.000Z" },
  ], ahora);
  assert.equal(c.leyendas.pct, null);
  assert.equal(c.leyendas.motivo, "sin datos");
  assert.equal(c.leyendas.anterior, 71);
  assert.equal(cupoEtiqueta(c.leyendas).txt, "(sin dato fresco)");
  assert.equal(/csilva@|gmail/.test(JSON.stringify(c)), false);
});
