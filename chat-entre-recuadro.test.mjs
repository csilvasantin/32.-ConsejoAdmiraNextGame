import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COLOR, colorDe, cortoDe, detectarHablante, hablanteDe, interlocutorDe,
  parClave, esDialogoConsejeros, agruparConversaciones, agruparMix, fraseVista,
  horaMadrid,
} from "./chat-entre-recuadro.mjs";

const ELON = {
  id: "cmmwdla5cbqilaw2",
  de: "Musk",
  para: "Jobs",
  texto: "🔴 EN DIRECTO Ya estamos en Chrome y a pantalla completa. Steve, ¿qué ve el visitante en los primeros diez segundos?",
  hora: "2026-11-12T13:34:10Z",
};
const JOBS_MAL_FIRMADO = {
  id: "cmmwdlalr0rr7rqu",
  de: "Musk",
  para: "Jobs",
  texto: "🔴 EN DIRECTO Hola, Carlos, soy Steve Jobs. Una sola cosa, Elon: su nombre en la pantalla, dándole la bienvenida.",
  hora: "2026-11-12T13:34:31Z",
};
const DEMO_1412 = [
  { id: "cmmwdkid5esemhc6", de: "Musk", para: "Jobs", texto: "🔴 EN DIRECTO Nueva ronda en directo. Steve, si solo pudiéramos enseñar una atracción en la demo, ¿cuál sería?", hora: "2026-11-12T13:12:05Z" },
  { id: "cmmwdkilsbw5kc82", de: "Musk", para: "Jobs", texto: "🔴 EN DIRECTO Hola, Carlos, soy Steve Jobs. La que el visitante cuente al volver a casa, Elon. Esa es la única que importa.", hora: "2026-11-12T13:12:18Z" },
];

test("colores: Elon azul #39f, Jobs dorado #f93, y el resto definido", () => {
  assert.equal(COLOR.Musk, "#39f");
  assert.equal(COLOR.Jobs, "#f93");
  assert.equal(colorDe("Elon Musk"), "#39f");
  assert.equal(colorDe("Steve Jobs"), "#f93");
  assert.equal(colorDe("Huang"), "#76b900");
  assert.equal(colorDe("Wozniak"), "#4ec3e0");
  assert.equal(colorDe("Disney"), "#e23d28");
  assert.equal(colorDe("Lucas"), "#f5c518");
  assert.ok(colorDe("Cook") && colorDe("Cook").startsWith("#"));
  assert.ok(colorDe("Murati").startsWith("#"));
  assert.equal(cortoDe("Musk"), "Elon");
  assert.equal(cortoDe("Jobs"), "Jobs");
});

test("detectarHablante: «soy Steve Jobs» y «Jobs:» aunque de=Musk", () => {
  assert.equal(detectarHablante("Hola, Carlos, soy Steve Jobs. Una sola cosa."), "Jobs");
  assert.equal(detectarHablante("🔴 EN DIRECTO Hola, Carlos, soy Steve Jobs. Hola."), "Jobs");
  assert.equal(detectarHablante("soy Elon Musk. Ya estamos."), "Musk");
  assert.equal(detectarHablante("Jobs: Una sola cosa, Elon."), "Jobs");
  assert.equal(detectarHablante("Elon: Hecho, Steve."), "Musk");
  assert.equal(hablanteDe(JOBS_MAL_FIRMADO), "Jobs");
  assert.equal(hablanteDe(ELON), "Musk");
  assert.equal(interlocutorDe(JOBS_MAL_FIRMADO), "Musk");
  assert.equal(parClave(ELON), "Jobs|Musk");
  assert.equal(parClave(JOBS_MAL_FIRMADO), "Jobs|Musk");
  assert.equal(esDialogoConsejeros(ELON), true);
  // Una frase que menciona «así:» no se toma por etiqueta de hablante.
  assert.equal(detectarHablante("Pues la medimos así: cuántas veces la cuentan."), "");
});

test("agruparConversaciones: Musk y Jobs seguidos van en UN recuadro, con hora inicio/fin y hora de cada frase", () => {
  const g = agruparConversaciones([ELON, JOBS_MAL_FIRMADO]);
  assert.equal(g.length, 1);
  assert.equal(g[0].tipo, "grupo");
  assert.equal(g[0].par, "Jobs|Musk");
  assert.equal(g[0].titulo, "Jobs ↔ Elon");
  assert.equal(g[0].horaDesde, "14:34:10"); // 13:34:10Z = 14:34:10 Madrid (CET)
  assert.equal(g[0].horaHasta, "14:34:31");
  assert.equal(g[0].frases.length, 2);
  assert.equal(g[0].frases[0].hablante, "Musk");
  assert.equal(g[0].frases[0].corto, "Elon");
  assert.equal(g[0].frases[0].color, "#39f");
  assert.equal(g[0].frases[0].hora, "14:34:10");
  assert.equal(g[0].frases[0].directo, true);
  assert.equal(g[0].frases[0].texto, "Ya estamos en Chrome y a pantalla completa. Steve, ¿qué ve el visitante en los primeros diez segundos?");
  assert.doesNotMatch(g[0].frases[0].texto, /EN DIRECTO|🔴/);
  assert.equal(g[0].frases[1].hablante, "Jobs");
  assert.equal(g[0].frases[1].color, "#f93");
  assert.equal(g[0].frases[1].hora, "14:34:31");
  assert.match(g[0].frases[1].texto, /^Hola, Carlos, soy Steve Jobs/);
  assert.doesNotMatch(g[0].frases[1].texto, /EN DIRECTO|🔴/);
});

