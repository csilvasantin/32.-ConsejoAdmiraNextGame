// r243 (Carlos, 21-11-2026 23:17): «arregla los Consejeros que aparecen 0 de 6 y estan todos».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aplicarConsejerosAbiertos, aplicarRojo, porqueColor, CUENTA_GROKBOT } from "./flota-trabajando-lib.mjs";

const T = Math.floor(Date.parse("2026-11-21T22:18:00Z") / 1000);
// Datos reales de las 23:18 (Madrid): Grok Bot csilva@admira.com abierto en MacStudio y MacMini; csilvasantin@gmail.com en MBP16.
const apps = [
  { maquina: "MacMini", cuenta: "csilva@admira.com", haceS: 48, usoS: 114, fuente: "app" },
  { maquina: "MacBookPro16", cuenta: "csilvasantin@gmail.com", haceS: 48, usoS: 2582, fuente: "app" },
  { maquina: "MacStudio", cuenta: "csilva@admira.com", haceS: 43, usoS: 0, fuente: "app" },
];
const ficha = (agente, o = {}) => ({ agente, estado: "gris", motivo: "sin tokens ni app en uso", consejero: true, grupo: "consejeros", ...o });

test("r243: Lucas y Disney están en la cuenta Leyendas con Jobs y Wozniak; Musk y Huang en Coetáneos", () => {
  assert.equal(CUENTA_GROKBOT.Lucas, "csilva@admira.com");
  assert.equal(CUENTA_GROKBOT.Disney, "csilva@admira.com");
  assert.equal(CUENTA_GROKBOT.Huang, "csilvasantin@gmail.com");
});

test("r243: los 6 consejeros con su Grok Bot abierto → verde «abierto» (y aplicarRojo no los toca)", () => {
  const ts = ["Jobs", "Wozniak", "Musk", "Lucas", "Disney", "Huang"].map((n) => ficha(n, { actividad: { ts: T - 3600 * 3, fuente: "mensaje de consejero" } }));
  aplicarConsejerosAbiertos(ts, apps, T); aplicarRojo(ts, T);
  for (const t of ts) assert.equal(t.estado, "verde", t.agente);
  assert.match(ts.find((t) => t.agente === "Lucas").abiertoApp, /^Grok Bot abierto en Mini \+ MacStudio \(cuenta Leyendas\)$/);
  assert.match(ts.find((t) => t.agente === "Huang").abiertoApp, /MBP16 \(cuenta Coetáneos\)/);
  assert.match(porqueColor(ts[0], T), /^abierto: Grok Bot abierto/);
});

test("r243: actividad propia < 15 min → verde «trabajando» (sin etiqueta de abierto)", () => {
  const [t] = aplicarConsejerosAbiertos([ficha("Jobs", { actividad: { ts: T - 300, fuente: "mensaje de consejero" } })], apps, T);
  assert.equal(t.estado, "verde"); assert.equal(t.abiertoApp, undefined); assert.match(t.motivo, /mensaje de consejero hace 5 min/);
});

test("r243: sin app de su cuenta (o vista hace > 15 min) ni actividad reciente → sigue rojo/gris; amarillo no se toca", () => {
  const ts = [ficha("Lucas", { actividad: { ts: T - 7200, fuente: "encargo cerrado" } }), ficha("Huang"), ficha("Jobs", { estado: "amarillo" })];
  aplicarConsejerosAbiertos(ts, [{ maquina: "MacStudio", cuenta: "csilva@admira.com", haceS: 2000 }], T);
  aplicarRojo(ts, T);
  const de = (n) => ts.find((t) => t.agente === n).estado;
  assert.equal(de("Lucas"), "rojo"); assert.equal(de("Huang"), "gris"); assert.equal(de("Jobs"), "amarillo");
  const noGrok = [{ agente: "Neo", estado: "gris" }];
  aplicarConsejerosAbiertos(noGrok, apps, T);
  assert.equal(noGrok[0].estado, "gris");
});

test("r243: cliente — chip «Grok Bot abierto», cuenta como abierto en el contador; barra y rótulos dicen «abierto»", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /chipAbiertoApp\(t\)/);
  assert.match(js, /t\.estado === 'verde' && \(t\.abiertoDA \|\| t\.abiertoApp\)/);
  assert.match(readFileSync(new URL("./assets/barra-agentes.js", import.meta.url), "utf8"), /t\.abiertoApp \|\| t\.abiertoDA \? T\("abierto"/);
  assert.match(readFileSync(new URL("./assets/consejo-rotulo.js", import.meta.url), "utf8"), /t\.abiertoApp \? "abierto"/);
});
