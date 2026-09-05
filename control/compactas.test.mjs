import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// FLT-1863 (Carlos, 5-sep-2026): por defecto todas las opciones de los equipos remotos salen compactadas.
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const trozo = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const fabrica = () => new Function(
  trozo("const EXPANDIDAS=new Set();", "// Deep-link desde /status") + "\nreturn { isCollapsed, optsLabel, toggleCollapse, EXPANDIDAS };")();

test("al cargar, TODAS las tarjetas van compactas, sin memoria de otras visitas", () => {
  const f = fabrica();
  assert.equal(f.isCollapsed("macmini"), true);
  assert.equal(f.isCollapsed("macbookpro16"), true);
  assert.doesNotMatch(html, /fleet_card_collapsed/, "nada del despliegue se guarda en localStorage");
});

test("desplegar es de esta visita: vive en memoria y se pliega otra vez con el mismo botón", () => {
  const f = fabrica();
  globalThis.document = { querySelector() { return null; } };
  f.toggleCollapse("macmini"); assert.equal(f.isCollapsed("macmini"), false);
  f.toggleCollapse("macmini"); assert.equal(f.isCollapsed("macmini"), true);
  delete globalThis.document;
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
  const pf = html.indexOf("${dsPreflightHtml(m)}");
  assert.ok(html.slice(pf - 200, pf).indexOf("controlReadyHtml") === -1, "controlReadyHtml ya no va suelto junto a la señalización (vive en .mando-extra)");
});

test("por defecto solo se pintan los encendidos; los apagados van en un pie con sus nombres", () => {
  assert.match(html, /let HIDE_OFF=\(localStorage\.getItem\('fleet_hideoff'\)===null\)\?true:/);
  assert.match(html, /const fuera=HIDE_OFF\?ms\.filter\(m=>!m\.online\):\[\];/);
  assert.match(html, /el\.innerHTML\+=pieFuera;/);
  assert.match(html, /🟢 solo encendidos/);
});

test("el botón de la barra dice lo que hace: plegar si hay abiertas, desplegar si no", () => {
  assert.match(html, /ca\.textContent=any\?'⊟ plegar todas':'⊞ desplegar todas'/);
  assert.match(html, /<button id="collapseAll"[^>]*>⊞ desplegar todas<\/button>/);
});

test('FLT-1903: todas las fichas iguales — sin bloque MISIONES exclusivo de los Air ni condicionales por tipo de máquina en la tarjeta', () => {
  assert.doesNotMatch(html, /isAirId|class="mqueue"|mq-add|AIR_BY_ID/);
  const i = html.indexOf('function renderCards('); const j = html.indexOf('\n}\n', i);
  const body = html.slice(i, j);
  assert.doesNotMatch(body, /macbookair|isAir|macmini|macbookpro/i, 'la plantilla de la ficha no distingue máquinas');
});

test('normativa 07: el pie no lleva sellos viejos por módulo; muestra el sello único de la página', () => {
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');   // el historial en comentarios conserva su fecha (normativa 07)
  assert.doesNotMatch(visible, /v\.2026\.\d\d\.\d\d\.r\d/, 'sello con el año delante (formato retirado) a la vista');
  assert.match(html, /id="pageStamp"/);
});

test('5-sep: la señalización va al pie de la ficha y el monitor pequeño refleja la caja grande', () => {
  const i = html.indexOf('function renderCards('); const body = html.slice(i, html.indexOf('\n}\n', i));
  const shot = body.indexOf('class="shot"'), opts = body.indexOf('class="card-opts"'), ds = body.indexOf('${dsPreflightHtml(m)}');
  assert.ok(shot > 0 && opts > shot && ds > opts, 'orden: captura → acciones → opciones → señalización');
  assert.match(html, /function setIconScreen\(machineId, src\)/);
  assert.match(html, /setIconScreen\(machineId, src\);\s*\/\/ el monitor pequeño/);
  assert.match(html, /img\.onload=\(\)=>\{ img\.onload=null; setIconScreen\(machineId, img\.src\); \}/);
});
