// Encargo #7751 (Carlos, 27-nov-2026): los tags de Winamp van DIRECTOS al player virtual de Win95.
// AdmirAmp carga su lista por el mismo camino que el Admira Media Player: la emisión de
// virtual-win95 con el hashtag #winamp vía /api/win95/emision?lista=winamp (server-side),
// sin raspar stock.admira.store ni api.admira.store/stock/list desde el navegador.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCREEN, TAGS, TAGS_WINAMP, LISTAS, tagsDeLista } from "./win95-emision-lib.mjs";
import * as api from "./functions/api/win95/emision.js";
import { emitir as emitirPuerta, COOKIE as COOKIE_PUERTA } from "./functions/_puerta.js";

const html = readFileSync(new URL("./windows95/index.html", import.meta.url), "utf8");

test("#7751: la lista winamp existe, es solo #winamp y la lista por defecto sigue siendo la del Media Player", () => {
  assert.deepEqual(TAGS_WINAMP, ["winamp"]);
  assert.deepEqual(tagsDeLista("winamp"), ["winamp"]);
  assert.deepEqual(tagsDeLista("WINAMP"), ["winamp"]);
  assert.equal(tagsDeLista(), TAGS);
  assert.equal(tagsDeLista(""), TAGS);
  assert.equal(tagsDeLista("media"), TAGS);
  assert.equal(tagsDeLista("stock"), null);
  assert.equal(tagsDeLista("__proto__"), null);
  assert.deepEqual(Object.keys(LISTAS).sort(), ["media", "winamp"]);
});

const FIRMA = "z".repeat(48);
function kvFalso() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); } };
}

