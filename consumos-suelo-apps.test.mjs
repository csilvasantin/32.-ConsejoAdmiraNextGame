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

// r229 (Carlos, 21-11 20:50): 250 k por agente abierto (reloj 1) y además 250 k por GrokBot abierto (reloj 2), + medido.
test("relojes del total: reloj 1 = agentes × 250 k + medido de agentes; reloj 2 = + GrokBot × 250 k + medido de consejeros", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /var medido = mA\.total \+ mC\.total, total = sA \+ sG \+ medido, fuente;/);
  assert.match(js, /var sA = su \? su\.sueloAgentes : 0, sG = su && conConsejeros \? su\.sueloGrokBot : 0;/);
  assert.match(js, /var rF = ritmoTotal\(d, sin, false\);/);
  assert.match(js, /var rT = ritmoTotal\(d \|\| \{\}, sin, true\);/);
  assert.match(js, /tokHoy: d\.tokHoy != null \? Math\.round\(Number\(d\.tokHoy\)\) : null, fuente: fuente/);
  assert.match(js, /if \(ev && ev\.detail && ev\.detail\.tarjetas\) TRAB = ev\.detail;/);
});

test("suelos: 4 DeepAgents abiertos (deepagents-estado) y GrokBot por Mac y cuenta con fuente «app»; sin señal no cuenta", () => {
  const c = {}; vm.createContext(c);
  vm.runInContext(readFileSync(new URL("./assets/consumos-velocimetro-elegir.js", import.meta.url), "utf8"), c);
  vm.runInContext(readFileSync(new URL("./assets/deepagents-estado.js", import.meta.url), "utf8"), c);
  const app = (maquina, a) => ({ tipo: "app", maquina, app: a, fuente: "pulso" });
  const trab = {
    tarjetas: [
      { agente: "Trinity", grupo: "agentes", superficies: [app("MacStudio", "Codex")] },
      { agente: "Neo", grupo: "agentes", superficies: [app("MacStudio", "Claude")] },
      { agente: "Oráculo", grupo: "agentes", superficies: [app("MacMini", "Codex")] },
      { agente: "Morfeo", grupo: "agentes", superficies: [app("MacMini", "Claude")] },
      { agente: "Smith", grupo: "agentes", superficies: [{ tipo: "cli", maquina: "MacMini", sesion: "smith", fuente: "pulso" }] },
      { agente: "Jobs", grupo: "consejeros", superficies: [app("MacStudio", "GrokBot")] },
    ],
    appsGrokBot: [{ maquina: "MacStudio", cuenta: "a@b.com", fuente: "app" }, { maquina: "MacMini", cuenta: "a@b.com", fuente: "app" }, { maquina: "MacBookPro16", cuenta: null, fuente: "desconocida" }],
  };
  for (const dae of [c.DeepAgentsEstado, null]) {
    const s = c.ConsumosElegir.suelos(trab, dae);
    assert.equal(s.nAgentes, 4); assert.equal(s.sueloAgentes, 1e6);
    assert.equal(s.nGrokBot, 2); assert.equal(s.sueloGrokBot, 5e5);
  }
  const nada = c.ConsumosElegir.suelos({ tarjetas: [], appsGrokBot: [] }, null);
  assert.equal(nada.sueloAgentes + nada.sueloGrokBot, 0);
  assert.equal(c.ConsumosElegir.esFilaConsejeros({ agente: "Consejeros (Cloudflare)" }), true);
  assert.equal(c.ConsumosElegir.esFilaConsejeros({ agente: "Grok Bot (Consejo)" }), false);
});

test("Trabajando ahora: «parados (N con app abierta)», sin contar como trabajando", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /con app abierta/);
  assert.match(js, /cifras\(g\.n, g\.tarjetas\)/);
  assert.match(js, /app abierta · 250k\/h/); assert.match(js, /txtAb \+ T\(. · en espera./);
});
