// Napster · catálogo real de admira.studio y búsqueda hashtag → título → artista.
// node --test win95-napster.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MAX_RESULTS, STOCK_INDEX, buscar, catalogo, coincideArtista, coincideHashtag,
  coincideTitulo, esCancion, esAudioPieza, esVideoPieza, leerCatalogo, nombreArchivo, partirTitulo, pieza, responder, tagDescarga, urlPublica,
  vaciarCache,
} from "./win95-napster-lib.mjs";
import * as api from "./functions/api/win95/napster.js";
import { emitir as emitirPuerta, COOKIE as COOKIE_PUERTA } from "./functions/_puerta.js";

const html = fs.readFileSync(new URL("./windows95/index.html", import.meta.url), "utf8");
const FIRMA = "z".repeat(48);
const env = () => ({ PUERTA_FIRMA: FIRMA });
const cookiePuerta = async () => {
  const puerta = await emitirPuerta(FIRMA, "agente", "neo");
  return COOKIE_PUERTA + "=" + puerta.valor;
};
const req = (q = "", cookie = "") =>
  new Request("https://www.admira.live/api/win95/napster" + q, {
    headers: cookie ? { Cookie: cookie } : {},
  });

const FIX = [
  { id: "a1", type: "audio", title: "Vida mía (versión Admira)", tags: ["suno", "admira", "vida-mia"], mime: "audio/mpeg", ext: "mp3", size: 2560000, url: "https://stock.admira.store/stock/a1/asset.mp3" },
  { id: "a2", type: "audio", title: "Vanessa Carlton - A Thousand Miles", tags: ["música", "pop", "videoclip"], mime: "audio/mpeg", ext: "mp3", size: 8855660, url: "https://stock.admira.store/stock/a2/asset.mp3" },
  { id: "a3", type: "music", title: "EN · 365 Hilo · Tarde dulce", tags: ["365", "song"], mime: "audio/mpeg", ext: "mp3", size: 1000000, url: "https://stock.admira.store/stock/a3/asset.mp3" },
  { id: "v80", type: "video", title: "Best Songs Of 1986 #80smusic #1986", tags: ["años 80", "80s", "80smusic"], mime: "video/mp4", ext: "mp4", url: "https://stock.admira.store/stock/v80/asset.mp4", thumbnail: "https://stock.admira.store/stock/v80/thumb.jpg" },
  { id: "v80t", type: "video", title: "Así Sonaba 1985… Cuando los 80s No Tenían Competencia", tags: ["música", "cine", "1985"], mime: "video/mp4", ext: "mp4", url: "https://stock.admira.store/stock/v80t/asset.mp4" },
  { id: "vbad", type: "video", title: "PREDATOR: The Competition That Turned the Cast Into Action Heroes", tags: ["80s", "4380"], mime: "video/mp4", ext: "mp4", url: "https://stock.admira.store/stock/vbad/asset.mp4" },
  { id: "loc1", type: "locucion", title: "Today we are closing at 8:00 PM", tags: ["locucion", "starbucks"], mime: "audio/mpeg", ext: "mp3", url: "https://stock.admira.store/stock/loc1/asset.mp3" },
  { id: "evil", type: "audio", title: "Cancion trampa #80", tags: ["80"], mime: "audio/mpeg", ext: "mp3", url: "https://evil.example/x.mp3" },
];

const canciones = catalogo(FIX);

test("esCancion: audio y music, vídeos musicales; no locuciones, no cine sin música, no URLs ajenas", () => {
  assert.equal(esCancion(FIX[0]), true);
  assert.equal(esCancion(FIX[1]), true);
  assert.equal(esCancion(FIX[2]), true);
  assert.equal(esCancion(FIX[3]), true);
  assert.equal(esCancion(FIX[4]), true);
  assert.equal(esCancion(FIX[5]), false, "Predator no es una canción");
  assert.equal(esCancion(FIX[6]), false, "locución no es canción");
  assert.equal(esCancion(FIX[7]), false, "host que no es de Admira");
  assert.equal(canciones.length, 5);
  assert.deepEqual(canciones.map((c) => c.id), ["a1", "a2", "a3", "v80", "v80t"]);
});

