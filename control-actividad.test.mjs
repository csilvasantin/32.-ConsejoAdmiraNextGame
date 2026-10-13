// HACKEO en vivo (Woz · MBP14, 13-10-2026): control-lineas-lib.mjs (actividad + Δ de líneas) + /api/control/actividad.
import test from "node:test";
import assert from "node:assert/strict";
import { fuenteContable, contarDiff, leerAtom, mapaAlias, clavesDe, motivoPresencia, actividadProyectos, sumarLineasVivas } from "./control-lineas-lib.mjs";
import { construir } from "./functions/api/control/actividad.js";
import { _olvidarPresencia } from "./functions/api/flota/trabajando.js";

const PROJECTS = [
  { key: "tv", project: "admira.tv", domain: "www.admira.tv", repo: "csilvasantin/admira-tv", commit: "aaaaaaa" },
  { key: "biz", project: "admira.biz", domain: "www.admira.biz", repo: "csilvasantin/clearchannel-tv", commit: "bbbbbbb" },
  { key: "clearchannel", project: "clearchannel.tv", domain: "www.clearchannel.tv", repo: "csilvasantin/clearchannel-tv", commit: "bbbbbbb" },
  { key: "pixeria", project: "pixeria.com", domain: "www.pixeria.com", repo: "csilvasantin/pixeria", commit: "ccccccc" },
  { key: "yokup", project: "yokup.com", domain: "www.yokup.com", repo: "csilvasantin/tool", commit: "ddddddd" },
  { key: "admiralive", project: "admira.live", domain: "www.admira.live", repo: "csilvasantin/32.-ConsejoAdmiraNextGame", commit: "eeeeeee", commit_full: "eeeeeee0123456789" },
];
const AHORA_S = 1791885500, AHORA_MS = AHORA_S * 1000;
const snap = (extra) => ({ persona: "Neo", machine: "MacBookProNegro14", source: "process_snapshot", updated: AHORA_S - 2, ...extra });

test("fuenteContable: mismos filtros que el corpus (extensión, carpetas fuera, sensibles, minificados)", () => {
  assert.equal(fuenteContable("src/app.js"), true);
  assert.equal(fuenteContable("tools/x.py"), true);
  assert.equal(fuenteContable("README.md"), false);
  assert.equal(fuenteContable("node_modules/a/b.js"), false);
  assert.equal(fuenteContable("dist/app.js"), false);
  assert.equal(fuenteContable("lib/token-store.js"), false);
  assert.equal(fuenteContable("vendor.min.js"), false);
  assert.equal(fuenteContable(".env.production"), false);
});

test("contarDiff: solo líneas NO vacías de ficheros fuente; cabeceras +++/--- no cuentan", () => {
  const d = [
    "diff --git a/app.js b/app.js", "index 1..2 100644", "--- a/app.js", "+++ b/app.js", "@@ -1,3 +1,4 @@",
    " const a = 1;", "-const b = 2;", "+const b = 3;", "+", "+const c = 4;", "-   ",
    "diff --git a/README.md b/README.md", "--- a/README.md", "+++ b/README.md", "+texto", "+más",
    "diff --git a/nuevo.py b/nuevo.py", "new file mode 100644", "--- /dev/null", "+++ b/nuevo.py", "+print(1)",
  ].join("\n");
  assert.deepEqual(contarDiff(d), { anadidas: 3, quitadas: 1, ficheros: 2 });
  assert.deepEqual(contarDiff(""), { anadidas: 0, quitadas: 0, ficheros: 0 });
});

test("leerAtom: sha, fecha, autor y título; ordenado del más reciente al más viejo", () => {
  const xml = `<feed><entry><id>tag:github.com,2008:Grit::Commit/1111111aaaa</id><title>\n  viejo &amp; bueno\n</title><updated>2026-10-13T09:00:00Z</updated><author><name>ana</name></author></entry>
  <entry><id>tag:github.com,2008:Grit::Commit/2222222bbbb</id><title>nuevo</title><updated>2026-10-13T09:50:00Z</updated><author>\n<name>woz</name></author></entry></feed>`;
  const c = leerAtom(xml);
  assert.deepEqual(c.map((x) => x.sha), ["2222222bbbb", "1111111aaaa"]);
  assert.equal(c[1].titulo, "viejo & bueno"); assert.equal(c[0].autor, "woz");
  assert.deepEqual(leerAtom("<html>no es atom</html>"), []);
});

