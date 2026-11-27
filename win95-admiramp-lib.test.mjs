// node --test win95-admiramp-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAGNET_THRESHOLD,
  AMP_DESIGN,
  EQ_FREQS,
  EQ_Q,
  EQ_PRESETS,
  sliderToDb,
  dbToSlider,
  preGainFromDb,
  bandGains,
  eqCurveValues,
  nextPresetIndex,
  presetByName,
  box,
  snapWindow,
  descendants,
  connectedCluster,
  undock,
  setDock,
  moveGroup,
  reflowDocks,
  initialAmpLayout,
  detectDocks,
  layoutPlaylist,
  skinScale,
  hostPermitido,
  urlPublicaAudio,
  proxyAudioPath,
  corsAllowsOrigin,
  audioPlaybackSrc,
  isProxySrc,
} from "./win95-admiramp-lib.mjs";
import * as api from "./functions/api/win95/audio.js";
import { emitir as emitirPuerta, COOKIE as COOKIE_PUERTA } from "./functions/_puerta.js";

const html = readFileSync(new URL("./windows95/index.html", import.meta.url), "utf8");

test("el día arranca con los 3 bloques imantados y alineados en vertical", () => {
  const { positions, docks } = initialAmpLayout(182, 16);
  assert.equal(positions.amp.l, 182);
  assert.equal(positions.eqw.t, positions.amp.b);
  assert.equal(positions.plw.t, positions.eqw.b);
  assert.equal(positions.eqw.l, 182);
  assert.equal(positions.plw.l, 182);
  assert.equal(docks.eqw.parentId, "amp");
  assert.equal(docks.eqw.side, "bottom");
  assert.equal(docks.plw.parentId, "eqw");
  assert.deepEqual(connectedCluster(docks, "amp").sort(), ["amp", "eqw", "plw"].sort());
});

test("al acercar un bloque a ~16 px se imanta al borde y alinea la arista", () => {
  const amp = box("amp", 100, 20, 275, 116);
  const eqw = box("eqw", 104, 20 + 116 + 12, 275, 116); // 12 px debajo, 4 px a la derecha
  const s = snapWindow(eqw, [amp], MAGNET_THRESHOLD);
  assert.equal(s.t, amp.b);
  assert.equal(s.l, amp.l);
  assert.equal(s.dock.parentId, "amp");
  assert.equal(s.dock.side, "bottom");
  assert.equal(s.dock.align, 0);
});

test("se imanta también a izquierda, derecha y arriba", () => {
  const amp = box("amp", 200, 80, 275, 116);
  const right = snapWindow(box("eqw", 200 + 275 + 10, 82, 275, 116), [amp]);
  assert.equal(right.l, amp.r);
  assert.equal(right.dock.side, "right");
  const left = snapWindow(box("eqw", 200 - 275 - 8, 80, 275, 116), [amp]);
  assert.equal(left.l, amp.l - 275);
  assert.equal(left.dock.side, "left");
  const above = snapWindow(box("eqw", 200, 80 - 116 - 15, 275, 116), [amp]);
  assert.equal(above.t, amp.t - 116);
  assert.equal(above.dock.side, "top");
});

test("fuera del umbral no se imanta", () => {
  const amp = box("amp", 0, 0, 275, 116);
  const s = snapWindow(box("eqw", 0, 116 + 40, 275, 116), [amp], 16);
  assert.equal(s.dock, null);
  assert.equal(s.t, 156);
});

test("arrastrar el principal mueve en bloque la cadena Main+Lista+EQ", () => {
  const { positions, docks } = initialAmpLayout(182, 16);
  const moved = moveGroup(positions, "amp", 200, 40, docks, "cluster");
  const dx = 18, dy = 24;
  assert.equal(moved.amp.l, 200);
  assert.equal(moved.amp.t, 40);
  assert.equal(moved.eqw.l, positions.eqw.l + dx);
  assert.equal(moved.eqw.t, positions.eqw.t + dy);
  assert.equal(moved.plw.l, positions.plw.l + dx);
  assert.equal(moved.plw.t, positions.plw.t + dy);
  assert.equal(moved.eqw.t, moved.amp.b);
  assert.equal(moved.plw.t, moved.eqw.b);
});

