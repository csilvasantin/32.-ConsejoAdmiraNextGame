// r11 (Carlos, 13:57): «Jobs no sale en CONSEJEROS» · franja que alterna máquina ↔ runtime.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tarjetas, runtimeCorto, DUALIDAD } from "./flota-trabajando-lib.mjs";

const T = 1791627668;
const de = (t, n) => t.find((x) => x.agente === n);
const smithVivo = { persona: "SmithMBP16", machine: "MacBook Pro 16", runtime: "grok", updated: T - 5, mode: "trabajando" };

test("Jobs y Wozniak: dualidad con Smith (incluidos en su Grok), como Musk/Huang con Merovingio", () => {
  assert.equal(DUALIDAD.Jobs, "Smith");
  assert.equal(DUALIDAD.Wozniak, "Smith");
  assert.equal(DUALIDAD.Musk, "Merovingio");
});

test("Jobs sin latido + Smith trabajando → Jobs activo vía Smith en Consejeros, una sola ficha, sin tokens propios", () => {
  const t = tarjetas({ presencia: [smithVivo], ahoraS: T });
  const s = de(t, "Smith"), j = de(t, "Jobs"), w = de(t, "Wozniak");
  assert.equal(t.filter((x) => x.agente === "Jobs").length, 1);
  assert.deepEqual([j.estado, j.grupo, j.via, j.maquina], [s.estado, "consejeros", "Smith", s.maquina]);
  assert.equal(s.estado, "verde");
  assert.equal(j.tokHoy, null);
  assert.equal(w.via, "Smith");
  assert.match(j.motivo, /^activo vía Smith/);
});

test("Jobs con latido propio vivo → manda el suyo (no se pisa con Smith)", () => {
  const t = tarjetas({ presencia: [smithVivo, { persona: "Jobs", machine: "GrokBot", runtime: "grok", updated: T - 3, mode: "trabajando" }], ahoraS: T });
  assert.equal(de(t, "Jobs").via, undefined);
  assert.equal(de(t, "Jobs").estado, "verde");
});

test("Smith parado → Jobs sigue saliendo (gris), nunca desaparece", () => {
  const t = tarjetas({ presencia: [], ahoraS: T });
  assert.ok(de(t, "Jobs"));
  assert.equal(de(t, "Jobs").grupo, "consejeros");
});

test("runtime corto: cerrados Grok/Codex/Claude; abiertos OpenCode · Nemotron 3 Ultra (o el real)", () => {
  assert.equal(runtimeCorto({ motor: "Claude Code" }), "Claude");
  assert.equal(runtimeCorto({ motor: "Codex" }), "Codex");
  assert.equal(runtimeCorto({ motor: "Grok Bot · Grok CLI", modelo: "pool Grok Bot csilvasantin" }), "Grok");
  assert.equal(runtimeCorto({ motor: "OpenCode", modelo: "nvidia/nvidia/nemotron-3-ultra-550b-a55b" }), "OpenCode · Nemotron 3 Ultra");
  assert.equal(runtimeCorto({ motor: "DeepAgents", modelo: "nvidia/nemotron-3-ultra-550b-a55b:free" }), "DeepAgents · Nemotron 3 Ultra");
  assert.equal(runtimeCorto({ motor: "Nemotron 3 Ultra", modelo: "gratis · por defecto", gratis: true }), "OpenCode · Nemotron 3 Ultra");
  assert.equal(runtimeCorto({ motor: "OpenCode", modelo: "qwen/qwen3-coder:free" }), "OpenCode · qwen3-coder");
});

test("cada ficha trae maqCorta y runtime", () => {
  const t = tarjetas({ presencia: [smithVivo], ahoraS: T });
  assert.equal(de(t, "Smith").maqCorta, "MBP16");
  assert.equal(de(t, "Smith").runtime, "Grok");
  assert.equal(de(t, "Disney").runtime, "OpenCode · Nemotron 3 Ultra");
});

test("franja: alterna cada 10 s, con fundido y respetando prefers-reduced-motion", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(js, /ALTERNA_MS = 10000/);
  assert.match(js, /tr-alt/);
  assert.match(html, /prefers-reduced-motion[^}]*\{[^}]*\.tr-alt/);
});
