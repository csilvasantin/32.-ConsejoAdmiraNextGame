import test from "node:test";
import assert from "node:assert/strict";
import { normalizarTurno, anadirTurno, salud, emailGoogle, MAX_TURNOS, GOOGLE_CLIENT_ID } from "./chat-hilo-lib.mjs";
import * as hilo from "./functions/api/chat/hilo.js";
import * as saludApi from "./functions/api/chat/salud.js";

function kvFalso() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, m };
}
const TOKEN = "t".repeat(40);
const env = () => ({ RECORTE_KV: kvFalso(), CONSUMOS_LECTURAS_TOKEN: TOKEN });
const post = (body, token = TOKEN) => new Request("https://www.admira.live/api/chat/hilo", { method: "POST", headers: { "content-type": "application/json", ...(token ? { "X-Council-Token": token } : {}) }, body: JSON.stringify(body) });
const get = (q, headers = {}) => new Request("https://www.admira.live/api/chat/hilo" + q, { headers });

test("normalizar valida persona, rol, origen, texto y ts", async () => {
  const ahora = Date.parse("2026-10-09T04:30:00Z");
  const ok = await normalizarTurno({ persona: "Jobs", rol: "carlos", origen: "app", texto: " hola ", ts: "2026-10-09T06:21:00+02:00" }, ahora);
  assert.equal(ok.turno.ts, "2026-10-09T04:21:00.000Z");
  assert.equal(ok.turno.texto, "hola");
  assert.match(ok.turno.id, /^h_[a-f0-9]{32}$/);
  assert.equal((await normalizarTurno({ persona: "jobs", rol: "carlos", origen: "app", texto: "hola", ts: "2026-10-09T06:21:00+02:00" }, ahora)).turno.id, ok.turno.id);
  assert.match((await normalizarTurno({ persona: "neo", rol: "carlos", origen: "app", texto: "x" })).error, /persona/);
  assert.match((await normalizarTurno({ persona: "jobs", rol: "lucas", origen: "app", texto: "x" })).error, /rol/);
  assert.match((await normalizarTurno({ persona: "jobs", rol: "jobs", origen: "mail", texto: "x" })).error, /origen/);
  assert.match((await normalizarTurno({ persona: "jobs", rol: "jobs", origen: "app", texto: "" })).error, /texto/);
  assert.match((await normalizarTurno({ persona: "jobs", rol: "jobs", origen: "app", texto: "x".repeat(8001) })).error, /largo/);
  assert.match((await normalizarTurno({ persona: "jobs", rol: "jobs", origen: "app", texto: "x", ts: "2030-01-01T00:00:00Z" }, ahora)).error, /futuro/);
  assert.match((await normalizarTurno({ persona: "jobs", rol: "jobs", origen: "app", texto: "x", msg_id: "a b" })).error, /msg_id/);
});

test("añadir es idempotente, ordena por ts y recorta a 500", async () => {
  let turnos = [];
  for (let i = 0; i < MAX_TURNOS + 5; i++) {
    const { turno } = await normalizarTurno({ persona: "jobs", rol: "jobs", origen: "app", texto: "t" + i, ts: 1_790_000_000_000 + i * 1000, msg_id: "msg-" + i });
    turnos = anadirTurno(turnos, turno).turnos;
  }
  assert.equal(turnos.length, MAX_TURNOS);
  assert.equal(turnos[0].id, "msg-5");
  const repetido = anadirTurno(turnos, { ...turnos[10], texto: "otro" });
  assert.equal(repetido.duplicado, true);
  assert.equal(repetido.turno.texto, "t15");
});

test("salud: pendiente de admira.live y aviso tras 10 min, sin texto", () => {
  const T = (min, rol, origen) => ({ id: rol + min, rol, origen, texto: "secreto", ts: new Date(Date.parse("2026-10-09T04:00:00Z") + min * 60000).toISOString() });
  const turnos = [T(0, "carlos", "app"), T(1, "jobs", "app"), T(2, "carlos", "live")];
  const s = salud(turnos, "jobs", Date.parse("2026-10-09T04:15:00Z"));
  assert.equal(s.estado, "aviso");
  assert.equal(s.pendiente.minutos, 13);
  assert.equal(s.ultimoPorOrigen.live.rol, "carlos");
  assert.equal(JSON.stringify(s).includes("secreto"), false);
  assert.equal(salud([...turnos, T(4, "jobs", "rutina")], "jobs", Date.parse("2026-10-09T04:15:00Z")).estado, "ok");
  assert.equal(salud(turnos, "jobs", Date.parse("2026-10-09T04:05:00Z")).estado, "ok");
});

