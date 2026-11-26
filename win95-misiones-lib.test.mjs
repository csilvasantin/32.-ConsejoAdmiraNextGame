import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanear, titularCorto, principalDe, normalizarEncargo, nombreCarpeta,
  construirMisiones, MISIONES_FALLBACK, BANDEJAS_26NOV, DEEPAGENTS, STEVEJOBS,
  notaSteveJobs, textoMisionDia, misionDeclaradaEnTexto, misionCompacta,
  coincideCarpetaConsejero, misionDesdeCarpeta, misionDeConsejeroEnCarpetas,
  CONSEJEROS_ICQ, consejeroMisiones, construirConsejeros,
} from "./win95-misiones-lib.mjs";
import { onRequestGet, construir } from "./functions/api/win95/misiones.js";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const AHORA = Date.parse("2026-11-26T09:25:00Z"); // 10:25 en Madrid

test("sanear: fuera IPs, SSH, correos y tokens; la prosa se queda", () => {
  const t = sanear("ip 192.168.1.20 · ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC1JF0DtGQrL0OoLTw8rqnrqz+0raabZK1/2Cl7d6hKw user@host · token=abcd1234xyz · escribe a csilva@admira.com");
  for (const fuga of ["192.168.1.20", "ssh-ed25519", "AAAAC3NzaC1lZDI1NTE5", "abcd1234xyz", "csilva@admira.com"]) {
    assert.ok(!t.includes(fuga), fuga);
  }
  assert.match(t, /\[IP oculta\]|\[clave oculta\]|\[correo oculto\]|\[oculto\]/);
  assert.equal(sanear("Ojos Remotos en AdmiraNeXT04, falta acceso a admira-vault"), "Ojos Remotos en AdmiraNeXT04, falta acceso a admira-vault");
});

