import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(raiz, rel), "utf8");

test("Entrelazado arranca en ON por defecto y ya no se pinta como caja en la interfaz", () => {
  const js = src("assets/win95-crt.js");
  const css = src("assets/win95-crt.css");
  const html = src("windows95/index.html");

  assert.match(js, /Entrelazado: ON/);
  assert.match(js, /Entrelazado: OFF/);
  assert.match(js, /admira-win95-entrelazado/);
  assert.match(js, /KEY_ENT/);
  assert.match(js, /localStorage\.getItem\(KEY_ENT\) !== "0"/);
  assert.doesNotMatch(js, /getItem\(KEY_ENT\) === "1"/);
  assert.doesNotMatch(js, /admira-win95-entrelazado"\)==="1"/);
  assert.doesNotMatch(js, /admira-win95-entrelazado"\) === "1"/);

  assert.doesNotMatch(js, /ent\.id = "crt-entrelazado-toggle"/);
  assert.doesNotMatch(js, /ui\.appendChild\(ent\)/);
  assert.match(css, /#crt-entrelazado-toggle[^{]*\{[^}]*display:\s*none\s*!important/s);

  assert.match(html, /admira-win95-entrelazado"\)!=="0"/);
  assert.match(html, /classList\.add\("crt-interlace-off"\)/);

  assert.match(css, /#crt-ui\s*\{[^}]*flex-direction:\s*column/s);
});

test("Entrelazado OFF quita las scanlines, persiste en localStorage y funciona en todos los modos", () => {
  const js = src("assets/win95-crt.js");
  const css = src("assets/win95-crt.css");

  assert.match(css, /html\.crt-interlace-off #crt-fx \.scan/);
  assert.match(css, /html\.crt-interlace-off #crt-fx \.scan\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /#crt-fx \.scan\s*\{[^}]*repeating-linear-gradient/s);

  assert.match(js, /classList\.toggle\("crt-interlace-off", !on\)/);
  assert.match(js, /localStorage\.setItem\(KEY_ENT, on \? "1" : "0"\)/);
  assert.match(js, /win95EntrelazadoSet/);
  assert.match(js, /win95EntrelazadoOn/);
  assert.match(js, /aplicarEntrelazado\(leerEntrelazado\(\)/);
  assert.match(js, /win95EntrelazadoSet = function \(on\) \{ aplicarEntrelazado\(!!on\); \}/);

  // Independiente de Extended / Monitor: no se fuerza ni se limpia al cambiar de modo.
  const aplicarExt = js.slice(js.indexOf("function aplicarExtended"), js.indexOf("function aplicar("));
  const aplicarMon = js.slice(js.indexOf("function aplicar("), js.indexOf("function placeGate"));
  assert.doesNotMatch(aplicarExt, /crt-interlace-off|aplicarEntrelazado/);
  assert.doesNotMatch(aplicarMon, /crt-interlace-off|aplicarEntrelazado/);
});