test("arrastrar Lista o EQ los despega; sus hijos viajan con ellos", () => {
  const { positions, docks } = initialAmpLayout(182, 16);
  const freed = undock(docks, "eqw");
  assert.equal(freed.eqw, undefined);
  assert.equal(freed.plw.parentId, "eqw");
  const moved = moveGroup(positions, "eqw", 40, 10, freed, "subtree");
  assert.equal(moved.amp.l, 182);
  assert.equal(moved.amp.t, 16);
  assert.equal(moved.eqw.l, 40);
  assert.equal(moved.eqw.t, 10);
  assert.equal(moved.plw.t, 10 + positions.eqw.h);
  assert.equal(moved.plw.l, 40);
});

test("setDock evita ciclos y detectDocks reconoce una pila alineada", () => {
  const { positions } = initialAmpLayout();
  const d = detectDocks(positions);
  assert.equal(d.eqw.parentId, "amp");
  assert.equal(d.plw.parentId, "eqw");
  const cyclic = setDock({ amp: { parentId: "eqw", side: "top", align: 0 } }, "eqw", { parentId: "amp", side: "bottom", align: 0 });
  assert.equal(cyclic.eqw, undefined);
  assert.deepEqual(descendants({ eqw: { parentId: "amp" }, plw: { parentId: "eqw" } }, "amp"), ["eqw", "plw"]);
});

test("al cambiar el tamaño del principal, reflow mantiene los imantados pegados", () => {
  const { positions, docks } = initialAmpLayout(182, 16);
  const taller = { ...positions, amp: box("amp", 182, 16, 275, 160) };
  const next = reflowDocks(taller, docks);
  assert.equal(next.eqw.t, 16 + 160);
  assert.equal(next.plw.t, next.eqw.b);
  assert.equal(next.eqw.l, 182);
});

test("al estirar la lista, pistas, scroll y barra inferior rellenan el 100 %", () => {
  const L = layoutPlaylist(275 + 180, 150);
  assert.equal(L.list.l, 10);
  assert.equal(L.list.w, 455 - 10 - 9 - 7);
  assert.equal(L.list.w + L.scrollbar.w + 10 + 9, 455);
  assert.equal(L.scrollbar.l + L.scrollbar.w + 9, 455);
  assert.equal(L.list.h, 150 - 23 - 18);
  assert.equal(L.scrollbar.h, L.list.h);
  assert.equal(L.tools.t + L.tools.h + 7, 150);
  assert.ok(L.tools.w > 200);
  assert.ok(L.fontPx >= 9);
  const slim = layoutPlaylist(275, 140);
  assert.ok(slim.list.w < L.list.w);
  assert.ok(slim.list.w >= 40);
});

test("WINAMP y EQ escalan el interior de forma proporcional, sin huecos de diseño", () => {
  const s = skinScale(550, 218);
  assert.equal(s.sx, 2);
  assert.equal(s.sy, 2);
  assert.equal(s.bodyW, 275);
  assert.equal(s.bodyH, 102);
  const odd = skinScale(400, 116);
  assert.equal(odd.sx, 400 / 275);
  assert.equal(odd.sy, 1);
});

