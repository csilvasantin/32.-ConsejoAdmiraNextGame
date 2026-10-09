// Con Carlos (GrokBotBox, 09-10-2026, r20): si Carlos trabaja directamente con un agente, nadie le inyecta encargos.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizarPulso, aplicarPulso, agentesDePulso, conCarlosDePulso, estadoConCarlos, mezclar, STALE_MS } from "./consumos-pulso-lib.mjs";
import { orquestar, estaConCarlos, OCUPADO_CON_CARLOS } from "./orquestar-lib.mjs";
import { onRequestGet as getConCarlos } from "./functions/api/flota/con-carlos.js";
import { KEY_PREFIX, KEY_INDICE } from "./consumos-pulso-lib.mjs";

const AHORA = Date.parse("2026-10-09T11:55:00+02:00");
const pulso = (cc) => ({ maquina: "MacBookPro16", agentes: [
  { agente: "Neo", motor: "claude", tokHoy: 10, conCarlos: false, conCarlosMotivo: "Mac activo pero sin señal" },
  { agente: "Trinity", motor: "codex", tokHoy: 20, conCarlos: cc, conCarlosMotivo: "reposo 0s · c) prompt tecleado <b>x</b>", conCarlosDesde: "2026-10-09T09:54:48Z" }] });

test("normalizarPulso: conCarlos solo si es true; motivo limpio; desde solo con conCarlos", () => {
  const n = normalizarPulso(pulso(true));
  assert.equal(n.ok, true);
  const t = n.pulso.agentes[1];
  assert.equal(t.conCarlos, true);
  assert.equal(t.conCarlosDesde, "2026-10-09T09:54:48.000Z");
  assert.ok(!/[<>]/.test(t.conCarlosMotivo));
  assert.equal(n.pulso.agentes[0].conCarlosDesde, null);
  assert.equal(normalizarPulso({ maquina: "M", agentes: [{ agente: "A", motor: "claude", tokHoy: 1, conCarlos: "true" }] }).pulso.agentes[0].conCarlos, false);
});

test("aplicarPulso guarda conCarlos; agentesDePulso y la lista pública lo exponen (sin motivo)", () => {
  const { doc } = aplicarPulso(null, normalizarPulso(pulso(true)).pulso, AHORA - 30000);
  const ag = agentesDePulso([doc], AHORA);
  assert.equal(ag.find((a) => a.agente === "Trinity").conCarlos, true);
  assert.equal(ag.find((a) => a.agente === "Neo").conCarlos, false);
  assert.deepEqual(conCarlosDePulso([doc], AHORA), [{ agente: "Trinity", maquina: "MacBookPro16", desde: "2026-10-09T09:54:48.000Z" }]);
  const m = mezclar(null, [doc], AHORA);
  assert.equal(m.porAgente.find((a) => a.agente === "Trinity").conCarlos, true);
});

test("sin pulso fresco (>3 min) nunca cuenta como con Carlos", () => {
  const { doc } = aplicarPulso(null, normalizarPulso(pulso(true)).pulso, AHORA - STALE_MS - 1000);
  assert.deepEqual(conCarlosDePulso([doc], AHORA), []);
  assert.equal(estadoConCarlos(doc.agentes.Trinity, AHORA).conCarlos, false);
  assert.match(estadoConCarlos(doc.agentes.Trinity, AHORA).conCarlosMotivo, /sin pulso fresco/);
});

const P = (persona, perfil, alias = [persona]) => ({ persona, maquina: "M", modelo: "X", perfil, cuenta: null, alias });
const PERSONAS = [P("Neo", "claude"), P("Trinity", "codex"), P("Oráculo", "codex", ["Oraculo", "Oráculo"])];
const S = AHORA / 1000;
const vivos = PERSONAS.map((p) => ({ persona: p.persona, updated: S - 30 }));

test("orquestar: quien está con Carlos queda excluido («ocupado con Carlos»)", () => {
  const r = orquestar({ tipo: "codigo", presencia: vivos, ahora: AHORA, personas: PERSONAS, conCarlos: ["Neo"] });
  assert.notEqual(r.elegido.persona, "Neo");
  assert.ok(!r.candidatos.some((c) => c.persona === "Neo"));
  const ex = r.excluidos.find((x) => x.persona === "Neo");
  assert.equal(ex.motivo, OCUPADO_CON_CARLOS);
  assert.equal(ex.conCarlos, true);
  assert.deepEqual(r.conCarlos, ["Neo"]);
});

test("orquestar: si no queda nadie más apto, sí puede ir a quien está con Carlos (y se dice)", () => {
  const r = orquestar({ tipo: "codigo", presencia: vivos, ahora: AHORA, personas: [PERSONAS[0]], conCarlos: ["Neo"] });
  assert.equal(r.elegido.persona, "Neo");
  assert.match(r.elegido.motivo, /ocupado con Carlos/);
  assert.equal(r.candidatos[0].libre.why, OCUPADO_CON_CARLOS);
});

test("estaConCarlos casa por alias y sin tildes", () => {
  assert.equal(estaConCarlos(PERSONAS[2], ["Oráculo"]), true);
  assert.equal(estaConCarlos(PERSONAS[2], ["oraculo"]), true);
  assert.equal(estaConCarlos(PERSONAS[1], ["Oráculo"]), false);
});

test("GET /api/flota/con-carlos: público, solo nombres + desde", async () => {
  const m = new Map();
  const store = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const { doc } = aplicarPulso(null, normalizarPulso(pulso(true)).pulso, Date.now() - 10000);
  m.set(KEY_INDICE, JSON.stringify(["MacBookPro16"]));
  m.set(KEY_PREFIX + "MacBookPro16", JSON.stringify(doc));
  const r = await getConCarlos({ env: { RECORTE_KV: store } });
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.deepEqual(d.conCarlos.map((x) => Object.keys(x).sort()), [["agente", "desde", "maquina"]]);
  assert.equal(d.conCarlos[0].agente, "Trinity");
  assert.ok(!JSON.stringify(d).includes("prompt"));
});
