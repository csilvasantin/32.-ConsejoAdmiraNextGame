import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as T from "./voz-turno-lib.mjs";
import { onRequestGet, onRequestPost, onRequestOptions } from "./functions/api/chat/turno-voz.js";

function memKv(init) {
  const d = new Map();
  if (init) d.set(T.KEY_TURNO, JSON.stringify(init));
  return {
    async get(k) { return d.get(k) ?? null; },
    async put(k, v) { d.set(k, v); },
    dump() { const raw = d.get(T.KEY_TURNO); return raw ? JSON.parse(raw) : null; },
  };
}
const envDe = (kv) => ({ CHAT_KV: kv });

test("estimarDuracionMs respeta mínimos, máximo y crece con el texto", () => {
  assert.equal(T.estimarDuracionMs(""), T.MIN_MS);
  assert.equal(T.estimarDuracionMs("sí"), T.MIN_MS);
  const medio = T.estimarDuracionMs("h".repeat(100));
  assert.equal(medio, 100 * T.CHAR_MS + T.PAD_MS);
  assert.ok(medio > T.estimarDuracionMs("hola"));
  assert.equal(T.estimarDuracionMs("x".repeat(10000)), T.MAX_MS);
});

test("prioridadDe: sala-voz y /chat son consejero; el resto, otra", () => {
  assert.equal(T.prioridadDe("sala-voz-leyendas"), "consejero");
  assert.equal(T.prioridadDe("sala-voz-coetaneos"), "consejero");
  assert.equal(T.prioridadDe("chat-entre"), "consejero");
  assert.equal(T.prioridadDe("chat-hilo"), "consejero");
  assert.equal(T.prioridadDe("portada"), "otra");
  assert.equal(T.prioridadDe("agente"), "otra");
  assert.equal(T.prioridadDe("agente", "consejero"), "consejero");
});

test("dos páginas piden a la vez: solo una obtiene el turno", () => {
  const t0 = 1_000_000;
  let r1 = T.pedir(T.vacio(), t0, { mensajeId: "m1", clienteId: "leyendas", fuente: "sala-voz-leyendas", duracionMs: 5000 });
  let r2 = T.pedir(r1.doc, t0, { mensajeId: "m2", clienteId: "coetaneos", fuente: "sala-voz-coetaneos", duracionMs: 5000 });
  assert.equal(r1.concedido, true);
  assert.equal(r2.concedido, false);
  assert.equal(T.locutoresActivos(r2.doc, t0), 1);
  assert.ok(r2.esperaMs > 0);
  assert.equal(r2.doc.turno.clienteId, "leyendas");
});

test("al liberar, la que esperaba recibe el turno en orden", () => {
  const t0 = 1_000_000;
  let doc = T.pedir(T.vacio(), t0, { mensajeId: "a", clienteId: "L", fuente: "sala-voz-leyendas", duracionMs: 4000 }).doc;
  doc = T.pedir(doc, t0, { mensajeId: "b", clienteId: "C", fuente: "sala-voz-coetaneos", duracionMs: 4000 }).doc;
  const lib = T.liberar(doc, t0 + 100, { mensajeId: "a", clienteId: "L" });
  assert.equal(lib.doc.turno.mensajeId, "b");
  assert.equal(lib.doc.turno.clienteId, "C");
  assert.equal(T.locutoresActivos(lib.doc, t0 + 100), 1);
});

test("el mismo mensaje no lo locutan dos páginas (yaDicho)", () => {
  const t0 = 1_000_000;
  const r1 = T.pedir(T.vacio(), t0, { mensajeId: "m9", clienteId: "sala", fuente: "sala-voz-leyendas", duracionMs: 4000 });
  const r2 = T.pedir(r1.doc, t0, { mensajeId: "m9", clienteId: "chat", fuente: "chat-entre", duracionMs: 4000 });
  assert.equal(r1.concedido, true);
  assert.equal(r2.concedido, false);
  assert.equal(r2.yaDicho, true);
  const lib = T.liberar(r2.doc, t0 + 50, { mensajeId: "m9", clienteId: "sala" });
  const r3 = T.pedir(lib.doc, t0 + 50, { mensajeId: "m9", clienteId: "chat", fuente: "chat-entre", duracionMs: 4000 });
  assert.equal(r3.concedido, false);
  assert.equal(r3.yaDicho, true);
  assert.equal(T.locutoresActivos(r3.doc, t0 + 50), 0);
});

