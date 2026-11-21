// r226 (Carlos, 21-11-2026): «por defecto siempre es Toda la Flota y Todos los Proyectos para que el número sea muy
// grande, siempre tenemos que hablar de lo máximo posible».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");

test("arranque: agente '' (Toda la flota) y proyecto TODOS; lo guardado en localStorage no se lee y se borra", () => {
  assert.match(js, /proyecto: TODOS, agente: '', d1: null/);
  assert.ok(!/lsGet\(LS_PROY\)|lsGet\(LS_AG\)/.test(js), "ya no se recupera auto ni un agente guardado");
  assert.match(js, /removeItem\('consumos\.vel\.proyecto'\); root\.localStorage\.removeItem\('consumos\.vel\.agente'\)/);
});

test("«Todos los proyectos» es la 1.ª opción del selector de proyectos y «Automático» la 2.ª", () => {
  const i = js.indexOf("var items = [{ valor: TODOS"), j = js.indexOf("{ valor: AUTO, estado: elegido", i);
  assert.ok(i > 0 && j > i);
});

test("«Toda la flota» es la 1.ª del de agentes; «Automático» es opción aparte y solo manda si se elige", () => {
  assert.match(js, /items\.push\(\{ valor: AUTO, estado: ''/);
  assert.match(js, /if \(estado\.agente !== AUTO\) return '';/);
  assert.match(js, /function agenteVer\(d\) \{ return estado\.agente === AUTO \? agUnico\(d\) : estado\.agente; \}/);
  assert.match(js, /DD\.ag\.pon\(items, estado\.agente \|\| ''\);/);
});

test("el total usa la cadena honesta de r225 (15 min → última hora → Cursor → sin dato en vivo) y una escala que lo abarca", () => {
  assert.match(js, /function ritmoTotal\(d, sin\)/);
  assert.match(js, /var vivo = v15 > 0 \? v15 : vH, total = vivo \+ cur, fuente;/, "en vivo (15 min → última hora) + ventana de Cursor");
  assert.match(js, /total = hayVerdes\(\) \? null : 0; fuente = total == null \? 'sinvivo' : null;/, "sin nada medido: «sin dato en vivo» o 0");
  assert.match(js, /if \(nombre === TODOS\) return pintaTodos\(d, sin, lista\);/);
  assert.match(js, /function escalaTotal\(d, v\)/);
  // escala: 1,25 × max(pico 24 h, cifra), mínimo 2 M
  const ctx = {};
  const esc = new Function("return " + js.match(/function escala\(pico, minimo\) \{[\s\S]*?\n  \}/)[0])();
  const escalaTotal = (d, v) => esc(Math.max(Number(d && d.pico24h) || 0, Number(v) || 0) / 1.5 * 1.25, 2e6);
  assert.equal(escalaTotal({ pico24h: 505896 }, 56009), 2e6);
  assert.ok(escalaTotal({ pico24h: 505896 }, 3.1e6) >= 3.1e6 * 1.25);
  void ctx;
});
