import test from "node:test";
import assert from "node:assert/strict";
import { emitirSesion, emailSesion, emailGoogle, emailPuertaPersona, COOKIE_SESION } from "./chat-hilo-lib.mjs";
import { emitir as emitirPuerta, COOKIE as COOKIE_PUERTA } from "./functions/_puerta.js";
import { onRequestGet as sesionGet } from "./functions/api/chat/sesion.js";
const env = { CONSUMOS_LECTURAS_TOKEN: "x".repeat(32) };
const req = (cookie, method = "GET", origin) => new Request("https://www.admira.live/api/chat/hilo", { method, headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}), Authorization: "Bearer sesion" } });
test("cookie firmada válida → email permitido (GET, pestaña nueva)", async () => {
  const s = await emitirSesion(env, "csilva@admira.com");
  assert.equal(await emailSesion(req(COOKIE_SESION + "=" + s.valor), env), "csilva@admira.com");
  assert.equal(await emailGoogle(req(COOKIE_SESION + "=" + s.valor), env, () => { throw new Error("no Google"); }), "csilva@admira.com");
});
test("cookie manipulada, caducada o de email fuera de allowlist → null", async () => {
  const s = await emitirSesion(env, "csilvasantin@gmail.com");
  const [d, f] = s.valor.split(".");
  const falso = btoa(JSON.stringify({ v: 1, e: "csilva@admira.com", x: Date.now() + 1e9 })).replace(/=+$/, "");
  assert.equal(await emailSesion(req(COOKIE_SESION + "=" + falso + "." + f), env), null);
  assert.equal(await emailSesion(req(COOKIE_SESION + "=" + s.valor), env, Date.now() + 200 * 864e5), null);
  const otro = await emitirSesion(env, "intruso@example.com");
  assert.equal(await emailSesion(req(COOKIE_SESION + "=" + otro.valor), env), null);
  assert.equal(await emailSesion(req(COOKIE_SESION + "=" + d + "." + f), { CONSUMOS_LECTURAS_TOKEN: "y".repeat(32) }), null);
});
test("POST con cookie exige mismo origen (anti-CSRF)", async () => {
  const s = await emitirSesion(env, "csilva@admira.com");
  assert.equal(await emailSesion(req(COOKIE_SESION + "=" + s.valor, "POST", "https://evil.example"), env), null);
  assert.equal(await emailSesion(req(COOKIE_SESION + "=" + s.valor, "POST"), env), null);
  assert.equal(await emailSesion(req(COOKIE_SESION + "=" + s.valor, "POST", "https://www.admira.live"), env), "csilva@admira.com");
});
test("sin secreto configurado no se emite sesión", async () => {
  assert.equal(await emitirSesion({}, "csilva@admira.com"), null);
});

const FIRMA = "z".repeat(48);
const envPuerta = { PUERTA_FIRMA: FIRMA, CONSUMOS_LECTURAS_TOKEN: "x".repeat(32) };
const reqPuerta = async (tipo, sujeto, method = "GET", origin) => {
  const c = await emitirPuerta(FIRMA, tipo, sujeto);
  return new Request("https://www.admira.live/api/chat/hilo", { method, headers: { Cookie: COOKIE_PUERTA + "=" + c.valor, ...(origin ? { Origin: origin } : {}), Authorization: "Bearer sesion" } });
};

test("la cookie de la puerta (persona) vale como sesión del chat, sin pedir otro Google", async () => {
  const r = await reqPuerta("persona", "csilva@admira.com");
  assert.equal(await emailPuertaPersona(r, envPuerta), "csilva@admira.com");
  assert.equal(await emailSesion(r, envPuerta), "csilva@admira.com");
  assert.equal(await emailGoogle(r, envPuerta, () => { throw new Error("no Google"); }), "csilva@admira.com");
});

test("agente o kiosco de la puerta no abren el chat; email fuera de allowlist tampoco", async () => {
  assert.equal(await emailSesion(await reqPuerta("agente", "Neo"), envPuerta), null);
  assert.equal(await emailSesion(await reqPuerta("kiosco", "kiosco-1"), envPuerta), null);
  assert.equal(await emailSesion(await reqPuerta("persona", "intruso@example.com"), envPuerta), null);
});

test("POST con solo la puerta también exige mismo origen", async () => {
  assert.equal(await emailSesion(await reqPuerta("persona", "csilva@admira.com", "POST", "https://evil.example"), envPuerta), null);
  assert.equal(await emailSesion(await reqPuerta("persona", "csilva@admira.com", "POST"), envPuerta), null);
  assert.equal(await emailSesion(await reqPuerta("persona", "csilva@admira.com", "POST", "https://www.admira.live"), envPuerta), "csilva@admira.com");
});

test("GET /api/chat/sesion con la puerta emite la cookie del chat", async () => {
  const request = await reqPuerta("persona", "csilvasantin@gmail.com");
  const res = await sesionGet({ request, env: envPuerta });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.email, "csilvasantin@gmail.com");
  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  assert.ok(cookies.some((c) => c && c.startsWith(COOKIE_SESION + "=") && /HttpOnly; Secure; SameSite=Lax/.test(c)));
});
