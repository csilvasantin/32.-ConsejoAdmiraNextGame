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

test("Highscore: la fórmula traduce nodos con puntuación y las cabeceras compartidas", () => {
  const { frase } = carga("./admira-idioma-sitio.js");
  assert.equal(frase("La apertura automática admite una sola ventana cada 60 minutos; una ventana por hora suma"), "Automatic opening allows a single window every 60 minutes; one window per hour adds");
  assert.equal(frase("Ordenador"), "Computer");
  assert.equal(frase("objetivos,"), "goals,");
  for (const heading of ["OBJETIVOS", "DECISIONES", "INCIDENCIAS", "INFORMES", "NOTIFICACIONES", "Desconectar"]) assert.ok(frase(heading), heading);
  assert.equal(frase("6/14 vivas"), "6/14 live");
  assert.equal(frase("14/25 vivos"), "14/25 live");
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

test("consumos: tarjeta Accounts en inglés (edad, sesión/semana, reinicios gratis, Sin lectura) — ventana 00:21", () => {
  const { frase } = carga("./admira-idioma-sitio.js", "./admira-idioma-consumos.js");
  assert.equal(frase("dato de hace 26 h"), "data from 26 h ago");
  assert.equal(frase("dato de hace 2 días"), "data from 2 days ago");
  assert.equal(frase("sesión 42 % · hoy 03:00 · semana 10,5 % · lun 09:00"), "session 42 % · today 03:00 · week 10.5 % · Mon 09:00");
  assert.equal(frase("sesión 0 % (renovado) · semana 0 % (renovado)"), "session 0 % (renewed) · week 0 % (renewed)");
  assert.equal(frase("Reinicio gratis disponible · vence 22 oct"), "Free reset available · expires Oct 22");
  assert.equal(frase("3 reinicios gratis · el primero vence 22 oct"), "3 free resets · the first expires Oct 22");
  assert.match(frase("Mover encargos pesados a claude max (Max de Carlos, no GrokBot): les sobra 60 %. Sin lectura: GrokBot (Consejo) · Cursor Pro."), /No reading: GrokBot \(Council\) · Cursor Pro\.$/);
  assert.match(frase("Todas las cuentas con lectura van justas.  Frenar X. Sin lectura: GrokBot (Consejo) · Cursor Pro."), /^All accounts with a reading are tight\..*No reading: GrokBot \(Council\)/);
});
