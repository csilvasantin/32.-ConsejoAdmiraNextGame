import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  nombreDeepAgent, paraDesdeRemitente, asuntoMision, fechaBandeja, whenBandeja,
  cuerpoMision, emailDesdeEncargo, construirBandeja, tooltipBandeja, aplicarLeidos,
  contieneSecreto, BANDEJA_FALLBACK, HECHAS_26NOV, BANDEJA_URL, BANDEJA_LEIDOS_KEY,
  BANDEJA_CADA_SEG, CC_CARLOS, PARA_DEFECTO, DEEPAGENTS_BANDEJA,
  mailDeEncargo, carpetaDeEstado, nombreConsejeroFiel, asuntoCarpeta,
} from "./win95-bandeja-lib.mjs";
import { onRequestGet, construir } from "./functions/api/win95/bandeja.js";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const AHORA = Date.parse("2026-11-26T10:35:00Z"); // 11:35 en Madrid

test("mapeo De=DeepAgent, Para=consejero, CC=Carlos Silva", () => {
  assert.equal(nombreDeepAgent("NeoMacStudio"), "Neo");
  assert.equal(nombreDeepAgent("Oraculo"), "Oráculo");
  assert.equal(nombreDeepAgent("Trinity"), "Trinity");
  assert.equal(paraDesdeRemitente("status-web · JobsGrokBot"), "Steve Jobs");
  assert.equal(paraDesdeRemitente("status-web · Elon Musk (Carlos 25-nov)"), "Elon Musk");
  assert.equal(paraDesdeRemitente("status-web · HuangGrokBot"), "Jensen Huang");
  assert.equal(paraDesdeRemitente("status-web · Mira / Trinity (por encargo de Carlos)"), PARA_DEFECTO);
  assert.equal(paraDesdeRemitente("status-web · status-web"), PARA_DEFECTO);

  const neo = emailDesdeEncargo(HECHAS_26NOV.find((e) => e.encargo === 7722), { ahora: AHORA });
  assert.equal(neo.id, "mision-7722");
  assert.equal(neo.de, "Neo");
  assert.equal(neo.para, "Steve Jobs");
  assert.equal(neo.cc, CC_CARLOS);
  assert.equal(neo.asunto, "Misión finalizada · #7722 Unión de los dos mundos");
  assert.equal(neo.fecha, "25-11-2026 20:48");
  assert.match(neo.cuerpo, /Vuelta al 95/);
  assert.ok(!/token|192\.168|ghp_/i.test(neo.cuerpo));

  const tri = emailDesdeEncargo(HECHAS_26NOV.find((e) => e.encargo === 7694), { ahora: AHORA });
  assert.equal(tri.de, "Trinity");
  assert.equal(tri.para, "Elon Musk");
  assert.equal(tri.cc, "Carlos Silva");
  assert.match(tri.asunto, /#7694/);
  assert.match(tri.asunto, /Voz activada por defecto/);
  assert.equal(tri.fecha, "25-11-2026 10:59");
  assert.match(tri.cuerpo, /PR https:\/\/github\.com\/csilvasantin\/32\.-ConsejoAdmiraNextGame\/pull\/475/);

  const mor = emailDesdeEncargo(HECHAS_26NOV.find((e) => e.encargo === 7658), { ahora: AHORA });
  assert.equal(mor.de, "Morfeo");
  assert.equal(mor.para, PARA_DEFECTO);
  assert.equal(mor.cc, "Carlos Silva");
  assert.match(mor.asunto, /#7658/);
  assert.match(mor.cuerpo, /ainimation\.studio\/taza/);

  const ora = emailDesdeEncargo(HECHAS_26NOV.find((e) => e.encargo === 7626), { ahora: AHORA });
  assert.equal(ora.de, "Oráculo");
  assert.equal(ora.para, "Jensen Huang");
  assert.equal(ora.cc, "Carlos Silva");
  assert.match(ora.cuerpo, /Vecna/);
});

test("construirBandeja: solo done, sin duplicar, ordenadas por cierre, saneadas", () => {
  const d = construirBandeja({
    bandejas: {
      Neo: [
        { id: 1, status: "done", done_at: "2026-11-25T19:48:00Z", from_name: "JobsGrokBot", target_persona: "Neo", text: "Titular: Prueba", respuesta: "Hecho. IP 192.168.1.20 y token=abcd1234xyz" },
        { id: 1, status: "done", done_at: "2026-11-25T19:48:00Z", from_name: "JobsGrokBot", target_persona: "Neo", text: "duplicado" },
        { id: 2, status: "in_progress", from_name: "Jobs", target_persona: "Neo", text: "abierto, no es correo" },
      ],
      Jobs: [HECHAS_26NOV.find((e) => e.encargo === 7722)],
    },
    ahora: AHORA,
  });
  assert.equal(d.ok, true);
  assert.equal(d.emails.filter((e) => e.encargo === 1).length, 1);
  assert.ok(!d.emails.some((e) => e.encargo === 2));
  const secreto = d.emails.find((e) => e.encargo === 1);
  assert.equal(secreto.de, "Neo");
  assert.equal(secreto.para, "Steve Jobs");
  assert.equal(secreto.cc, "Carlos Silva");
  assert.ok(!secreto.cuerpo.includes("192.168.1.20"), secreto.cuerpo);
  assert.ok(!secreto.cuerpo.includes("abcd1234xyz"), secreto.cuerpo);
  assert.match(secreto.cuerpo, /\[IP oculta\]|\[oculto\]/);
  assert.equal(d.emails[0].encargo, 7722);
});

test("fallback 26-nov: misiones reales #7722 #7694 #7658 #7626, CC Carlos, sin secretos", () => {
  const d = BANDEJA_FALLBACK;
  assert.equal(d.ok, true);
  const ids = d.emails.map((e) => e.encargo);
  assert.deepEqual(ids, [7722, 7694, 7658, 7626]);
  assert.ok(d.emails.every((e) => e.cc === "Carlos Silva"));
  assert.ok(d.emails.every((e) => e.de && e.para && e.asunto && e.fecha && e.cuerpo));
  assert.equal(d.emails[0].de, "Neo");
  assert.equal(d.emails[0].para, "Steve Jobs");
  assert.equal(d.emails[1].de, "Trinity");
  assert.equal(d.emails[1].para, "Elon Musk");
  assert.equal(d.emails[2].de, "Morfeo");
  assert.equal(d.emails[3].de, "Oráculo");
  assert.equal(d.emails[3].para, "Jensen Huang");
  const blob = JSON.stringify(d);
  for (const fuga of ["192.168.", "100.117.", "100.89.", "ssh-ed25519", "AAAAC3", "csilva@", "ghp_", "token=", "Bearer "]) {
    assert.ok(!blob.includes(fuga), fuga);
  }
  assert.equal(contieneSecreto(blob), false);
});

test("leídos en localStorage: unread/read y tooltip de la bandeja", () => {
  assert.equal(tooltipBandeja(0), "Bandeja de entrada");
  assert.equal(tooltipBandeja(1), "Bandeja de entrada: 1 misión finalizada sin leer");
  assert.equal(tooltipBandeja(3), "Bandeja de entrada: 3 misiones finalizadas sin leer");
  const aplicados = aplicarLeidos(BANDEJA_FALLBACK.emails, ["mision-7722", "mision-7658"]);
  assert.equal(aplicados.find((e) => e.id === "mision-7722").unread, false);
  assert.equal(aplicados.find((e) => e.id === "mision-7694").unread, true);
  assert.equal(aplicados.find((e) => e.id === "mision-7658").unread, false);
  assert.equal(aplicados.filter((e) => e.unread).length, 2);
  assert.equal(BANDEJA_LEIDOS_KEY, "admira-win95-bandeja-leidos");
  assert.equal(BANDEJA_CADA_SEG, 45);
  assert.equal(asuntoMision(7722, "cierre de «unión de los dos mundos»"), "Misión finalizada · #7722 Unión de los dos mundos");
  assert.equal(fechaBandeja(Date.parse("2026-11-25T19:48:00Z")), "25-11-2026 20:48");
  assert.equal(whenBandeja(Date.parse("2026-11-25T19:48:00Z"), AHORA), "25-11");
  assert.equal(whenBandeja(Date.parse("2026-11-26T10:10:00Z"), AHORA), "11:10");
});

test("/api/win95/bandeja: sin sesión 401; con datos reales mapea De/Para/CC", async () => {
  const r = await onRequestGet({ request: new Request("https://www.admira.live/api/win95/bandeja"), env: {}, fetchImpl: async () => new Response("{}") });
  assert.equal(r.status, 401);
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes("persona=Trinity")) return Response.json({ items: [HECHAS_26NOV.find((e) => e.encargo === 7694)] });
    if (u.includes("persona=Morfeo")) return Response.json({ items: [HECHAS_26NOV.find((e) => e.encargo === 7658)] });
    if (u.includes("persona=Oraculo")) return Response.json({ items: [HECHAS_26NOV.find((e) => e.encargo === 7626)] });
    if (u.includes("persona=Neo")) return Response.json({ items: [] });
    return Response.json({ items: [] });
  };
  const d = await construir({ fetchImpl, ahora: AHORA });
  assert.equal(d.ok, true);
  assert.ok(d.emails.some((e) => e.de === "Trinity" && e.para === "Elon Musk" && e.cc === "Carlos Silva"));
  assert.ok(d.emails.some((e) => e.de === "Morfeo" && e.cc === "Carlos Silva"));
  assert.ok(d.emails.some((e) => e.de === "Oráculo" && e.para === "Jensen Huang"));
  assert.ok(!d.emails.some((e) => e.de === "Neo"), "Neo no está en su bandeja de agente; #7722 vive en el fallback / consejero");
});

