import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const VISIBLES = ["Elon Musk", "Jensen Huang", "Gwynne Shotwell", "Jony Ive", "John Lasseter", "Ryan Reynolds"];

function placas(src) {
  const block = src.split("coetaneos: [")[1].split("],")[0];
  return [...block.matchAll(/persona:\s*"([^"]+)"/g)].map((m) => m[1]);
}

test("la mesa de coetáneos enseña seis consejeros y no sienta a Ruth ni a Ratti", () => {
  for (const file of ["app.flt-100529.js", "app.js"]) {
    const src = fs.readFileSync(file, "utf8");
    assert.deepEqual(placas(src), VISIBLES, file);
    assert.match(src, /if \(persona === "Carlos"\) return;/);
    assert.match(src, /data-persona="Carlos"/);
    assert.match(src, /setNameplatesVisible\(gen === "coetaneos"\)/);
    assert.match(src, /COUNCIL_IMAGE_VERSION = "20261108-coetaneos-siete"/);
    assert.match(src, /persona: "Ruth Porat"/);
    assert.match(src, /persona: "Carlos Ratti"/);
  }
});

test("las siluetas de coetáneos siguen a las seis sillas y a Carlos, sin Ruth ni Ratti", () => {
  const raw = fs.readFileSync("assets/council-silhouettes.js", "utf8");
  const data = JSON.parse(raw.split("=").slice(1).join("=").trim().replace(/;$/, ""));
  assert.deepEqual(Object.keys(data.coetaneos.paths), [...VISIBLES, "Carlos"]);
  for (const name of VISIBLES.concat("Carlos")) {
    assert.match(data.coetaneos.paths[name], /^M\d+ \d+(?: L\d+ \d+){5,} Z$/);
  }
});

test("la presencia no vuelve a pintar la placa vieja de coetáneos", () => {
  const meta = JSON.parse(fs.readFileSync("assets/consejo-vacio/meta.json", "utf8"));
  assert.equal(meta.coetaneos.sinPlaca, true);
  assert.equal(meta.coetaneos.cutouts["Ruth Porat"], undefined);
  assert.equal(meta.coetaneos.cutouts["Carlos Ratti"], undefined);
  assert.match(fs.readFileSync("assets/council-presencia.js", "utf8"), /g\.sinPlaca/);
  assert.equal(meta.leyendas.sinPlaca, undefined);
});
