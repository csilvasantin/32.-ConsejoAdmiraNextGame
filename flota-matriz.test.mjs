// r4 (Jensen, 10-10-2026): Carlos — «no veo al Merovingio ni a Oráculo» + Matriz de agentes. Datos de agentes_vivos de las 12:38.
import test from "node:test";
import assert from "node:assert/strict";
import { tarjetas } from "./flota-trabajando-lib.mjs";
import { matriz, cargaDe, persona } from "./flota-matriz-lib.mjs";

const T = 1791628000;
const lat = (o) => ({ source: "process_snapshot", declaration_state: "unverified", updated: T - 10, declared_updated: T - 10, ...o });
const presencia = [
  lat({ persona: "Oraculo", machine: "MacMini", runtime: "OpenCode", model: "nvidia/nemotron-3-ultra-550b-a55b", session_id: "oraculo-opencode" }),
  lat({ persona: "Oraculo", machine: "MacBookAir16plata", runtime: "Codex", model: "gpt-6-astra", session_id: "oraculo" }),
  { persona: "Merovingio", machine: "GrokBotBox", runtime: "DeepAgents", source: "heartbeat", mode: "pasivo", updated: T - 39, declared_updated: T - 39 },
  { persona: "Cypher", machine: "GrokBotBox", runtime: "DeepAgents", source: "heartbeat", mode: "pasivo", updated: T - 39 },
  lat({ persona: "Agente Nuevo", machine: "MacMini", runtime: "OpenCode", model: "nemotron" }),
];
const carga = new Map([["Oraculo", { in_progress: 9, abiertos: 28 }], ["Merovingio", { in_progress: 0, abiertos: 5 }], ["Cypher", { in_progress: 0 }]]);
const de = (t, n) => t.find((x) => x.agente === n);

test("Oráculo (OpenCode gratis + Codex, 0 tokens, 9 en curso) sale trabajando, una vez, con Codex y nota plan C", () => {
  const t = tarjetas({ presencia, velocidad: null, ahoraS: T, carga });
  const o = t.filter((x) => x.agente === "Oráculo");
  assert.equal(o.length, 1);
  assert.equal(o[0].estado, "verde");
  assert.equal(o[0].motor, "Codex");
  assert.equal(o[0].planC, true);
  assert.equal(o[0].enCurso, 9);
});
test("Merovingio con latido sale trabajando, con Grok CLI y sin nota de plan C", () => {
  const m = de(tarjetas({ presencia, velocidad: null, ahoraS: T, carga }), "Merovingio");
  assert.equal(m.estado, "verde");
  assert.equal(m.motor, "GrokBot · GrokBot CLI");
  assert.equal(m.planC, false);
});
test("latido sin encargo en curso ni tokens (Cypher) sigue parado; latido de > 15 min no cuenta", () => {
  assert.equal(de(tarjetas({ presencia, velocidad: null, ahoraS: T, carga }), "Cypher").estado, "gris");
  const viejo = presencia.map((e) => ({ ...e, updated: T - 1000, declared_updated: T - 1000 }));
  assert.equal(de(tarjetas({ presencia: viejo, velocidad: null, ahoraS: T, carga }), "Oráculo").estado, "gris");
});
test("Matriz: mapa fijo + agente nuevo sin clasificar y gratis; sin señal en gris; resumen N de M de pago", () => {
  const { filas, resumen } = matriz({ presencia, carga, ahoraS: T });
  const o = filas.find((f) => f.persona === "Oraculo");
  assert.equal(o.coste, "mixto"); assert.equal(o.depende, "Musk"); assert.equal(o.vivo, true);
  const n = filas.find((f) => f.persona === "Agente Nuevo");
  assert.equal(n.mapeado, false); assert.equal(n.coste, "gratis"); assert.equal(n.abierto, true); assert.equal(n.equipo, null);
  assert.equal(filas.filter((f) => /Merovingio/.test(f.agente)).length, 1);
  assert.equal(filas.find((f) => f.persona === "Neo").vivo, false);
  assert.equal(filas.find((f) => f.persona === "Link").coste, null);
  assert.equal(resumen.suscripciones, 6);
  assert.deepEqual(resumen.subs, { grok: 2, codex: 2, claude: 2 });
  assert.equal(filas.find((f) => f.persona === "Smith").depende, "Jobs");
  assert.equal(filas.find((f) => f.persona === "Huang").coste, "incluido");
  assert.equal(filas.find((f) => f.persona === "Jobs").incluidoEn, "Smith");
  assert.equal(resumen.fuera, 0);
});
test("cargaDe cuenta solo los de la persona; persona() normaliza", () => {
  assert.equal(persona("Oráculo"), "Oraculo"); assert.equal(persona("Elon / Merovingio"), "Merovingio"); assert.equal(persona("JensenHuang"), "Huang");
  const c = cargaDe([{ target_persona: "Oraculo", status: "in_progress" }, { target_persona: "Neo", status: "in_progress" }, { target_persona: "oraculo", status: "done" }], "Oraculo");
  assert.equal(c.in_progress, 1); assert.equal(c.abiertos, 1);
});