test("partirTitulo: «Artista - Título» y hashtags del vídeo; artista vacío no se inventa", () => {
  assert.deepEqual(partirTitulo(FIX[1]), { titulo: "A Thousand Miles", artista: "Vanessa Carlton" });
  assert.equal(partirTitulo(FIX[0]).artista, "");
  assert.equal(partirTitulo(FIX[0]).titulo, "Vida mía (versión Admira)");
  const p = pieza(FIX[3]);
  assert.ok(p.hashtags.includes("80s") && p.hashtags.includes("80smusic") && p.hashtags.includes("anos 80"));
  assert.equal(p.thumb, "https://stock.admira.store/stock/v80/thumb.jpg");
});

test("urlPublica solo admite https de hosts Admira", () => {
  assert.equal(urlPublica("https://stock.admira.store/stock/a1/asset.mp3").startsWith("https://stock.admira.store/"), true);
  assert.equal(urlPublica("https://evil.example/x.mp3"), "");
  assert.equal(urlPublica("http://admira.store/x.mp3"), "");
  assert.equal(urlPublica("javascript:alert(1)"), "");
});

test("coincideHashtag: #80 y 80 encuentran 80, 80s, 80smusic, años 80; no 4380", () => {
  const tags = ["años 80", "80s", "80smusic", "musica80", "pop 80s", "4380", "good"];
  assert.equal(coincideHashtag(tags, "80"), true);
  assert.equal(coincideHashtag(tags, "#80"), true);
  assert.equal(coincideHashtag(tags, "80s"), true);
  assert.equal(coincideHashtag(["4380", "good"], "80"), false);
  assert.equal(coincideHashtag(["1980s"], "80"), true);
  assert.equal(coincideHashtag(["admira"], "80"), false);
});

test("coincideTitulo: 80 encuentra 80s y 1980; no un 80 dentro de un número suelto tipo 180", () => {
  assert.equal(coincideTitulo("Cuando los 80s No Tenían Competencia", "80"), true);
  assert.equal(coincideTitulo("Cuando los 80s No Tenían Competencia", "#80"), true);
  assert.equal(coincideTitulo("Hits de 1980", "80"), true);
  assert.equal(coincideTitulo("Spatial Intelligence Ambient", "80"), false);
  assert.equal(coincideTitulo("Versión 180", "80"), false);
  assert.equal(coincideTitulo("Vida mía (versión Admira)", "admira"), true);
});

test("búsqueda #80 / 80: primero hashtag, después título, después artista", () => {
  const ids = (q) => buscar(canciones, { q }).results.map((c) => c.id);
  const a = ids("80");
  const b = ids("#80");
  assert.deepEqual(a, b, "#80 y 80 devuelven lo mismo y en el mismo orden");
  assert.ok(a.includes("v80") && a.includes("v80t"));
  assert.ok(a.indexOf("v80") < a.indexOf("v80t"), "hashtag #80smusic / años 80 va antes del título «los 80s»");
  assert.equal(a.includes("vbad"), false);
  assert.equal(a.includes("loc1"), false);
  assert.equal(buscar(canciones, { q: "80" }).total, 5, "total es el catálogo completo, no los resultados");
});

test("búsqueda por artista (Vanessa) y por título (Thousand / admira)", () => {
  const van = buscar(canciones, { q: "Vanessa" });
  assert.deepEqual(van.results.map((c) => c.id), ["a2"]);
  assert.equal(van.results[0].artista, "Vanessa Carlton");
  assert.equal(coincideArtista("Vanessa Carlton", "vanessa"), true);
  const tit = buscar(canciones, { q: "Thousand" });
  assert.deepEqual(tit.results.map((c) => c.id), ["a2"]);
  const adm = buscar(canciones, { q: "admira" });
  assert.equal(adm.results[0].id, "a1", "hashtag admira primero");
  assert.ok(!adm.results.some((c) => c.id === "a2"), "Vanessa no casa con admira");
});

test("campos separados: artista + título se combinan; sin consulta, solo el total", () => {
  const vacio = buscar(canciones, {});
  assert.equal(vacio.total, 5);
  assert.deepEqual(vacio.results, []);
  const ambos = buscar(canciones, { artista: "Vanessa", titulo: "Thousand" });
  assert.deepEqual(ambos.results.map((c) => c.id), ["a2"]);
  const no = buscar(canciones, { artista: "Vanessa", titulo: "80" });
  assert.deepEqual(no.results, []);
});

