import test from "node:test";
import assert from "node:assert/strict";
import { emitirSesion, emailSesion, emailGoogle, COOKIE_SESION } from "./chat-hilo-lib.mjs";
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
