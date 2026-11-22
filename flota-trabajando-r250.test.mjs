// r250 → r251 (Carlos, 22-11 18:59): en el reloj de Proyectos los 4 puntos son los 4 pilares (MacStudio, MacMini,
// MBP16, MBP14): verde = Grok Bot abierto (cualquier cuenta). Clic = la etiqueta bajo el odómetro dice máquina y
// consejeros; doble clic = encender / apagar por el relay FleetControl.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { grokbotPulso } from "./consumos-pulso-lib.mjs";

const ctx = { globalThis: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("./assets/consumos-marchas-grokbot.js", import.meta.url), "utf8"), ctx);
const G = ctx.globalThis.MarchasGrokBot;
const J = (x) => JSON.parse(JSON.stringify(x));

test("orden de pilares, ids del relay y defecto: solo MacStudio encendido (Leyendas)", () => {
  assert.deepEqual(J(G.PILARES.map((p) => [p.maquina, p.id, p.defecto, p.cuentaDefecto].join("|"))),
    ["MacStudio|macstudio|true|leyendas", "MacMini|macmini|false|", "MBP16|macbookpro16|false|", "MBP14|macbookpronegro14|false|"]);
  assert.equal(G.maqCanon("MacBookPro16"), "MBP16"); assert.equal(G.maqCanon("MacBook Pro Negro 14"), "MBP14");
});

const D = { ok: true,
  appsGrokBot: [{ maquina: "MacStudio", cuenta: "csilva@admira.com", fuente: "app" }, { maquina: "MacBookPro16", cuenta: "csilvasantin@gmail.com", fuente: "ultima" }],
  grokbotPulso: [{ maquina: "MacStudio", abierta: true, haceS: 9, fresco: true }, { maquina: "MacMini", abierta: false, haceS: 40, fresco: true }, { maquina: "MacBookPro16", abierta: true, haceS: 20, fresco: true }],
  tarjetas: [] };

test("verde = Grok Bot abierto en ese pilar; apagado con pulso fresco; sin dato sin pulso ni presencia", () => {
  const ps = G.pilares(D);
  assert.deepEqual(J(ps.map((p) => p.on)), [true, false, true, false]);
  assert.deepEqual(J(ps.map((p) => p.sinDato)), [false, false, false, true]);
  assert.deepEqual(J(ps.map((p) => G.etiqueta(p))), ["MacStudio · Leyendas", "MacMini · apagado", "MBP16 · Actuales", "MBP14 · sin dato"]);
  assert.deepEqual(J(ps.map((p) => p.difiere)), [false, false, true, false]);
  assert.match(G.titulo(ps[0]), /^MacStudio · Grok Bot encendido \(pulso\) · Leyendas · Jobs, Wozniak, Lucas, Disney · csilva@admira.com · por defecto encendido · clic: ver abajo · doble clic: apagar$/);
  assert.match(G.titulo(ps[3]), /sin dato/);
});

test("presencia (superficie GrokBot de un consejero) también enciende el pilar", () => {
  const ps = G.pilares({ ok: true, tarjetas: [{ agente: "Huang", superficies: [{ tipo: "app", app: "GrokBot", maquina: "MacBook Pro Negro 14", fuente: "latido" }] }] });
  assert.equal(ps[3].on, true); assert.equal(G.etiqueta(ps[3]), "MBP14 · Actuales");
});

test("decidir: apagar con la cuenta abierta; encender con la cuenta por defecto; bloqueos", () => {
  const ps = G.pilares(D);
  const off = G.decidir(ps[0]); assert.equal(off.orden, "grok-off"); assert.equal(off.unidad, "leyendas"); assert.match(off.pregunta, /^¿Apagar Grok Bot en MacStudio\?/);
  const on = G.decidir(ps[1]); assert.equal(on.orden, "grok-on"); assert.equal(on.unidad, "desconocida"); assert.match(on.pregunta, /última cuenta usada/);
  const ps2 = G.pilares({ ok: true, grokbotPulso: [{ maquina: "MacStudio", abierta: false, haceS: 5, fresco: true }] });
  assert.equal(G.decidir(ps2[0]).unidad, "leyendas");
  const fr = G.pilares({ ok: true, appsGrokBot: [{ maquina: "MacStudio", cuenta: "csilva@admira.com", alFrente: true }] });
  assert.match(G.decidir(fr[0]).bloqueo, /Carlos está usando/);
  assert.match(G.decidir({ ...ps[1], id: null }).bloqueo, /no tiene canal/);
});

test("pendiente por máquina: parpadea hasta que el pulso confirma; caduca a los 3 min", () => {
  const ps = G.pilares(D), t0 = 1_000_000;
  let p = G.resolver({ MacMini: { on: true, ts: t0 } }, ps, t0 + 10_000);
  assert.ok(p.MacMini && !p.MacMini.nota);
  assert.match(G.html(ps, p, 1), /data-i="1"/); assert.match(G.html(ps, p, 1), /vel-da-p def-off sel pend/);
  p = G.resolver({ MacMini: { on: true, ts: t0 } }, ps, t0 + G.PEND_MAX_MS + 1); assert.match(p.MacMini.nota, /no se ha confirmado/);
  assert.equal(Object.keys(G.resolver({ MacStudio: { on: true, ts: t0 } }, ps, t0 + 5000)).length, 0);
});

test("grokbotPulso: cada Mac que informa de su Grok Bot (abierta o cerrada) y si es fresco", () => {
  const ahora = 10_000_000;
  const r = grokbotPulso([{ maquina: "MacMini", grokbotApp: { abierta: false, ts: ahora - 30_000 } }, { maquina: "MBP16", grokbotApp: { abierta: true, ts: ahora - 400_000 } }, { maquina: "X" }], ahora);
  assert.deepEqual(r, [{ maquina: "MacMini", abierta: false, haceS: 30, fresco: true }, { maquina: "MBP16", abierta: true, haceS: 400, fresco: false }]);
});

test("HTML y velocímetro: #vel-gb entre reloj de Proyectos y su odómetro; rótulo «Ayer · total tokens» se conserva", () => {
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /<div class="vel-dial-svg"><\/div><div class="vel-da vel-gb" id="vel-gb"[^>]*><\/div><div class="odo" title="Total de tokens de ayer/);
  assert.match(html, /id="vel-proy-rotulo"[^>]*>Ayer · total tokens</);
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /pfx === 'vg1' \|\| pfx === 'vg2' \? '' :/);
  const gb = readFileSync(new URL("./assets/consumos-marchas-grokbot.js", import.meta.url), "utf8");
  assert.match(gb, /mesh\.json\('\/run'/); assert.doesNotMatch(gb, /kill -9|pkill/);
});
