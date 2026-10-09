// r31 (GrokBotBox, 09-10-2026): /consumos compacto por defecto — tres zonas plegables accesibles.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");

test("tres zonas plegables: botón con aria-expanded=false + aria-controls a un cuerpo que existe", () => {
  for (const [clave, cuerpo] of [["trabajando", "trabajando-cuerpo"], ["velocidad", "vel-mas"], ["lecturas", "lecturas-mas"]]) {
    assert.match(html, new RegExp('data-plegable="' + clave + '"'), clave);
    assert.match(html, new RegExp('class="plg-boton" aria-expanded="false" aria-controls="' + cuerpo + '"'), clave);
    assert.match(html, new RegExp('class="plg-cuerpo" id="' + cuerpo + '"'), clave);
  }
  assert.match(html, /<script src="\/assets\/consumos-plegable\.js/);
  assert.match(html, /prefers-reduced-motion: reduce\)\{\.plg-cuerpo/);
});

test("lo que se ve plegado: fichas de quién trabaja, resumen de velocidad, «Más margen» + píldoras", () => {
  assert.match(html, /id="trabajando-chips"/);
  assert.match(html, /id="vel-resumen"/);
  assert.match(html, /id="lecturas-resumen"/);
  // El ranking, las gráficas y el pie quedan DENTRO del cuerpo plegable de velocidad.
  const vel = html.slice(html.indexOf('id="vel-mas"'), html.indexOf("</section>", html.indexOf('id="vel-mas"')));
  for (const id of ["vel-agentes", "vel-rango", "vel-spark", "vel-lineas", "vel-pie"]) assert.match(vel, new RegExp('id="' + id + '"'), id);
});

test("?abierto=todo abre todas; ?abierto=lecturas solo esa; sin parámetro, nada", () => {
  const src = readFileSync(new URL("./assets/consumos-plegable.js", import.meta.url), "utf8");
  const corre = (search) => {
    const win = { location: { search }, localStorage: null, requestAnimationFrame: () => {} };
    const ctx = { window: win, globalThis: win, URLSearchParams, document: { readyState: "complete", querySelectorAll: () => [] } };
    vm.runInNewContext(src, ctx);
    return win.ConsumosPlegable.porUrl;
  };
  assert.equal(corre("?abierto=todo")("velocidad"), true);
  assert.equal(corre("?abierto=lecturas")("lecturas"), true);
  assert.equal(corre("?abierto=lecturas")("trabajando"), false);
  assert.equal(corre("")("trabajando"), false);
});
