// r227 (Carlos, 21-11-2026): «minimo 100k por cada aplicación abierta de agentes y de consejeros y siempre va a haber
// minimo 6 … los consejeros actuales y los leyendas en MacStudio y MacMini y los 2 DeepAgents en el MacStudio y los 2
// DeepAgents en MacMini».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("./assets/consumos-velocimetro-elegir.js", import.meta.url), "utf8"), ctx);
const E = ctx.ConsumosElegir;
const sup = (maquina, tipo, extra) => ({ tipo, maquina, fuente: "pulso", ...extra });

test("apps abiertas: una por Mac y app (o sesión CLI); pilares con sus 4 de base mientras estén en línea", () => {
  const trab = {
    tarjetas: [
      { agente: "Trinity", superficies: [sup("MacStudio", "app", { app: "Codex" }), sup("MacBookPro16", "cli", { sesion: "trinity" })] },
      { agente: "Neo", superficies: [sup("MacStudio", "app", { app: "Claude" }), { tipo: "app", maquina: "MacBook Pro 16", app: "Claude", fuente: "latido" }] },
      { agente: "Jobs", superficies: [{ tipo: "asistente", maquina: null, fuente: "mapa" }, sup("MacStudio", "app", { app: "GrokBot" })] },
      { agente: "Wozniak", superficies: [sup("MacStudio", "app", { app: "GrokBot" })] },
      { agente: "Morfeo", superficies: [sup("MacMini", "app", { app: "Claude" })] },
      { agente: "Smith", superficies: [sup("MacMini", "cli", { sesion: "smith" })] },
      // la sesión «siempre viva» de Merovingio sin latido propio (sin sesión) no cuenta
      { agente: "Merovingio", superficies: [{ tipo: "cli", maquina: "GrokBotBox", runtime: "GrokBot CLI", fuente: "latido" }] },
    ],
    appsGrokBot: [{ maquina: "MacStudio", fuente: "app" }, { maquina: "MacMini", fuente: "desconocida" }],
  };
  const a = E.appsAbiertas(trab);
  assert.equal(a.porMaquina.MacStudio, 4, "3 detectadas (Codex, Claude, GrokBot) → base 4");
  assert.equal(a.porMaquina.MacMini, 4, "2 detectadas → base 4");
  assert.equal(a.porMaquina.MacBookPro16, 2);
  assert.equal(a.porMaquina.GrokBotBox, undefined);
  assert.equal(a.n, 10);
  assert.equal(a.suelo, 1000000);
});

test("pilares apagados (sin ninguna señal) no cuentan: 0 de verdad", () => {
  const a = E.appsAbiertas({ tarjetas: [{ agente: "Neo", superficies: [{ tipo: "app", maquina: "MacStudio", app: "Claude", fuente: "mapa" }] }], appsGrokBot: [] });
  assert.equal(a.n, 0); assert.equal(a.suelo, 0);
  assert.equal(E.appsAbiertas(null).n, 0);
});

test("dial del total: cifra = max(medido, mínimo); el odómetro sigue con tokHoy real; etiqueta honesta", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /if \(apps && apps\.suelo > 0 && !\(total >= apps\.suelo\)\) \{ total = apps\.suelo; fuente = 'suelo'; \}/);
  assert.match(js, /tokHoy: d\.tokHoy != null \? Math\.round\(Number\(d\.tokHoy\)\) : null, fuente: fuente/);
  assert.match(js, /incluye mínimo de 100 k\/h por app abierta/);
  assert.match(js, /if \(ev && ev\.detail && ev\.detail\.tarjetas\) TRAB = ev\.detail;/);
});

test("Trabajando ahora: «parados (N con app abierta)», sin contar como trabajando", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /con app abierta/);
  assert.match(js, /cifras\(g\.n, g\.tarjetas\)/);
  assert.match(js, /app abierta · en espera/);
});
