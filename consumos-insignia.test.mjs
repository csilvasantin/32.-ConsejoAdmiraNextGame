// Insignia PAGO / GRATIS de la matriz de /consumos (encargo #5645).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matriz, insignia } from "./flota-matriz-lib.mjs";

const T = 1791700000;
const late = (persona, machine, runtime, model) => ({ persona, machine, runtime, model, updated: T - 60 });
const PAGO = ["Merovingio", "Smith", "Oraculo", "Trinity", "Neo", "Morfeo"];

test("los seis de pago salen PAGO y el resto GRATIS, lata quien lata", () => {
  for (const presencia of [[], [late("Merovingio", "GrokBotBox", "DeepAgents", "openai:nvidia/nemotron-3-ultra-550b-a55b:free"),
    late("Cypher", "GrokBotBox", "DeepAgents", "nvidia/nemotron-3-ultra-550b-a55b"), late("Trinity", "MacBook Pro 16", "Codex", "gpt-5")]]) {
    const { filas, resumen } = matriz({ presencia, ahoraS: T });
    assert.deepEqual(filas.filter((f) => f.insignia === "pago").map((f) => f.persona).sort(), [...PAGO].sort());
    for (const f of filas) assert.match(f.insignia, /^(pago|gratis)$/, f.persona);
    assert.equal(resumen.insigniaPago, 6);
    assert.equal(resumen.insigniaPago + resumen.insigniaGratis, filas.length);
  }
});

test("Merovingio es PAGO aunque su latido venga de OpenRouter gratis; Cypher, Niobe y los incluidos son GRATIS", () => {
  const { filas } = matriz({ presencia: [late("Merovingio", "GrokBotBox", "DeepAgents", "openai:nvidia/nemotron-3-ultra-550b-a55b:free")], ahoraS: T });
  const de = (p) => filas.find((f) => f.persona === p).insignia;
  assert.equal(de("Merovingio"), "pago");
  for (const p of ["Cypher", "Niobe", "Huang", "Jobs", "Wozniak", "Link", "Switch"]) assert.equal(de(p), "gratis", p);
});

test("un agente sin mapear que late con un runtime de pago no pasa por gratis", () => {
  const { filas } = matriz({ presencia: [late("Agente Nuevo", "MacMini", "Claude", "claude-opus-5")], ahoraS: T });
  assert.equal(filas.find((f) => f.persona === "Agente Nuevo").insignia, "pago");
  assert.equal(insignia({ mapeado: true, coste: "gratis", fuera: true }), "pago");
  assert.equal(insignia({ mapeado: false, coste: null }), "gratis");
});

test("la página pinta la insignia delante del detalle, en ámbar y verde, también en inglés", () => {
  const js = readFileSync(new URL("./assets/consumos-matriz.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.ok(js.includes("T('PAGO', 'PAID')") && js.includes("T('GRATIS', 'FREE')"));
  assert.ok(js.includes(`'<td class="mz-td-co">' + insignia(f) + '<span class="mz-co`));
  assert.match(html, /\.mz-ins-pago\{background:#ffb020/);
  assert.match(html, /\.mz-ins-gratis\{background:#3ddc84/);
  assert.match(html, /\.mz-off td\.mz-td-co\{opacity:1\}/);
  assert.match(html, /consumos-matriz\.js\?v=20261021-r46-jensen/);
});