test("#7751: GET /api/win95/emision?lista=winamp pide SOLO tag=winamp a admira.tv (screen virtual-win95) y devuelve la playlist saneada", async () => {
  const e = { CHAT_KV: kvFalso(), PUERTA_FIRMA: FIRMA };
  const puerta = await emitirPuerta(FIRMA, "agente", "neo");
  const req = (q, cookie) => new Request("https://www.admira.live/api/win95/emision" + q, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  // sin sesión → 401, también con lista
  assert.equal((await api.onRequestGet({ request: req("?lista=winamp"), env: e, fetch: async () => { throw new Error("no"); } })).status, 401);

  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(new URL(url));
    return new Response(JSON.stringify({
      ok: true,
      screen: "virtual-win95",
      fuente: "hashtag",
      piezas: [
        { pos: 1, id: "1795803270347-c6o6yn", stockId: "1795803270347-c6o6yn", titulo: "90’s Most Popular Songs #90s", tipo: "audio", medio: "audio", duracion: 18, url: "https://api.admira.store/stock/asset/1795803270347-c6o6yn?v=1666457", token: "nunca" },
        { pos: 2, id: "1795802671299-dv4c0e", titulo: "Clasicos De Los 80 y 90", tipo: "audio", duracion: 18, url: "https://api.admira.store/stock/asset/1795802671299-dv4c0e?v=1727111" },
        { pos: 3, id: "ajena", titulo: "host ajeno", tipo: "audio", url: "https://evil.example/x.mp3" },
      ],
      avisos: [{ es: "El mando ha puesto la playlist alternativa #winamp", en: "..." }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const r = await api.onRequestGet({ request: req("?lista=winamp", COOKIE_PUERTA + "=" + puerta.valor), env: e, fetch: fakeFetch });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.screen, SCREEN);
  assert.equal(d.lista, "winamp");
  assert.equal(calls.length, 1, "una sola llamada upstream: solo #winamp");
  assert.equal(calls[0].origin + calls[0].pathname, "https://admira.tv/api/emision");
  assert.equal(calls[0].searchParams.get("screen"), "virtual-win95");
  assert.equal(calls[0].searchParams.get("tag"), "winamp");
  assert.deepEqual(d.tags.map((t) => t.tag), ["winamp"]);
  assert.equal(d.total, 2, "la pieza de host ajeno se descarta");
  assert.deepEqual(d.playlist.map((p) => p.id), ["1795803270347-c6o6yn", "1795802671299-dv4c0e"]);
  assert.ok(d.playlist.every((p) => p.tag === "winamp" && p.tipo === "audio" && p.url.startsWith("https://api.admira.store/")));
  assert.match(d.tags[0].aviso, /#winamp/);
  assert.ok(!JSON.stringify(d).includes("nunca"), "solo campos públicos");
});

test("#7751: una lista desconocida no abre un proxy: 400; sin lista sigue siendo el Media Player (4 hashtags)", async () => {
  const e = { CHAT_KV: kvFalso(), PUERTA_FIRMA: FIRMA };
  const puerta = await emitirPuerta(FIRMA, "agente", "neo");
  const cookie = COOKIE_PUERTA + "=" + puerta.valor;
  const calls = [];
  const fakeFetch = async (url) => { calls.push(new URL(url).searchParams.get("tag")); return new Response(JSON.stringify({ ok: true, piezas: [] }), { status: 200 }); };
  const mk = (q) => new Request("https://www.admira.live/api/win95/emision" + q, { headers: { Cookie: cookie } });

  const malo = await api.onRequestGet({ request: mk("?lista=stock"), env: e, fetch: fakeFetch });
  assert.equal(malo.status, 400);
  assert.equal((await malo.json()).error, "lista");
  assert.equal(calls.length, 0);

  const base = await api.onRequestGet({ request: mk(""), env: e, fetch: fakeFetch });
  assert.equal(base.status, 200);
  assert.equal((await base.json()).lista, "media");
  assert.deepEqual(calls.sort(), [...TAGS].sort());
});

test("#7751: AdmirAmp carga su lista por /api/win95/emision?lista=winamp y ya no raspa el Stock en el cliente", () => {
  assert.match(html, /async function readWinampEmision\(\)/);
  assert.match(html, /fetch\('\/api\/win95\/emision\?lista=winamp', \{cache:'no-store', credentials:'same-origin'/);
  assert.match(html, /function trackFromEmision\(p\)/);
  assert.match(html, /var piezas = await readWinampEmision\(\);/);
  assert.match(html, /descargasDe\('winamp'\)/, "las descargas de Napster siguen entrando en la lista");
  // Nada de raspado desde el navegador
  assert.doesNotMatch(html, /readWinampStock/);
  assert.doesNotMatch(html, /stockHasTag/);
  assert.doesNotMatch(html, /api\.admira\.store\/stock\/list\?limit=200/);
  assert.doesNotMatch(html, /fetch\('https:\/\/stock\.admira\.store\/stock\/index\.json'/);
  // Sin servidor (file:) no hay emisión y no se inventa nada
  assert.match(html, /if \(location\.protocol==='file:' \|\| typeof fetch!=='function'\) return \[\];/);
});

test("#7751: trackFromEmision (misma lógica que la página) convierte piezas de audio y descarta vídeo o URL no https", () => {
  // Se extrae la función tal cual del HTML para probarla sin navegador.
  const m = html.match(/function trackFromEmision\(p\)\{[\s\S]*?\n\}\n/);
  assert.ok(m, "trackFromEmision presente");
  const trackFromEmision = new Function(m[0] + "return trackFromEmision;")();
  const t = trackFromEmision({ id: "a1", titulo: "Daft Punk - Around the World", tipo: "audio", duracion: 18, url: "https://api.admira.store/stock/asset/a1?v=1" });
  assert.deepEqual(t, { stockId: "a1", artist: "Daft Punk", title: "Around the World", duration: 18, bpm: 120, src: "https://api.admira.store/stock/asset/a1?v=1", tag: "winamp" });
  assert.equal(trackFromEmision({ id: "a2", titulo: "Sin artista", tipo: "audio", url: "https://api.admira.store/stock/asset/a2" }).artist, "Admira Studio");
  assert.equal(trackFromEmision({ id: "v1", titulo: "Vídeo", tipo: "video", url: "https://api.admira.store/stock/asset/v1" }), null);
  assert.equal(trackFromEmision({ id: "h1", titulo: "http", tipo: "audio", url: "http://api.admira.store/stock/asset/h1" }), null);
  assert.equal(trackFromEmision(null), null);
});

test("#7751: la documentación precargada cuenta el camino directo", () => {
  const txt = readFileSync(new URL("./windows95/como-funciona-win95-xperience.txt", import.meta.url), "utf8");
  for (const doc of [html, txt]) {
    assert.match(doc, /GET \/api\/win95\/emision\?lista=winamp, el mismo camino que el Media\nPlayer; encargo #7751/);
    assert.match(doc, /Ya no se raspa el Stock desde el navegador/);
  }
});