test("responder expone el contrato público y recorta a MAX_RESULTS", () => {
  const r = responder({ canciones, at: Date.parse("2026-11-25T20:30:00Z") }, { q: "80" });
  assert.equal(r.ok, true);
  assert.equal(r.total, 5);
  assert.equal(r.fuente, "stock.admira.store");
  assert.equal(r.results[0].titulo.length > 0, true);
  assert.deepEqual(Object.keys(r.results[0]).sort(), ["artista", "duracion", "hashtags", "id", "size", "thumb", "tipo", "titulo", "url"]);
  assert.equal(r.results[0].tipo, "video");
  assert.ok(r.results[0].url.startsWith("https://stock.admira.store/"));
  const muchos = Array.from({ length: MAX_RESULTS + 10 }, (_, i) => ({
    id: "n" + i, titulo: "Tema " + i, artista: "", hashtags: ["80"], duracion: 1, url: "https://stock.admira.store/x.mp3", thumb: "", size: 1,
  }));
  assert.equal(buscar(muchos, { q: "80" }).results.length, MAX_RESULTS);
});

test("leerCatalogo: 502 honesto si Stock falla o el JSON no es un catálogo; cachea el bueno", async () => {
  vaciarCache();
  await assert.rejects(() => leerCatalogo(async () => new Response("no", { status: 503 })), /HTTP 503/);
  await assert.rejects(() => leerCatalogo(async () => new Response("{\"no\":true}", { status: 200, headers: { "content-type": "application/json" } })), /irreconocible/);
  let llamadas = 0;
  const fetchOk = async (url) => {
    llamadas++;
    assert.equal(url, STOCK_INDEX);
    return new Response(JSON.stringify({ items: FIX, total: FIX.length }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const a = await leerCatalogo(fetchOk, { ahora: 1_000, forzar: true });
  assert.equal(a.total, 5);
  const b = await leerCatalogo(fetchOk, { ahora: 1_000 + 10_000 });
  assert.equal(b.cached, true);
  assert.equal(llamadas, 1);
  vaciarCache();
});

test("GET /api/win95/napster: 401 sin sesión; 502 si Stock falla; 200 con orden hashtag-primero", async () => {
  vaciarCache();
  assert.equal((await api.onRequestGet({ request: req(), env: env() })).status, 401);
  const cookie = await cookiePuerta();
  const fail = await api.onRequestGet({
    request: req("?q=80", cookie),
    env: env(),
    fetch: async () => new Response("down", { status: 502 }),
  });
  assert.equal(fail.status, 502);
  const err = await fail.json();
  assert.equal(err.ok, false);
  assert.match(err.error, /admira\.studio no contesta/);
  assert.equal("results" in err, false);

  vaciarCache();
  const ok = await api.onRequestGet({
    request: req("?q=80", cookie),
    env: env(),
    fetch: async () => new Response(JSON.stringify({ items: FIX }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal(ok.status, 200);
  const d = await ok.json();
  assert.equal(d.ok, true);
  assert.equal(d.total, 5);
  assert.deepEqual(d.results.map((c) => c.id), ["v80", "v80t"]);
  assert.ok(d.results[0].url.startsWith("https://stock.admira.store/"));
});

test("la Win95 Xperience llama a /api/win95/napster y no usa el catálogo de demostración", () => {
  assert.match(html, /\/api\/win95\/napster/);
  assert.doesNotMatch(html, /var NAP_DB\s*=/);
  assert.doesNotMatch(html, /NAP\.songs\+=Math\.floor\(Math\.random/);
  assert.doesNotMatch(html, /morfeo_95/);
  assert.match(html, /admira\.studio/);
  assert.match(html, /waitUntil\(function\(\)\{ return NAP\.conn; \},tk,20000\)/);
});

test("al descargar, audio recibe #winamp y vídeo #AdmiraMediaPlayer", () => {
  assert.equal(tagDescarga(pieza(FIX[0])), "winamp");
  assert.equal(esAudioPieza(pieza(FIX[0])), true);
  assert.equal(tagDescarga(pieza(FIX[3])), "AdmiraMediaPlayer");
  assert.equal(esVideoPieza(pieza(FIX[3])), true);
  assert.equal(nombreArchivo(pieza(FIX[1])), "Vanessa Carlton - A Thousand Miles.mp3");
  assert.equal(nombreArchivo(pieza(FIX[3])).endsWith(".mp4"), true);
});