test("clavesDe: dominio, repo y raíz inequívoca; «admira», «otros» y desconocidos → nada", () => {
  const al = mapaAlias(PROJECTS);
  assert.deepEqual(clavesDe("admira.tv", al), ["tv"]);
  assert.deepEqual(clavesDe("https://www.admira.tv/foo", al), ["tv"]);
  assert.deepEqual(clavesDe("admira-live", al), ["admiralive"]);
  assert.deepEqual(clavesDe("pixeria", al), ["pixeria"]);
  assert.deepEqual(clavesDe("yokup", al), ["yokup"]);
  assert.deepEqual(clavesDe("clearchannel-tv", al).sort(), ["biz", "clearchannel"]);
  assert.deepEqual(clavesDe("admira", al), []);
  assert.deepEqual(clavesDe("otros", al), []);
  assert.deepEqual(clavesDe("tool", al), []);      // nombre de repo demasiado genérico
  assert.deepEqual(clavesDe("", al), []);
});

test("motivoPresencia: sin falsos positivos (fila vieja, declaración vieja, bucle pasivo, CPU de máquina)", () => {
  assert.match(motivoPresencia(snap({ project: "admira.tv", declared_updated: AHORA_S - 60 }), AHORA_S), /declaró/);
  assert.equal(motivoPresencia(snap({ project: "admira.tv", declared_updated: AHORA_S - 60, updated: AHORA_S - 600 }), AHORA_S), null);
  assert.equal(motivoPresencia(snap({ project: "admira.tv", declared_updated: AHORA_S - 600 }), AHORA_S), null);
  assert.equal(motivoPresencia(snap({ project: "admira.tv", declared_updated: AHORA_S - 600, cpu: 90 }), AHORA_S), null);
  assert.match(motivoPresencia(snap({ project: "admira.tv", declared_updated: AHORA_S - 600, app_turn: { state: "active" } }), AHORA_S), /turno/);
  assert.match(motivoPresencia(snap({ project: "admira.tv", declared_updated: AHORA_S - 600, proc_cpu: 40 }), AHORA_S), /CPU/);
  assert.equal(motivoPresencia(snap({ project: "admira.tv", declared_updated: AHORA_S - 1200, app_turn: { state: "active" } }), AHORA_S), null);
  assert.equal(motivoPresencia(snap({ project: "admira.tv", declared_updated: 0 }), AHORA_S), null);
  const hb = { persona: "Merovingio", machine: "GrokBotBox", source: "heartbeat", updated: AHORA_S - 10, project: "pixeria" };
  assert.equal(motivoPresencia({ ...hb, mode: "pasivo" }, AHORA_S), null);
  assert.equal(motivoPresencia({ ...hb, mode: "autonomo" }, AHORA_S), null);
  assert.match(motivoPresencia({ ...hb, mode: "trabajando" }, AHORA_S), /trabajando/);
  assert.equal(motivoPresencia({ ...hb, mode: "trabajando", updated: AHORA_S - 500 }, AHORA_S), null);
});

