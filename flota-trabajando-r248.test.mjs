// r248 (Carlos, 22-11-2026 11:46): «recuerda que estos son contadores de trabajos/misiones realizadas cada dia, algo esta
// mal cuando nadie pasa de 1».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { appsGrokBot, CUENTA_ULTIMA_S } from "./consumos-pulso-lib.mjs";

function carga() {
  const ctx = { console, Intl, Date, JSON, localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./assets/trabajos-hoy.js", import.meta.url), "utf8"), ctx);
  return ctx.TrabajosHoy;
}
const AHORA = Date.parse("2026-11-22T10:50:00Z"); // 11:50 Madrid
const pr = (iso, repo, n, rama, title) => ({ type: "PullRequestEvent", created_at: iso, repo: { name: "csilvasantin/" + repo }, payload: { action: "merged", number: n, pull_request: { head: { ref: rama }, title } } });
// Eventos reales del 22-11 (GitHub público de csilvasantin)
const EV = [
  pr("2026-11-22T10:47:38Z", "admira-tv", 242, "neo/7658-gemelo-envio", "Gemelo de la taza: envío real (encargo 7658)"),
  pr("2026-11-22T10:34:55Z", "admira-tv", 240, "neo/7658-gemelo-taza", "Gemelo digital 3D de la taza (encargo 7658)"),
  pr("2026-11-22T09:50:55Z", "admira-tv", 241, "neo/apple-watch-rotulo-vertical", "Apple Watch: rótulo"),
  pr("2026-11-22T09:41:42Z", "ainimation", 168, "neo/apple-watch-ultra-twin", "Gemelo Apple Watch"),
  pr("2026-11-22T09:41:38Z", "admira-tv", 239, "neo/apple-watch-ultra-player", "Apple Watch player"),
  pr("2026-11-22T09:32:50Z", "32.-ConsejoAdmiraNextGame", 463, "woz/misiones-color", "r247"),
  pr("2026-11-22T09:09:49Z", "admira-tv", 238, "trinity/galleon-flechas-espera", "Galleon espera"),
  pr("2026-11-22T09:08:47Z", "admira-tv", 237, "trinity/galleon-flechas-luz", "Galleon luz"),
  pr("2026-11-22T09:08:29Z", "ainimation", 167, "trinity/galleon-flechas-luz", "Galleon luz"),
  pr("2026-11-22T09:08:02Z", "32.-ConsejoAdmiraNextGame", 462, "woz/conectado-vs-trabajando", "r246"),
  pr("2026-11-21T22:56:39Z", "admira-tv", 236, "trinity/corsair-retorno-usb", "ayer 23:56 Madrid"),
  { type: "PullRequestEvent", created_at: "2026-11-22T10:46:56Z", repo: { name: "csilvasantin/admira-tv" }, payload: { action: "opened", number: 242, pull_request: { head: { ref: "neo/7658-gemelo-envio" } } } },
  pr("2026-11-22T09:12:05Z", "admira-next-web", 547, "calc-traer-generador", "sin prefijo de agente"),
];
const TS = [
  { agente: "Trinity", hechasHoy: [] },
  { agente: "Neo", hechasHoy: [], misionesDesglose: { texto: "0 hechas · 1 sin cerrar desde 19-11", enCurso: 0 } },
  { agente: "Morfeo", hechasHoy: [{ id: "#7658", ts: Math.floor(Date.parse("2026-11-22T09:47:20Z") / 1000), maquina: "MBP16", titulo: "Gemelo Digital Taza" }], misionesLuz: "verde", misionesDesglose: { texto: "1 hecha · 3 pendientes", enCurso: 0, ultima: { id: "#7658", estado: "done" } } },
  { agente: "Wozniak", hechasHoy: [{ id: "#7653", ts: Math.floor(Date.parse("2026-11-21T23:08:18Z") / 1000) }], misionesDesglose: { texto: "1 hecha · 2 sin cerrar desde 10-11", enCurso: 0 } },
  { agente: "Jobs", hechasHoy: [{ id: "#7654", ts: 1 }] },
  { agente: "Musk", hechasHoy: [] },
];

test("r248: PRs fusionados HOY (Madrid) por rama de agente; abiertos, de ayer o sin prefijo no cuentan", () => {
  const p = JSON.parse(JSON.stringify(carga().prsHoy(EV, AHORA)));
  assert.equal(p.length, 10);
  assert.ok(!p.some((x) => x.pr === 236 || x.pr === 547));
  assert.deepEqual(p.filter((x) => x.agente === "Wozniak").map((x) => x.pr), [463, 462]);
  assert.equal(p.find((x) => x.pr === 240).encargo, "#7658");
});

test("r248: N = misiones + trabajos con PR; misión y sus PRs una vez, acreditada a quien la hizo (#7658 Morfeo → Neo)", () => {
  const out = JSON.parse(JSON.stringify(carga().combinar(TS, EV, AHORA)));
  const de = (n) => out.find((t) => t.agente === n);
  assert.deepEqual(out.map((t) => [t.agente, t.nHoyTotal]), [["Trinity", 2], ["Neo", 4], ["Morfeo", 0], ["Wozniak", 3], ["Jobs", 1], ["Musk", 0]]);
  const m = de("Neo").trabajosHoy.find((x) => x.id === "#7658");
  assert.equal(m.tipo, "mision"); assert.equal(m.deDestinatario, "Morfeo"); assert.deepEqual(m.prs, ["admira-tv#242", "admira-tv#240"]);
  assert.deepEqual(de("Trinity").trabajosHoy.find((x) => x.rama === "trinity/galleon-flechas-luz").prs, ["admira-tv#237", "ainimation#167"]);
  assert.equal(de("Neo").misionesLuz, "verde"); assert.equal(de("Neo").misionesDesglose.texto, "4 hechas (1 misión + 3 PR) · 1 sin cerrar desde 19-11");
  assert.equal(de("Morfeo").misionesLuz, "gris"); assert.equal(de("Morfeo").misionesDesglose.texto, "0 hechas · 3 pendientes");
  assert.equal(de("Wozniak").misionesDesglose.texto, "3 hechas (1 misión + 2 PR) · 2 sin cerrar desde 10-11");
  assert.equal(TS[2].hechasHoy.length, 1, "no muta las fichas originales");
});

test("r248: color — en curso gana; un fallo posterior al último trabajo da rojo", () => {
  const H = carga();
  const a = JSON.parse(JSON.stringify(H.combinar([{ agente: "Neo", hechasHoy: [], misionesDesglose: { enCurso: 1, texto: "0 hechas · 1 en curso" } }], EV, AHORA)))[0];
  assert.equal(a.misionesLuz, "amarillo");
  const r = JSON.parse(JSON.stringify(H.combinar([{ agente: "Neo", hechasHoy: [], misionesDesglose: { enCurso: 0, ultima: { id: "#9", estado: "failed", ts: Math.floor(AHORA / 1000) } } }], EV, AHORA)))[0];
  assert.equal(r.misionesLuz, "rojo");
});

test("r248: app Grok Bot sin uso en 1 h conserva la última cuenta usada si fue hace ≤ 6 h (Musk/Jensen en el MBP16)", () => {
  assert.equal(CUENTA_ULTIMA_S, 21600);
  const ahora = Date.parse("2026-11-22T10:50:00Z");
  const doc = (cuentas) => ({ maquina: "MacBookPro16", grokbotApp: { abierta: true, ts: ahora - 20000, reposoS: 87, firmada: true, cuenta: null, cuentas } });
  const a = appsGrokBot([doc([{ cuenta: "csilvasantin@gmail.com", haceS: 4400 }])], ahora);
  assert.deepEqual(a.map((x) => [x.cuenta, x.fuente]), [["csilvasantin@gmail.com", "ultima"]]);
  assert.equal(appsGrokBot([doc([{ cuenta: "csilvasantin@gmail.com", haceS: 30000 }])], ahora)[0].fuente, "desconocida");
});

test("r248: páginas cargan trabajos-hoy.js y lo usan antes de pintar", () => {
  const c = readFileSync(new URL("./consumos.html", import.meta.url), "utf8");
  assert.ok(c.indexOf("trabajos-hoy.js?v=20261122-r248") < c.indexOf("consumos-trabajando.js?v=20261122-r248-trabajos-hoy"));
  assert.match(readFileSync(new URL("./deepagents/index.html", import.meta.url), "utf8"), /trabajos-hoy\.js\?v=20261122-r248/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /trabajos-hoy\.js\?v=20261122-r248/);
  const js = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(js, /then\(avisa\)\.then\(conTrabajos\)\.then\(pinta\)/);
  assert.match(js, /trabajos hechos hoy \(día de Madrid\)/);
  assert.match(readFileSync(new URL("./deepagents/deepagents.js", import.meta.url), "utf8"), /TrabajosHoy\.asegurar\(d\)/);
  assert.match(readFileSync(new URL("./assets/barra-agentes.js", import.meta.url), "utf8"), /TrabajosHoy\.asegurar\(d\)/);
});
