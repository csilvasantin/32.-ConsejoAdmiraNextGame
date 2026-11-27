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
  ampLayoutBox,
  restackAmpWindows,
  reflowVisibleDocks,
  visibleDockParent,
  shouldUndockOnPointer,
  detectDocks,
  layoutPlaylist,
  skinScale,
  hostPermitido,
  urlPublicaAudio,
  proxyAudioPath,
  corsAllowsOrigin,
  audioPlaybackSrc,
  isProxySrc,
  trackKey,
  shouldProxyAudio,
  cleanLocalName,
  removeSelected,
  mergePlaylist,
  eqLiveBars,
  useFakeSpectrum,
  importStatus,
  isAudioResult,
  ampIsPlaying,
  ampVisorState,
  playerSpectrumActive,
  marqueeCanDraw,
  playlistCounterText,
  playlistCount,
  playerVisorDefaultMode,
  eqWaveSamples,
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
  assert.match(html, /function restackAmpDefault\(/);
  assert.match(html, /function restackAmpWindows\(/);
  assert.match(html, /function ampLayoutBox\(/);
  assert.match(html, /restackAmpDefault\(\);/);
  assert.match(html, /shouldUndockOnPointer\(/);
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
  assert.match(html, /id="ampAdd"/);
  assert.match(html, /id="ampRemove"/);
  assert.match(html, /id="ampSel"/);
  assert.match(html, /function ampRemoveSelected\(/);
  assert.match(html, /function ampAddLocalFiles\(/);
  assert.match(html, /function openAmpSel\(/);
  assert.match(html, /\/api\/win95\/napster\?q=/);
  assert.match(html, /createObjectURL/);
  assert.match(html, /shouldProxyAudio/);
  assert.match(html, /function eqLiveWaveNow\(/);
  assert.match(html, /getByteTimeDomainData\(A\.wave\)/);
  assert.match(html, /var VZ_MODE_BARS=0/);
  assert.match(html, /var VZ=\{mode:VZ_MODE_BARS/);
  assert.match(html, /function ampIsPlaying\(/);
  assert.match(html, /function ampVisorState\(/);
  assert.match(html, /function playlistCounterText\(/);
  assert.match(html, /if\(!MARQ\.img\) return;/);
  assert.match(html, /try\{ if\(PL\.open\)\{/);
  assert.match(html, /catch\(e\)\{\} requestAnimationFrame\(frame\)/);
  assert.match(html, /ampIsPlaying\(\)&&audioRunning\(\)&&A\.analyser/);
  assert.match(html, /\.prow \.n\{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis\}/);
  assert.match(html, /#plw>#plist\{[^}]*right:16px/);
  assert.match(html, /Importar a #winamp/);
  assert.doesNotMatch(html, /if\(!box\.children\.length\)/);
});


test("QUITAR elimina la pista seleccionada, avanza si sonaba y no la deja en el merge", () => {
  const a = { stockId: "a", title: "Uno", src: "https://stock.admira.store/a.mp3" };
  const b = { stockId: "b", title: "Dos", src: "https://stock.admira.store/b.mp3" };
  const c = { localId: "l1", title: "Local", src: "blob:https://www.admira.live/x" };
  const r = removeSelected([a, b, c], 1, 1, "play");
  assert.equal(r.removed.stockId, "b");
  assert.deepEqual(r.tracks.map((t) => t.stockId || t.localId), ["a", "l1"]);
  assert.equal(r.playIndex, 1);
  assert.equal(r.cur, 1);
  const empty = removeSelected([a], 0, 0, "play");
  assert.equal(empty.state, "stop");
  assert.equal(empty.tracks.length, 0);
  assert.equal(empty.playIndex, null);
  const merged = mergePlaylist({
    stock: [a, b],
    extras: [c],
    hiddenKeys: [trackKey(b)],
  });
  assert.deepEqual(merged.map(trackKey), ["stock:a", "local:l1"]);
  assert.equal(merged.some((t) => t.stockId === "b"), false);
});

test("AÑADIR local limpia el nombre y no proxifica blob:", () => {
  const n = cleanLocalName("Clasicos De Los 80 - Mix.mp3");
  assert.equal(n.artist, "Clasicos De Los 80");
  assert.equal(n.title, "Mix");
  assert.equal(cleanLocalName("tema.wav").artist, "Local");
  assert.equal(cleanLocalName("tema.wav").title, "tema");
  assert.equal(shouldProxyAudio("blob:https://www.admira.live/abc"), false);
  assert.equal(shouldProxyAudio("https://stock.admira.store/stock/x/asset.mp3"), true);
  assert.equal(useFakeSpectrum({ src: "blob:https://x/y" }), false);
  assert.equal(useFakeSpectrum({ bars: 16 }), true);
});

test("SEL importa a la lista de sesión y declara con honestidad que no hay API de escritura en Stock", () => {
  const extra = { stockId: "z", title: "Nueva", src: "https://stock.admira.store/z.mp3", tag: "winamp" };
  const list = mergePlaylist({ stock: [{ stockId: "a", src: "https://stock.admira.store/a.mp3" }], extras: [extra] });
  assert.equal(list.length, 2);
  assert.equal(list[1].stockId, "z");
  assert.match(importStatus(false), /no hay un API para escribir la etiqueta #winamp/i);
  assert.equal(isAudioResult({ tipo: "audio", url: "https://stock.admira.store/a.mp3" }), true);
  assert.equal(isAudioResult({ tipo: "video", url: "https://stock.admira.store/a.mp4" }), false);
});

test("el espectro del EQ sale de datos reales del analizador, no de un pulso inventado", () => {
  const freq = new Uint8Array(512);
  freq[Math.round((60 / 22050) * 512)] = 200;
  freq[Math.round((1000 / 22050) * 512)] = 40;
  const bars = eqLiveBars(freq, 44100, 10);
  assert.equal(bars.length, 10);
  assert.ok(bars[0] > 0.5, "graves vivos");
  assert.ok(bars[4] > 0.1, "1K reacciona");
  assert.ok(eqLiveBars([], 44100).every((v) => v === 0));
});


test("GET /api/win95/audio sigue redirects a hosts Admira y rechaza un 302 a un dominio ajeno", async () => {
  const e = env();
  const puerta = await emitirPuerta(FIRMA, "agente", "lucas");
  const cookie = COOKIE_PUERTA + "=" + puerta.valor;
  const finalUrl = "https://stock.admira.store/stock/x/asset.mp3";
  const mid = "https://api.admira.store/stock/asset/x";
  const calls = [];
  const fakeFetch = async (url, init) => {
    const u = String(url);
    calls.push(u);
    if (u === mid) {
      return new Response(null, { status: 302, headers: { Location: finalUrl } });
    }
    if (u === finalUrl) {
      return new Response("OKAUDIO", { status: 200, headers: { "content-type": "audio/mpeg", "accept-ranges": "bytes" } });
    }
    throw new Error("unexpected " + u);
  };
  const req = new Request("https://www.admira.live/api/win95/audio?u=" + encodeURIComponent(mid), { headers: { Cookie: cookie } });
  const r = await api.onRequestGet({ request: req, env: e, fetch: fakeFetch });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "OKAUDIO");
  assert.deepEqual(calls, [mid, finalUrl]);

  const evilFetch = async (url) => new Response(null, { status: 302, headers: { Location: "https://evil.com/steal.mp3" } });
  const bad = await api.onRequestGet({
    request: new Request("https://www.admira.live/api/win95/audio?u=" + encodeURIComponent(finalUrl), { headers: { Cookie: cookie } }),
    env: e,
    fetch: evilFetch,
  });
  assert.equal(bad.status, 502);
});

test("el visor del player WINAMP se activa cuando el audio está realmente sonando, aunque PL.state diga stop", () => {
  assert.equal(ampIsPlaying({ state: "stop", elPaused: false, elEnded: false, elSrc: "https://stock.admira.store/a.mp3" }), true);
  assert.equal(ampVisorState({ state: "stop", elPaused: false, elEnded: false, elSrc: "https://stock.admira.store/a.mp3" }), "play");
  assert.equal(playerSpectrumActive({ state: "stop", elPaused: false, elEnded: false, elSrc: "https://stock.admira.store/a.mp3" }), true);
  assert.equal(ampIsPlaying({ state: "play", elPaused: true, elEnded: false, elSrc: "" }), true);
  assert.equal(ampIsPlaying({ state: "stop", elPaused: true, elEnded: false, elSrc: "https://x/a.mp3" }), false);
  assert.equal(ampIsPlaying({ state: "pause", elPaused: true, elEnded: false, elSrc: "https://x/a.mp3" }), false);
  assert.equal(ampVisorState({ state: "pause", elPaused: true, elEnded: false, elSrc: "https://x/a.mp3" }), "pause");
  assert.equal(ampIsPlaying({ state: "stop", seqPlaying: true }), true);
  assert.equal(playerSpectrumActive({ state: "stop" }), false);
  assert.equal(marqueeCanDraw(null), false);
  assert.equal(marqueeCanDraw(undefined), false);
  assert.equal(marqueeCanDraw({ width: 0, height: 0 }), false);
  assert.equal(marqueeCanDraw({ width: 40, height: 7 }), true);
});

test("el contador de la lista nunca pinta 1/0 y usa el total real de pistas", () => {
  assert.equal(playlistCounterText(0, 0, 0, 0), "0/0 0:00/0:00");
  assert.equal(playlistCounterText(0, 3, 0, 0), "1/3 0:00/0:00");
  assert.equal(playlistCounterText(1, 3, 75, 360), "2/3 1:15/6:00");
  assert.equal(playlistCounterText(9, 3, 12, 40), "3/3 0:12/0:40");
  assert.equal(playlistCount(0, 0), 0);
  assert.equal(playlistCount(0, 3), 3);
  assert.equal(playlistCount(3, 0), 3);
  const L = layoutPlaylist(275, 150);
  assert.equal(L.list.l + L.list.w, L.scrollbar.l);
  assert.equal(L.list.r, 16);
  assert.ok(L.list.l + L.list.w + L.list.r === 275);
});

test("el visor WINAMP arranca en barras de espectro y el EQ pinta la onda en tiempo real", () => {
  assert.equal(playerVisorDefaultMode(), 0);
  assert.match(html, /var VZ_MODE_BARS=0,VZ_MODE_WAVE=1/);
  assert.match(html, /var VZ=\{mode:VZ_MODE_BARS/);
  assert.match(html, /VZ\.mode=VZ\.mode===VZ_MODE_BARS\?VZ_MODE_WAVE:VZ_MODE_BARS/);
  assert.match(html, /function eqLiveWaveNow\(/);
  assert.match(html, /function drawEqGraph\(\)\{[\s\S]*?eqLiveWaveNow\(W\)/);
  assert.match(html, /function eqLiveWaveNow\([\s\S]*?getByteTimeDomainData\(A\.wave\)/);
  assert.doesNotMatch(html, /function drawEqGraph\(\)\{[\s\S]*?eqLiveBarsNow/);
  assert.doesNotMatch(html, /function drawEqGraph\(\)\{[\s\S]*?VCOL\[/);
  const silent = new Uint8Array(64).fill(128);
  assert.ok(eqWaveSamples(silent, 10).every((v) => v === 0));
  assert.deepEqual(eqWaveSamples(null, 4), [0, 0, 0, 0]);
  const wave = new Uint8Array(64);
  for (let i = 0; i < 64; i++) wave[i] = i < 32 ? 255 : 1;
  const samples = eqWaveSamples(wave, 10);
  assert.equal(samples.length, 10);
  assert.ok(samples[0] > 0.5, "ataque positivo de la onda");
  assert.ok(samples[9] < -0.5, "valle negativo de la onda");
});

test("ampLayoutBox no usa (0,0) cuando la ventana está oculta: conserva left/top del estilo", () => {
  const hidden = ampLayoutBox("eqw", {
    hidden: true,
    offsetL: 0, offsetT: 0, offsetW: 0, offsetH: 0,
    styleL: 400, styleT: 132, styleW: 275, styleH: 116,
  });
  assert.equal(hidden.l, 400);
  assert.equal(hidden.t, 132);
  assert.equal(hidden.w, 275);
  assert.equal(hidden.h, 116);
  const vis = ampLayoutBox("eqw", {
    hidden: false,
    offsetL: 300, offsetT: 140, offsetW: 275, offsetH: 116,
    styleL: 0, styleT: 0,
  });
  assert.equal(vis.l, 300);
  assert.equal(vis.t, 140);
});

test("mover WINAMP y desactivar/reactivar EQ y PL los deja alineados bajo el player, no en la posición inicial", () => {
  const start = initialAmpLayout(182, 16);
  const moved = moveGroup(start.positions, "amp", 400, 40, start.docks, "cluster");
  assert.equal(moved.amp.l, 400);
  assert.equal(moved.eqw.l, 400);
  assert.equal(moved.plw.l, 400);

  const hidEq = restackAmpWindows(moved, { amp: true, eqw: false, plw: true });
  assert.equal(hidEq.positions.plw.l, 400);
  assert.equal(hidEq.positions.plw.t, hidEq.positions.amp.b);
  assert.equal(hidEq.docks.plw.parentId, "amp");
  assert.equal(hidEq.positions.eqw.l, 400);
  assert.equal(hidEq.positions.eqw.t, hidEq.positions.amp.b);
  assert.notEqual(hidEq.positions.eqw.l, 182);
  assert.notEqual(hidEq.positions.plw.t, 248);

  const shown = restackAmpWindows(hidEq.positions, { amp: true, eqw: true, plw: true });
  assert.equal(shown.positions.eqw.l, 400);
  assert.equal(shown.positions.eqw.t, shown.positions.amp.b);
  assert.equal(shown.positions.plw.l, 400);
  assert.equal(shown.positions.plw.t, shown.positions.eqw.b);
  assert.equal(shown.docks.eqw.parentId, "amp");
  assert.equal(shown.docks.plw.parentId, "eqw");
});

test("al ocultar EQ, el reflow no ancla la playlist a una caja (0,0)", () => {
  const start = initialAmpLayout(182, 16);
  const moved = moveGroup(start.positions, "amp", 360, 20, start.docks, "cluster");
  const hiddenEqBox = { ...moved.eqw, l: 0, t: 0, w: 0, h: 0, r: 0, b: 0 };
  const broken = { ...moved, eqw: hiddenEqBox };
  const fixed = reflowVisibleDocks(broken, start.docks, { amp: true, eqw: false, plw: true });
  assert.equal(visibleDockParent(start.docks, "plw", { amp: true, eqw: false, plw: true }), "amp");
  assert.equal(fixed.plw.l, moved.amp.l);
  assert.equal(fixed.plw.t, moved.amp.b);
  assert.notEqual(fixed.plw.l, 0);
  assert.notEqual(fixed.plw.t, 0);
});

test("desacoplar al arrastrar no parte de (0,0): un clic no desenchufa y el arrastre usa la posición actual", () => {
  assert.equal(shouldUndockOnPointer(0, 0), false);
  assert.equal(shouldUndockOnPointer(3, 0), false);
  assert.equal(shouldUndockOnPointer(4, 0), true);
  assert.equal(shouldUndockOnPointer(0, -5), true);
  const start = initialAmpLayout(182, 16);
  const moved = moveGroup(start.positions, "amp", 410, 50, start.docks, "cluster");
  const eqStart = ampLayoutBox("eqw", {
    hidden: false,
    offsetL: moved.eqw.l, offsetT: moved.eqw.t, offsetW: moved.eqw.w, offsetH: moved.eqw.h,
  });
  assert.equal(eqStart.l, 410);
  assert.equal(eqStart.t, moved.amp.b);
  const dragged = moveGroup(moved, "eqw", eqStart.l + 12, eqStart.t + 8, undock(start.docks, "eqw"), "subtree");
  assert.equal(dragged.eqw.l, 422);
  assert.notEqual(dragged.eqw.l, 182);
  assert.notEqual(dragged.eqw.l, 0);
});

test("mover WINAMP con EQ oculto y reabrir EQ lo coloca bajo el player, empujando PL debajo", () => {
  const start = initialAmpLayout(182, 16);
  const afterHide = restackAmpWindows(start.positions, { amp: true, eqw: false, plw: true });
  const moved = moveGroup(afterHide.positions, "amp", 350, 30, afterHide.docks, "cluster");
  // EQ oculto viaja con el cluster si sigue imantado (posición de estilo, no 0,0)
  assert.equal(moved.eqw.l, 350);
  const reopened = restackAmpWindows(moved, { amp: true, eqw: true, plw: true });
  assert.equal(reopened.positions.eqw.l, 350);
  assert.equal(reopened.positions.eqw.t, reopened.positions.amp.b);
  assert.equal(reopened.positions.plw.l, 350);
  assert.equal(reopened.positions.plw.t, reopened.positions.eqw.b);
  assert.ok(reopened.positions.plw.t >= reopened.positions.eqw.b);
});