test("actividadProyectos: agentes por proyecto, commit < 15 min, repo compartido enciende los dos; sin señal → vacío", () => {
  const presencia = [
    snap({ project: "admira.tv", declared_updated: AHORA_S - 30 }),
    snap({ project: "admira.tv", declared_updated: AHORA_S - 30 }),          // misma fila repetida: una vez
    snap({ persona: "Smith", project: "otros", declared_updated: AHORA_S - 30 }),
    snap({ persona: "Trinity", project: "pixeria.com", declared_updated: AHORA_S - 3000 }),
  ];
  const commits = {
    "csilvasantin/clearchannel-tv": [{ sha: "abcdef1234", ts: AHORA_MS - 5 * 60000, autor: "carla", titulo: "fix" }],
    "csilvasantin/pixeria": [{ sha: "0123456789", ts: AHORA_MS - 3 * 3600000, autor: "x", titulo: "viejo" }],
  };
  const a = actividadProyectos({ projects: PROJECTS, presencia, commits, ahoraMs: AHORA_MS });
  assert.deepEqual(Object.keys(a).sort(), ["biz", "clearchannel", "tv"]);
  assert.equal(a.tv.motivos.length, 1); assert.equal(a.tv.motivos[0].agente, "Neo");
  assert.equal(a.biz.motivos[0].tipo, "commit"); assert.equal(a.biz.motivos[0].haceS, 300);
  assert.deepEqual(actividadProyectos({ projects: PROJECTS, presencia: [], commits: {}, ahoraMs: AHORA_MS }), {});
});

test("sumarLineasVivas: por repo; un repo sin leer no se inventa (completos=false)", () => {
  const s = sumarLineasVivas({ a: { anadidas: 10, quitadas: 3 }, b: { anadidas: 5, quitadas: 0 }, c: null });
  assert.equal(s.neto, 12); assert.equal(s.anadidas, 15); assert.equal(s.quitadas, 3);
  assert.equal(s.completos, false); assert.equal(s.porRepo.c, null); assert.equal(s.porRepo.a.neto, 7);
});

test("API construir: une corpus, presencia, Atom y diff (cacheado en KV); GitHub caído → null, no cero", async () => {
  _olvidarPresencia();
  const corpus = { generated: "2026-10-13T08:00:00+0200", lines_total_all: 1000, projects: PROJECTS };
  const atom = (sha, ts) => `<feed><entry><id>tag:github.com,2008:Grit::Commit/${sha}</id><title>t</title><updated>${new Date(ts).toISOString()}</updated><author><name>woz</name></author></entry></feed>`;
  const diff = "diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n+a\n+b\n-c\n";
  let diffs = 0;
  const fetchImpl = async (u) => {
    u = String(u);
    if (u.startsWith("https://bot.yokup.com/api/presence")) return new Response(JSON.stringify({ ok: true, now: AHORA_S, presence: [snap({ project: "admira.tv", declared_updated: AHORA_S - 20 })] }));
    if (u.endsWith("/hackeo-corpus/index.json")) return new Response(JSON.stringify(corpus));
    if (u.includes("admira-tv/commits.atom")) return new Response(atom("aaaaaaa", AHORA_MS - 3600000));          // HEAD = corpus → Δ 0
    if (u.includes("ConsejoAdmiraNextGame/commits.atom")) return new Response(atom("fffffff9999", AHORA_MS - 60000));
    if (u.includes("ConsejoAdmiraNextGame/compare/eeeeeee0123456789...fffffff9999.diff")) { diffs++; return new Response(diff); }
    return new Response("no", { status: 503 });
  };
  const m = new Map(), env = { RECORTE_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } } };
  const d = await construir({ env, fetchImpl, origin: "https://x.pages.dev", ahoraMs: AHORA_MS, cache: null });
  assert.equal(d.ok, true);
  assert.deepEqual(Object.keys(d.activos).sort(), ["admiralive", "tv"]);
  assert.equal(d.lineas.porRepo["csilvasantin/admira-tv"].neto, 0);
  assert.deepEqual([d.lineas.porRepo["csilvasantin/32.-ConsejoAdmiraNextGame"].anadidas, d.lineas.porRepo["csilvasantin/32.-ConsejoAdmiraNextGame"].quitadas], [2, 1]);
  assert.equal(d.lineas.porRepo["csilvasantin/pixeria"], null);
  assert.equal(d.lineas.completos, false); assert.equal(d.lineas.neto, 1);
  assert.ok(d.fuentes.github.fallos.includes("csilvasantin/pixeria"));
  await construir({ env, fetchImpl, origin: "https://x.pages.dev", ahoraMs: AHORA_MS, cache: null });
  assert.equal(diffs, 1, "el diff base…head se lee una vez y luego sale de KV");
});
