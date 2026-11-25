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

test("el Bloc de notas es un textarea editable con menús de los 90", () => {
  const html = src("windows95/index.html");
  assert.match(html, /<textarea id="nt"/);
  assert.match(html, /wrap="soft"/);
  assert.match(html, /data-note-menu="archivo"/);
  assert.match(html, /data-note-menu="edicion"/);
  assert.match(html, /data-note-menu="buscar"/);
  assert.match(html, /Nuevo/);
  assert.match(html, /Abrir\.\.\./);
  assert.match(html, /Guardar/);
  assert.match(html, /Deshacer/);
  assert.match(html, /Cortar/);
  assert.match(html, /Copiar/);
  assert.match(html, /Pegar/);
  assert.match(html, /Seleccionar todo/);
  assert.match(html, /Hora\/Fecha/);
  assert.match(html, /Buscar siguiente/);
  assert.match(html, /admira-win95-notepad/);
  assert.match(html, /NOTE\.dirty/);
  assert.match(html, /function noteGuardar/);
  assert.match(html, /Lucida Console/);
  const js = src("assets/win95-crt.js");
  assert.match(js, /tag === "textarea"/);
  assert.match(js, /isContentEditable/);
  assert.match(js, /e\.key === "m"/);
});

test("el protector de pantalla solo arranca al pulsar el reloj de la bandeja", () => {
  const html = src("windows95/index.html");
  const startCalls = [...html.matchAll(/ssStart\s*\(/g)];
  assert.ok(startCalls.length >= 2, "ssStart debe existir");
  const afterClock = html.slice(html.indexOf("qs('#clock').addEventListener('click'"));
  assert.match(afterClock.slice(0, 400), /ssStart\s*\(/);
  assert.doesNotMatch(html, /ghostEl\.style\.visibility='hidden'; ssStart\(\)/);
  assert.doesNotMatch(html, /case 'ssaver': ssStart\(\)/);
  assert.match(html, /case 'ssaver': msgBox\('Protector de pantalla'/);
  assert.match(html, /pulse la hora en la bandeja/);
  const attract = html.slice(html.indexOf("async function attractLoop"), html.indexOf("function takeOver"));
  assert.doesNotMatch(attract, /ssStart/);
  const idle = html.slice(html.indexOf("if(idle>CONFIG.idleSeconds*1000)"));
  assert.match(idle.slice(0, 80), /backToDemo\(\)/);
  assert.doesNotMatch(idle.slice(0, 80), /ssStart/);
});

test("los iconos del escritorio son 32x32 pixelados y Netscape vuelve al PNG anterior", () => {
  const html = src("windows95/index.html");
  assert.match(html, /icono_netscape\.png/);
  assert.match(html, /icono_napster\.png/);
  assert.match(html, /icons\/mypc\.png/);
  assert.match(html, /icons\/trash\.png/);
  assert.match(html, /icons\/trash-full\.png/);
  assert.match(html, /icons\/folder\.png/);
  assert.match(html, /image-rendering:pixelated/);
  assert.match(html, /filter:url\(#win95-sel\)/);
  assert.match(html, /id="win95-sel"/);
  const files = [
    "windows95/icono_netscape.png",
    "windows95/icono_napster.png",
    "windows95/icons/mypc.png",
    "windows95/icons/trash.png",
    "windows95/icons/folder.png",
    "windows95/icons/readme.png",
    "windows95/icons/inbox.png",
    "windows95/icons/media.png",
  ];
  for (const f of files) {
    const buf = readFileSync(join(raiz, f));
    assert.ok(buf.length > 50, f);
    assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", f + " no es PNG");
  }
});

test("el escritorio permite crear carpetas y accesos directos", () => {
  const html = src("windows95/index.html");
  assert.match(html, /id="dm-folder"/);
  assert.match(html, /id="dm-lnk"/);
  assert.doesNotMatch(html, /<div class="mi2 dis">Carpeta<\/div>/);
  assert.doesNotMatch(html, /<div class="mi2 dis">Acceso directo<\/div>/);
  assert.match(html, /Nueva carpeta/);
  assert.match(html, /function newFolder/);
  assert.match(html, /function openFolder/);
  assert.match(html, /function openShortcutWizard/);
  assert.match(html, /Crear acceso directo/);
  assert.match(html, /id="dm-paste"/);
  assert.match(html, /id="dm-paste-lnk"/);
  assert.match(html, /Pegar acceso directo/);
  assert.match(html, /id="im-ren"/);
  assert.match(html, /Cambiar nombre/);
  assert.match(html, /folder:SV\('0 0 32 32'/);
  assert.match(html, /folderOpen:SV\('0 0 32 32'/);
  assert.match(html, /lnkarr:SV\('0 0 11 11'/);
  assert.match(html, /class="lnk-arr"/);
  assert.match(html, /st\.v=2/);
  assert.match(html, /st\.items/);
});

test("el escritorio incluye Para las Leyendas.txt precargado en el código", () => {
  const html = src("windows95/index.html");
  const txt = src("windows95/para-las-leyendas.txt");
  assert.match(txt, /PARA LAS LEYENDAS/);
  assert.match(txt, /COETANEOS/);
  assert.match(txt, /LEYENDAS/);
  assert.doesNotMatch(txt, /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/);
  assert.doesNotMatch(txt, /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/);
  assert.match(html, /id="leyendas-seed"/);
  assert.match(html, /doc-leyendas/);
  assert.match(html, /function ensureLeyendasDoc/);
  assert.match(html, /Para las Leyendas\.txt/);
  assert.match(html, /id="note-ro"/);
  assert.ok(html.includes(leyendasSeedBody()));
});

function leyendasSeedBody() {
  return src("windows95/para-las-leyendas.txt").replace(/\s+$/, "");
}
