// r241 (Carlos, 21-11-2026 22:39: «porque Trinity aparece en amarillo si esta trabajando a tope?»):
// en un agente, la actividad propia reciente gana a «con Carlos»; amarillo solo si está parado esperando a Carlos.
import test from "node:test";
import assert from "node:assert/strict";
import { tarjetas, actividadPropia, ACTIVIDAD_PROPIA_S, CPU_APP_TRABAJANDO } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-11-21T21:40:00Z") / 1000);
const iso = (s) => new Date(s * 1000).toISOString();
const vel = (o) => ({ porAgente: [{ agente: "Trinity", maquina: "MacStudio", tokHora: 0, tokUltimaHora: 0, tokHoy: 5797345,
  conCarlos: true, conCarlosMotivo: "reposo 3s · c) prompt tecleado por persona en app de Codex hace 27s", ...o.p }],
  superficies: o.sup || [] });
const trin = (v) => tarjetas({ presencia: [], velocidad: v, ahoraS: T }).find((t) => t.agente === "Trinity");

test("r241: Trinity con Carlos y tokens hace 9 s (datos reales 22:39) → VERDE, guarda dónde está Carlos", () => {
  const t = trin(vel({ p: { tokHora: 280408, tokUltimaHora: 5797345, ultimoEvento: iso(T - 9), ultimaActividad: iso(T - 9) },
    sup: [{ maquina: "MacStudio", agente: "Trinity", tipo: "app", app: "Codex", enUso: true, cpu: 53.6 }] }));
  assert.equal(t.estado, "verde");
  assert.match(t.motivo, /^tokens hace 9 s · con Carlos/);
  assert.match(t.conCarlosTrabajando, /prompt tecleado/);
  assert.equal(t.conCarlosEn, "MacStudio");
});

test("r241: con Carlos, sin tokens recientes pero su app a > umbral de CPU → VERDE", () => {
  const t = trin(vel({ p: { ultimoEvento: iso(T - 1800) }, sup: [{ maquina: "MacStudio", agente: "Trinity", tipo: "app", app: "Codex", enUso: true, cpu: CPU_APP_TRABAJANDO + 5 }] }));
  assert.equal(t.estado, "verde");
  assert.match(t.motivo, /app Codex al 45 % de CPU/);
});

test("r241: con Carlos y parado (último token hace 30 min, app en reposo) → sigue AMARILLO", () => {
  const t = trin(vel({ p: { ultimoEvento: iso(T - 1800) }, sup: [{ maquina: "MacStudio", agente: "Trinity", tipo: "app", app: "Codex", enUso: true, cpu: 3 }] }));
  assert.equal(t.estado, "amarillo");
  assert.equal(t.conCarlosTrabajando, null);
});

test("r241: actividadPropia — ventana de 5 min y CPU de la app de ESE agente", () => {
  assert.equal(ACTIVIDAD_PROPIA_S, 300);
  assert.match(actividadPropia({ agente: "Trinity", ultTok: T - 299, ahoraS: T }), /tokens hace 299 s/);
  assert.equal(actividadPropia({ agente: "Trinity", ultTok: T - 301, ahoraS: T }), null);
  assert.equal(actividadPropia({ agente: "Trinity", ultTok: null, tokVivo: 10, ahoraS: T }), "tokens en los últimos 15 min");
  assert.equal(actividadPropia({ agente: "Trinity", ultTok: T - 4000, ahoraS: T, superficies: [{ tipo: "app", agente: "Neo", app: "Claude", cpu: 90, maquina: "MacStudio" }] }), null);
});