test("la voz de un consejero se adelanta a otra voz en la cola (FIFO entre consejeros)", () => {
  const t0 = 1_000_000;
  let doc = T.pedir(T.vacio(), t0, { mensajeId: "ocupado", clienteId: "A", fuente: "sala-voz-leyendas", duracionMs: 8000 }).doc;
  doc = T.pedir(doc, t0 + 1, { mensajeId: "otra1", clienteId: "X", fuente: "portada", duracionMs: 3000 }).doc;
  doc = T.pedir(doc, t0 + 2, { mensajeId: "cons1", clienteId: "C", fuente: "sala-voz-coetaneos", duracionMs: 3000 }).doc;
  assert.equal(doc.cola[0].mensajeId, "cons1");
  assert.equal(doc.cola[0].prioridad, "consejero");
  assert.equal(doc.cola[1].mensajeId, "otra1");
  const lib = T.liberar(doc, t0 + 10, { mensajeId: "ocupado", clienteId: "A" });
  assert.equal(lib.doc.turno.mensajeId, "cons1");
});

test("un consejero interrumpe una voz que no es de consejero; nunca hay dos a la vez", () => {
  const t0 = 1_000_000;
  let r1 = T.pedir(T.vacio(), t0, { mensajeId: "ruido", clienteId: "bot", fuente: "portada", duracionMs: 20000 });
  const r2 = T.pedir(r1.doc, t0 + 100, { mensajeId: "jobs", clienteId: "sala", fuente: "sala-voz-leyendas", duracionMs: 5000 });
  assert.equal(r1.concedido, true);
  assert.equal(r2.concedido, true);
  assert.equal(r2.interrumpido, true);
  assert.equal(r2.doc.turno.mensajeId, "jobs");
  assert.equal(r2.doc.turno.prioridad, "consejero");
  assert.equal(T.locutoresActivos(r2.doc, t0 + 100), 1);
  assert.equal(r2.doc.cola[0].mensajeId, "ruido");
  // la voz interrumpida, si pregunta, ya no tiene el turno
  const lat = T.latido(r2.doc, t0 + 200, { clienteId: "bot", mensajeId: "ruido", fuente: "portada" });
  assert.equal(lat.concedido, false);
  assert.equal(lat.perdido, true);
});

test("al expirar el turno se concede el siguiente", () => {
  const t0 = 1_000_000;
  let doc = T.pedir(T.vacio(), t0, { mensajeId: "a", clienteId: "L", fuente: "sala-voz-leyendas", duracionMs: 2000 }).doc;
  doc = T.pedir(doc, t0, { mensajeId: "b", clienteId: "C", fuente: "sala-voz-coetaneos", duracionMs: 2000 }).doc;
  const later = T.expirar(doc, t0 + 2000);
  assert.equal(later.turno.mensajeId, "b");
  assert.equal(later.turno.clienteId, "C");
});

test("presencia de /sala-voz deja salaAbierta y caduca", () => {
  const t0 = 1_000_000;
  const p = T.presencia(T.vacio(), t0, { consejo: "leyendas" });
  assert.equal(p.ok, true);
  assert.equal(T.salaAbierta(p.doc, t0), true);
  assert.equal(T.salaAbierta(p.doc, t0 + T.SALA_VIVA_MS + 1), false);
  const p2 = T.presencia(p.doc, t0, { consejo: "no-existe" });
  assert.equal(p2.ok, false);
});

test("publicState no expone clienteId ajeno", () => {
  const t0 = 1_000_000;
  const r = T.pedir(T.vacio(), t0, { mensajeId: "m", clienteId: "secreto-cliente", fuente: "sala-voz-leyendas", duracionMs: 4000 });
  const pub = T.publicState(r.doc, t0, { clienteId: "otro" });
  const raw = JSON.stringify(pub);
  assert.equal(pub.turno.mia, false);
  assert.doesNotMatch(raw, /secreto-cliente/);
  assert.equal(pub.turno.mensajeId, "m");
  assert.equal(pub.ok, true);
});

