// r30 (GrokBotBox, 09-10-2026): líneas de código de los agentes junto a los tokens, mismo eje de tiempo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cubos, lineasPorCubo, tokensPorCubo, commitsDeFotos, lineasHoy, tokPorLinea, normalizarDoc, inicioDiaMadrid, RANGOS } from "./consumos-lineas-lib.mjs";
import { seriePorMinuto } from "./consumos-pulso-lib.mjs";
import { construir } from "./functions/api/consumos/lineas.js";

const AHORA = Date.parse("2026-10-09T13:47:30Z"); // 15:47:30 Madrid

test("cubos alineados: 1 h = 60 × 1 min, 24 h = 48 × 30 min, 7 d = 42 × 4 h; el último contiene «ahora»", () => {
  for (const [r, { n, pasoMin }] of Object.entries(RANGOS)) {
    const c = cubos(r, AHORA);
    assert.equal(c.length, n, r);
    assert.ok(c[n - 1] <= AHORA && AHORA < c[n - 1] + pasoMin * 60000, r);
    assert.equal(c[1] - c[0], pasoMin * 60000);
  }
  assert.equal(cubos("raro", AHORA).length, 60);
});

test("líneas por cubo, por agente y por proyecto; fuera de rango no cuenta", () => {
  const s = AHORA / 1000;
  const commits = [{ t: s - 30, a: 100, g: "Trinity", r: "admira.studio" }, { t: s - 600, a: 40, g: "Morfeo", r: "admira.tv" },
    { t: s - 610, a: 10, g: "Trinity", r: "admira.studio" }, { t: s - 7200, a: 999, g: "Neo", r: "x" }];
  const l = lineasPorCubo(commits, "1h", AHORA);
  assert.equal(l.total, 150);
  assert.equal(l.serie[59].lineas, 100);
  assert.deepEqual(l.porAgente.map((x) => [x.agente, x.lineas, x.commits]), [["Trinity", 110, 2], ["Morfeo", 40, 1]]);
  assert.equal(lineasPorCubo(commits, "24h", AHORA).total, 1149);
});

test("tokens por cubo: misma suma que la serie por minuto del pulso; antes de la primera muestra → null", () => {
  const s = Math.floor(AHORA / 1000);
  const serie = []; for (let i = 0; i <= 120; i++) serie.push([s - (120 - i) * 60, i * 1000]);
  const ag = [{ serie }];
  const t1 = tokensPorCubo(ag, "1h", AHORA);
  assert.equal(t1.reduce((a, x) => a + (x.tok || 0), 0), seriePorMinuto(ag, AHORA, 60).reduce((a, x) => a + x.tok, 0));
  const t24 = tokensPorCubo(ag, "24h", AHORA);
  assert.equal(t24[0].tok, null, "hace 24 h no había pulso: sin datos, no cero");
  assert.ok(t24[47].tok > 0);
});

test("fotos 00:00/12:00 → Δ escalonado; hoy (Madrid) y tokens por línea", () => {
  const f = commitsDeFotos([{ ts: "2026-10-09T00:01:00+02:00", total: 1000 }, { ts: "2026-10-09T12:01:00+02:00", total: 1500 }]);
  assert.deepEqual(f.map((c) => c.a), [500]);
  assert.equal(new Date(inicioDiaMadrid(AHORA)).toISOString(), "2026-10-08T22:00:00.000Z");
  const h = lineasHoy([{ t: AHORA / 1000 - 3600, a: 7, g: "Neo" }, { t: Date.parse("2026-10-08T21:59:00Z") / 1000, a: 99, g: "Neo" }], AHORA);
  assert.equal(h.total, 7);
  assert.equal(tokPorLinea(70000, 7), 10000);
  assert.equal(tokPorLinea(0, 7), null);
  assert.equal(tokPorLinea(5, 0), null);
});

test("POST normalizado y GET sin datos: dice «ninguna», no inventa", async () => {
  assert.ok(normalizarDoc({}, AHORA).error);
  const { doc } = normalizarDoc({ commits: [{ t: AHORA / 1000, a: "5", g: "Neo", r: "x", s: "abcdef1234567" }, { t: 1, a: 3 }] }, AHORA);
  assert.equal(doc.commits.length, 1);
  assert.equal(doc.commits[0].a, 5);
  const r = await construir({ env: {}, rango: "24h", ahora: AHORA });
  assert.equal(r.fuente, "ninguna");
  assert.equal(r.lineas.total, 0);
  assert.equal(r.tokens.every((x) => x.tok === null), true);
});

test("/consumos: segunda gráfica de líneas con selector 1 h / 24 h / 7 d", () => {
  const html = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.match(html, /id="vel-rango"/);
  assert.match(html, /id="vel-lineas"/);
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.match(js, /\/api\/consumos\/lineas\?rango=/);
});
