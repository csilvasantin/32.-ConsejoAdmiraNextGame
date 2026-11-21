// r225 (21-11-2026): los consejeros del motor Cloudflare cuentan en /consumos con los tokens REALES del API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registrarConsumoConsejo, volcarSiPendiente, tokensDe, diaMadrid, AGENTE_CF, MAQUINA_CF, KEY_PENDIENTE_CF } from "./consejo-consumo-lib.mjs";
import { KEY_PREFIX, KEY_INDICE, agentesDePulso } from "./consumos-pulso-lib.mjs";

function kvFalso() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k).v : null; },
    async put(k, v, o) { m.set(k, { v: String(v), meta: (o && o.metadata) || null }); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.meta })), list_complete: true }; },
  };
}

test("tokensDe: entrada + salida del API; sin usage no se inventa nada", () => {
  assert.equal(tokensDe({ input_tokens: 1200, output_tokens: 300 }), 1500);
  assert.equal(tokensDe({ input_tokens: null, output_tokens: null }), null);
  assert.equal(tokensDe({}), null);
});

test("una respuesta de consejero se vuelca al pulso de la máquina Cloudflare (motor grok, proyecto admira.live)", async () => {
  const kv = kvFalso(), env = { RECORTE_KV: kv };
  const t0 = Date.parse("2026-11-21T17:00:00Z");
  const r = await registrarConsumoConsejo(env, { input_tokens: 1000, output_tokens: 250, llm: "grok-4.6" }, t0);
  assert.equal(r.guardado, true);
  const doc = JSON.parse(await kv.get(KEY_PREFIX + MAQUINA_CF));
  const a = doc.agentes[AGENTE_CF];
  assert.equal(a.motor, "grok");
  assert.equal(a.tokHoy, 1250);
  assert.deepEqual(a.porProyecto, { "admira.live": 1250 });
  assert.deepEqual(JSON.parse(await kv.get(KEY_INDICE)), [MAQUINA_CF]);
  // Segunda respuesta a los 10 s: se apunta pero no se escribe el pulso (≤ 1 escritura / 50 s) → queda pendiente.
  const r2 = await registrarConsumoConsejo(env, { input_tokens: 500, output_tokens: 100 }, t0 + 10e3);
  assert.equal(r2.guardado, false);
  assert.ok(await kv.get(KEY_PENDIENTE_CF));
  // /api/consumos/velocidad lo vuelca en cuanto se puede.
  const v = await volcarSiPendiente(env, t0 + 61e3);
  assert.equal(v.guardado, true);
  assert.equal(v.tokHoy, 1850);
  const lista = agentesDePulso([JSON.parse(await kv.get(KEY_PREFIX + MAQUINA_CF))], t0 + 62e3);
  const ag = lista.find((x) => x.agente === AGENTE_CF);
  assert.ok(ag, "el agente Consejeros (Cloudflare) sale en la lista de consumos");
  assert.equal(ag.tokHoy, 1850);
  assert.ok(ag.tokHora > 0, "con tokens en los últimos 15 min el ritmo es > 0");
  assert.equal(ag.stale, false, "silencio entre respuestas no es «parado»");
  assert.equal(ag.tokUltimaHora, 1850, "la primera respuesta del día también cuenta en la serie");
});

test("sin tokens del API o sin KV no se apunta nada y nunca lanza", async () => {
  assert.equal((await registrarConsumoConsejo({}, { input_tokens: 10, output_tokens: 5 })).ok, false);
  const kv = kvFalso();
  assert.equal((await registrarConsumoConsejo({ RECORTE_KV: kv }, { input_tokens: null })).ok, false);
  assert.equal(kv.m.size, 0);
  const roto = { RECORTE_KV: { get() { throw new Error("x"); }, put() { throw new Error("x"); } } };
  assert.equal((await registrarConsumoConsejo(roto, { input_tokens: 1, output_tokens: 1 })).ok, false);
});

test("día de Madrid", () => {
  assert.equal(diaMadrid(Date.parse("2026-11-21T23:30:00Z")), "2026-11-22");
});

test("preguntarConsejero apunta el consumo y velocidad vuelca lo pendiente", () => {
  const lib = readFileSync(new URL("./consejo-ask-lib.mjs", import.meta.url), "utf8");
  assert.match(lib, /await registrarConsumoConsejo\(env, \{ input_tokens: out\.input_tokens, output_tokens: out\.output_tokens/);
  const vel = readFileSync(new URL("./functions/api/consumos/velocidad.js", import.meta.url), "utf8");
  assert.match(vel, /await volcarSiPendiente\(env, ahora\)/);
});
