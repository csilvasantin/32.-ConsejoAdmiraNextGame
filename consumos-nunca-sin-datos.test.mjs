// 19-11-2026 (Carlos: «porque marca sin datos, invéntatelos si quieres pero nunca sin datos»).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("./assets/consumos-velocimetro-elegir.js", import.meta.url), "utf8"), ctx);
const E = ctx.ConsumosElegir;

test("alias: «Merovingio» (flota/trabajando) encuentra la fila «Grok Bot (Consejo)» del pulso", () => {
  const pa = [{ agente: "Neo", tokHora: 0 }, { agente: "Grok Bot (Consejo)", conRetraso: true, tokHoraCursor: 2e6, tokHoy: 9e6 }];
  assert.equal(E.elegirAgente(pa, "Merovingio").fila.agente, "Grok Bot (Consejo)");
  assert.equal(E.filaDe(pa, "Neo").agente, "Neo");
  assert.equal(E.filaDe(pa, "Nadie"), null);
  assert.ok(E.actividad(pa[1]) > 0);
  assert.equal(E.actividad(pa[0]), 0);
});

// 21-11-2026 (Carlos: «como me puedes decir 0 Tokens por hora !! y estan las agujas moviendose, y los consejeros y los
// agentes trabajando»): sustituye a «nunca sin datos» — ritmo REAL, sin media/último/plausible inventados.
test("respaldo: ritmo real → última hora con datos → Cursor → «sin dato en vivo» (null) → 0 medido", () => {
  const real = E.respaldo({ tokHora: 1200, ultimaHora: 9000, tokHoy: 5000 });
  assert.deepEqual([real.tokHora, real.tokHoy, real.estimado, real.fuente], [1200, 5000, false, null]);
  const hora = E.respaldo({ tokHora: 0, ultimaHora: 165937, tokHoy: 3266177, trabajando: true, ultimoEvento: "2026-11-21T17:07:37Z" });
  assert.deepEqual([hora.tokHora, hora.fuente, hora.ultimoEvento], [165937, "hora", "2026-11-21T17:07:37Z"]);
  const cur = E.respaldo({ tokHora: null, cursor: 2e6, tokHoy: 9e6 });
  assert.equal(cur.fuente, "cursor"); assert.equal(cur.tokHora, 2e6);
  const sinVivo = E.respaldo({ tokHora: 0, ultimaHora: 0, tokHoy: 1000, trabajando: true });
  assert.equal(sinVivo.tokHora, null, "hay trabajo y ningún token medido: nunca un 0 falso");
  assert.equal(sinVivo.fuente, "sinvivo");
  const parado = E.respaldo({ tokHora: 0, ultimaHora: 0, tokHoy: 1000, trabajando: false });
  assert.deepEqual([parado.tokHora, parado.fuente], [0, null]);
  const nada = E.respaldo({});
  assert.equal(nada.tokHora, null); assert.equal(nada.fuente, "sinvivo");
  assert.equal(E.respaldo({ tokHora: null, tokHoy: 0, plausible: 300000 }).tokHora, null, "ya no hay «plausible»");
});

test("aguja = cifra: sin ralentí ni marchas; r228: temblor centrado en la cifra solo con ritmo > 0", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.ok(!/if \(f < this\.ralenti\) f = this\.ralenti/.test(js), "sin suelo de ralentí");
  assert.ok(!/^\s*programaMarcha\(\);/m.test(js), "los cambios de marcha no se programan");
  assert.match(js, /var vibra = !quieto && !this\.cerrado && \(this\.vivoFn \? this\.ritmoVivo > 0 && !this\.sin : amplitud\(this\.destino, this\.sin\) > 0\);/);
  assert.match(js, /sin dato en vivo/);
  assert.match(js, /ritmo de la última hora con datos/);
  assert.ok(!/T\('sin datos', 'no data'\)/.test(js));
});

test("líneas de código: con tokens y 0 líneas → estimadas; con líneas reales, reales", () => {
  assert.deepEqual({ ...E.lineasRespaldo(0, 1e6, 2000, null) }, { lineas: 500, estimado: true });
  assert.deepEqual({ ...E.lineasRespaldo(0, 1e6, null, null) }, { lineas: 200, estimado: true });
  assert.deepEqual({ ...E.lineasRespaldo(42, 1e6, 2000, null) }, { lineas: 42, estimado: false });
  assert.deepEqual({ ...E.lineasRespaldo(0, 0, 2000, null) }, { lineas: 0, estimado: false });
});

test("el velocímetro ya no escribe «Este agente no aparece…: sin cifra» ni «no se enseña ninguna cifra»", () => {
  const js = readFileSync(new URL("./assets/consumos-velocimetro.js", import.meta.url), "utf8");
  assert.ok(!/sin cifra\.'/.test(js));
  assert.ok(!/no se enseña ninguna cifra/i.test(js));
  assert.ok(/E\.respaldo\(/.test(js) && /resp\('ag:'/.test(js) && /resp\('p:'/.test(js) && /function ritmoTotal\(d, sin, conConsejeros\)/.test(js));
  assert.ok(!/plausible: plausibleDe/.test(js), "ningún dial pide ya una cifra plausible");
});