test("API: POST exige token, es idempotente; GET es privado", async () => {
  const e = env();
  assert.equal((await hilo.onRequestPost({ request: post({ persona: "jobs", rol: "carlos", origen: "app", texto: "hola" }, "malo"), env: e })).status, 401);
  assert.equal((await hilo.onRequestPost({ request: post({ persona: "jobs", rol: "carlos", origen: "app", texto: "hola" }), env: { RECORTE_KV: kvFalso() } })).status, 503);
  const r1 = await hilo.onRequestPost({ request: post({ persona: "jobs", rol: "carlos", origen: "app", texto: "hola", msg_id: "x-0001" }), env: e });
  assert.equal(r1.status, 201);
  const r2 = await hilo.onRequestPost({ request: post({ persona: "jobs", rol: "carlos", origen: "app", texto: "hola", msg_id: "x-0001" }), env: e });
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).duplicado, true);
  await hilo.onRequestPost({ request: post({ persona: "jobs", rol: "jobs", origen: "app", texto: "qué tal" }), env: e });
  const sin = await hilo.onRequestGet({ request: get("?persona=jobs"), env: e, fetchImpl: async () => new Response("{}", { status: 400 }) });
  assert.equal(sin.status, 401);
  const conToken = await hilo.onRequestGet({ request: get("?persona=jobs&limite=1", { "X-Council-Token": TOKEN }), env: e });
  const d = await conToken.json();
  assert.equal(d.total, 2);
  assert.equal(d.turnos.length, 1);
  assert.equal(d.turnos[0].texto, "qué tal");
  const s = await (await saludApi.onRequestGet({ request: new Request("https://www.admira.live/api/chat/salud?persona=jobs"), env: e })).json();
  assert.equal(s.turnos, 2);
  assert.equal(JSON.stringify(s).includes("hola"), false);
});

