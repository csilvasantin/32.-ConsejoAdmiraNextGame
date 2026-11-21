// r232 (Carlos, 21-11 21:37): «esta Trinity a tope y aparece en rojo y además no está en el cli del MacStudio sino en la desktop app».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { aplicarMedicionCiega, porqueColor } from "./flota-trabajando-lib.mjs";

const trinity = () => ({ agente: "Trinity", estado: "rojo", consejero: false, maquina: "MacStudio", sinMedicion: true, ultimaActividad: null, ultimoToken: null,
  superficies: [{ tipo: "cli", maquina: "MacBookPro16", runtime: "Codex CLI", fuente: "pulso" }, { tipo: "app", maquina: "MacStudio", app: "Codex", enUso: false, fuente: "pulso" }] });

test("app de escritorio abierta en su Mac y el pulso de ese Mac nunca vio actividad → ciego (estado no cambia)", () => {
  const [t] = aplicarMedicionCiega([trinity()]);
  assert.equal(t.estado, "rojo");
  assert.equal(t.ciego.app, "Codex"); assert.equal(t.ciego.maquina, "MacStudio");
  assert.match(porqueColor(t, 1795293600), /el pulso de ese Mac no ve sus sesiones/);
});

test("no es ciego si el pulso vio actividad, si hay tokens, si la app está en otro Mac o si es consejero", () => {
  const casos = [{ ultimaActividad: "2026-11-08T11:49:09Z" }, { sinMedicion: false }, { ultimoToken: "2026-11-21T19:00:00Z" }, { maquina: "MacMini" }, { consejero: true }, { estado: "verde" }];
  for (const c of casos) assert.equal(aplicarMedicionCiega([{ ...trinity(), ...c }])[0].ciego, undefined, JSON.stringify(c));
});

test("página: la superficie corta es la del Mac mostrado (Trinity // MacStudio → App, no CLI del MBP16) y el chip ciego no dice «hace 3 h»", () => {
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /var m = maqActual\(t\), aqui = m \? l\.filter/);
  assert.match(js, /function chipCiego\(t\)/);
  assert.match(js, /actividad no medible/);
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /\.tr-chipa\.tr-ciego i\{background:#5fd3ff/);
  assert.match(html, /consumos-trabajando\.js\?v=20261121-r241-verde-gana/);
});