test("Win95: Bandeja de entrada pinta De/Para/CC, sondea /api/win95/bandeja y el sobre parpadea junto a la red", () => {
  assert.match(html, /BANDEJA_URL='\/api\/win95\/bandeja'/);
  assert.match(html, /id="bandeja-fallback-seed"/);
  assert.match(html, /function loadBandeja\(/);
  assert.match(html, /function updateTrayMail\(/);
  assert.match(html, /function leidosBandeja\(/);
  assert.match(html, /admira-win95-bandeja-leidos/);
  assert.match(html, /CC: Carlos Silva/);
  assert.match(html, /Para: '\+m\.to/);
  assert.match(html, /mision-7722/);
  assert.match(html, /Unión de los dos mundos/);
  // Icono de correo inmediatamente al lado del icono de red, y parpadea si hay no leídos.
  assert.match(html, /id="trayNet"[\s\S]{0,900}?id="trayMail"/);
  assert.match(html, /id="trayMail"[^>]*class="blinking"/);
  assert.match(html, /#trayMail\.on\{display:inline-flex\}/);
  assert.match(html, /el\.classList\.toggle\('on',unread>0\)/);
  assert.match(html, /el\.classList\.toggle\('blinking',unread>0\)/);
  assert.match(html, /el\.title=tooltipBandeja\(unread\)/);
  assert.match(html, /function tooltipBandeja\(/);
  assert.match(html, /qs\('#trayMail'\)\.addEventListener\('click',function\(\)\{ openMail\(false\); \}\)/);
  assert.match(html, /setInterval\(function\(\)\{ if\(!document\.hidden\) loadBandeja\(false\); \}/);
  assert.doesNotMatch(html, /MAIL_NEW=/);
  const seed = html.match(/id="bandeja-fallback-seed">([^<]+)</);
  assert.ok(seed, "falta la instantánea de la bandeja");
  const datos = JSON.parse(seed[1]);
  assert.equal(datos.ok, true);
  assert.deepEqual(datos.emails.map((e) => e.encargo), BANDEJA_FALLBACK.emails.map((e) => e.encargo));
  assert.equal(datos.emails[0].de, "Neo");
  assert.equal(datos.emails[0].para, "Steve Jobs");
  assert.equal(datos.emails[0].cc, "Carlos Silva");
  assert.equal(BANDEJA_URL, "/api/win95/bandeja");
  assert.ok(DEEPAGENTS_BANDEJA.some((a) => a.persona === "Smith"));
  assert.ok(DEEPAGENTS_BANDEJA.some((a) => a.persona === "Niobe"));
  assert.ok(DEEPAGENTS_BANDEJA.some((a) => a.persona === "Arquitecto"));
});


test("las 4 carpetas mapean estados reales: entrada done, salida en curso, enviados del consejero, eliminados no acabadas", () => {
  assert.equal(carpetaDeEstado("done"), "entrada");
  assert.equal(carpetaDeEstado("in_progress"), "salida");
  assert.equal(carpetaDeEstado("pending"), "salida");
  assert.equal(carpetaDeEstado("ack"), "salida");
  assert.equal(carpetaDeEstado("blocked"), "eliminados");
  assert.equal(carpetaDeEstado("cancelled"), "eliminados");
  assert.equal(carpetaDeEstado("canceled"), "eliminados");
  assert.equal(carpetaDeEstado("failed"), "eliminados");

  const rawCurso = {
    encargo: 8801,
    estado: "in_progress",
    de: "status-web · JobsGrokBot",
    from_name: "status-web · JobsGrokBot",
    target_persona: "Neo",
    cuando: "2026-11-27T09:00:00Z",
    texto: "Titular: Retoma del preloader de Windows 95",
  };
  const rawBloq = {
    encargo: 8802,
    estado: "blocked",
    de: "status-web · HuangGrokBot",
    from_name: "status-web · HuangGrokBot",
    target_persona: "Oraculo",
    cuando: "2026-11-20T10:00:00Z",
    texto: "Ojos Remotos en AdmiraNeXT04: hace falta acceso de lectura.",
    respuesta: "Bloqueado: falta el acceso de lectura a admira-vault.",
  };
  const rawFail = {
    encargo: 8803,
    estado: "failed",
    de: "status-web · Elon Musk",
    from_name: "status-web · Elon Musk",
    target_persona: "Trinity",
    cuando: "2026-11-21T08:00:00Z",
    texto: "Titular: Prueba del webhook que no llegó a cerrarse",
  };

  const d = construirBandeja({
    bandejas: {
      Neo: [rawCurso, HECHAS_26NOV.find((e) => e.encargo === 7722)],
      Oraculo: [rawBloq],
      Trinity: [rawFail],
    },
    ahora: AHORA,
  });
  assert.equal(d.carpetas.conteo.entrada, 1);
  assert.equal(d.carpetas.entrada[0].encargo, 7722);
  assert.equal(d.carpetas.entrada[0].de, "Neo");
  assert.equal(d.emails.length, 1);

  assert.equal(d.carpetas.conteo.salida, 1);
  const sal = d.carpetas.salida[0];
  assert.equal(sal.de, "Neo");
  assert.equal(sal.para, "Steve Jobs");
  assert.equal(sal.cc, "Carlos Silva");
  assert.match(sal.asunto, /#8801/);
  assert.match(sal.asunto, /en curso/i);
  assert.match(sal.cuerpo, /Estado: en curso/i);
  assert.match(sal.cuerpo, /preloader de Windows 95/i);

  const env = d.carpetas.enviados;
  assert.ok(env.some((e) => e.encargo === 8801 && e.de === "Steve Jobs" && e.para === "Neo"));
  assert.ok(env.some((e) => e.encargo === 7722 && e.de === "Steve Jobs" && e.para === "Neo"));
  assert.ok(env.some((e) => e.encargo === 8802 && e.de === "Jensen Huang" && e.para === "Oráculo"));
  assert.ok(env.some((e) => e.encargo === 8803 && e.de === "Elon Musk" && e.para === "Trinity"));
  assert.ok(env.every((e) => e.cc === "Carlos Silva"));
  const enc = env.find((e) => e.encargo === 8801);
  assert.match(enc.asunto, /^Encargo · #8801/);
  assert.match(enc.cuerpo, /preloader de Windows 95/);

  assert.equal(d.carpetas.conteo.eliminados, 2);
  const bloq = d.carpetas.eliminados.find((e) => e.encargo === 8802);
  assert.equal(bloq.de, "Oráculo");
  assert.equal(bloq.para, "Jensen Huang");
  assert.equal(bloq.estado, "blocked");
  assert.match(bloq.asunto, /No acabada · #8802/);
  assert.match(bloq.cuerpo, /bloqueado/i);
  assert.match(bloq.cuerpo, /admira-vault/);
  const fail = d.carpetas.eliminados.find((e) => e.encargo === 8803);
  assert.equal(fail.de, "Trinity");
  assert.equal(fail.estado, "failed");
  assert.match(fail.cuerpo, /fallido/i);
  assert.ok(!JSON.stringify(d).includes("token="));
});

test("nombreConsejeroFiel lee creado_por, consejero, origen o de sin inventar", () => {
  assert.equal(nombreConsejeroFiel({ creado_por: "JobsGrokBot", de: "status-web" }), "Steve Jobs");
  assert.equal(nombreConsejeroFiel({ consejero: "Walt Disney", target_persona: "Morfeo" }), "Walt Disney");
  assert.equal(nombreConsejeroFiel({ origen: "status-web · Mira Murati" }), "Mira Murati");
  assert.equal(nombreConsejeroFiel({ solicitante: "George Lucas" }), "George Lucas");
  assert.equal(nombreConsejeroFiel({ de: "NeoMacStudio" }), "");
  assert.equal(nombreConsejeroFiel({}), "");
});

test("Win95: las 4 carpetas del Correo Admira son clicables y Enviar y recibir las refresca", () => {
  assert.match(html, /id="mfIn"/);
  assert.match(html, /id="mfOut"/);
  assert.match(html, /id="mfSent"/);
  assert.match(html, /id="mfDel"/);
  assert.match(html, /setMailView\('fin'\)/);
  assert.match(html, /setMailView\('out'\)/);
  assert.match(html, /setMailView\('sent'\)/);
  assert.match(html, /setMailView\('del'\)/);
  assert.match(html, /No hay mensajes en esta carpeta\./);
  assert.match(html, /encargos enviados/);
  assert.match(html, /no acabadas/);
  assert.match(html, /De → Para/);
  assert.match(html, /loadBandeja\(true\); if\(MVIEW==='da'\) loadDaCom\(true\)/);
  assert.match(html, /MAILBOX=\{entrada:\[\],salida:\[\],enviados:\[\],eliminados:\[\]\}/);
  const seed = html.match(/id="bandeja-fallback-seed">([^<]+)</);
  const datos = JSON.parse(seed[1]);
  assert.equal(datos.carpetas.conteo.entrada, 4);
  assert.equal(datos.carpetas.conteo.enviados, 4);
  assert.equal(datos.carpetas.conteo.salida, 0);
  assert.equal(datos.carpetas.conteo.eliminados, 0);
});
