import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");

test("Netscape de Win95: menú Ir desplegable con los cinco sitios de AdmiraNeXT", () => {
  for (const s of ["admira.studio", "admira.store", "admira.tv", "admira.app", "admira.biz"]) {
    assert.match(html, new RegExp("url:'https://" + s.replace(".", "\\.") + "/'"), s + " debe estar en BR_SITES");
  }
  assert.match(html, /data-br-menu="ir"/);
  assert.match(html, /id="brGoDrop"/);
  assert.match(html, /ir:\[\{l:'Atrás'/);
});

test("Netscape de Win95: omnibox, pestañas y marcadores como un navegador actual", () => {
  assert.match(html, /<input class="fin" id="brUrl"/);
  assert.match(html, /id="brTabs"/);
  assert.match(html, /function brNuevaTab\(/);
  assert.match(html, /function brCierraTab\(/);
  assert.match(html, /id="brBk"/);
  assert.match(html, /brPaginaWeb\('https:\/\/'\+t\)/, "sin https:// se completa");
});

test("Netscape de Win95: admira.store no se incrusta (frame-ancestors 'none') y ofrece pestaña real", () => {
  assert.match(html, /h:'admira\.store'[^\n]*frame:false/);
  assert.match(html, /function brAbrirReal\(url\)\{ if\(!\/\^https\?:\\\/\\\/\/i\.test/);
});

test("windows95 conserva la verja de login", () => {
  assert.match(html, /<script src="\/auth-gate\.js"><\/script>/);
});

test("Netscape de Win95: la barra de marcadores arranca oculta y el menú dice Mostrar", () => {
  assert.match(html, /id="brw" class="win nobk"/);
  assert.match(html, /var BR_BK_BAR_KEY='vuelta95\.netscape\.barra-marcadores'/);
  assert.match(html, /var BR_BK_BAR_VER=1/);
  assert.match(html, /function brInitBarra\(/);
  assert.match(html, /function brToggleBarra\(/);
  assert.match(
    html,
    /Elección explícita posterior al cambio de default \(v>=1\)\. Un valor antiguo sin versión se ignora: arranca oculta\./
  );
  assert.match(html, /l:\(brBarOculta\(\)\?'Mostrar':'Ocultar'\)\+' barra de marcadores',fn:brToggleBarra/);
});

test("Netscape de Win95: Ver tiene Pantalla completa bajo Recargar y Detener; Esc solo sale del modo", () => {
  assert.match(
    html,
    /ver:\[\{l:'Recargar',acc:'F5'[\s\S]*?\{l:'Detener',acc:'Esc'[\s\S]*?\{l:'Pantalla completa',acc:'F11',fn:brToggleFs\},\{sep:1\}/
  );
  assert.match(html, /id="brFsHint" hidden>Pulsa Esc para salir de pantalla completa</);
  assert.match(html, /#brw\.fs\{left:0!important;top:0!important;width:640px!important;height:480px!important/);
  assert.match(html, /function brEnterFs\(/);
  assert.match(html, /function brExitFs\(/);
  assert.match(
    html,
    /window\.addEventListener\('keydown',function\(e\)\{[\s\S]*?if\(e\.key!=='Escape'\) return;[\s\S]*?e\.preventDefault\(\); e\.stopPropagation\(\); brExitFs\(\);[\s\S]*?\},true\)/
  );
});
