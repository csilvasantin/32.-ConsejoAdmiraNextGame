// Barra única de admira.live (Carlos, 21-11-2026): «la barra superior igual en TODAS las
// páginas … mover el icono de opciones a la izquierda del todo para que quepa comunicaciones
// que se llama DeepAgents y va antes de Consumo». Las tres superficies que pintan la barra
// —home (index.html), subpáginas (admira-bar.js) y plataforma (yk-frame.js)— deben llevar las
// mismas pestañas en el mismo orden, con Opciones a la izquierda del todo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ORDEN = ["/dashboard", "/objetivos", "/decisiones", "/misiones", "/tareas", "/highscore",
  "/asignaciones", "/deepagents", "/consumos"];
const norm = (h) => h.replace(/^https:\/\/www\.admira\.live/, "").replace(/\/$/, "");

test("home: opciones primero y las pestañas en el orden canónico (DeepAgents antes de Consumo)", () => {
  const html = readFileSync("index.html", "utf8");
  const bar = html.slice(html.indexOf('<div class="top-bar">'), html.indexOf('<div class="pf-toggles">'));
  assert.ok(bar.indexOf('id="pf-ic-opcion"') < bar.indexOf("brand-logo"), "opciones va antes de la marca");
  const tabs = bar.slice(bar.indexOf('<nav class="top-tabs"'));
  const hrefs = [...tabs.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => norm(m[1])).filter((h) => !/usuarios/.test(h));
  assert.deepEqual(hrefs, ORDEN);
  assert.match(tabs, /<a href="\/deepagents"[^>]*>🤖 DeepAgents<\/a>/);
});

test("admira-bar.js: misma fila plana, opciones a la izquierda del todo", () => {
  const js = readFileSync("admira-bar.js", "utf8");
  const top = js.slice(js.indexOf("var TOP = ["), js.indexOf("];", js.indexOf("var TOP = [")));
  assert.deepEqual([...top.matchAll(/h: "([^"]+)"/g)].map((m) => norm(m[1])), ORDEN);
  assert.doesNotMatch(top, /badge-comunicaciones/);
  assert.match(js, /#pf-opciones\{order:-3/);
  assert.match(js, /top\.insertBefore\(wrap, top\.firstChild\)/);
  assert.doesNotMatch(js, /Flujo ▾|Flota ▾/);
  // el cruce de la cuadratura (opciones a la derecha) ya no existe
  assert.doesNotMatch(js, /\.rail\.rail-left\{left:auto/);
});

test("yk-frame.js: APP_NAV con el mismo orden y Opciones como primer icono", () => {
  const js = readFileSync("yk-frame.js", "utf8");
  const nav = js.slice(js.indexOf("var APP_NAV = ["), js.indexOf("];", js.indexOf("var APP_NAV = [")));
  assert.deepEqual([...nav.matchAll(/\["[A-Z]+",\s*"([^"]+)"/g)].map((m) => norm(m[1])), ORDEN);
  const b = js.indexOf("bar.appendChild(icoL);");
  assert.ok(b > 0 && b < js.indexOf("bar.appendChild(logo);"), "opciones antes del logo");
  // lo que sale de la fila sigue a un clic en el raíl Opciones
  for (const r of ["/incidencias", "/supervisor", "/informes-flota", "/notificaciones", "/comunicaciones"]) {
    assert.match(js.slice(js.indexOf("var APP_NAV_OPCIONES")), new RegExp('"' + r + '"'));
  }
});

// Carlos, 21-11-2026 (r224): «el numero de conversaciones no tiene que aparecer en el menu superior
// y la selección de idioma se hace al entrar con lo que tampoco tiene que estar en el menu superior».
test("la barra no lleva el número de DeepAgents ni el botón de idioma", () => {
  const home = readFileSync("index.html", "utf8");
  const bar = readFileSync("admira-bar.js", "utf8");
  const marco = readFileSync("yk-frame.js", "utf8");
  for (const [n, src] of [["home", home], ["admira-bar", bar], ["yk-frame", marco]]) {
    assert.doesNotMatch(src, /comunicaciones-widget\.js|badge-comunicaciones|admira-da-n/, n + " pinta el contador");
  }
  assert.doesNotMatch(marco, /buildLangButton|yk-lang|yk-ico-lang/, "el marco pinta el botón de idioma");
  assert.doesNotMatch(readFileSync("yk-frame.css", "utf8"), /yk-ico-lang|admira-da-n/);
  // el idioma elegido al entrar se sigue aplicando: el marco carga admira-idioma.js
  assert.match(marco, /expertScript\("\/admira-idioma\.js\?v=" \+ EXPERT_CMD_V, "AdmiraIdioma"\)/);
});

// Carlos, 21-11-2026 (r224): fuera «ADMIRA.LIVE · CANAL MCP»; DeepAgents con flecha que despliega el
// texto (contraído por defecto) y, a su altura, la hora real de lectura de los agentes.
test("DeepAgents: sin CANAL MCP, texto plegado tras la flecha y hora de lectura en la misma línea", () => {
  const h = readFileSync("deepagents/index.html", "utf8");
  const js = readFileSync("deepagents/deepagents.js", "utf8");
  assert.doesNotMatch(h, /CANAL MCP/i);
  const linea = h.slice(h.indexOf('<div class="cab-linea">'), h.indexOf("</div>", h.indexOf('<div class="cab-linea">')));
  assert.match(linea, /<h1>DeepAgents<\/h1>/);
  assert.match(linea, /<button type="button" class="plegar" id="da-plegar" aria-expanded="false" aria-controls="da-lead"/);
  assert.match(linea, /id="lectura-hora"/);
  assert.match(h, /<p class="lead" id="da-lead" hidden>/);
  assert.match(js, /\$\("lectura-hora"\)\.textContent = flota\.generado \?/);
  assert.match(js, /\$\("da-lead"\)\.hidden = !abrir/);
});