test("EQ: 10 peaking, PRE en dB, ON/OFF y presets reales", () => {
  assert.deepEqual(EQ_FREQS, [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000]);
  assert.equal(EQ_Q, 1.4);
  assert.equal(sliderToDb(0.5), 0);
  assert.equal(sliderToDb(0), 12);
  assert.equal(sliderToDb(1), -12);
  assert.equal(dbToSlider(0), 0.5);
  assert.equal(preGainFromDb(6, true), Math.pow(10, 6 / 20));
  assert.equal(preGainFromDb(6, false), 1);
  assert.deepEqual(bandGains([3, -2, 0, 0, 0, 0, 0, 0, 0, 99], true), [3, -2, 0, 0, 0, 0, 0, 0, 0, 12]);
  assert.deepEqual(eqCurveValues([5, 5, 5, 5, 5, 5, 5, 5, 5, 5], false), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.ok(presetByName("rock"));
  assert.ok(presetByName("AGUDOS"));
  assert.ok(presetByName("SUAVE"));
  assert.equal(EQ_PRESETS.length >= 8, true);
  assert.equal(presetByName("ROCK")[1].length, 10);
  assert.equal(nextPresetIndex(0), 1);
  assert.equal(nextPresetIndex(EQ_PRESETS.length - 1), 0);
});

test("solo se proxifican URLs https de hosts Admira; Stock tiene CORS *", () => {
  assert.equal(hostPermitido("stock.admira.store"), true);
  assert.equal(hostPermitido("api.admira.store"), true);
  assert.equal(hostPermitido("evil.com"), false);
  assert.equal(hostPermitido("admira.store.evil.com"), false);
  assert.equal(urlPublicaAudio("http://stock.admira.store/x.mp3"), "");
  assert.equal(urlPublicaAudio("https://example.com/x.mp3"), "");
  assert.equal(urlPublicaAudio("https://user:pass@stock.admira.store/x.mp3"), "");
  const u = "https://stock.admira.store/stock/1795803270347-c6o6yn/asset.mp3?v=1";
  assert.equal(urlPublicaAudio(u), u);
  assert.equal(audioPlaybackSrc(u), u);
  assert.equal(audioPlaybackSrc(u, { useProxy: true }), "/api/win95/audio?u=" + encodeURIComponent(u));
  assert.equal(isProxySrc(proxyAudioPath(u)), true);
  assert.equal(corsAllowsOrigin("*"), true);
  assert.equal(corsAllowsOrigin("https://www.admira.live"), true);
  assert.equal(corsAllowsOrigin(""), false);
  assert.equal(corsAllowsOrigin("https://evil.com"), false);
});

const FIRMA = "z".repeat(48);
function kvFalso() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, m };
}
function env() { return { CHAT_KV: kvFalso(), PUERTA_FIRMA: FIRMA }; }

test("GET /api/win95/audio exige sesión, niega hosts ajenos y reenvía Range", async () => {
  const e = env();
  const bare = new Request("https://www.admira.live/api/win95/audio?u=" + encodeURIComponent("https://stock.admira.store/a.mp3"));
  assert.equal((await api.onRequestGet({ request: bare, env: e })).status, 401);

  const puerta = await emitirPuerta(FIRMA, "agente", "lucas");
  const cookie = COOKIE_PUERTA + "=" + puerta.valor;
  const bad = new Request("https://www.admira.live/api/win95/audio?u=" + encodeURIComponent("https://evil.com/a.mp3"), { headers: { Cookie: cookie } });
  assert.equal((await api.onRequestGet({ request: bad, env: e })).status, 400);

  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), method: init && init.method, range: init && init.headers && (init.headers.Range || init.headers.range) });
    return new Response("ID3FAKE", {
      status: 206,
      headers: {
        "content-type": "audio/mpeg",
        "content-range": "bytes 0-7/80",
        "content-length": "8",
        "accept-ranges": "bytes",
      },
    });
  };
  const okUrl = "https://stock.admira.store/stock/x/asset.mp3";
  const req = new Request("https://www.admira.live/api/win95/audio?u=" + encodeURIComponent(okUrl), {
    headers: { Cookie: cookie, Range: "bytes=0-7" },
  });
  const r = await api.onRequestGet({ request: req, env: e, fetch: fakeFetch });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.equal(r.headers.get("content-range"), "bytes 0-7/80");
  assert.equal(r.headers.get("accept-ranges"), "bytes");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, okUrl);
  assert.equal(calls[0].range, "bytes=0-7");
  assert.equal(await r.text(), "ID3FAKE");
  assert.equal(r.headers.get("set-cookie"), null);
});

test("el HTML cablea imán, escalado del interior y EQ Web Audio con CORS/proxy", () => {
  assert.match(html, /function makeAmpDraggable\(/);
  assert.match(html, /function layoutSkin\(/);
  assert.match(html, /function snapAmpWindow\(/);
  assert.match(html, /skin-body/);
  assert.match(html, /pl-tools/);
  assert.match(html, /createBiquadFilter/);
  assert.match(html, /f\.type='peaking'/);
  assert.match(html, /createMediaElementSource/);
  assert.match(html, /crossOrigin\s*=\s*['"]anonymous['"]/);
  assert.match(html, /\/api\/win95\/audio/);
  assert.match(html, /tryResume\(\)/);
  assert.match(html, /getByteFrequencyData/);
  assert.match(html, /eqPresetMenu|EQ_PRESETS|#eqPre/);
  assert.match(html, /drawEqGraph\(/);
});
