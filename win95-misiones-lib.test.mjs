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
  assert.equal(principalDe(ora, AHORA).encargo, 7677);
});

test("fallback 26-nov: 4 DeepAgents + SteveJobs, misiones reales, sin secretos", () => {
  const d = MISIONES_FALLBACK;
  assert.equal(d.ok, true);
  const nombres = d.carpetas.map((c) => c.nombre);
  assert.equal(d.carpetas.length, 5);
  assert.ok(nombres.some((n) => n.startsWith("Neo - #7621") && /Screen sync/i.test(n)), nombres.join(" | "));
  assert.ok(nombres.some((n) => n.startsWith("Trinity - #7736") && /webhook|Huang|7536/i.test(n)), nombres.join(" | "));
  assert.ok(nombres.some((n) => n.startsWith("Morfeo - #7706") && /Vuelta al 95/i.test(n)), nombres.join(" | "));
  assert.ok(nombres.some((n) => n.startsWith("Oráculo - #7677") && /Ojos Remotos/i.test(n)), nombres.join(" | "));
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
});

test("Win95 ICQGram: la fila muestra nombre (n) · misión leída de Miscelánea, con ellipsis y title", () => {
  assert.match(html, /function misionConsejeroEnMiscelanea\(/);
  assert.match(html, /function coincideCarpetaConsejero\(/);
  assert.match(html, /function misionDeclaradaEnTexto\(/);
  assert.match(html, /class="mis"/);
  assert.match(html, /misionConsejeroEnMiscelanea\(c\)/);
  assert.match(html, /\.crow > span\{[^}]*text-overflow:ellipsis/);
});
