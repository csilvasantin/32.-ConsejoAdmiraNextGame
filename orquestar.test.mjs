// Orquestador (GrokBotBox, 09-10-2026): función pura de puntuación y elección.
import test from "node:test";
import assert from "node:assert/strict";
import { inferirTipo, puntuacion, orquestar, libre, UMBRAL_APTO } from "./orquestar-lib.mjs";

const AHORA = Date.parse("2026-10-09T08:00:00Z");
const S = AHORA / 1000;
const P = (persona, perfil, cuenta, alias = [persona]) => ({ persona, maquina: "M", modelo: "X", perfil, cuenta, alias });
const G = (persona, perfil, cuenta) => ({ ...P(persona, perfil, cuenta), despierta: "webhook" });
const PERSONAS = [P("Neo", "claude", "neo-claude"), P("Trinity", "codex", "trinity-codex"), G("Jobs", "grok-heavy", "leyendas"), P("Morfeo", "claude", null), G("Disney", "grok-heavy-creativo", "leyendas")];
const CUENTAS = [{ id: "neo-claude", nombre: "Neo", margen: 91, semaforo: "verde" }, { id: "trinity-codex", nombre: "Trinity", margen: 77, semaforo: "verde" }, { id: "leyendas", nombre: "Leyendas", margen: 73, semaforo: "rojo" }];
const vivos = (...ps) => ps.map((persona) => ({ persona, updated: S - 30 }));

test("inferirTipo: tipo explícito manda; si no, palabras clave; si nada, código", () => {
  assert.deepEqual(inferirTipo("Investigacion", "arregla bug"), { tipo: "investigacion", inferido: false });
  assert.equal(inferirTipo("", "arreglar un bug en la home").tipo, "codigo");
  assert.equal(inferirTipo("", "rediseñar la landing").tipo, "web");
  assert.equal(inferirTipo("", "investiga la competencia en DOOH").tipo, "investigacion");
  assert.equal(inferirTipo("", "un guion para el spot").tipo, "creativo");
  assert.equal(inferirTipo("", "hola").tipo, "codigo");
});

test("puntuacion: aptitud > libre > margen; margen desconocido penaliza", () => {
  assert.ok(puntuacion({ apto: 0.9, esLibre: true, margenPct: 10 }) > puntuacion({ apto: 0.9, esLibre: false, margenPct: 100 }));
  assert.ok(puntuacion({ apto: 0.9, esLibre: true, margenPct: 80 }) > puntuacion({ apto: 0.9, esLibre: true, margenPct: 50 }));
  assert.ok(puntuacion({ apto: 0.9, esLibre: true, margenPct: 30 }) > puntuacion({ apto: 0.9, esLibre: true, margenPct: null }));
});

