// Diccionario del sitio entero (admira-idioma-sitio.js) y el de /consumos — Carlos, 10-10-2026:
// «si cambio a ENG la mayoría de los textos siguen en castellano; repásate todo el site».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function carga(...files) {
  const D = {}, R = [];
  const G = { AdmiraIdioma: { diccionario: (d, r) => { Object.assign(D, d); R.push(...r); }, extra: (d, r) => { Object.assign(D, d); R.push(...r); } } };
  for (const f of files) new Function("globalThis", readFileSync(new URL(f, import.meta.url), "utf8"))(G);
  const buscar = (c) => {
    if (Object.hasOwn(D, c)) return D[c];
    for (const [re, rep] of R) { const m = c.match(re); if (!m) continue; if (typeof rep !== "function") return c.replace(re, rep); const r = rep(m, frase); if (r != null) return r; }
    return null;
  };
  const frase = (c) => {
    const t = buscar(c); if (t != null || !c.includes(" · ")) return t;
    let ch = false; const p = c.split(" · ").map((x) => { const q = buscar(x); if (q != null && q !== x) { ch = true; return q; } return x; });
    return ch ? p.join(" · ") : null;
  };
  return { D, R, frase };
}

test("sitio: carga y trae la barra, el EXPERTO y el acceso", () => {
  const { D, R, frase } = carga("./admira-idioma-sitio.js");
  assert.ok(Object.keys(D).length > 1500, "diccionario grande");
  assert.ok(R.every((r) => r[0] instanceof RegExp));
  assert.equal(frase("Control global por agente"), "Global control per agent");
  assert.equal(frase("INICIA SESIÓN PARA CONTINUAR"), "SIGN IN TO CONTINUE");
  assert.equal(frase("Abrir menú de navegación"), "Open navigation menu");
});

test("sitio: reglas con máquinas y números (los datos no se traducen)", () => {
  const { frase } = carga("./admira-idioma-sitio.js");
  assert.equal(frase("Codex en MacMini: abierta; cerrar"), "Codex on MacMini: open; close");
  assert.equal(frase("Cerrar Codex de Trinity en MacBook Pro 16"), "Close Trinity's Codex on MacBook Pro 16");
  assert.equal(frase("CLIs de MacBookAir16plata"), "MacBookAir16plata CLIs");
  assert.equal(frase("Todos · 52"), "All · 52");
  assert.equal(frase("hace 8 min"), "8 min ago");
  assert.equal(frase("Oráculo"), null);
});

test("sitio: ninguna clave vacía ni traducción idéntica", () => {
  const { D } = carga("./admira-idioma-sitio.js");
  for (const [k, v] of Object.entries(D)) { assert.ok(k && v, k); assert.notEqual(k, v); }
});

test("consumos: se suma con extra() y también si llega antes que el selector", () => {
  const { frase } = carga("./admira-idioma-sitio.js", "./admira-idioma-consumos.js");
  assert.equal(frase("Velocidad por agente"), "Speed per agent");
  const G = {}; new Function("globalThis", readFileSync(new URL("./admira-idioma-consumos.js", import.meta.url), "utf8"))(G);
  assert.equal(G.AdmiraIdiomaExtra.length, 1);
});

test("páginas sueltas cargan el selector; las de Yokup lo piden al cargar", () => {
  for (const f of ["status/index.html", "telegram/bots.html", "orquestar/index.html", "game/index.html", "chat/jobs/index.html"])
    assert.match(readFileSync(new URL("./" + f, import.meta.url), "utf8"), /<script src="\/admira-idioma\.js"><\/script>/, f);
  assert.match(readFileSync(new URL("./yk-frame.js", import.meta.url), "utf8"), /expertScript\("\/admira-idioma\.js\?v=" \+ EXPERT_CMD_V, "AdmiraIdioma"\);\n  \}/);
  assert.match(readFileSync(new URL("./consumos.html", import.meta.url), "utf8"), /admira-idioma-consumos\.js/);
});
