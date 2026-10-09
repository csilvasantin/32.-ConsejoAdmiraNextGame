// Orquestador (GrokBotBox, 09-10-2026): función pura de puntuación y elección.
import test from "node:test";
import assert from "node:assert/strict";
import { inferirTipo, puntuacion, orquestar, libre, UMBRAL_APTO } from "./orquestar-lib.mjs";

const AHORA = Date.parse("2026-10-09T08:00:00Z");
const S = AHORA / 1000;
const P = (persona, perfil, cuenta, alias = [persona]) => ({ persona, maquina: "M", modelo: "X", perfil, cuenta, alias });
const PERSONAS = [P("Neo", "claude", "neo-claude"), P("Trinity", "codex", "trinity-codex"), P("Jobs", "grok-heavy", "leyendas"), P("Morfeo", "claude", null), P("Disney", "grok-heavy-creativo", "leyendas")];
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
  assert.deepEqual(keys, ["apto", "cuenta", "encargosEnCurso", "encargosIds", "grupo", "libre", "maquina", "margenPct", "modelo", "motivo", "persona", "puntuacion", "semaforo", "ultimoLatido"]);
});
