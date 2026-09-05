import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// FLT-1863 (Carlos, 5-sep-2026): por defecto todas las opciones de los equipos remotos salen compactadas.
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const trozo = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const fabrica = (stored) => new Function("localStorage",
  trozo("const COLLAPSE_KEY=", "// Deep-link desde /status") + "\nreturn { isCollapsed, optsLabel, COLLAPSE_KEY };")({
  getItem(k) { return k === "fleet_card_collapsed_v2" ? stored : null; }, setItem() {} });

test("sin preferencia, y también con la preferencia ANTIGUA expandida, la tarjeta va compacta", () => {
  assert.equal(fabrica(null).isCollapsed("macmini"), true);
  // la clave vieja «fleet_card_collapsed» ya no se lee: lo expandido hace semanas vuelve a compacto
  assert.equal(fabrica(null).isCollapsed("macbookpro16"), true);
});

test("lo que el usuario expande hoy sí se recuerda", () => {
  assert.equal(fabrica(JSON.stringify({ macmini: false })).isCollapsed("macmini"), false);
  assert.equal(fabrica(JSON.stringify({ macmini: false })).isCollapsed("otro"), true);
});

test("compacto oculta botones, info y señalización; deja mando, control y captura; y hay un botón «opciones» visible", () => {
  assert.match(html, /\.card\.collapsed \.info,\.card\.collapsed \.acts,\.card\.collapsed \.dsflight\{display:none\}/);
  assert.doesNotMatch(html, /\.card\.collapsed \.(mando|ctlready|shot)\{display:none/);
  assert.match(html, /<button type="button" class="card-opts" data-fold="\$\{m\.id\}"/);
  assert.equal(fabrica(null).optsLabel(true, 17), "▸ opciones (17)");
  assert.equal(fabrica(null).optsLabel(false, 17), "▴ menos");
});

test("«control · ver + tocar» y «probar» viven dentro del pliegue del mando; sin watcher se ven siempre", () => {
  assert.match(html, /<div class="mando-extra">\$\{controlReadyHtml\(m\)\}<\/div>/);
  assert.match(html, /\.card \.mando\.abierto \+ \.mando-extra\{display:block\}/);
  assert.doesNotMatch(html, /mando-extra\.siempre/, "sin watcher también va dentro del pliegue");
  const acts = html.indexOf('<div class="acts"'); const pf = html.indexOf("${dsPreflightHtml(m)}");
  assert.ok(pf < acts && html.slice(pf - 40, pf).indexOf("controlReadyHtml") === -1, "ya no va suelto antes de la señalización");
});

test("por defecto solo se pintan los encendidos; los apagados van en un pie con sus nombres", () => {
  assert.match(html, /let HIDE_OFF=\(localStorage\.getItem\('fleet_hideoff'\)===null\)\?true:/);
  assert.match(html, /const fuera=HIDE_OFF\?ms\.filter\(m=>!m\.online\):\[\];/);
  assert.match(html, /el\.innerHTML\+=pieFuera;/);
  assert.match(html, /🟢 solo encendidos/);
});