test("la demo de 14:12 también se agrupa y Jobs se detecta aunque de=Musk", () => {
  const g = agruparConversaciones(DEMO_1412);
  assert.equal(g.length, 1);
  assert.equal(g[0].frases[0].hablante, "Musk");
  assert.equal(g[0].frases[1].hablante, "Jobs");
  assert.equal(g[0].horaDesde, "14:12:05");
  assert.equal(g[0].horaHasta, "14:12:18");
});

test("otro par o un agente corta el recuadro; dos diálogos del mismo par separados son dos recuadros", () => {
  const disney = { id: "d1", de: "Disney", para: "Huang", texto: "Que se vea.", hora: "2026-11-12T13:35:00Z" };
  const otra = { id: "e2", de: "Musk", para: "Jobs", texto: "Volvemos.", hora: "2026-11-12T13:36:00Z" };
  const g = agruparConversaciones([ELON, JOBS_MAL_FIRMADO, disney, otra]);
  assert.equal(g.length, 3);
  assert.equal(g[0].tipo, "grupo");
  assert.equal(g[0].frases.length, 2);
  assert.equal(g[1].par, "Disney|Huang");
  assert.equal(g[1].frases[0].color, COLOR.Disney);
  assert.equal(g[2].par, "Jobs|Musk");
  assert.equal(g[2].frases[0].texto, "Volvemos.");
});

test("agruparMix respeta los turnos del hilo de Carlos en medio", () => {
  const mix = [
    { tipo: "entre", m: ELON, ts: Date.parse(ELON.hora) },
    { tipo: "entre", m: JOBS_MAL_FIRMADO, ts: Date.parse(JOBS_MAL_FIRMADO.hora) },
    { tipo: "hilo", t: { id: "h1", rol: "carlos", texto: "Sigo aquí" }, ts: Date.parse("2026-11-12T13:40:00Z") },
  ];
  const out = agruparMix(mix);
  assert.equal(out.length, 2);
  assert.equal(out[0].tipo, "grupo");
  assert.equal(out[0].frases.length, 2);
  assert.equal(out[1].tipo, "hilo");
});

test("fraseVista pone la hora HH:MM:SS Madrid visible, no vacía", () => {
  const f = fraseVista(ELON);
  assert.equal(f.hora, "14:34:10");
  assert.match(f.hora, /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(horaMadrid(Date.parse(ELON.hora)), "14:34:10");
});

test("el CSS y el HTML cargan el recuadro y la hora visible junto a la frase", () => {
  const css = readFileSync(new URL("./council-grokbot.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("./council-grokbot.js", import.meta.url), "utf8");
  const entre = readFileSync(new URL("./assets/consejero-mensajes.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(css, /council-chat__conv/);
  assert.match(css, /council-chat__conv-hora/);
  assert.match(js, /agruparMix/);
  assert.match(js, /council-chat__conv-hora/);
  assert.match(entre, /agruparConversaciones/);
  assert.match(entre, /hablanteDe/);
  assert.match(html, /consejero-mensajes\.js\?v=20261112-recuadro-conv/);
  assert.match(html, /council-grokbot\.js\?v=20261112-recuadro-conv/);
  assert.match(html, /council-grokbot\.css\?v=20261112-recuadro-conv/);
});

test("el panel refresca la transcripción cada ~1 s, no cada 15 s", () => {
  const entre = readFileSync(new URL("./assets/consejero-mensajes.js", import.meta.url), "utf8");
  const grok = readFileSync(new URL("./council-grokbot.js", import.meta.url), "utf8");
  const hilo = readFileSync(new URL("./assets/chat-hilo-client.js", import.meta.url), "utf8");
  assert.match(entre, /ENTRE_SONDEO_MS = 1000/);
  assert.doesNotMatch(entre, /setInterval\(cargar, 15000\)/);
  assert.match(grok, /ENTRE_SONDEO_MS\)\|\|1000/);
  assert.doesNotMatch(grok, /,15000\)/);
  assert.match(hilo, /RAPIDO_MS = 1000/);
  assert.match(grok, /esConsejero/);
  assert.match(entre, /Solo voces de consejeros/);
});
