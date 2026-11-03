// #7402 · Consultas externas de admira.live sólo para el Directorio NeXT.
import test from "node:test";
import assert from "node:assert/strict";
import { emitirSesion, emailSesion, COOKIE_SESION, autorizado, _vaciarCacheDirectorio } from "./chat-hilo-lib.mjs";

const TOK = "d".repeat(40);
const env = { CHAT_SESION_SECRET: "s".repeat(40), DIRECTORIO_NEXT_TOKEN: TOK };
const dir = (miembros, estado = 200) => async (url, init) => {
  assert.equal(init.headers["X-Directorio-Token"], TOK);
  if (estado !== 200) return new Response("{}", { status: estado });
  const { email } = JSON.parse(init.body);
  return Response.json({ ok: true, miembro: miembros.includes(email) });
};
const req = (c) => new Request("https://www.admira.live/api/chat/hilo", { headers: { Cookie: COOKIE_SESION + "=" + c } });

test("miembro del directorio entra; quien no está, fuera (aunque fuese dueño)", async () => {
  _vaciarCacheDirectorio();
  assert.equal(await autorizado("ana@admira.com", env, dir(["ana@admira.com"])), true);
  assert.equal(await autorizado("intruso@gmail.com", env, dir(["ana@admira.com"])), false);
  _vaciarCacheDirectorio();
  assert.equal(await autorizado("csilva@admira.com", env, dir([])), false);
});
test("sesión firmada de alguien fuera del directorio → null", async () => {
  _vaciarCacheDirectorio();
  const s = await emitirSesion(env, "intruso@gmail.com");
  assert.equal(await emailSesion(req(s.valor), env, Date.now(), dir([])), null);
  const ok = await emitirSesion(env, "ana@admira.com");
  assert.equal(await emailSesion(req(ok.valor), env, Date.now(), dir(["ana@admira.com"])), "ana@admira.com");
});
test("directorio caído → sólo dueños como respaldo", async () => {
  _vaciarCacheDirectorio();
  assert.equal(await autorizado("csilva@admira.com", env, dir([], 503)), true);
  assert.equal(await autorizado("ana@admira.com", env, dir([], 503)), false);
});
test("sin DIRECTORIO_NEXT_TOKEN: comportamiento anterior (sólo dueños)", async () => {
  assert.equal(await autorizado("csilva@admira.com", {}, async () => { throw new Error("no debe llamar"); }), true);
  assert.equal(await autorizado("ana@admira.com", {}, async () => { throw new Error("no debe llamar"); }), false);
});
