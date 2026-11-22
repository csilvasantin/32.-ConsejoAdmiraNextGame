// r252 (Carlos, 22-11 20:53: «esta claro que el contador no funciona»): el (N) leía solo la 1.ª página de eventos de
// GitHub (100 eventos ≈ desde las 11:47 a esa hora) y perdía lo fusionado antes; el tooltip no permitía auditarlo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = { globalThis: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("./assets/trabajos-hoy.js", import.meta.url), "utf8"), ctx);
const TH = ctx.globalThis.TrabajosHoy;
const AHORA = Date.parse("2026-11-22T19:55:00Z");
const pr = (id, iso, repo, n, rama, action = "merged") => ({ id: String(id), type: "PullRequestEvent", created_at: iso, repo: { name: "csilvasantin/" + repo }, payload: { action, number: n, pull_request: { number: n, title: "", head: { ref: rama } } } });
const otro = (id, iso) => ({ id: String(id), type: "PushEvent", created_at: iso, repo: { name: "csilvasantin/x" }, payload: {} });
const relleno = (n, iso, base) => Array.from({ length: n }, (_, i) => otro(base + i, iso));

// Página 1: llena (100), con un PushEvent viejo (20-nov) que NO debe cortar la lectura; página 2: la mañana y ayer.
const P1 = [pr(1, "2026-11-22T19:32:00Z", "admira-tv", 258, "neo/fold-fullscreen"), pr(2, "2026-11-22T10:47:38Z", "admira-tv", 242, "neo/7658-gemelo-envio"), otro(3, "2026-11-20T11:12:14Z"), ...relleno(97, "2026-11-22T15:00:00Z", 100)];
const P2 = [pr(10, "2026-11-22T10:34:00Z", "admira-tv", 240, "neo/7658-gemelo-taza"), pr(11, "2026-11-22T09:08:47Z", "admira-tv", 237, "trinity/galleon-flechas-luz"),
  pr(12, "2026-11-22T09:08:50Z", "ainimation", 167, "trinity/galleon-flechas-luz"), pr(13, "2026-11-22T09:09:49Z", "admira-tv", 238, "trinity/galleon-flechas-espera"),
  pr(14, "2026-11-22T09:10:00Z", "admira-studio", 171, "trinity/abierto-sin-fusionar", "opened"), pr(15, "2026-11-21T22:56:00Z", "admira-tv", 236, "trinity/de-ayer-madrid-23h56"),
  pr(16, "2026-11-21T23:30:00Z", "admira-tv", 300, "trinity/hoy-madrid-0h30"), ...relleno(93, "2026-11-21T20:00:00Z", 300)];
const fetchDe = (pags, llamadas) => (u) => { llamadas.push(u); const n = +new URL(u).searchParams.get("page"); return Promise.resolve({ ok: true, json: () => Promise.resolve(pags[n] || []) }); };

test("lee páginas hasta pasar la medianoche de Madrid (solo los PullRequestEvent marcan el corte)", async () => {
  const ll = []; const r = await TH.leerPaginas(fetchDe({ 1: P1, 2: P2, 3: [] }, ll), AHORA);
  assert.equal(ll.length, 2); assert.equal(r.completo, true);
  const prs = TH.prsHoy(r.ev, AHORA);
  assert.deepEqual(JSON.parse(JSON.stringify(prs.map((p) => p.repo + "#" + p.pr).sort())),
    ["admira-tv#237", "admira-tv#238", "admira-tv#240", "admira-tv#242", "admira-tv#258", "admira-tv#300", "ainimation#167"]);
});

test("combinar: rama en dos repos = 1; misión citada por la rama = 1 y se cede a quien la hizo (lo dice la ficha cedente)", async () => {
  const r = await TH.leerPaginas(fetchDe({ 1: P1, 2: P2 }, []), AHORA);
  const fichas = [{ agente: "Neo", hechasHoy: [] }, { agente: "Trinity", hechasHoy: [] }, { agente: "Morfeo", hechasHoy: [{ id: "#7658", titulo: "Gemelo Taza", ts: 1795000000 }] }];
  const out = TH.combinar(fichas, r.ev, AHORA), by = Object.fromEntries(out.map((t) => [t.agente, t]));
  assert.equal(by.Neo.nHoyTotal, 2); // #7658 (PR 240 + 242) + fold-fullscreen
  assert.equal(by.Trinity.nHoyTotal, 3); // galleon-flechas-luz (2 repos) + galleon-flechas-espera + hoy-madrid-0h30; ni el abierto ni el de ayer
  assert.equal(by.Morfeo.nHoyTotal, 0);
  assert.match(by.Morfeo.trabajosCedidos[0], /^#7658 → Neo \(neo\/7658-/);
  const m = by.Neo.trabajosHoy.find((x) => x.tipo === "mision"); assert.deepEqual(JSON.parse(JSON.stringify(m.prs.sort())), ["admira-tv#240", "admira-tv#242"]);
});

test("página 1 con un PR de ayer: no pide más páginas", async () => {
  const ll = []; await TH.leerPaginas(fetchDe({ 1: [pr(1, "2026-11-22T19:00:00Z", "a", 1, "neo/x"), pr(2, "2026-11-21T10:00:00Z", "a", 2, "neo/y"), ...relleno(98, "2026-11-22T12:00:00Z", 10)] }, ll), AHORA);
  assert.equal(ll.length, 1);
});

test("tooltip del (N): lista numerada de lo contado y las misiones cedidas", () => {
  const src = readFileSync(new URL("./assets/consumos-trabajando.js", import.meta.url), "utf8");
  assert.match(src, /\(i \+ 1\) \+ '\. '/); assert.match(src, /trabajosCedidos/);
  assert.match(readFileSync(new URL("./assets/trabajos-hoy.js", import.meta.url), "utf8"), /admira:gh-eventos:v2/);
});
