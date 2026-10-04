// #5114 — mosaico del Mac 1984: imagen EN VIVO de la Computadora primero, por silla.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { noteLiveFrame, liveFrameFor, imagenRecibida, LIVE_FRAME_TTL_MS, MOSAIC_SEATS, MOSAIC_POLL_MS } from './assets/mac-hoy.js';

const hoy = fs.readFileSync(new URL('./assets/mac-hoy.js', import.meta.url), 'utf8');
const remote = fs.readFileSync(new URL('./assets/mac-remote.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('#5114 fotograma vivo por silla (alias o nombre completo) con caducidad', () => {
  const t = 1_800_000_000_000;
  assert.equal(noteLiveFrame('Steve Wozniak', 'data:image/jpeg;base64,/9j/AAA', t), true);
  assert.equal(liveFrameFor('Wozniak', t + 1000).src, 'data:image/jpeg;base64,/9j/AAA');
  assert.equal(liveFrameFor('Wozniak', t + LIVE_FRAME_TTL_MS + 1), null);
  assert.equal(liveFrameFor('Jobs', t), null);
  assert.equal(noteLiveFrame('', 'x'), false);
  assert.deepEqual(MOSAIC_SEATS, ['Jobs', 'Wozniak', 'Lucas', 'Disney', 'Musk', 'Huang']);
  assert.equal(MOSAIC_POLL_MS, 12000);
});

test('#5114 sello «Imagen recibida HH:MM» en hora de Madrid', () => {
  assert.equal(imagenRecibida(Date.UTC(2026, 9, 4, 18, 52, 31)), 'Imagen recibida 20:52');
  assert.equal(imagenRecibida(null), '');
});

test('#5114 orden: fotograma del ultradetalle → screen.jpg → evidencia/cerrada/placard', () => {
  const fn = hoy.slice(hoy.indexOf('async function mosaicTile'), hoy.indexOf('export function refreshMosaic'));
  const iLive = fn.indexOf('liveFrameFor(alias)'), iJpeg = fn.indexOf('mosaicFetchLiveBlob'), iEv = fn.indexOf('EVIDENCE_URL'), iCap = fn.indexOf('missionCaptureUrl');
  assert.ok(iLive > 0 && iLive < iJpeg && iJpeg < iEv && iEv < iCap, 'orden de fuentes');
  assert.match(fn, /mosaicSetTime\(tile, live\.at\)/);
  assert.match(fn, /mosaicSetTime\(tile, null\)/);
  // el mosaico no abre sesiones remotas propias (cerraría el ultradetalle y activa GrokBot)
  assert.doesNotMatch(hoy, /action:\s*'open'\s*[,}]/);
  assert.doesNotMatch(hoy, /grokbot\/remote['"]/);
});

test('#5114 mac-remote.js publica cada fotograma pintado para el mosaico', () => {
  assert.match(remote, /dispatchEvent\(new CustomEvent\('mac-remote-frame'/);
  assert.match(hoy, /addEventListener\('mac-remote-frame'/);
});

test('#5114 401 no apaga el vivo 5 min: reintento corto y sin sesión no se pide', () => {
  assert.match(hoy, /r\.status === 403\)\) liveBackoff\.set\('\*', now \+ LIVE_RETRY_MS\)/);
  assert.match(hoy, /admiraGateCsrf/);
});

test('#5114 cache-bust y estilo del sello', () => {
  assert.match(html, /assets\/mac-hoy\.js\?v=20261004-5114-vivo/);
  assert.match(html, /assets\/mac-remote\.js\?v=20261004-5114-vivo/);
  assert.match(html, /\.mac-hoy-tile-time\s*\{/);
});
