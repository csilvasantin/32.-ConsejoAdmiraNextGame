import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const paginas = readdirSync(join(raiz, "chat")).filter((n) => !n.startsWith("."));
const src = (rel) => readFileSync(join(raiz, rel), "utf8");

test("cada Histórico (/chat/<consejero>/) incluye la entrada Win95 · Xperiencia", () => {
  assert.ok(paginas.length >= 6, "faltan páginas de chat: " + paginas.join(","));
  for (const p of paginas) {
    const html = src("chat/" + p + "/index.html");
    assert.match(html, /\/assets\/historico-win95\.js/, p + " debe cargar historico-win95.js");
    assert.match(html, /<script src="\/admira-bar\.js/, p + " conserva la barra del sitio");
  }
});

test("historico-win95.js abre /windows95 a pantalla completa y sale con Esc", () => {
  const js = src("assets/historico-win95.js");
  assert.match(js, /Win95 · Xperiencia/);
  assert.match(js, /requestFullscreen|webkitRequestFullscreen/);
  assert.match(js, /Salir \(Esc\)/);
  assert.match(js, /\/windows95\//);
  assert.match(js, /Escape/);
  assert.match(js, /Press Start 2P/);
});

test("win95 conserva ?fs=1 al redirigir a /windows95/", () => {
  const html = src("win95/index.html");
  assert.match(html, /auth-gate\.js/);
  assert.match(html, /location\.search/);
  assert.match(html, /\/windows95\//);
});

test("windows95 carga el gancho ?fs=1 y el script pide pantalla completa", () => {
  const html = src("windows95/index.html");
  assert.match(html, /\/assets\/win95-fs\.js/);
  const js = src("assets/win95-fs.js");
  assert.match(js, /searchParams\.get\("fs"\) === "1"/);
  assert.match(js, /requestFullscreen|webkitRequestFullscreen/);
  assert.match(js, /Salir \(Esc\)/);
  assert.match(js, /Escape/);
});

test("el CRT frontal envuelve la Xperiencia: placa ADMIRA, apagado y cristal", () => {
  const html = src("windows95/index.html");
  assert.match(html, /id="crt-shell"/);
  assert.match(html, /id="crt-badge">ADMIRA</);
  assert.match(html, /id="crt-power"/);
  assert.match(html, /assets\/win95-crt\.css/);
  assert.match(html, /assets\/win95-crt\.js/);
  assert.match(html, /sw=off\?640:784, sh=off\?480:716/);
  const css = src("assets/win95-crt.css");
  assert.match(css, /#crt-fx/);
  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /#crt-screen #admira-gate/);
  const js = src("assets/win95-crt.js");
  assert.match(js, /win95-crt/);
  assert.match(js, /exit/);
  assert.match(js, /crt-power/);
});

test("el marco del CRT se puede ocultar: Monitor ON/OFF, tecla M y ?crt=", () => {
  const js = src("assets/win95-crt.js");
  assert.match(js, /Monitor: ON/);
  assert.match(js, /Monitor: OFF/);
  assert.match(js, /admira-win95-crt/);
  assert.match(js, /searchParams\.get\("crt"\)/);
  assert.match(js, /e\.key === "m"/);
  const css = src("assets/win95-crt.css");
  assert.match(css, /html\.crt-frame-off/);
  assert.match(css, /win95-crt-plastic\.png/);
  const hist = src("assets/historico-win95.js");
  assert.match(hist, /win95-fs-monitor/);
  assert.match(hist, /Monitor: ON/);
  const html = src("windows95/index.html");
  assert.match(html, /admira-win95-crt/);
});
