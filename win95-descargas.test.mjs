// Napster → Winamp / Admira Media Player: descargas, etiquetas y sin autoplay.
// node --test win95-descargas.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./windows95/index.html", import.meta.url), "utf8");

test("abrir Winamp o Admira Media Player no reproduce solo; cerrar detiene el audio", () => {
  assert.match(html, /case 'amp': openAmp\(false\); break;/);
  assert.match(html, /function openAmp\(autoplay\)\{/);
  assert.match(html, /if\(autoplay&&PL\.state!=='play'&&CONFIG\.tracks\.length\) play\(\);/);
  assert.match(html, /function closeAmp\(\)\{/);
  assert.match(html, /A\.el\.removeAttribute\('src'\); A\.el\.src=''; A\.el\.load\(\);/);
  assert.match(html, /function openMedia\(autoplay\)\{/);
  assert.match(html, /if\(autoplay\)\{/);
  assert.match(html, /function closeMedia\(\)\{ mpExitFS\(\);(?: mpHideList\(\);)? mpStop\(\);/);
  assert.doesNotMatch(html, /case 'amp': openAmp\(MODE==='interactive'\)/);
  assert.doesNotMatch(html, /if\(!MP\.playing\|\|MP\.paused\) mpPlay\(\);\s*else mpLoadTags/);
});

test("la playlist de Winamp arranca vacía: solo descargas de Napster y Stock con #winamp", () => {
  assert.match(html, /tracks: \[\],/);
  assert.doesNotMatch(html, /Ambient Store Mix/);
  assert.match(html, /descargasDe\('winamp'\)/);
  assert.match(html, /stockHasTag\(item, 'winamp'\)/);
  assert.match(html, /if\(!CONFIG\.tracks\.length\) return;/);
});

test("Napster descarga con diálogo clásico, etiqueta #winamp o #AdmiraMediaPlayer y lo deja en Descargas", () => {
  assert.match(html, /function napProgressShow\(x\)\{/);
  assert.match(html, /id='dlprog'/);
  assert.match(html, /Descargando\.\.\./);
  assert.match(html, /function napFinish\(x\)\{/);
  assert.match(html, /rememberDescarga\(x\.r, tag\)/);
  assert.match(html, /function napTagOf\(r\)\{ return napEsVideo\(r\)\?'AdmiraMediaPlayer':'winamp'; \}/);
  assert.match(html, /function ensureDescargasFolder\(\)\{/);
  assert.match(html, /name:'Descargas'/);
  assert.match(html, /admira-win95-descargas/);
  assert.match(html, /kind==='media'/);
  assert.match(html, /function openMediaFile\(d\)\{/);
  assert.match(html, /Vídeo de Admira Media Player/);
  assert.match(html, /Canción de Winamp/);
});

test("Admira Media Player lista #win95/#WindowsMediaPlayer/#AdmiraMediaPlayer y las descargas de vídeo de Napster", () => {
  assert.match(html, /t==='win95'\|\|t==='genero95'\|\|t==='windowsmediaplayer'\|\|t==='admiramediaplayer'/);
  assert.match(html, /function mpPlayDownload\(r\)\{/);
  assert.match(html, /descargasDe\('AdmiraMediaPlayer'\)/);
  assert.match(html, /Pulsa Reproducir para ver la playlist #AdmiraMediaPlayer/);
  // El nombre del reproductor sigue siendo Admira Media Player (antes Windows Media Player).
  assert.match(html, /media:'Admira Media Player'/);
  assert.equal(html.includes("Windows Media Player"), false);
});
