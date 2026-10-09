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
