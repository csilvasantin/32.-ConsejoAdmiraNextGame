import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runtimeCorto, maquinaCorta } from "./flota-trabajando-lib.mjs";
import { MAPA } from "./flota-matriz-lib.mjs";

test("r18: la familia visible es GrokBot (CLI en terminal); cerrados y abiertos como antes", () => {
  assert.equal(runtimeCorto({ motor: "Grok", modelo: "Grok Heavy" }), "GrokBot");
  assert.equal(runtimeCorto({ motor: "grok", modelo: "grok-4.7" }), "GrokBot CLI");
  assert.equal(runtimeCorto({ motor: "GrokBot CLI" }), "GrokBot CLI");
  assert.equal(runtimeCorto({ motor: "Claude Code" }), "Claude");
  for (const [k, v] of Object.entries(MAPA)) assert.doesNotMatch(v.modelo, /\bGrok\b(?![\s-]*\d)/, k + ": " + v.modelo);
});

test("r18: gb() del cliente renombra Grok/Grok Bot/Grok CLI pero respeta versiones de modelo y GrokBot", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  const src = js.match(/function gb\(s\) \{[^\n]+\}/)[0];
  const gb = new Function(src + "; return gb;")();
  assert.equal(gb("Grok"), "GrokBot");
  assert.equal(gb("Grok Bot · Grok CLI"), "GrokBot · GrokBot CLI");
  assert.equal(gb("Grok · Grok Heavy"), "GrokBot · Grok Heavy");
  assert.equal(gb("Grok 4.7 · grok-4.7"), "Grok 4.7 · grok-4.7");
  assert.equal(gb("GrokBot · Jobs"), "GrokBot · Jobs");
  for (const f of ["assets/consumos-matriz.js", "assets/consumos-velocimetro.js"]) assert.match(readFileSync(new URL("./" + f, import.meta.url), "utf8"), /function gb\(s\)/);
});

test("r18: móviles con nombre corto, sin presencia inventada", () => {
  assert.equal(maquinaCorta("iPhone"), "iPhone");
  assert.equal(maquinaCorta("Galaxy Fold"), "Fold");
});

test("r19: gb() también el motor «grok» suelto, nombres de agente «Grok Bot» y la nota «no GrokBot»", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  const gb = new Function(js.match(/function gb\(s\) \{[^\n]+\}/)[0] + "; return gb;")();
  assert.equal(gb("MacBook Pro 16 · grok · Grok 4.6"), "MacBook Pro 16 · GrokBot CLI · Grok 4.6");
  assert.equal(gb("Wozniak · Grok, Disney · Grok"), "Wozniak · GrokBot, Disney · GrokBot");
  assert.equal(gb("Grok Bot"), "GrokBot");
  assert.equal(gb("grok-4.7"), "grok-4.7");
  const lib = readFileSync(new URL("./consumos-lecturas-lib.mjs", import.meta.url), "utf8");
  assert.match(lib, /", no GrokBot\)"/); assert.match(lib, /Merovingio · GrokBot \(Cursor Pro\)/);
});

test("r20: «Grok Bot» con espacio → «GrokBot» en cupos de lecturas y en la nota de Merovingio", () => {
  const js = readFileSync(new URL("./consumos-lecturas.js", import.meta.url), "utf8");
  assert.match(js, /replace\(\/\\bGrok Bot\\b\/g, "GrokBot"\)/);
  const lib = readFileSync(new URL("./consumos-lecturas-lib.mjs", import.meta.url), "utf8");
  assert.match(lib, /bolsa de GrokBot de csilvasantin/); assert.doesNotMatch(lib, /bolsa de Grok Bot/);
});
