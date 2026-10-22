import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const html = fs.readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
function carga() {
  const ctx = { document: { readyState: "complete", documentElement: { getAttribute: () => "es" }, getElementById: () => null, addEventListener() {} }, location: { search: "", href: "https://www.admira.live/consumos" }, navigator: { language: "es" }, localStorage: { getItem: () => null }, setInterval() {}, fetch: async () => ({ ok: false }), CustomEvent: class {}, console };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.addEventListener = () => {}; ctx.dispatchEvent = () => {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8"), ctx);
  return ctx.ConsumosTrabajando;
}
test("Trabajando ahora: «Nombre // Máquina» canónica y sin repetir la máquina a la derecha", () => {
  const ct = carga();
  for (const [i, o] of [["MacBookPro16", "MBP16"], ["MacBook Pro 16", "MBP16"], ["Pro16", "MBP16"], ["MacBookProNegro14", "MBP14"], ["Negro14", "MBP14"], ["Mini", "MacMini"], ["MacStudio", "MacStudio"], ["Samsung Fold", "Android"], ["iPhone 15", "iPhone"], ["GrokBotBox", "GrokBot"], ["MacBookAirPlata", ""], [null, ""]]) assert.equal(ct.maqCanon(i), o, i);
  assert.equal(ct.maqActual({ estado: "amarillo", conCarlosEn: "MBP16", maquina: "MacStudio" }), "MBP16");
  assert.equal(ct.maqActual({ estado: "verde", maquina: "GrokBot", maquinas: ["GrokBot", "MacMini"] }), "MacMini");
  assert.equal(ct.maqActual({ estado: "gris", maquina: "GrokBot", maquinas: ["GrokBot"] }), "GrokBot");
  assert.equal(ct.maqActual({ estado: "gris", maquinas: [] }), "");
  const h = ct.chipsDe([{ agente: "Jobs", estado: "rojo", maquina: "MacStudio", maqCorta: "MacStudio + MBP16", appMaquinas: [{}, {}], haceS: 10800 }]);
  assert.match(h, /Jobs<span class="tr-maqsuf"><span class="tr-sl">\/\/<\/span> MacStudio<\/span>/);
  assert.doesNotMatch(h, /<span class="tr-b">MacStudio/);
  assert.doesNotMatch(ct.chipsDe([{ agente: "Lucas", estado: "gris", maquinas: [] }]), /tr-maqsuf/);
  assert.match(html, /\.tr-maqsuf\{[^}]*color:var\(--dim\)/);
});
