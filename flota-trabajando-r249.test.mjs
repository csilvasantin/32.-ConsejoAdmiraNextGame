// r249 (Carlos, 22-11 18:11): 4 puntos de DeepAgents en lugar de los 3 testigos del velocímetro de Agentes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./assets/consumos-marchas-deepagents.js", import.meta.url), "utf8");
const ctx = { globalThis: {} }; ctx.window = undefined; vm.createContext(ctx);
vm.runInContext(src, ctx);
const M = ctx.globalThis.MarchasDeepAgents;

const app = (app, maquina, fuente = "pulso") => ({ tipo: "app", app, maquina, fuente });
const cli = (maquina) => ({ tipo: "cli", maquina, fuente: "latido" });

test("orden y reparto: Neo/Morfeo = Claude Studio/Mini, Trinity/Oráculo = Codex Studio/Mini", () => {
  assert.deepEqual([...M.PUNTOS.map((p) => [p.agente, p.app, p.maquina].join("|"))],
    ["Neo|Claude|MacStudio", "Morfeo|Claude|MacMini", "Trinity|Codex|MacStudio", "Oráculo|Codex|MacMini"]);
});

test("verde solo con la Desktop App en su Mac de pilar; ni CLI ni MBP16", () => {
  const d = { ok: true, tarjetas: [
    { agente: "Neo", superficies: [app("Claude", "MacBook Pro 16", "latido")] },
    { agente: "Morfeo", superficies: [app("Claude", "MacMini", "latido")] },
    { agente: "Trinity", superficies: [cli("MacStudio"), app("Codex", "MacStudio")] },
    { agente: "Oraculo", superficies: [cli("MacMini")] },
  ] };
  const ps = M.puntos(d);
  assert.deepEqual([...ps.map((p) => p.verde)], [false, true, true, false]);
  assert.equal(ps[0].titulo, "Neo · Claude · MacStudio · no conectado");
  assert.match(ps[1].titulo, /^Morfeo · Claude · MacMini · conectado \(latido/);
  assert.equal(ps[2].titulo, "Trinity · Codex · MacStudio · conectado (pulso del Mac)");
});

test("sin datos o error: los 4 negros", () => {
  for (const d of [null, { ok: false }, { ok: true, tarjetas: [] }]) assert.deepEqual([...M.puntos(d).map((p) => p.verde)], [false, false, false, false]);
});

test("si la presencia atribuye la app a otro DeepAgent, no se pinta y se avisa", () => {
  const ps = M.puntos({ ok: true, tarjetas: [{ agente: "Trinity", superficies: [app("Claude", "MacStudio")] }] });
  assert.equal(ps[0].verde, false); assert.match(ps[0].titulo, /atribuye a Trinity/);
});

test("html: 4 botones con title y clase on", () => {
  const h = M.html(M.puntos({ ok: true, tarjetas: [{ agente: "Neo", superficies: [app("Claude", "Mac Studio")] }] }));
  assert.equal((h.match(/class="vel-da-p/g) || []).length, 4);
  assert.equal((h.match(/vel-da-p on/g) || []).length, 1);
  assert.match(h, /title="Neo · Claude · MacStudio · conectado/);
});

test("velocímetro: vg1 sin los 3 testigos, vg2 los conserva; HTML con #vel-da entre reloj y odómetro", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /pfx === 'vg1'( \|\| pfx === 'vg2')? \? '' :/);
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /<div class="vel-dial-svg"><\/div><div class="vel-da" id="vel-da"[^>]*><\/div><div class="odo" title="Media de tokens por hora de ayer/);
  assert.ok(html.indexOf("/assets/consumos-marchas-deepagents.js") > 0);
});
