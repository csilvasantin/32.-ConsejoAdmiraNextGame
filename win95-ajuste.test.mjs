// «Vuelta al 95» · ajuste desde Admira Director: esquema, saneado, fusión y API /api/win95/ajuste.
// node --test win95-ajuste.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ESQUEMA, PLANTILLAS_PISTA, campos, extraer, fusionar, medioValido, sanear } from "./win95-ajuste-lib.mjs";
import * as api from "./functions/api/win95/ajuste.js";
import { emitirSesion, COOKIE_SESION } from "./chat-hilo-lib.mjs";
import { emitir as emitirPuerta, COOKIE as COOKIE_PUERTA } from "./functions/_puerta.js";

function kvFalso() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }, m };
}
const FIRMA = "z".repeat(48);
const env = () => ({ CHAT_KV: kvFalso(), PUERTA_FIRMA: FIRMA, CONSUMOS_LECTURAS_TOKEN: "x".repeat(32) });
const req = (method, { cookie = "", body, origin } = {}) =>
  new Request("https://www.admira.live/api/win95/ajuste", {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
const sesionGoogle = async (e, email = "csilva@admira.com") => COOKIE_SESION + "=" + (await emitirSesion(e, email)).valor;

test("el esquema sólo tiene rutas conocidas de CONFIG y cada campo un tipo válido", () => {
  const tipos = new Set(["text", "number", "bool", "select", "image", "tags", "list"]);
  for (const c of campos()) {
    assert.ok(tipos.has(c.tipo), c.ruta + " tipo " + c.tipo);
    assert.ok(c.etiqueta.es && c.etiqueta.en, c.ruta + " etiqueta ES/EN");
    if (c.tipo === "list") for (const i of c.item) assert.ok(tipos.has(i.tipo) && i.tipo !== "list", c.ruta + "." + i.ruta);
  }
  assert.equal(ESQUEMA.id, "vuelta-al-95");
});

test("sanear: acepta lo válido, descarta lo inválido con motivo y completa las pistas con su síntesis", () => {
  const { ajuste, errores } = sanear({
    visitor: "  Carlos ", idleSeconds: "45", names: { player: "Winamp 2.95", browser: "x".repeat(50) },
    mediaPlayer: { tags: "#win95, genero95, win95", rotateSeconds: 5, inDemo: "true" },
    tracks: [{ artist: "Modem Love", title: "56k", style: "house", bpm: 122 }, { artist: "A", title: "B", style: "metal", bpm: 120 }],
    contacts: [{ id: "Jensen!", name: "Jensen", on: true, auto: "" }, { id: "jensen", name: "Dup" }, { id: "", name: "sin id" }],
    icqgram: { quick: ["¡Hola!", "", "¿Qué es AdmiraNeXT?"] },
    secreto: "no", salamandra: { url: "http://evil" },
  });
  assert.equal(ajuste.visitor, "Carlos");
  assert.equal(ajuste.idleSeconds, 45);
  assert.equal(ajuste.names.player, "Winamp 2.95");
  assert.equal(ajuste.names.browser, undefined);
  assert.deepEqual(ajuste.mediaPlayer.tags, ["win95", "genero95"]);
  assert.equal(ajuste.mediaPlayer.rotateSeconds, undefined);
  assert.equal(ajuste.mediaPlayer.inDemo, true);
  assert.equal(ajuste.tracks.length, 1);
  assert.deepEqual(ajuste.tracks[0], { artist: "Modem Love", title: "56k", style: "house", bpm: 122, ...PLANTILLAS_PISTA.house });
  assert.deepEqual(ajuste.contacts, [{ id: "jensen", name: "Jensen", status: "", on: true }]);
  assert.deepEqual(ajuste.icqgram.quick, ["¡Hola!", "¿Qué es AdmiraNeXT?"]);
  assert.equal("secreto" in ajuste, false);
  assert.equal("salamandra" in ajuste, false);
  const rutas = errores.map((e) => e.ruta);
  assert.ok(rutas.includes("names.browser") && rutas.includes("mediaPlayer.rotateSeconds") && rutas.includes("tracks.1.style"), JSON.stringify(errores));
});

test("medios: archivo de la carpeta, ruta del sitio o https de Admira; nada más", () => {
  assert.equal(medioValido("fondo.png"), "fondo.png");
  assert.equal(medioValido("/windows95/Admira_Next.mp4"), "/windows95/Admira_Next.mp4");
  assert.equal(medioValido("https://api.admira.store/media/x.jpg"), "https://api.admira.store/media/x.jpg");
  assert.equal(medioValido(""), "");
  assert.equal(medioValido("../auth-gate.js"), null);
  assert.equal(medioValido("https://evil.example/x.png"), null);
  assert.equal(medioValido("http://admira.tv/x.png"), null);
  assert.equal(medioValido("javascript:alert(1)"), null);
});

test("fusionar: objetos clave a clave, listas enteras; extraer devuelve lo de fábrica", () => {
  const config = { visitor: "", names: { player: "Winamp", browser: "Netscape" }, tracks: [{ a: 1 }, { a: 2 }], salamandra: { url: "" } };
  fusionar(config, { names: { player: "Nuevo" }, tracks: [{ a: 3 }] });
  assert.deepEqual(config.names, { player: "Nuevo", browser: "Netscape" });
  assert.deepEqual(config.tracks, [{ a: 3 }]);
  assert.deepEqual(config.salamandra, { url: "" });
  const f = extraer({ visitor: "x", names: { player: "P", browser: "B", chat: "C", p2p: "N", media: "M" }, tracks: [{ artist: "a" }] });
  assert.equal(f.names.player, "P");
  assert.deepEqual(f.tracks, [{ artist: "a" }]);
  assert.equal("salamandra" in f, false);
});

test("GET sin sesión → 401; con cookie de la puerta (agente) → esquema y ajuste vacío", async () => {
  const e = env();
  assert.equal((await api.onRequestGet({ request: req("GET"), env: e })).status, 401);
  const puerta = await emitirPuerta(FIRMA, "agente", "neo");
  const r = await api.onRequestGet({ request: req("GET", { cookie: COOKIE_PUERTA + "=" + puerta.valor }), env: e });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.esquema.id, "vuelta-al-95");
  assert.deepEqual(d.ajuste, {});
});

test("PUT exige sesión de Google del mismo origen; guarda saneado y GET lo devuelve; DELETE restaura", async () => {
  const e = env();
  const puerta = await emitirPuerta(FIRMA, "agente", "neo");
  assert.equal((await api.onRequestPut({ request: req("PUT", { cookie: COOKIE_PUERTA + "=" + puerta.valor, body: { ajuste: { visitor: "x" } }, origin: "https://www.admira.live" }), env: e })).status, 401);
  const cookie = await sesionGoogle(e);
  assert.equal((await api.onRequestPut({ request: req("PUT", { cookie, body: { ajuste: { visitor: "x" } }, origin: "https://evil.example" }), env: e })).status, 401);
  const r = await api.onRequestPut({ request: req("PUT", { cookie, body: { ajuste: { visitor: "Carlos", names: { player: "Winamp 2.95" }, idleSeconds: 2 } }, origin: "https://www.admira.live" }), env: e });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.by, "Carlos");
  assert.deepEqual(d.ajuste, { visitor: "Carlos", names: { player: "Winamp 2.95" } });
  assert.equal(d.errores[0].ruta, "idleSeconds");
  const g = await (await api.onRequestGet({ request: req("GET", { cookie }), env: e })).json();
  assert.deepEqual(g.ajuste, { visitor: "Carlos", names: { player: "Winamp 2.95" } });
  assert.equal(g.by, "Carlos");
  assert.ok(g.at);
  const malo = await api.onRequestPut({ request: req("PUT", { cookie, body: { ajuste: { idleSeconds: 1 } }, origin: "https://www.admira.live" }), env: e });
  assert.equal(malo.status, 400);
  assert.equal((await api.onRequestDelete({ request: req("DELETE", { cookie: COOKIE_PUERTA + "=" + puerta.valor, origin: "https://www.admira.live" }), env: e })).status, 401);
  const del = await api.onRequestDelete({ request: req("DELETE", { cookie, origin: "https://www.admira.live" }), env: e });
  assert.equal(del.status, 200);
  const g2 = await (await api.onRequestGet({ request: req("GET", { cookie }), env: e })).json();
  assert.deepEqual(g2.ajuste, {});
});

test("la página carga el ajuste antes de arrancar y sólo escucha al Director desde ainimation.studio", () => {
  const html = fs.readFileSync(new URL("./windows95/index.html", import.meta.url), "utf8");
  assert.match(html, /cargarAjuste\(function\(\)\{ preloadIcons\(boot\);/);
  assert.match(html, /fetch\('\/api\/win95\/ajuste',\{credentials:'same-origin'/);
  assert.match(html, /ORIGENES=\['https:\/\/www\.ainimation\.studio','https:\/\/ainimation\.studio'\]/);
  assert.match(html, /ev\.source!==window\.opener\|\|DIRECTOR\.origenes\.indexOf\(ev\.origin\)<0/);
  for (const tipo of ["hola", "estado?", "aplicar", "descartar", "guardar", "restaurar"]) assert.ok(html.includes("tipo==='" + tipo + "'"), tipo);
  assert.doesNotMatch(html, /postMessage\([^)]*,'\*'\)/);
});
