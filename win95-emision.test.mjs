import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCREEN, TAGS, piezaClave, playlistUnica } from "./win95-emision-lib.mjs";
import * as api from "./functions/api/win95/emision.js";
import { emitirSesion, COOKIE_SESION } from "./chat-hilo-lib.mjs";
import { emitir as emitirPuerta, COOKIE as COOKIE_PUERTA } from "./functions/_puerta.js";

test("la playlist de fábrica incluye #win95, #WindowsMediaPlayer y #AdmiraMediaPlayer", () => {
  assert.equal(SCREEN, "virtual-win95");
  const low = TAGS.map((t) => t.toLowerCase());
  assert.ok(low.includes("win95"));
  assert.ok(low.includes("windowsmediaplayer"));
  assert.ok(low.includes("admiramediaplayer"));
  assert.ok(low.includes("genero95"));
});

test("playlistUnica une hashtags, no inventa piezas y no repite id", () => {
  const tags = [
    { tag: "win95", piezas: [
      { id: "a", titulo: "Uno", url: "https://api.admira.store/stock/asset/a" },
      { id: "b", titulo: "Dos", url: "https://api.admira.store/stock/asset/b" },
    ] },
    { tag: "WindowsMediaPlayer", piezas: [
      { id: "a", titulo: "Uno otra vez", url: "https://api.admira.store/stock/asset/a" },
    ] },
    { tag: "AdmiraMediaPlayer", piezas: [] },
    { tag: "genero95", piezas: null },
  ];
  const pl = playlistUnica(tags);
  assert.equal(pl.length, 2);
  assert.deepEqual(pl.map((p) => p.id), ["a", "b"]);
  assert.equal(pl[0].tag, "win95");
  assert.equal(playlistUnica([]).length, 0);
  assert.equal(playlistUnica(undefined).length, 0);
  assert.equal(piezaClave({}), "");
});

const FIRMA = "z".repeat(48);
const env = () => ({ CHAT_KV: new Map(), PUERTA_FIRMA: FIRMA });
// CHAT_KV needs get/put for emailGoogle? emision only uses verificar or emailGoogle.
// Map is not a KV. Use a stub like other tests if needed. Auth via puerta cookie is enough.

function kvFalso() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, m };
}

test("GET /api/win95/emision sin sesión → 401; con puerta devuelve playlist real (0/0 si vacío)", async () => {
  const e = { CHAT_KV: kvFalso(), PUERTA_FIRMA: FIRMA };
  const req = (cookie = "") => new Request("https://www.admira.live/api/win95/emision", {
    headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal((await api.onRequestGet({ request: req(), env: e, fetch: async () => { throw new Error("no"); } })).status, 401);

  const puerta = await emitirPuerta(FIRMA, "agente", "woz");
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    const tag = u.searchParams.get("tag");
    if (tag === "win95") {
      return new Response(JSON.stringify({
        ok: true,
        piezas: [
          { id: "1795a", titulo: "Freestyler", tipo: "video", url: "https://api.admira.store/stock/asset/1795a" },
          { id: "1795b", titulo: "Fistraila", tipo: "video", url: "https://api.admira.store/stock/asset/1795b" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, piezas: [], avisos: [{ es: "vacío" }] }), { status: 200 });
  };
  const r = await api.onRequestGet({ request: req(COOKIE_PUERTA + "=" + puerta.valor), env: e, fetch: fakeFetch });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.screen, "virtual-win95");
  assert.equal(d.total, 2);
  assert.equal(d.playlist.length, 2);
  assert.deepEqual(d.playlist.map((p) => p.titulo), ["Freestyler", "Fistraila"]);
  const asked = calls.map((u) => new URL(u).searchParams.get("tag")).sort();
  assert.deepEqual(asked, ["AdmiraMediaPlayer", "WindowsMediaPlayer", "genero95", "win95"].sort());
  assert.ok(!JSON.stringify(d).includes("secret") && !JSON.stringify(d).includes("token"));
});
