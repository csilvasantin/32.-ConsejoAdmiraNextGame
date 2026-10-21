import test from "node:test";
import assert from "node:assert/strict";
import { activosDeFlota, normProyecto } from "./flota-trabajando-lib.mjs";
import { proyectosDePulso } from "./consumos-pulso-lib.mjs";

test("r47: activos = latido trabajando ∪ tokens última hora; proyectos de su dato, sin inventar", () => {
  const ts = [
    { agente: "Oráculo", estado: "verde", motivo: "latido", maquina: "MacMini", proyecto: null, tokUltimaHora: 0 },
    { agente: "Neo", estado: "verde", motivo: "latido", maquina: "MacStudio", proyecto: "admira.store" },
    { agente: "Morfeo", estado: "gris", maquina: "MacMini", proyecto: "admira.tv", tokUltimaHora: 5 },
    { agente: "Smith", estado: "gris", maquina: "MacMini", proyecto: "yokup", tokUltimaHora: 0 },
    { agente: "Musk", estado: "gris", motivo: "vía Merovingio (parado)", tokUltimaHora: 9 },
  ];
  const a = activosDeFlota(ts, { porProyecto: [{ proyecto: "admiranext.com", tokUltimaHora: 3 }] });
  assert.deepEqual(a.agentes.map((x) => x.agente), ["Oráculo", "Neo", "Morfeo"]);
  assert.deepEqual(a.proyectos.map((p) => p.proyecto).sort(), ["admira.store", "admira.tv", "admiranext.com"]);
  assert.equal(a.total, 4);
  assert.equal(a.maquinas.Neo, "MacStudio");
  assert.equal(normProyecto("www.admiranext.com"), "admiranext.com");
  assert.equal(normProyecto("admiranext", ["admiranext.com"]), "admiranext.com");
  assert.equal(normProyecto("otros"), null);
});

test("r47: proyectosDePulso da tokUltimaHora por proyecto", () => {
  const ahora = Date.UTC(2026, 9, 21, 20, 0, 0), s = (m) => Math.floor((ahora - m * 60000) / 1000);
  const docs = [{ maquina: "MacMini", agentes: { Morfeo: { tokHoy: 300, ultimoPulso: ahora, porProyecto: { "admira.tv": 300 },
    serie: [[s(50), 100, 0, { "admira.tv": 100 }], [s(30), 300, 0, { "admira.tv": 300 }], [s(1), 300, 0, { "admira.tv": 300 }]] } } }];
  const p = proyectosDePulso(docs, ahora).find((x) => x.proyecto === "admira.tv");
  assert.equal(p.tokUltimaHora, 200);
  assert.equal(p.tokHora, 0);
});