test("titularCorto: Titular, comillas, retoma y frases de proyecto", () => {
  assert.match(titularCorto("Titular: Retoma control mañana 26-nov — Reparar el 401 del webhook de Huang y cerrar el espejo #7536"), /Webhook Huang y espejo #7536|Reparar el 401/);
  assert.equal(titularCorto("Retoma de #7612 (Screen sync AdmiraNeXT01–05), sesión nueva."), "Screen sync AdmiraNeXT01–05");
  assert.equal(titularCorto("«Vuelta al 95» (admira.live/windows95). Parte siempre de main."), "Vuelta al 95, partir de main");
  assert.equal(titularCorto("Seguimiento de Ojos Remotos en AdmiraNeXT04: hace falta acceso.", "blocked"), "Ojos Remotos (bloqueado)");
  assert.equal(titularCorto("Gemelo digital de StreamDeck para controlar la Xperiencia Terminator. Encargo de Carlos: mejorar el gemelo, empezando por el BOTÓN HACKEO."), "Hackeo desde el gemelo de StreamDeck (Terminator)");
});

test("principalDe: hoy gana; si no, in_progress; si no, el más reciente", () => {
  const neo = BANDEJAS_26NOV.Neo.map(normalizarEncargo);
  const pNeo = principalDe(neo, AHORA);
  assert.equal(pNeo.encargo, 7621);
  assert.equal(pNeo.estado, "in_progress");
  const tri = BANDEJAS_26NOV.Trinity.map(normalizarEncargo);
  assert.equal(principalDe(tri, AHORA).encargo, 7736);
  const mor = BANDEJAS_26NOV.Morfeo.map(normalizarEncargo);
  assert.equal(principalDe(mor, AHORA).encargo, 7706);
  const ora = BANDEJAS_26NOV.Oraculo.map(normalizarEncargo);
  assert.equal(principalDe(ora, AHORA).encargo, 7739);
  assert.equal(principalDe(ora, AHORA).estado, "pending");
  assert.equal(principalDe(ora, AHORA).acuseMs, 0);
});

test("fallback 26-nov: 4 DeepAgents + SteveJobs, misiones reales, sin secretos", () => {
  const d = MISIONES_FALLBACK;
  assert.equal(d.ok, true);
  const nombres = d.carpetas.map((c) => c.nombre);
  assert.equal(d.carpetas.length, 5);
  assert.ok(nombres.some((n) => n.startsWith("Neo - #7621") && /Screen sync/i.test(n)), nombres.join(" | "));
  assert.ok(nombres.some((n) => n.startsWith("Trinity - #7736") && /webhook|Huang|7536/i.test(n)), nombres.join(" | "));
  assert.ok(nombres.some((n) => n.startsWith("Morfeo - #7706") && /Vuelta al 95/i.test(n)), nombres.join(" | "));
  assert.ok(nombres.some((n) => n.startsWith("Oráculo - #7739") && /Hackeo desde el gemelo de StreamDeck \(Terminator\)/i.test(n)), nombres.join(" | "));
  const oraC = d.carpetas.find((c) => c.persona === "Oraculo");
  assert.equal(oraC.principal.encargo, 7739);
  assert.equal(oraC.principal.estado, "pending");
  assert.equal(oraC.principal.acuseMs, 0);
  assert.ok(oraC.abiertos.some((e) => e.encargo === 7739 && e.titulo.includes("StreamDeck")));
  assert.ok(oraC.hechas.some((e) => e.encargo === 7626 && e.estado === "done"));
  assert.ok(oraC.hechas.every((e) => !("texto" in e) && !("maquina" in e)));
  assert.ok(nombres.includes("SteveJobs"));
  assert.ok(d.carpetas.filter((c) => c.padre === "misiones").length === 4);
  assert.equal(d.carpetas.find((c) => c.nombre === "SteveJobs").padre, "miscelanea");
  const jobs = d.carpetas.find((c) => c.id === STEVEJOBS.folderId);
  assert.match(jobs.ficheros[0].texto, /Win95 Xperience y control de DeepAgents en admira\.live/);
  assert.match(jobs.ficheros[0].texto, /Frescura de cupos en ICQGram/);
  const blob = JSON.stringify(d);
  for (const fuga of ["192.168.", "100.117.", "100.89.", "ssh-ed25519", "AAAAC3", "csilva@", "ghp_", "token="]) {
    assert.ok(!blob.includes(fuga), fuga);
  }
  assert.ok(!blob.includes("nota"));
});

test("construirMisiones no reenvía notas ni mezcla IPs aunque vengan en el crudo", () => {
  const d = construirMisiones({
    bandejas: {
      Neo: [{ encargo: 1, estado: "pending", cuando: AHORA, maquina: "macstudio", texto: "Hola", nota: "IP 10.0.0.7 ssh-ed25519 AAAAUSER" }],
    },
    ahora: AHORA,
  });
  const blob = JSON.stringify(d);
  assert.ok(!blob.includes("10.0.0.7") && !blob.includes("ssh-ed25519") && !blob.includes("AAAAUSER"));
  assert.match(d.carpetas.find((c) => c.persona === "Neo").nombre, /Neo - #1/);
  assert.equal(d.carpetas.find((c) => c.nombre === "SteveJobs").nombre, "SteveJobs");
});

test("/api/win95/misiones: sin sesión 401; con sesión no reenvía secretos", async () => {
  const r = await onRequestGet({ request: new Request("https://www.admira.live/api/win95/misiones"), env: {}, fetchImpl: async () => new Response("{}") });
  assert.equal(r.status, 401);
  const fetchImpl = async (url) => {
    if (String(url).includes("persona=Trinity")) {
      return Response.json({ items: BANDEJAS_26NOV.Trinity });
    }
    if (String(url).includes("persona=Neo")) return Response.json({ items: BANDEJAS_26NOV.Neo });
    if (String(url).includes("persona=Morfeo")) return Response.json({ items: BANDEJAS_26NOV.Morfeo });
    if (String(url).includes("persona=Oraculo")) return Response.json({ items: BANDEJAS_26NOV.Oraculo });
    return Response.json({ items: [] });
  };
  const d = await construir({ fetchImpl, ahora: AHORA });
  assert.equal(d.ok, true);
  assert.ok(d.carpetas.some((c) => c.nombre.startsWith("Trinity - #7736")));
  assert.ok(d.carpetas.some((c) => c.nombre === "SteveJobs"));
  assert.ok(Array.isArray(d.consejeros));
  assert.equal(d.consejeros.length, CONSEJEROS_ICQ.length);
  const mu = d.consejeros.find((c) => c.persona === "murati");
  assert.equal(mu.hechas, 0);
  assert.equal(mu.actual, null);
});

test("Win95: Misiones hidrata los 4 DeepAgents y Miscelánea guarda SteveJobs; Detalles por defecto; Nueva carpeta y Subir un nivel", () => {
  assert.match(html, /MISIONES_URL='\/api\/win95\/misiones'/);
  assert.match(html, /fld-deep-neo/);
  assert.match(html, /fld-deep-trinity/);
  assert.match(html, /fld-deep-morfeo/);
  assert.match(html, /fld-deep-oraculo/);
  assert.match(html, /fld-stevejobs/);
  assert.match(html, /id="misiones-fallback-seed"/);
  assert.match(html, /function ensureDeepAgents\(/);
  assert.match(html, /function ensureSteveJobs\(/);
  assert.match(html, /function ensureMisionesFolder\(/);
  assert.match(html, /padreDeCarpeta\(/);
  assert.match(html, /function loadMisiones\(/);
  assert.match(html, /Win95 Xperience y control de DeepAgents en admira\.live/);
  assert.match(html, /DESK_LAYOUT_VER=4/);
  assert.match(html, /FVIEW_KEY='admira-win95-vistas-v2'/);
  assert.match(html, /mode:VIEW_MODES\.indexOf\(v\.mode\)>=0\?v\.mode:\(isDesk\?'large':'details'\)/);
  assert.match(html, /data-up[\s\S]{0,80}Subir un nivel/);
  assert.match(html, /class="foldpath"/);
  assert.match(html, /\{l:'Nueva carpeta',fn:function\(\)\{ newFolder\(/);
  assert.match(html, /if\(e\.key==='Enter'&&el&&el\._def\)/);
  assert.match(html, /function openMyPc\(/);
  assert.match(html, /case 'mypc': openMyPc\(\); break;/);
  assert.match(html, /id===MISC_ID\)\{ loadComms\(true\); loadMisiones\(true\); \}/);
});

test("Win95: arranque por defecto con la distribución de Carlos (columna izq., Léeme y Leyendas, columna dcha., ICQGram)", () => {
  assert.match(html, /DESK_POS=\{/);
  assert.match(html, /mypc:\{left:4,top:6\}/);
  assert.match(html, /browser:\{left:4,top:68\}/);
  assert.match(html, /'fld-descargas':\{left:4,top:130\}/);
  assert.match(html, /'fld-misc':\{left:4,top:192\}/);
  assert.match(html, /'fld-misiones':\{left:82,top:192\}/);
  assert.match(html, /p2p:\{left:4,top:254\}/);
  assert.match(html, /amp:\{left:4,top:316\}/);
  assert.match(html, /media:\{left:4,top:378\}/);
  assert.match(html, /readme:\{left:82,top:6\}/);
  assert.match(html, /'doc-leyendas':\{left:160,top:6\}/);
  assert.match(html, /inbox:\{left:564,top:6\}/);
  assert.match(html, /ssaver:\{left:564,top:192\}/);
  assert.match(html, /trash:\{left:564,top:378\}/);
  assert.match(html, /id="icq"[^>]*left:236px;top:118px;width:320px;height:330px/);
  assert.match(html, /DESK_RIGHT_COL-ww-8/);
  assert.match(html, /openIcq\(\);\s*applyWinLayout\(\);/);
  assert.match(html, /if\(!data\|\|data\.v!==DESK_LAYOUT_VER/);
});

test("nombreCarpeta y nota de Jobs son estables", () => {
  const neo = DEEPAGENTS[0];
  const p = principalDe(BANDEJAS_26NOV.Neo.map(normalizarEncargo), AHORA);
  assert.equal(nombreCarpeta(neo, p), "Neo - #7621 Screen sync AdmiraNeXT01–05");
  assert.match(notaSteveJobs(AHORA), /26-11-2026|26-11-26/);
  assert.match(textoMisionDia(neo, p, AHORA), /#7621/);
});

test("ICQGram: la misión se lee de la subcarpeta del consejero en Miscelánea; si no hay, no se inventa", () => {
  const jobs = { name: "Steve Jobs", persona: "jobs" };
  assert.ok(coincideCarpetaConsejero("SteveJobs", jobs));
  assert.ok(coincideCarpetaConsejero("Steve Jobs", jobs));
  assert.ok(coincideCarpetaConsejero("SteveWozniak", { name: "Steve Wozniak", persona: "wozniak" }));
  assert.ok(coincideCarpetaConsejero("WaltDisney", { name: "Walt Disney", persona: "disney" }));
  assert.ok(coincideCarpetaConsejero("GeorgeLucas", { name: "George Lucas", persona: "lucas" }));
  assert.ok(coincideCarpetaConsejero("ElonMusk", { name: "Elon Musk", persona: "musk" }));
  assert.ok(coincideCarpetaConsejero("JensenHuang", { name: "Jensen Huang", persona: "huang" }));
  assert.ok(coincideCarpetaConsejero("MiraMurati", { name: "Mira Murati", persona: "murati" }));
  assert.ok(coincideCarpetaConsejero("JohnLasseter", { name: "John Lasseter", persona: "lasseter" }));
  assert.ok(!coincideCarpetaConsejero("Neo - #7621 Screen sync", jobs));
  const nota = notaSteveJobs(AHORA);
  assert.equal(misionDeclaradaEnTexto(nota), "Win95 Xperience y control de DeepAgents en admira.live");
  assert.equal(misionCompacta("Win95 Xperience y control de DeepAgents en admira.live"), "Win95 Xperience y control DeepAgents");
  const mis = misionDeConsejeroEnCarpetas(jobs, MISIONES_FALLBACK.carpetas);
  assert.equal(mis.corto, "Win95 Xperience y control DeepAgents");
  assert.equal(misionDeConsejeroEnCarpetas({ name: "Elon Musk", persona: "musk" }, MISIONES_FALLBACK.carpetas), null);
  assert.equal(misionDesdeCarpeta({ nombre: "SteveWozniak", ficheros: [] }), null);
  assert.equal(misionDesdeCarpeta({ nombre: "ElonMusk - Xperience en admira.tv", ficheros: [] }).corto, "Xperience en admira.tv");
  const wozTxt = "Este documento está en Miscelánea: «SteveWozniak/2026-11-26.txt».\n\nMisión principal: Win95 Xperience en admira.live.";
  assert.equal(misionDeclaradaEnTexto(wozTxt), "Win95 Xperience en admira.live");
  assert.equal(misionDeclaradaEnTexto("Ruta: «SteveWozniak/2026-11-26.txt»."), "");
  assert.equal(misionCompacta("Win95 Xperience en admira.live"), "Win95 Xperience");
  const woz = misionDesdeCarpeta({ nombre: "SteveWozniak", ficheros: [{ nombre: "2026-11-26.txt", texto: wozTxt }] });
  assert.equal(woz.corto, "Win95 Xperience");
});

test("Win95 ICQGram: la fila muestra nombre (n) · misión leída de Miscelánea, con ellipsis y title", () => {
  assert.match(html, /function misionConsejeroEnMiscelanea\(/);
  assert.match(html, /function coincideCarpetaConsejero\(/);
  assert.match(html, /function misionDeclaradaEnTexto\(/);
  assert.match(html, /class="mis"/);
  assert.match(html, /misionConsejeroEnMiscelanea\(c\)/);
  assert.match(html, /function misionConsejero\(/);
  assert.match(html, /function hechasConsejero\(/);
  assert.match(html, /function datosConsejero\(/);
  assert.match(html, /hn!==null\?' \('\+hn\+'\)':''/);
  assert.match(html, /misionConsejero\(CONSEJO\[ci\]\)/);
  assert.match(html, /\.crow > span\{[^}]*text-overflow:ellipsis/);
});

test("consejeroMisiones: hechas de la bandeja, actual del latido o del encargo en curso, y no se inventa", () => {
  const t = AHORA;
  const done = (id) => ({ id, status: "done", done_at: "2026-11-20T10:00:00Z", text: "hecho #" + id });
  const murati = consejeroMisiones({ persona: "murati", items: [], latido: null, ahora: t });
  assert.equal(murati.hechas, 0);
  assert.equal(murati.actual, null);
  assert.ok(murati.falta.some((f) => /bandeja/.test(f)));
  assert.ok(murati.falta.some((f) => /latido/.test(f)));

  const sinFuente = consejeroMisiones({ persona: "murati", ahora: t });
  assert.equal(sinFuente.hechas, null);
  assert.equal(sinFuente.actual, null);

  const s = Math.floor(t / 1000);
  const lucas = consejeroMisiones({
    persona: "lucas",
    items: [done(1), done(2), done(3), { id: 7740, status: "pending", created_at: "2026-11-26T08:00:00Z", text: "algo pendiente" }],
    latido: { modo: "trabajando", caducado: false, mision: "Sincronizar consumos hoy en admira.live y base 1 M", until: s + 3600, hasta: s + 3600, encargo: null },
    ahora: t,
  });
  assert.equal(lucas.hechas, 3);
  assert.equal(lucas.actual.fuente, "latido");
  assert.match(lucas.actual.titulo, /Sincronizar consumos/);
  assert.equal(lucas.actual.encargo, null);

  const musk = consejeroMisiones({
    persona: "musk",
    items: [
      { id: 7536, status: "in_progress", created_at: "2026-11-11T10:00:00Z", text: "Titular: Webhook Huang y espejo #7536" },
      { id: 7707, status: "pending", created_at: "2026-11-25T10:00:00Z", text: "pendiente" },
    ],
    latido: { modo: "reposo", caducado: false, mision: "otra", at: s - 100, hasta: s - 10 },
    ahora: t,
  });
  assert.equal(musk.hechas, 0);
  assert.equal(musk.actual.fuente, "encargo");
  assert.equal(musk.actual.encargo, 7536);
  assert.match(musk.actual.titulo, /Webhook Huang y espejo #7536/);

  const caducado = consejeroMisiones({
    persona: "lasseter",
    items: [],
    latido: { modo: "trabajando", caducado: true, mision: "prueba estado mesa", at: s - 4000, hasta: s - 10 },
    ahora: t,
  });
  assert.equal(caducado.hechas, 0);
  assert.equal(caducado.actual, null, "un latido caducado no es la misión en curso");

  const sinTexto = consejeroMisiones({
    persona: "wozniak",
    items: [done(10), done(11), { id: 7546, status: "in_progress", created_at: "2026-11-26T08:00:00Z" }],
    ahora: t,
  });
  assert.equal(sinTexto.hechas, 2);
  assert.equal(sinTexto.actual.encargo, 7546);
  assert.equal(sinTexto.actual.titulo, "#7546");
  assert.notEqual(sinTexto.actual.titulo, "misión en curso");

  const huang = consejeroMisiones({
    persona: "huang",
    items: Array.from({ length: 17 }, (_, i) => done(100 + i)).concat([{ id: 7705, status: "pending", created_at: "2026-11-25T10:00:00Z", text: "pendiente" }]),
    latido: null,
    ahora: t,
  });
  assert.equal(huang.hechas, 17);
  assert.equal(huang.actual, null, "un pendiente no cuenta como misión en curso");

  const todos = construirConsejeros({
    bandejas: { jobs: [done(1)], wozniak: [done(2), done(3)], disney: [], lucas: [], musk: [], huang: [], murati: [], lasseter: [] },
    latido: { ok: true, consejeros: { Jobs: { modo: "trabajando", mision: "Win95 Xperience y control de DeepAgents en admira.live", hasta: s + 600 } } },
    ahora: t,
  });
  assert.equal(todos.length, 8);
  assert.equal(todos[0].persona, "jobs");
  assert.equal(todos[0].hechas, 1);
  assert.equal(todos[0].actual.fuente, "latido");
  assert.equal(todos.find((c) => c.persona === "wozniak").hechas, 2);
  assert.equal(todos.find((c) => c.persona === "murati").actual, null);
});

test("ICQGram: grupos plegables, DeepAgents antes de Fuera de línea, plegado por defecto, misiones reales", () => {
  assert.match(html, /var DEEP_ICQ=/);
  assert.match(html, /id:'d-neo',persona:'Neo',name:'Neo'/);
  assert.match(html, /id:'d-trinity',persona:'Trinity',name:'Trinity'/);
  assert.match(html, /id:'d-morfeo',persona:'Morfeo',name:'Morfeo'/);
  assert.match(html, /id:'d-oraculo',persona:'Oraculo',name:'Oráculo'/);
  assert.match(html, /ICQ_FOLD=\{leyendas:false,actuales:false,deepagents:true/);
  assert.match(html, /function deepAgent\(/);
  assert.match(html, /function detalleMisiones\(/);
  assert.match(html, /grp\('DeepAgents'/);
  assert.match(html, /grp\('Fuera de línea',off/);
  const render = html.slice(html.indexOf("function renderContacts()"), html.indexOf("function dockIcq()"));
  const da = render.indexOf("grp('DeepAgents'");
  const fl = render.indexOf("grp('Fuera de línea'");
  assert.ok(da >= 0 && fl >= 0 && da < fl, "DeepAgents debe ir antes de Fuera de línea");
  assert.match(html, /data-grp=/);
  assert.match(html, /class="cgrp"/);
  assert.match(html, /class="ctog"/);
  assert.match(html, /class="cdet"/);
  assert.match(html, /\.clist\{[^}]*overflow:auto/);
  assert.match(html, /e\.target\.closest\('\.cgrp'\)/);
  assert.doesNotMatch(html, /id:'d-morfeo'[^\n]*sinChat:false/);
  // no se pisa el contacto de demo «morfeo»
  assert.match(html, /id:'morfeo', name:'Morfeo'/);
  assert.match(html, /if\(c\.deep\)/);
});