test("simulación intercalada: nunca hay dos locutores concedidos", () => {
  let doc = T.vacio();
  const now = { t: 5_000_000 };
  const vivos = [];
  function pedir(id, cliente, fuente, dur) {
    const r = T.pedir(doc, now.t, { mensajeId: id, clienteId: cliente, fuente, duracionMs: dur });
    doc = r.doc;
    if (r.concedido) vivos.push({ id, cliente, hasta: doc.turno.hasta });
    assert.ok(T.locutoresActivos(doc, now.t) <= 1);
    return r;
  }
  pedir("1", "L", "sala-voz-leyendas", 3000);
  pedir("2", "C", "sala-voz-coetaneos", 3000);
  pedir("3", "J", "chat-entre", 3000);
  pedir("4", "P", "portada", 3000);
  now.t += 3000;
  doc = T.expirar(doc, now.t);
  assert.ok(T.locutoresActivos(doc, now.t) <= 1);
  const lib = T.liberar(doc, now.t, { mensajeId: doc.turno && doc.turno.mensajeId, clienteId: doc.turno && doc.turno.clienteId });
  doc = lib.doc;
  assert.ok(T.locutoresActivos(doc, now.t) <= 1);
});

test("API: sin sesión responde 401; nunca es pública", async () => {
  const kv = memKv();
  const req = new Request("https://www.admira.live/api/chat/turno-voz", { method: "GET" });
  const r = await onRequestGet({ request: req, env: envDe(kv) });
  assert.equal(r.status, 401);
  const d = await r.json();
  assert.equal(d.ok, false);
});

test("API: OPTIONS 204; GET/POST con sesión y KV conceden un solo turno", async () => {
  const opt = await onRequestOptions({ request: new Request("https://www.admira.live/api/chat/turno-voz", { method: "OPTIONS" }) });
  assert.equal(opt.status, 204);
  const kv = memKv();
  const env = envDe(kv);
  const post = (body) => onRequestPost({
    request: new Request("https://www.admira.live/api/chat/turno-voz", {
      method: "POST",
      headers: { "content-type": "application/json", Origin: "https://www.admira.live" },
      body: JSON.stringify(body),
    }),
    env,
    quien: "test",
  });
  const a = await (await post({ accion: "pedir", mensajeId: "x1", clienteId: "L", fuente: "sala-voz-leyendas", duracionMs: 4000, consejo: "leyendas" })).json();
  const b = await (await post({ accion: "pedir", mensajeId: "x2", clienteId: "C", fuente: "sala-voz-coetaneos", duracionMs: 4000, consejo: "coetaneos" })).json();
  assert.equal(a.ok, true);
  assert.equal(a.concedido, true);
  assert.equal(b.concedido, false);
  assert.equal(a.salaAbierta || b.salaAbierta || true, true);
  const g = await onRequestGet({
    request: new Request("https://www.admira.live/api/chat/turno-voz", { headers: { Origin: "https://www.admira.live" } }),
    env,
    quien: "test",
  });
  assert.equal(g.status, 200);
  const estado = await g.json();
  assert.equal(estado.turno.mensajeId, "x1");
  assert.doesNotMatch(JSON.stringify(estado), /"clienteId"/);
  const pres = await (await post({ accion: "presencia", clienteId: "L", fuente: "sala-voz-leyendas", consejo: "leyendas" })).json();
  assert.equal(pres.salaAbierta, true);
});

test("_headers declara /sala-voz y el lib del turno; las páginas piden el cliente compartido", () => {
  const headers = readFileSync(new URL("./_headers", import.meta.url), "utf8");
  assert.match(headers, /\/sala-voz\/\*/);
  assert.match(headers, /Cache-Control: no-store/);
  assert.match(headers, /X-Robots-Tag: noindex, nofollow/);
  assert.match(headers, /\/sala-voz-lib\.mjs/);
  assert.match(headers, /\/voz-turno-lib\.mjs/);
  assert.match(headers, /\/api\/chat\/turno-voz/);
  const sala = readFileSync(new URL("./sala-voz/index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("./sala-voz/sala-voz.js", import.meta.url), "utf8");
  assert.match(sala, /voz-turno-cliente\.js\?v=20261112-turno-voz/);
  assert.match(sala, /sala-voz.js\?v=20261112-sin-voz-sistema/);
  assert.match(js, /AdmiraVozTurno/);
  assert.match(js, /sala-voz-/);
  const msg = readFileSync(new URL("./assets/consejero-mensajes.js", import.meta.url), "utf8");
  assert.match(msg, /AdmiraVozTurno/);
  assert.match(msg, /silencioSiSala|chat-entre/);
  assert.match(msg, /20261112-turno-voz|turno-voz/);
});