test("r6: modelo de pago fuera de las 6 → en rojo; el pool de Grok Bot va bajo Merovingio", () => {
  const p2 = [...presencia, lat({ persona: "Cypher", machine: "MacMini", runtime: "Claude" }), lat({ persona: "Oraculo", machine: "MacMini", runtime: "Claude" })];
  const { filas, resumen } = matriz({ presencia: p2, carga, ahoraS: T });
  assert.equal(filas.find((f) => f.persona === "Cypher").fuera, true);
  assert.equal(filas.find((f) => f.persona === "Oraculo").fuera, true, "Oráculo es Codex: Claude es de otra suscripción");
  assert.equal(resumen.fuera, 2);
  const vel = { porAgente: [{ agente: "Grok Bot (Consejo)", maquina: "GrokBotBox", motor: "cursor", tokHoy: 2000000, conRetraso: true }] };
  const t = tarjetas({ presencia: p2, velocidad: vel, ahoraS: T, carga });
  assert.equal(t.find((x) => /Grok Bot/.test(x.agente)), undefined);
  for (const c of ["Musk", "Huang"]) assert.equal(t.find((x) => x.agente === c).via, "Merovingio", c); // r44/r45
  const m = t.find((x) => x.agente === "Merovingio");
  assert.equal(m.tokHoy, 2000000); assert.ok(m.incluye.includes("Huang"));
  assert.ok(t.find((x) => x.agente === "Cypher").fuera.length > 0);
});

test("r6 · 13:01: solo Musk, Huang, Jobs y Wozniak en Grok Bot de pago; el resto del Consejo, Nemotron Ultra gratis por defecto", () => {
  const { filas, resumen } = matriz({ presencia, carga, ahoraS: T });
  for (const n of ["Shotwell", "Porat", "Lasseter", "Ive", "Ratti", "Reynolds", "Lucas", "Disney", "Cook"]) {
    const f = filas.find((x) => x.persona === n);
    assert.ok(f, n); assert.equal(f.coste, "gratis", n); assert.equal(f.porDefecto, true, n);
  }
  assert.equal(filas.find((f) => f.persona === "Jobs").coste, "incluido");
  assert.equal(filas.find((f) => f.persona === "Wozniak").coste, "incluido");
  assert.equal(resumen.suscripciones, 6);
  const lucasGrok = [...presencia, lat({ persona: "Lucas", machine: "GrokBot", runtime: "Grok", model: "Grok Heavy" }), lat({ persona: "Jobs", machine: "GrokBot", runtime: "Grok" })];
  const r = matriz({ presencia: lucasGrok, carga, ahoraS: T });
  assert.equal(r.filas.find((f) => f.persona === "Lucas").fuera, true, "Lucas con Grok de pago → rojo");
  assert.equal(r.filas.find((f) => f.persona === "Jobs").fuera, false);
  assert.equal(persona("Gwynne Shotwell"), "Shotwell");
});
