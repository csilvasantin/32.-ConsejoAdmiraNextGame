import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarGrokbotApp, appsGrokBot } from "./consumos-pulso-lib.mjs";
import { colocarPorAppGrokBot } from "./flota-trabajando-lib.mjs";

const AHORA = 1_800_000_000_000;
const doc = (maquina, g) => ({ maquina, grokbotApp: { ...normalizarGrokbotApp({ abierta: true, ...g }), ts: AHORA - 30_000 } });

test("r17: cuentas reales → una entrada por cuenta usada en la última hora; solo la más reciente va al frente", () => {
  const a = appsGrokBot([doc("MacBookProNegro14", { alFrente: true, reposoS: 10, cuenta: "csilva@admira.com",
    cuentas: [{ cuenta: "csilva@admira.com", haceS: 20 }, { cuenta: "csilvasantin@gmail.com", haceS: 900 }] })], AHORA);
  assert.deepEqual(a.map((x) => [x.cuenta, x.alFrente, x.fuente]), [["csilva@admira.com", true, "app"], ["csilvasantin@gmail.com", false, "app"]]);
});

test("r17: Mac Mini con cuentas sin uso reciente y fichero «desconocida» → app abierta, cuenta desconocida, ningún consejero", () => {
  const a = appsGrokBot([doc("MacMini", { cuenta: "desconocida", cuentas: [{ cuenta: "csilva@admira.com", haceS: 70000 }, { cuenta: "csilvasantin@gmail.com", haceS: 120000 }] })], AHORA);
  assert.equal(a.length, 1); assert.equal(a[0].cuenta, null); assert.equal(a[0].fuente, "desconocida");
  const out = colocarPorAppGrokBot([{ agente: "Jobs", estado: "gris", maquina: "MacMini", via: "Smith" }], a);
  assert.equal(out[0].appMaquinas, undefined);
});

test("r17: el fichero manual solo manda si es un correo (forzada); pulsos viejos sin «cuentas» siguen valiendo", () => {
  const f = appsGrokBot([doc("Air", { cuenta: "csilva@admira.com", forzada: true, cuentas: [{ cuenta: "csilvasantin@gmail.com", haceS: 5 }] })], AHORA);
  assert.deepEqual(f.map((x) => [x.cuenta, x.fuente]), [["csilva@admira.com", "forzada"]]);
  const v = appsGrokBot([doc("Air", { cuenta: "csilvasantin@gmail.com" })], AHORA);
  assert.deepEqual(v.map((x) => [x.cuenta, x.fuente]), [["csilvasantin@gmail.com", "fichero"]]);
});

test("r17: el pulso lee solo NOMBRES de la persistencia (no contenido) y el modelo de la matriz se traduce", () => {
  const py = readFileSync(new URL("./fleet/pulso-tokens.py", import.meta.url), "utf8");
  assert.match(py, /def grokbot_cuentas/); assert.match(py, /os\.listdir\(GROKBOT_PERSIST_DIR\)/);
  const cuerpo = py.slice(py.indexOf("def grokbot_cuentas"), py.indexOf("def grokbot_app"));
  assert.doesNotMatch(cuerpo, /open\(/);
  const js = readFileSync(new URL("./assets/consumos-matriz.js", import.meta.url), "utf8");
  assert.match(js, /pool de \(\[\^\)\]\+\)/);
});
