// r250 (Carlos, 22-11 18:25): 4 puntos Grok Bot (Leyendas / Coetáneos × MacStudio / MacMini) en el reloj de Proyectos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = { globalThis: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("./assets/consumos-marchas-grokbot.js", import.meta.url), "utf8"), ctx);
const G = ctx.globalThis.MarchasGrokBot;
const J = (x) => JSON.parse(JSON.stringify(x));

test("orden: Leyendas Studio/Mini, Coetáneos Studio/Mini; por defecto solo Leyendas en MacStudio", () => {
  assert.deepEqual(J(G.PUNTOS.map((p) => [p.grupo, p.maquina, p.id, p.defecto].join("|"))),
    ["leyendas|MacStudio|macstudio|true", "leyendas|MacMini|macmini|false", "coetaneos|MacStudio|macstudio|false", "coetaneos|MacMini|macmini|false"]);
  assert.deepEqual(J(G.GRUPOS.coetaneos.consejeros), ["Musk", "Jensen"]);
});

test("verde por appsGrokBot (cuenta + Mac) o por superficie GrokBot de un consejero del grupo; MBP16 no cuenta", () => {
  const d = { ok: true, appsGrokBot: [{ maquina: "MacStudio", cuenta: "csilva@admira.com", fuente: "app" }, { maquina: "MacBookPro16", cuenta: "csilvasantin@gmail.com", fuente: "ultima" }],
    tarjetas: [{ agente: "Huang", superficies: [{ tipo: "app", app: "GrokBot", maquina: "MacMini", fuente: "latido" }] }] };
  const ps = G.puntos(d);
  assert.deepEqual(J(ps.map((p) => p.on)), [true, false, false, true]);
  assert.deepEqual(J(ps.map((p) => p.difiere)), [false, false, false, true]);
  assert.match(G.titulo(ps[0]), /^Leyendas · Jobs, Wozniak, Lucas, Disney · csilva@admira.com · MacStudio · conectado \(pulso\) · por defecto encendido · doble clic: apagar$/);
  assert.match(G.titulo(ps[3]), /Coetáneos · Musk, Jensen · csilvasantin@gmail.com · MacMini · conectado \(presencia\) · por defecto apagado ⚠ difiere/);
});

test("sin datos: los 4 negros; Leyendas MacStudio difiere del defecto", () => {
  const ps = G.puntos(null);
  assert.deepEqual(J(ps.map((p) => p.on)), [false, false, false, false]);
  assert.equal(ps[0].difiere, true);
});

test("decidir: apagar pide confirmación; bloquea si Carlos la usa o si otra cuenta ocupa la app", () => {
  const ps = G.puntos({ ok: true, appsGrokBot: [{ maquina: "MacStudio", cuenta: "csilva@admira.com", alFrente: false }] });
  const off = G.decidir(ps[0]);
  assert.equal(off.orden, "grok-off"); assert.equal(off.unidad, "leyendas"); assert.match(off.pregunta, /^¿Apagar Leyendas en MacStudio\?/);
  const on = G.decidir(ps[1]);
  assert.equal(on.orden, "grok-on"); assert.match(on.pregunta, /open -g/);
  assert.match(G.decidir(ps[2]).bloqueo, /abierto con la cuenta Leyendas/);
  const fr = G.puntos({ ok: true, appsGrokBot: [{ maquina: "MacStudio", cuenta: "csilva@admira.com", alFrente: true }] });
  assert.match(G.decidir(fr[0]).bloqueo, /Carlos está usando/);
});

test("pendiente: parpadea hasta que el pulso llega al destino; caduca a los 3 min con nota", () => {
  const ps = G.puntos(null), t0 = 1_000_000;
  let p = G.resolver({ 1: { on: true, ts: t0 } }, ps, t0 + 10_000);
  assert.ok(p[1] && !p[1].nota);
  assert.match(G.html(ps, p), /data-i="1"[^>]*/); assert.match(G.html(ps, p), /vel-da-p def-off pend/);
  p = G.resolver({ 1: { on: true, ts: t0 } }, ps, t0 + G.PEND_MAX_MS + 1);
  assert.match(p[1].nota, /no se ha confirmado/);
  const on = G.puntos({ ok: true, appsGrokBot: [{ maquina: "MacMini", cuenta: "csilva@admira.com" }] });
  assert.equal(Object.keys(G.resolver({ 1: { on: true, ts: t0 } }, on, t0 + 5000)).length, 0);
});

test("HTML y velocímetro: #vel-gb entre reloj de Proyectos y su odómetro; sin testigos en ningún reloj", () => {
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /<div class="vel-dial-svg"><\/div><div class="vel-da vel-gb" id="vel-gb"[^>]*><\/div><div class="odo" title="Total de tokens de ayer/);
  assert.ok(html.indexOf("/assets/consumos-marchas-grokbot.js") > 0);
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /pfx === 'vg1' \|\| pfx === 'vg2' \? '' :/);
  const gb = readFileSync(new URL("./assets/consumos-marchas-grokbot.js", import.meta.url), "utf8");
  assert.match(gb, /mesh\.json\('\/run'/); assert.doesNotMatch(gb, /kill -9|pkill/);
});