test("Google: solo ID tokens válidos de las cuentas de Carlos", async () => {
  const jwt = "aaa.bbb.ccc";
  const req = (t) => get("?persona=jobs", { Authorization: "Bearer " + t });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const resp = (d) => async () => new Response(JSON.stringify(d), { status: 200 });
  assert.equal(await emailGoogle(req(jwt + "1"), {}, resp({ aud: GOOGLE_CLIENT_ID, email: "csilva@admira.com", email_verified: "true", exp })), "csilva@admira.com");
  assert.equal(await emailGoogle(req(jwt + "2"), {}, resp({ aud: "otro", email: "csilva@admira.com", email_verified: "true", exp })), null);
  assert.equal(await emailGoogle(req(jwt + "3"), {}, resp({ aud: GOOGLE_CLIENT_ID, email: "otro@admira.com", email_verified: "true", exp })), null);
  assert.equal(await emailGoogle(req(jwt + "4"), {}, resp({ aud: GOOGLE_CLIENT_ID, email: "csilva@admira.com", email_verified: "false", exp })), null);
  assert.equal(await emailGoogle(req("no-es-jwt"), {}, resp({})), null);
  const e = env();
  const ok = await hilo.onRequestGet({ request: req(jwt + "5"), env: e, fetchImpl: resp({ aud: GOOGLE_CLIENT_ID, email: "csilvasantin@gmail.com", email_verified: true, exp }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).lector, "google");
});

import * as enviarApi from "./functions/api/chat/enviar.js";
import { textoEncargo, porSincronizar, turnoDeEncargo } from "./chat-hilo-lib.mjs";

test("enviar: guarda turno live, crea UN encargo [chat-coetaneos] y es idempotente", async () => {
  const e = { ...env(), ADMIRA_TELEGRAM_PANEL_KEY: "panel-key" };
  const llamadas = [];
  const fetchImpl = async (url, init) => { llamadas.push({ url, init }); return new Response(JSON.stringify({ ok: true, id: 9001 }), { status: 200 }); };
  const req = (body, token = TOKEN) => new Request("https://www.admira.live/api/chat/enviar", { method: "POST", headers: { "X-Council-Token": token }, body: JSON.stringify(body) });
  assert.equal((await enviarApi.onRequestPost({ request: req({ texto: "hola" }, "malo"), env: e, fetchImpl: async () => new Response("{}", { status: 400 }) })).status, 401);
  assert.equal((await enviarApi.onRequestPost({ request: req({ texto: "hola" }), env: e, fetchImpl })).status, 400);
  const r = await enviarApi.onRequestPost({ request: req({ texto: "Prueba", msg_id: "live-abc123" }), env: e, fetchImpl });
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.turno.encargo, 9001);
  assert.equal(llamadas.length, 1);
  const cuerpo = JSON.parse(llamadas[0].init.body);
  assert.ok(cuerpo.text.startsWith("[chat-coetaneos]"));
  assert.match(cuerpo.text, /api\/chat\/hilo\?persona=jobs/);
  assert.match(cuerpo.text, /msg_id live-abc123/);
  assert.equal(cuerpo.target_persona, "Jobs");
  assert.equal(cuerpo.target_machine, "grokbot");
  assert.equal(llamadas[0].init.headers.authorization, "Bearer panel-key");
  const r2 = await enviarApi.onRequestPost({ request: req({ texto: "Prueba", msg_id: "live-abc123" }), env: e, fetchImpl });
  assert.equal((await r2.json()).duplicado, true);
  assert.equal(llamadas.length, 1);
  assert.equal((await enviarApi.onRequestPost({ request: req({ texto: "Otra", msg_id: "live-abc123" }), env: e, fetchImpl })).status, 409);
  const g = await (await hilo.onRequestGet({ request: get("?persona=jobs", { "X-Council-Token": TOKEN }), env: e, fetchImpl: async () => new Response(JSON.stringify({ ok: true, item: { id: 9001, status: "done", note: "Respuesta de Jobs", done_at: 1791500000 } }), { status: 200 }) })).json();
  const t = g.turnos.find((x) => x.id === "live-abc123");
  assert.equal(t.entrega, "entregado");
  assert.equal(t.encargo_estado, "done");
  const resp = g.turnos.find((x) => x.id === "enc-9001-resp");
  assert.equal(resp.rol, "jobs"); assert.equal(resp.origen, "rutina"); assert.equal(resp.texto, "Respuesta de Jobs");
});

test("enviar: fallo del bot-inbox queda en error, sin token de panel 503", async () => {
  const e = { ...env() };
  const req = new Request("https://www.admira.live/api/chat/enviar", { method: "POST", headers: { "X-Council-Token": TOKEN }, body: JSON.stringify({ texto: "hola", msg_id: "live-x1" }) });
  assert.equal((await enviarApi.onRequestPost({ request: req, env: e })).status, 503);
  e.ADMIRA_TELEGRAM_PANEL_KEY = "k";
  const req2 = new Request("https://www.admira.live/api/chat/enviar", { method: "POST", headers: { "X-Council-Token": TOKEN }, body: JSON.stringify({ texto: "hola", msg_id: "live-x2" }) });
  const r = await enviarApi.onRequestPost({ request: req2, env: e, fetchImpl: async () => new Response("{}", { status: 500 }) });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).turno.entrega, "error");
});

test("texto del encargo cabe en 4000 y sincronizar ignora lo ya respondido", () => {
  const largos = Array.from({ length: 10 }, (_, i) => ({ id: "t" + i, rol: i % 2 ? "jobs" : "carlos", origen: "app", texto: "x".repeat(3000), ts: new Date(1_790_000_000_000 + i).toISOString() }));
  const turno = { id: "live-1", texto: "y".repeat(3000) };
  assert.ok(textoEncargo("jobs", largos, turno).length <= 3900);
  const ahora = Date.now();
  const ts = new Date(ahora - 60000).toISOString();
  const lista = [{ id: "a1", rol: "carlos", origen: "live", encargo: 1, ts }, { id: "a2", rol: "carlos", origen: "live", encargo: 2, ts }, { id: "enc-2-resp", rol: "jobs", origen: "rutina", ts }];
  assert.deepEqual(porSincronizar(lista, "jobs", ahora).map((t) => t.id), ["a1"]);
  assert.equal(turnoDeEncargo("jobs", { id: 3, status: "ack", note: "x" }), null);
});
