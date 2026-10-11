// r26 (Carlos, 11-10-2026 11:31/11:33): foco = proyecto principal · deepagent; «Training» sin foco; solo Musk por defecto.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { focoDe, normalizarFoco, aplicarFoco, REPARTO, FOCO_DEFECTO, TRAINING } from "./consejo-foco-lib.mjs";
import { onRequestPost, onRequestGet } from "./functions/api/consejo/foco.js";

const A = Date.parse("2026-10-11T09:31:00Z");
test("consejeros: el suyo > latido > Musk por defecto > Training", () => {
  assert.deepEqual(Object.keys(FOCO_DEFECTO), ["Musk"]);
  const m = focoDe({ agente: "Musk", consejero: true, via: "Merovingio", proyecto: "admira.tv" }, null, A);
  assert.deepEqual([m.proyecto, m.deepagent, m.defecto], ["admira.live", "Morfeo", true], "vía Merovingio: el proyecto de Merovingio no es el de Musk");
  for (const n of ["Huang", "Jobs", "Wozniak", "Lucas", "Shotwell"]) {
    const f = focoDe({ agente: n, consejero: true }, null, A);
    assert.equal(f.proyecto, TRAINING, n); assert.equal(f.defecto, false); assert.equal(f.deepagent, null);
  }
  const doc = aplicarFoco(null, normalizarFoco({ consejero: "Huang", proyecto: "admira.live", deepagent: "Oráculo" }, A));
  assert.deepEqual([focoDe({ agente: "Huang", consejero: true }, doc, A).proyecto, focoDe({ agente: "Huang", consejero: true }, doc, A).fuente], ["admira.live", "consejero"]);
  assert.equal(focoDe({ agente: "Huang", consejero: true }, aplicarFoco(doc, normalizarFoco({ consejero: "huang", borrar: true }, A)), A).proyecto, TRAINING);
});

test("agentes: proyecto de ahora > pilar del reparto (hasta el 12-10)", () => {
  assert.equal(focoDe({ agente: "Trinity", proyecto: "admira.biz" }, null, A).proyecto, "admira.biz");
  assert.deepEqual([focoDe({ agente: "Trinity", proyecto: "otros" }, null, A).proyecto, focoDe({ agente: "Trinity" }, null, A).fuente], ["admira.biz", "reparto"]);
  assert.equal(focoDe({ agente: "Trinity" }, null, Date.parse("2026-10-20T10:00:00Z")), null);
  assert.equal(focoDe({ agente: "Cypher" }, null, A), null);
});

test("REPARTO coincide con /reparto/reparto-finde.json", () => {
  const j = JSON.parse(readFileSync(new URL("./reparto/reparto-finde.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.fromEntries(j.pilares.map((p) => [p.agente, p.pilar])), REPARTO);
});

test("API: POST con token guarda; sin token 401; GET público", async () => {
  const mem = new Map(), store = { get: async (k) => mem.get(k) ?? null, put: async (k, v) => { mem.set(k, v); } };
  const env = { CONSUMOS_LECTURAS_TOKEN: "t0k", CONSUMOS_KV: store };
  const req = (tok, body) => new Request("https://www.admira.live/api/consejo/foco", { method: "POST", headers: { "content-type": "application/json", ...(tok ? { "X-Council-Token": tok } : {}) }, body: JSON.stringify(body) });
  assert.equal((await onRequestPost({ request: req(null, { consejero: "Jobs", proyecto: "x" }), env })).status, 401);
  assert.equal((await onRequestPost({ request: req("t0k", { consejero: "Jobs" }), env })).status, 400);
  const r = await onRequestPost({ request: req("t0k", { consejero: "Jobs", proyecto: "admiranext.com", deepagent: "Smith" }), env });
  assert.equal(r.status, 200);
  const g = await (await onRequestGet({ request: new Request("https://www.admira.live/api/consejo/foco"), env })).json();
  assert.equal(g.focos.Jobs.deepagent, "Smith");
});

test("cliente: rota en 3 fases cada 15 s y no repite «CLI»", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  const win = { addEventListener() {}, dispatchEvent() {} };
  const doc = { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null };
  new Function("window", "document", "location", "localStorage", "URL", js.replace(/\(typeof window !== 'undefined' \? window : globalThis\)\s*;?\s*$/, "(window);"))(win, doc, { href: "https://x/consumos" }, { getItem: () => null }, URL);
  const { altChip, focoTxt } = win.ConsumosTrabajando;
  assert.match(js, /ALTERNA_MS = 15000/);
  const mero = altChip({ agente: "Merovingio", estado: "verde", maqCorta: "Box", runtime: "GrokBot CLI", superficies: [{ tipo: "cli" }, { tipo: "app", enUso: true }], foco: { proyecto: "admira.live" } });
  assert.doesNotMatch(mero, /CLI · CLI/); assert.match(mero, /GrokBot CLI · App · Carlos/); assert.match(mero, /tr-c">admira\.live</);
  assert.equal(focoTxt({ foco: { proyecto: "admira.live", deepagent: "Morfeo", defecto: true } }), "admira.live · Morfeo · por defecto");
  assert.equal(focoTxt({ foco: { proyecto: "Training", fuente: "training" } }), "Training");
});
