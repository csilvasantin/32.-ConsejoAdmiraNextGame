// /api/consumos/velocidad-publica (Carlos vía Jony, 2-nov-2026): solo agregados, sin emails ni claves, CORS abierto.
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestOptions } from "./functions/api/consumos/velocidad-publica.js";

function kvMem() { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
const req = () => new Request("https://www.admira.live/api/consumos/velocidad-publica");
const hoyDia = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

test("velocidad-publica: fuente caída → 200, sinDatos, CORS abierto, esquema v1", async () => {
  const r = await onRequestGet({ request: req(), env: { RECORTE_KV: kvMem() }, fetchImpl: async () => { throw new Error("caída"); } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.match(r.headers.get("cache-control"), /max-age=10/);
  const d = await r.json();
  assert.equal(d.esquema, "admira.consumos.velocidad/v1");
  assert.equal(d.ok, false);
  assert.equal(d.tokHoraAhora, null);
});

test("velocidad-publica: con datos (con emails en la fuente) → ningún @, ni cuenta/plan/email/clave", async () => {
  const fuente = { ok: true, partes: [{ owner: "OraculoMacMini", machine: "MacMini", dia: hoyDia, email: "x@ejemplo.com", cuenta: "x@ejemplo.com",
    datos: { persona: "Oraculo", runtime: "Codex", total: 26.1e6, email: "x@ejemplo.com", plan: "Max" } }], serie: {} };
  const fetchImpl = async () => new Response(JSON.stringify(fuente), { status: 200 });
  const r = await onRequestGet({ request: req(), env: { RECORTE_KV: kvMem() }, fetchImpl });
  const txt = await r.text();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.ok(!txt.includes("@"), "no debe contener emails");
  for (const k of ['"email"', '"cuenta"', '"plan"', '"conocidos"', '"limites"', '"key"', '"token"']) assert.ok(!txt.includes(k), k);
  const d = JSON.parse(txt);
  assert.equal(d.esquema, "admira.consumos.velocidad/v1");
  assert.equal(d.unidad, "tokens/hora");
});

test("velocidad-publica: OPTIONS → 204 con CORS", () => {
  const r = onRequestOptions();
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
});
