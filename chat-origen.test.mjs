import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { origenDe, horaMadrid, conOrigen, mensajeLimpio } from "./chat-hilo-lib.mjs";

test("origenDe: origen explícito o derivado del canal/autor", () => {
  assert.equal(origenDe({ origen: "live", rol: "carlos" }), "admira.live");
  assert.equal(origenDe({ origen: "app", rol: "carlos" }), "Grok Bot");
  assert.equal(origenDe({ origen: "rutina", rol: "jobs" }), "Grok Bot");
  assert.equal(origenDe({ id: "enc-12-resp", rol: "jobs" }), "Grok Bot");
  assert.equal(origenDe({ id: "live-x", rol: "carlos" }), "admira.live");
  assert.equal(origenDe({ rol: "carlos", autor: "csilva@admira.com" }), "admira.live");
  assert.equal(origenDe({ rol: "jobs" }), "Grok Bot");
});
test("horaMadrid: HH:MM en hora de Madrid (CEST/CET)", () => {
  assert.equal(horaMadrid("2026-10-24T07:13:00Z"), "09:13");
  assert.equal(horaMadrid("2026-12-01T07:13:00Z"), "08:13");
  assert.equal(horaMadrid("nada"), "");
  assert.deepEqual(conOrigen({ origen: "live", ts: "2026-10-24T07:13:00Z" }).hora, "09:13");
});
test("mensajeLimpio: sin cabeceras pegadas al texto", () => {
  const m = mensajeLimpio("jobs", { id: "live-1", ts: "2026-10-24T07:13:00Z", texto: "Hola Steve" }, "csilva@admira.com");
  assert.deepEqual(m, { autor: "Carlos Silva", autor_email: "csilva@admira.com", rol: "carlos", origen: "admira.live", canal: "chat/jobs", para: "Steve Jobs", ts: "2026-10-24T07:13:00Z", hora: "09:13", zona: "Europe/Madrid", texto: "Hola Steve", msg_id: "live-1" });
  assert.equal(mensajeLimpio("jobs", { id: "x", ts: "", texto: "a" }, "caja").autor_email, null);
});
test("cliente: origenTurno y metaTurno con el mismo formato", () => {
  const ctx = { window: {}, sessionStorage: null, console };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./assets/chat-hilo-client.js", import.meta.url), "utf8"), ctx);
  const c = ctx.ChatHiloClient;
  assert.equal(c.origenTurno({ origen: "live" }), "admira.live");
  assert.equal(c.origenTurno({ origen_etiqueta: "Grok Bot", origen: "live" }), "Grok Bot");
  assert.equal(c.origenTurno({ rol: "jobs" }), "Grok Bot");
  assert.equal(c.metaTurno("admira.live", "2026-10-24T07:13:00Z"), "admira.live · 09:13");
  assert.equal(c.metaTurno("Grok Bot", "2026-10-24T07:14:00Z"), "Grok Bot · 09:14");
});
