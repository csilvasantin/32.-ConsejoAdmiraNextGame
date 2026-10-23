// r55 (Carlos, 23-10-2026): actividad real de hoy → al menos rojo; Neo; pool compartido; tooltip del color.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { tarjetas, aplicarRojo, aplicarActividadConsejero, porqueColor, ultimaAccionEncargos, actividadDeLatidos } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-10-23T05:45:00Z") / 1000); // 07:45 Madrid
const iso = (s) => new Date(s * 1000).toISOString();
const card = (ts, n) => ts.find((x) => x.agente === n);

test("r55: Neo con tokens hoy a las 00:03 y latido de proceso de hace 5 s → ROJO (no gris)", () => {
  const p = { agente: "Neo", motor: "claude", tokHora: 0, tokHoy: 31860, tokUltimaHora: 0, maquina: "MacStudio", ultimoEvento: "2026-10-22T22:03:15Z", ultimaActividad: "2026-10-22T22:04:07Z", ultimoPulso: iso(T) };
  const lat = { persona: "Neo", machine: "MacStudio", source: "process_snapshot", host: "app", updated: T - 5 };
  const ts = tarjetas({ presencia: [lat], velocidad: { porAgente: [p] }, ahoraS: T });
  aplicarRojo(ts, T);
  const n = card(ts, "Neo");
  assert.equal(n.estado, "rojo");
  assert.ok(n.haceS > 5 * 3600, "haceS de los tokens, no del latido");
  assert.match(porqueColor(n, T), /sin tokens desde hace 8 h/);
});

test("r55: latido automático de un proceso (sin declaración) no cuenta; declaración y encargos sí", () => {
  assert.equal(actividadDeLatidos([{ source: "process_snapshot", updated: T, declared_updated: 0 }, { source: "heartbeat", mode: "pasivo", focus: "x", updated: T }]), null);
  assert.equal(actividadDeLatidos([{ source: "heartbeat", mode: "trabajando", focus: "PR #1", updated: T - 60 }]).ts, T - 60);
  assert.equal(actividadDeLatidos([{ source: "process_snapshot", updated: T, declared_updated: T - 9 }]), null);
  // en tarjetas los latidos de presencia nunca encienden «activo hoy»
  const ts = tarjetas({ presencia: [{ persona: "Trinity", machine: "MacMini", source: "heartbeat", mode: "trabajando", focus: "x", updated: T - 60 }], velocidad: null, ahoraS: T });
  aplicarRojo(ts, T);
  assert.equal(card(ts, "Trinity").estado, "gris");
  const items = [{ target_persona: "Oráculo", status: "done", done_at: T - 100, ack_at: T - 500 }, { target_persona: "Oráculo", status: "cancelled", done_at: T - 10 }, { target_persona: "Neo", ack_at: T }];
  assert.deepEqual(ultimaAccionEncargos(items, "oráculo"), { ts: T - 100, fuente: "encargo cerrado" });
});

test("r55: Oráculo con encargo cerrado hoy y 0 tokens → rojo; sin nada hoy → gris", () => {
  const carga = { get: (p) => (/^or[aá]culo$/i.test(p) ? { in_progress: 0, abiertos: 0, blocked: 0, ultAccion: { ts: T - 3000, fuente: "encargo cerrado" } } : null) };
  const ts = tarjetas({ presencia: [], velocidad: { porAgente: [{ agente: "Oráculo", motor: "codex", tokHora: 0, tokHoy: 0, tokUltimaHora: 0 }, { agente: "Smith", motor: "grok", tokHora: 0, tokHoy: 0, tokUltimaHora: 0 }], conocidos: [{ agente: "Smith" }] }, ahoraS: T, carga });
  aplicarRojo(ts, T);
  assert.equal(card(ts, "Oráculo").estado, "rojo");
  assert.match(porqueColor(card(ts, "Oráculo"), T), /encargo cerrado a las 06:55 · sin tokens hoy/);
  assert.equal(card(ts, "Smith").estado, "gris");
  assert.match(porqueColor(card(ts, "Smith"), T), /nada hoy/);
});

test("r55: mensaje de consejero hoy → su ficha gris pasa a rojo", () => {
  const ts = [{ agente: "Lucas", estado: "gris", consejero: true }];
  aplicarActividadConsejero(ts, { Lucas: { modo: "reposo", at: T - 7200, origen: "actividad consejero_mensaje" } });
  aplicarRojo(ts, T);
  assert.equal(ts[0].estado, "rojo");
  assert.match(porqueColor(ts[0], T), /^mensaje de consejero a las 05:45/);
});

test("r55: tooltip verde con último token y su traducción EN", () => {
  const t = { agente: "Morfeo", estado: "verde", ultimoToken: iso(T - 180), superficies: [{ tipo: "app", enUso: true }] };
  const es = porqueColor(t, T);
  assert.equal(es, "último token hace 3 min · app abierta en uso");
  const ctx = { globalThis: {} }; ctx.globalThis.AdmiraIdiomaExtra = [];
  vm.runInNewContext(readFileSync(new URL("./admira-idioma-consumos.js", import.meta.url), "utf8"), ctx);
  const reglas = ctx.globalThis.AdmiraIdiomaExtra[0][1];
  const tr = (s) => { for (const [re, r] of reglas) { const m = s.match(re); if (m) return typeof r === "function" ? r(m, () => null) : s.replace(re, r); } return null; };
  assert.equal(tr(es), "last token 3 min ago · app open and in use");
  assert.equal(tr("encargo aceptado a las 07:10 · sin tokens desde hace 2 h"), "task acknowledged at 07:10 · no tokens for 2 h");
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /t\.porqueColor \? t\.porqueColor/);
});
