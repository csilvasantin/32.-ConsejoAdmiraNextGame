// r27 (Carlos, 11-10-2026 12:16): visor de los 4 deepagents de pago en el Samsung Fold (admira.live/visor).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tapar, normalizarPane, fundir, vista, CONF_DEFECTO, sha256 } from "./visor-lib.mjs";
import { onRequestPost, onRequestGet } from "./functions/api/visor/pane.js";
import { onRequestPost as llavePost } from "./functions/api/visor/llave.js";

test("tapa secretos y deja el resto", () => {
  const s = tapar("export OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuv ghp_abcdefghijklmnopqrstuvwxyz12 Authorization: Bearer abc.def.ghijklmnopqrst password: hunter22");
  for (const malo of ["sk-proj-abc", "ghp_abc", "abc.def.ghij", "hunter22"]) assert.ok(!s.includes(malo), malo);
  assert.equal(tapar("✻ Thinking… (12s · ↓ 1.2k tokens) · git log --author Carlos"), "✻ Thinking… (12s · ↓ 1.2k tokens) · git log --author Carlos");
  assert.ok(!tapar("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawABCDEF").includes("AAHdq"));
});

test("la lista es la de la cuadratura del Mac (mismo orden, mismas sesiones)", () => {
  assert.deepEqual(CONF_DEFECTO.map((c) => c.sesion), ["neo", "morfeo", "trinity", "oraculo"]);
  const v = vista([], 0);
  assert.deepEqual(v.fichas.map((f) => f.estado), ["esperando", "esperando", "esperando", "esperando"]);
});

test("fundir: solo lo que cambió + sesiones muertas fuera; vista vivo/congelado/esperando", () => {
  const A = 1_000_000;
  const p1 = normalizarPane({ maquina: "MacBook-Pro-16", agentes: { neo: { lineas: ["a"] }, trinity: { lineas: ["t"] } }, vivas: ["neo", "trinity"] }, A).pane;
  const d1 = fundir(null, p1);
  const p2 = normalizarPane({ maquina: "macbook-pro-16", completo: false, agentes: { neo: { lineas: ["b"] } }, vivas: ["neo"] }, A + 3000).pane;
  const d2 = fundir(d1, p2);
  assert.deepEqual(Object.keys(d2.agentes), ["neo"]); assert.deepEqual(d2.agentes.neo.lineas, ["b"]);
  const v = vista([d2], A + 5000);
  assert.equal(v.fichas[0].estado, "vivo"); assert.equal(v.fichas[2].estado, "esperando"); assert.equal(v.fichas[3].estado, "esperando");
  assert.equal(vista([d2], A + 300000).fichas[0].estado, "congelado");
});

function kvMem() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }
const req = (method, body, h = {}) => new Request("https://www.admira.live/api/visor/pane", { method, headers: { "content-type": "application/json", ...h }, body: body ? JSON.stringify(body) : undefined });

test("POST con token de máquina; GET exige llave del visor (no es público) y la revocación es inmediata", async () => {
  const env = { RECORTE_KV: kvMem(), CONSUMOS_LECTURAS_TOKEN: "maquina-123" };
  assert.equal((await onRequestPost({ request: req("POST", { maquina: "macbook-pro-16", agentes: {} }), env })).status, 401);
  const r = await onRequestPost({ request: req("POST", { maquina: "macbook-pro-16", agentes: { neo: { lineas: ["\u001b[32mhola\u001b[0m sk-ant-abcdefghijklmnopqrstu"] } }, vivas: ["neo"], conf: CONF_DEFECTO }, { "X-Council-Token": "maquina-123" }), env });
  assert.equal(r.status, 200);
  assert.equal((await onRequestGet({ request: req("GET"), env })).status, 401, "sin llave");
  assert.equal((await onRequestGet({ request: req("GET", null, { "X-Visor-Key": "x".repeat(43) }), env })).status, 401, "llave inventada");
  const lr = await (await llavePost({ request: new Request("https://www.admira.live/api/visor/llave", { method: "POST", headers: { "X-Council-Token": "maquina-123" }, body: JSON.stringify({ accion: "nueva" }) }), env })).json();
  assert.ok(lr.llave.length >= 40);
  assert.ok(!env.RECORTE_KV.m.get("visor:v1:llaves").includes(lr.llave), "en KV solo el hash");
  assert.ok(env.RECORTE_KV.m.get("visor:v1:llaves").includes(await sha256(lr.llave)));
  const g = await onRequestGet({ request: req("GET", null, { "X-Visor-Key": lr.llave }), env });
  assert.equal(g.status, 200);
  const d = await g.json();
  assert.equal(d.fichas[0].estado, "vivo");
  assert.ok(d.fichas[0].lineas[0].includes("hola") && !d.fichas[0].lineas[0].includes("sk-ant-abc"), "el servidor también tapa");
  await llavePost({ request: new Request("https://www.admira.live/api/visor/llave", { method: "POST", headers: { "X-Council-Token": "maquina-123" }, body: JSON.stringify({ accion: "revocar" }) }), env });
  assert.equal((await onRequestGet({ request: req("GET", null, { "X-Visor-Key": lr.llave }), env })).status, 401, "revocada");
});

test("la página no lleva llaves ni tokens y manda la llave solo por cabecera", () => {
  const h = readFileSync(new URL("./visor/index.html", import.meta.url), "utf8");
  assert.ok(h.includes('"X-Visor-Key": llave'));
  assert.ok(h.includes("noindex"));
  assert.ok(!/\?k=/.test(h));
});
