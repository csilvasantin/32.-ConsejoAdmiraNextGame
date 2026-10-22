import test from "node:test";
import assert from "node:assert/strict";
import { colocarPorAppGrokBot, usoAppReciente } from "./flota-trabajando-lib.mjs";

const app = (o) => ({ maquina: "MacMini", cuenta: "csilvasantin@gmail.com", alFrente: false, reposoS: 900, haceS: 30, usoS: 20, fuente: "app", ...o });

test("r51: Musk gris vía Merovingio + su app en uso hace 20 s → verde", () => {
  const out = [{ agente: "Musk", estado: "gris", motivo: "parado vía Merovingio", via: "Merovingio", maquina: "GrokBot" }];
  colocarPorAppGrokBot(out, [app()]);
  assert.equal(out[0].estado, "verde");
  assert.match(out[0].motivo, /app GrokBot trabajando/);
  assert.equal(out[0].fuente, "app_grokbot");
});

test("r51: uso viejo (> 2 min) no enciende", () => {
  const out = [{ agente: "Musk", estado: "gris", motivo: "parado vía Merovingio", via: "Merovingio", maquina: "GrokBot" }];
  colocarPorAppGrokBot(out, [app({ usoS: 600 })]);
  assert.equal(out[0].estado, "gris");
});

test("r52: con Carlos + app en uso → VERDE gana (consejero)", () => {
  const out = [{ agente: "Musk", estado: "gris", motivo: "x", via: "Merovingio", maquina: "GrokBot" }];
  colocarPorAppGrokBot(out, [app({ alFrente: true, reposoS: 10 })]);
  assert.equal(out[0].estado, "verde");
  assert.equal(out[0].fuente, "app_grokbot");
  assert.match(out[0].motivo, /app GrokBot trabajando.*con Carlos en Mini/);
});

test("r52: con Carlos sin uso reciente de la app sigue amarillo", () => {
  const out = [{ agente: "Musk", estado: "gris", motivo: "x", via: "Merovingio", maquina: "GrokBot" }];
  colocarPorAppGrokBot(out, [app({ alFrente: true, reposoS: 10, usoS: 600 })]);
  assert.equal(out[0].estado, "amarillo");
});

test("r51: la cuenta compartida no enciende a Huang", () => {
  assert.equal(usoAppReciente("Huang", [app()]), null);
  assert.deepEqual(usoAppReciente("Musk", [app()]), { maquina: "MacMini", usoS: 20 });
});
