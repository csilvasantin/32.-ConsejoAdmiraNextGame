import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activosDeFlota } from "./flota-trabajando-lib.mjs";

test("#7056: «Agentes (x/y)»: x = tokens en los últimos 15 min, y = conectados a la flota", () => {
  const ts = [
    { agente: "Trinity", estado: "verde", tokHora: 2364808, tokUltimaHora: 1000 },
    { agente: "Neo", estado: "verde", tokHora: 279216, tokUltimaHora: 500 },
    { agente: "Oráculo", estado: "verde", motivo: "latido y encargo", tokHora: 0 },
    { agente: "Jobs", estado: "verde", motivo: "latido del consejero", tokHora: null },
    { agente: "Merovingio", estado: "gris", tokUltimaHora: 40 },
    { agente: "Mouse", estado: "verde", tokHora: 10 },
    { agente: "Smith", estado: "gris", tokHora: 0 },
    { agente: "Musk", estado: "gris", motivo: "vía Merovingio (parado)", tokHora: 9 },
  ];
  const a = activosDeFlota(ts, {});
  assert.equal(a.nTrabajando, 3);
  assert.equal(a.nConectados, 6);
  assert.equal(a.nAgentes, 6);
  assert.equal(a.total, 7);
});

test("#7056: el rótulo es Agentes (x/y) y el desplegable dice «trabajando · conectados de»", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /T\('Agentes', 'Agents'\) \+ ' \(' \+ xy\(nAgTrab\(\), nAgCon\(\)\) \+ '\)'/);
  assert.match(js, /T\('trabajando', 'working'\)/);
  assert.match(js, /T\('conectados', 'connected'\)/);
  assert.match(js, /T\('de ', 'of '\)/);
  assert.doesNotMatch(js, /\(trabajando \/ conectados\)/);
  assert.doesNotMatch(js, /'agentes activos', activos === 1/);
  assert.match(readFileSync(new URL("./consumos.html", import.meta.url), "utf8"), /Agentes \(0\/0\)/);
});
