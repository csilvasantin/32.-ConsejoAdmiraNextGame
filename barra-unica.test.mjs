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
  assert.match(tabs, /id="badge-comunicaciones" href="\/deepagents"/);
});

test("admira-bar.js: misma fila plana, opciones a la izquierda del todo", () => {
  const js = readFileSync("admira-bar.js", "utf8");
  const top = js.slice(js.indexOf("var TOP = ["), js.indexOf("];", js.indexOf("var TOP = [")));
  assert.deepEqual([...top.matchAll(/h: "([^"]+)"/g)].map((m) => norm(m[1])), ORDEN);
  assert.match(top, /DeepAgents.*id: "badge-comunicaciones"/);
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

test("el contador de DeepAgents se pinta como insignia en las tres barras", () => {
  const w = readFileSync("comunicaciones-widget.js", "utf8");
  assert.match(w, /admira-da-n/);
  assert.match(w, /window\.AdmiraDeepAgentsContador/);
  assert.match(readFileSync("admira-bar.js", "utf8"), /comunicaciones-widget\.js/);
  assert.match(readFileSync("yk-frame.js", "utf8"), /comunicaciones-widget\.js/);
});
