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
