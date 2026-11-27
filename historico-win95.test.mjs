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

test("/win95 sirve windows95 con rewrite 200 y conserva la query", () => {
  const redirs = src("_redirects");
  assert.match(redirs, /\/win95\s+\/windows95\/index\.html\s+200/);
  assert.match(redirs, /\/win95\/\s+\/windows95\/index\.html\s+200/);
  assert.doesNotMatch(redirs, /\/win95\s+\/windows95\/\s+302/);
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

test("Computer ON/OFF está junto a Monitor y al apagar vuelve a la home", () => {
  const js = src("assets/win95-crt.js");
  assert.match(js, /crt-computer-toggle/);
  assert.match(js, /Computer: ON/);
  assert.match(js, /Computer: OFF/);
  assert.match(js, /location\.href = "\/"/);
  assert.match(js, /function apagarEquipo\(/);
  const css = src("assets/win95-crt.css");
  assert.match(css, /flex-direction:\s*column/);
  assert.match(css, /#computer-off-cover/);
  assert.match(css, /#crt-computer-toggle|#crt-ui button/);
});

test("el preloader de Windows cubre desde el primer frame, antes del JS", () => {
  const html = src("windows95/index.html");
  const head = html.slice(0, html.indexOf("</style>") + 8);
  const firstScript = html.indexOf("<script src=\"/auth-gate.js\">");
  const firstStyle = html.indexOf("<style>");
  assert.ok(firstStyle >= 0 && firstStyle < firstScript, "el CSS crítico del preloader va antes de auth-gate");
  assert.match(html, /<html lang="es" class="booting">/);
  assert.match(head, /#boot-frame/);
  assert.match(head, /html\.booting/);
  assert.match(html, /id="boot-frame"/);
  assert.match(html, /function hideBoot\(/);
  assert.match(html, /function showBoot\(/);
  assert.doesNotMatch(html, /async function bootSeq\(tk\)\{ var b=qs\('#boot'\); b\.style\.display='block'/);
  const frame = html.slice(html.indexOf('id="boot-frame"'), html.indexOf('id="win95-filters"'));
  assert.match(frame, /class="ms">AdmiraNeXT/);
  assert.match(frame, /class="win">Windows/);
  assert.match(frame, /class="n95">95/);
  assert.doesNotMatch(frame, /Admira<span>95/);
  assert.match(frame, /#eb5a28/);
  assert.match(frame, /#65b849/);
  assert.match(frame, /#3b86d1/);
  assert.match(frame, /#f6c318/);
  assert.match(frame, /admira-cloud/);
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

test("Miscelánea incluye Estilo comunicaciones ICQGram.txt precargado en el código", () => {
  const html = src("windows95/index.html");
  const txt = src("windows95/estilo-comunicaciones-icqgram.txt");
  assert.match(txt, /ESTILO DE LAS COMUNICACIONES ICQGRAM/);
  assert.match(txt, /Norma de Carlos/);
  assert.match(txt, /25-11-2026/);
  assert.match(txt, /Leído y aplicado/);
  assert.match(txt, /cd \/workspace\/avatares-espejo && python3 generar\.py/);
  assert.match(txt, /espejo-enc-7725\.png/);
  assert.match(txt, /▓ ⊞ WIN95 · ICQGRAM/);
  assert.match(txt, /CARLOS · ADMIRA\.LIVE · 21:12/);
  assert.doesNotMatch(txt, /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/);
  assert.doesNotMatch(txt, /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/);
  assert.match(html, /id="estilo-icqgram-seed"/);
  assert.match(html, /doc-estilo-icqgram/);
  assert.match(html, /function ensureEstiloDoc/);
  assert.match(html, /Estilo comunicaciones ICQGram\.txt/);
  assert.match(html, /it\.parent=spec\.parent\|\|MISC_ID/);
  assert.ok(html.includes(estiloSeedBody()));
});

function estiloSeedBody() {
  return src("windows95/estilo-comunicaciones-icqgram.txt").replace(/\s+$/, "");
}

const NO_IP = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/;
const NO_MAC = /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/;

test("Miscelánea incluye el traspaso del Consejo precargado en el código", () => {
  const html = src("windows95/index.html");
  const como = src("windows95/como-funciona-win95-xperience.txt");
  const enc = src("windows95/encargos-y-misiones-abiertas.txt");
  const nor = src("windows95/normas-del-consejo.txt");
  assert.match(como, /CÓMO FUNCIONA WIN95 XPERIENCE/);
  assert.match(como, /\/api\/win95\/presencia/);
  assert.match(como, /Grok Bot semanal/);
  assert.match(como, /deploy\.sh/);
  assert.match(enc, /ENCARGOS Y MISIONES ABIERTAS/);
  assert.match(enc, /MDAT-3/);
  assert.match(enc, /#7692/);
  assert.match(enc, /sin verificar/);
  assert.match(nor, /NORMAS DEL CONSEJO PARA NUEVOS CONSEJEROS/);
  assert.match(nor, /desde mi ordenador, chat de Grok Bot/);
  assert.match(nor, /Leído y aplicado/);
  assert.match(nor, /LEYENDAS/);
  assert.match(nor, /ACTUALES/);
  for (const txt of [como, enc, nor]) {
    assert.doesNotMatch(txt, NO_IP);
    assert.doesNotMatch(txt, NO_MAC);
    assert.doesNotMatch(txt, /Bearer\s+[A-Za-z0-9._\-]+/);
  }
  assert.match(html, /id="como-funciona-win95-seed"/);
  assert.match(html, /id="encargos-abiertos-seed"/);
  assert.match(html, /id="normas-consejo-seed"/);
  assert.match(html, /doc-como-funciona-win95/);
  assert.match(html, /doc-encargos-abiertos/);
  assert.match(html, /doc-normas-consejo/);
  assert.match(html, /function isMiscSysDoc/);
  assert.match(html, /function ensureMiscSysOne/);
  assert.ok(html.includes(como.replace(/\s+$/, "")));
  assert.ok(html.includes(enc.replace(/\s+$/, "")));
  assert.ok(html.includes(nor.replace(/\s+$/, "")));
});

test("Miscelánea incluye la subcarpeta ElonMusk con la misión del 26-nov-2026", () => {
  const html = src("windows95/index.html");
  const txt = src("windows95/misiones/ElonMusk/2026-11-26.txt");
  assert.match(txt, /MISIÓN PRINCIPAL/);
  assert.match(txt, /Elon Musk/);
  assert.match(txt, /XperienceWin95/);
  assert.match(txt, /26-nov-2026/);
  assert.match(txt, /#7710/);
  assert.match(txt, /#7711/);
  assert.match(txt, /#7536/);
  assert.match(txt, /admira\.live\/win95/);
  assert.match(txt, /ElonMusk\/2026-11-26\.txt/);
  assert.doesNotMatch(txt, NO_IP);
  assert.doesNotMatch(txt, NO_MAC);
  assert.doesNotMatch(txt, /Bearer\s+[A-Za-z0-9._\-]+/);
  assert.match(html, /id="mision-elon-20261126-seed"/);
  assert.match(html, /id:'fld-elonmusk'/);
  assert.match(html, /name:'ElonMusk'/);
  assert.match(html, /mission:'XperienceWin95'/);
  assert.match(html, /id:'doc-elon-mision-20261126'/);
  assert.match(html, /function miscFolderTitle\(/);
  assert.doesNotMatch(html, /name:'Elon - Misión\.txt'/);
  assert.doesNotMatch(html, /id="elon-mision-seed"/);
  assert.ok(html.includes(txt.replace(/\s+$/, "")));
});

test("Miscelánea incluye la subcarpeta JensenHuang con la misión del 26-nov-2026", () => {
  const html = src("windows95/index.html");
  const txt = src("windows95/misiones/JensenHuang/2026-11-26.txt");
  assert.match(txt, /MISIÓN PRINCIPAL/);
  assert.match(txt, /Jensen Huang/);
  assert.match(txt, /ModoDemoAdmiraNeXT/);
  assert.match(txt, /26-nov-2026/);
  assert.match(txt, /Modo demo AdmiraNeXT en la zona Terminator/);
  assert.match(txt, /MBACrema/);
  assert.match(txt, /MBARosa/);
  assert.match(txt, /Admira95/);
  assert.match(txt, /ICQGram/);
  assert.match(txt, /Novedades de Netscape/);
  assert.match(txt, /JensenHuang\/2026-11-26\.txt/);
  assert.doesNotMatch(txt, NO_IP);
  assert.doesNotMatch(txt, NO_MAC);
  assert.doesNotMatch(txt, /Bearer\s+[A-Za-z0-9._\-]+/);
  assert.match(html, /id="mision-jensen-20261126-seed"/);
  assert.match(html, /id:'fld-jensenhuang'/);
  assert.match(html, /name:'JensenHuang'/);
  assert.match(html, /mission:'ModoDemoAdmiraNeXT'/);
  assert.match(html, /id:'doc-jensen-mision-20261126'/);
  assert.ok(html.includes(txt.replace(/\s+$/, "")));
});


test("Miscelánea incluye la subcarpeta SteveWozniak con la misión del 26-nov-2026", () => {
  const html = src("windows95/index.html");
  const txt = src("windows95/misiones/SteveWozniak/2026-11-26.txt");
  assert.match(txt, /MISIÓN PRINCIPAL/);
  assert.match(txt, /Steve Wozniak \(Woz\)/);
  assert.match(txt, /26-nov-2026/);
  assert.match(txt, /Win95 Xperience en admira\.live/);
  assert.match(txt, /Admira Media Player/);
  assert.match(txt, /Napster v2\.0 Transfer/);
  assert.match(txt, /ICQGram/);
  assert.doesNotMatch(txt, NO_IP);
  assert.doesNotMatch(txt, NO_MAC);
  assert.match(html, /id="mision-woz-20261126-seed"/);
  assert.match(html, /fld-stevewozniak/);
  assert.match(html, /SteveWozniak/);
  assert.match(html, /mission:'Win95 Xperience'/);
  assert.ok(html.includes(txt.replace(/\s+$/, "")));
  assert.doesNotMatch(html, /id:'fld-stevejobs'/);
});

test("Miscelánea incluye 2026-11-27.txt en SteveWozniak junto a la nota del 26-nov", () => {
  const html = src("windows95/index.html");
  const txt26 = src("windows95/misiones/SteveWozniak/2026-11-26.txt");
  const txt = src("windows95/misiones/SteveWozniak/2026-11-27.txt");
  assert.match(txt26, /26-nov-2026/);
  assert.match(txt26, /Win95 Xperience en admira\.live/);
  assert.match(txt, /MISIÓN PRINCIPAL/);
  assert.match(txt, /Steve Wozniak \(Woz\)/);
  assert.match(txt, /27-nov-2026/);
  assert.match(txt, /DeepAgents/);
  assert.match(txt, /sin gastar/);
  assert.match(txt, /tokens de consejero/);
  assert.match(txt, /legendarios y actuales/);
  assert.match(txt, /nube verde/);
  assert.match(txt, /\/win95/);
  assert.doesNotMatch(txt, NO_IP);
  assert.doesNotMatch(txt, NO_MAC);
  assert.match(html, /id="mision-woz-20261126-seed"/);
  assert.match(html, /id="mision-woz-20261127-seed"/);
  assert.match(html, /id:'doc-woz-mision-20261126'/);
  assert.match(html, /id:'doc-woz-mision-20261127'/);
  assert.match(html, /name:'2026-11-27\.txt'/);
  assert.match(html, /folder:'fld-stevewozniak'/);
  assert.ok(html.includes(txt.replace(/\s+$/, "")));
  // La nota del 26-nov se conserva en disco y en el seed; el cuerpo del .txt
  // y el seed ya diferían en main (ICQGram) y no se tocan.
  assert.match(txt26, /26-nov-2026/);
  assert.match(html, /id="mision-woz-20261126-seed"/);
  assert.match(html, /id:'doc-woz-mision-20261126'/);
  assert.match(html, /name:'2026-11-26\.txt'/);
});

test("el menú Inicio imita Windows 95 y la A de Admira es la nube, con estrellas en Navigator", () => {
  const html = src("windows95/index.html");
  assert.match(html, /Windows <b>95<\/b>/);
  assert.doesNotMatch(html, /<div class="side"><span><b>Admira<\/b>95<\/span>/);
  assert.match(html, /data-ico="startProg"/);
  assert.match(html, /data-ico="startDocs"/);
  assert.match(html, /data-ico="startSettings"/);
  assert.match(html, /data-ico="startFind"/);
  assert.match(html, /data-ico="startHelp"/);
  assert.match(html, /data-ico="startRun"/);
  assert.match(html, /data-ico="startShutdown"/);
  assert.match(html, /icons\/admira-nube-16\.png/);
  assert.match(html, /icons\/admira-nube-22\.png/);
  assert.match(html, /id="brThrob"/);
  assert.match(html, /@keyframes meteor/);
  assert.match(html, /animation:meteor/);
  assert.doesNotMatch(html, /<div class="tA">A<\/div>/);
  assert.doesNotMatch(html, /logo:SV\('0 0 16 16','<rect[^']*fill="#ff6a00"/);
  const files = [
    "windows95/icons/admira-nube.png",
    "windows95/icons/admira-nube-16.png",
    "windows95/icons/admira-nube-22.png",
    "windows95/icons/start-programs.png",
    "windows95/icons/start-docs.png",
    "windows95/icons/start-settings.png",
    "windows95/icons/start-find.png",
    "windows95/icons/start-help.png",
    "windows95/icons/start-run.png",
    "windows95/icons/start-shutdown.png",
  ];
  for (const f of files) {
    const buf = readFileSync(join(raiz, f));
    assert.ok(buf.length > 50, f);
    assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", f + " no es PNG");
  }
});