test("libre: latido <10 min y sin encargo en curso", () => {
  assert.equal(libre(S - 60, [], S).libre, true);
  assert.equal(libre(S - 11 * 60, [], S).libre, false);
  assert.match(libre(S - 60, [42], S).why, /#42/);
  assert.equal(libre(null, [], S).libre, false);
});

test("código: entre aptos libres gana el de más margen (Neo 91 % sobre Trinity 77 %)", () => {
  const r = orquestar({ tipo: "codigo", cuentas: CUENTAS, presencia: vivos("Neo", "Trinity", "Morfeo"), bandeja: [], ahora: AHORA, personas: PERSONAS });
  assert.equal(r.elegido.persona, "Neo");
  assert.equal(r.elegido.motivo, "Neo: código, libre, 91 % de margen");
  assert.deepEqual(r.candidatos.slice(0, 3).map((c) => c.persona), ["Neo", "Trinity", "Morfeo"]);
});

test("nunca gastar de quien tiene menos margen: si Neo baja a 20 %, va Trinity", () => {
  const cuentas = CUENTAS.map((c) => (c.id === "neo-claude" ? { ...c, margen: 20 } : c));
  const r = orquestar({ tipo: "codigo", cuentas, presencia: vivos("Neo", "Trinity"), bandeja: [], ahora: AHORA, personas: PERSONAS });
  assert.equal(r.elegido.persona, "Trinity");
});

test("ocupado: un encargo in_progress reciente quita a Neo de libre", () => {
  const bandeja = [{ id: 7, target_persona: "Neo", status: "in_progress", ts: S - 600 }, { id: 8, target_persona: "Trinity", status: "done", ts: S - 60 }];
  const r = orquestar({ tipo: "codigo", cuentas: CUENTAS, presencia: vivos("Neo", "Trinity"), bandeja, ahora: AHORA, personas: PERSONAS });
  assert.equal(r.elegido.persona, "Trinity");
  const neo = r.candidatos.find((c) => c.persona === "Neo");
  assert.equal(neo.libre.libre, false); assert.equal(neo.encargosEnCurso, 1);
  // un ack de hace 3 días se da por abandonado
  const viejo = orquestar({ tipo: "codigo", cuentas: CUENTAS, presencia: vivos("Neo"), bandeja: [{ id: 1, target_persona: "Neo", status: "ack", ts: S - 3 * 86400 }], ahora: AHORA, personas: PERSONAS });
  assert.equal(viejo.candidatos.find((c) => c.persona === "Neo").libre.libre, true);
});

test("investigación: Grok Heavy apto y libre gana a Claude; creativo → Disney", () => {
  const r = orquestar({ tipo: "investigacion", cuentas: CUENTAS, presencia: vivos("Neo", "Jobs"), bandeja: [], ahora: AHORA, personas: PERSONAS });
  assert.equal(r.elegido.persona, "Jobs");
  const c = orquestar({ tipo: "creativo", cuentas: CUENTAS, presencia: vivos("Disney", "Neo"), bandeja: [], ahora: AHORA, personas: PERSONAS });
  assert.equal(c.elegido.persona, "Disney");
});

test("no aptos (<0,4) fuera, salvo que no quede nadie; margen desconocido no excluye", () => {
  const solo = [P("Raro", "inexistente", null)];
  const r = orquestar({ tipo: "codigo", cuentas: [], presencia: [], bandeja: [], ahora: AHORA, personas: solo });
  assert.equal(r.elegido.persona, "Raro"); // aptitud neutra 0,5
  const conBajo = [{ ...P("Bajo", "x", null) }, P("Neo", "claude", "neo-claude")];
  const apt = orquestar({ tipo: "codigo", cuentas: CUENTAS, presencia: [], bandeja: [], ahora: AHORA, personas: conBajo, });
  assert.ok(apt.candidatos.every((x) => x.apto >= UMBRAL_APTO));
  const m = orquestar({ tipo: "codigo", cuentas: CUENTAS, presencia: vivos("Morfeo"), bandeja: [], ahora: AHORA, personas: PERSONAS });
  assert.equal(m.candidatos.find((x) => x.persona === "Morfeo").margenPct, null);
});

test("salida pública sin secretos: solo campos conocidos", () => {
  const r = orquestar({ tipo: "web", cuentas: CUENTAS, presencia: vivos("Neo"), bandeja: [], ahora: AHORA, personas: PERSONAS });
  const keys = Object.keys(r.candidatos[0]).sort();
  assert.deepEqual(keys, ["apto", "conCarlos", "cuenta", "despierta", "encargosEnCurso", "encargosIds", "grupo", "libre", "maquina", "margenPct", "modelo", "motivo", "persona", "puntuacion", "semaforo", "ultimoLatido"]);
});

test("consejeros GrokBot: se despiertan por webhook; un latido viejo no los deja «no libre», un encargo en curso sí", () => {
  const viejo = [{ persona: "Jobs", updated: S - 5 * 86400 }, { persona: "Neo", updated: S - 5 * 86400 }];
  const r = orquestar({ tipo: "investigacion", cuentas: CUENTAS, presencia: viejo, bandeja: [], ahora: AHORA, personas: PERSONAS });
  const jobs = r.candidatos.find((c) => c.persona === "Jobs");
  assert.equal(jobs.libre.libre, true);
  assert.equal(jobs.libre.why, "se despierta al recibir encargo");
  const disney = r.candidatos.find((c) => c.persona === "Disney");
  assert.equal(disney.libre.libre, true); // ni siquiera tiene latido
  assert.equal(r.candidatos.find((c) => c.persona === "Neo").libre.libre, false); // la flota sigue con el latido
  assert.equal(r.elegido.persona, "Jobs");
  const ocupado = orquestar({ tipo: "investigacion", cuentas: CUENTAS, presencia: [], bandeja: [{ id: 9, target_persona: "Jobs", status: "ack", ts: S - 3600 }], ahora: AHORA, personas: PERSONAS });
  const j2 = ocupado.candidatos.find((c) => c.persona === "Jobs");
  assert.equal(j2.libre.libre, false); assert.match(j2.libre.why, /#9/);
  // un ack de hace 3 días ya no cuenta (ventana de 48 h)
  const abandonado = orquestar({ tipo: "investigacion", cuentas: CUENTAS, presencia: [], bandeja: [{ id: 9, target_persona: "Jobs", status: "in_progress", ts: S - 3 * 86400 }], ahora: AHORA, personas: PERSONAS });
  assert.equal(abandonado.candidatos.find((c) => c.persona === "Jobs").libre.libre, true);
  assert.equal(libre(null, [], S, { despierta: "webhook" }).libre, true);
});

test("config real: Morfeo → morfeo-claude y Oráculo → oraculo-codex; los seis GrokBot por webhook, la flota por latido", async () => {
  const { PERSONAS: REAL } = await import("./orquestar-config.mjs");
  const by = Object.fromEntries(REAL.map((p) => [p.persona, p]));
  assert.equal(by.Morfeo.cuenta, "morfeo-claude");
  assert.equal(by["Oráculo"].cuenta, "oraculo-codex");
  for (const n of ["Jobs", "Wozniak", "Lucas", "Disney", "Musk", "Huang"]) assert.equal(by[n].despierta, "webhook", n);
  for (const n of ["Neo", "Morfeo", "Trinity", "Oráculo", "Smith"]) assert.equal(by[n].despierta, undefined, n);
  const { CUENTAS: CC } = await import("./consumos-lecturas-lib.mjs");
  for (const p of REAL) if (p.cuenta) assert.ok(CC.some((c) => c.id === p.cuenta), p.persona + " → " + p.cuenta);
  // Oráculo con lectura 40 % entra con margen 60; Morfeo sin lectura no se excluye y sale «sin lectura de margen»
  const cuentas = [{ id: "oraculo-codex", nombre: "Oráculo · Codex", margen: 60, semaforo: "verde" }, { id: "morfeo-claude", nombre: "Morfeo · Claude", margen: null, semaforo: "sin" }];
  const r = orquestar({ tipo: "codigo", cuentas, presencia: [{ persona: "Oraculo", updated: S - 60 }, { persona: "Morfeo", updated: S - 60 }], bandeja: [], ahora: AHORA });
  const ora = r.candidatos.find((c) => c.persona === "Oráculo");
  assert.equal(ora.margenPct, 60); assert.equal(ora.libre.libre, true);
  const mor = r.candidatos.find((c) => c.persona === "Morfeo");
  assert.equal(mor.margenPct, null); assert.match(mor.motivo, /sin lectura de margen/);
});
