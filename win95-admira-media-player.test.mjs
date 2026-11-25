import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./windows95/index.html', import.meta.url), 'utf8');

test('t1393u: el nombre visible es Admira Media Player, no Windows Media Player', () => {
  assert.equal(html.includes('Windows Media Player'), false);
  assert.match(html, /media:'Admira Media Player'/);
  assert.match(html, /id="mpT">Admira Media Player</);
  assert.match(html, /function mpName\(\)\{ return \(CONFIG\.names&&CONFIG\.names\.media\)\|\|'Admira Media Player'; \}/);
});

test('t1393u: la playlist de fábrica cubre #win95, #WindowsMediaPlayer y #AdmiraMediaPlayer', () => {
  assert.match(html, /tags:\['win95','genero95','WindowsMediaPlayer','AdmiraMediaPlayer'\]/);
});

test('t1393u: en modo ventana el contador i/x va al lado de En Directo y no se inventa', () => {
  assert.match(html, /<span id="mpLive"><i><\/i>SIN SEÑAL<\/span><span id="mpPos" hidden><\/span>/);
  assert.match(html, /function mpPosText\(\)\{/);
  assert.match(html, /if\(!MP\.known&&!x\) return '';/);
  assert.match(html, /if\(!x\) return '0\/0';/);
  assert.match(html, /function mpUpdatePos\(\)\{/);
  assert.match(html, /#mpw\.fs #mpPos,#mpw:fullscreen #mpPos/);
});

test('t1395u: doble clic en la barra maximiza (con marco); un clic simple no; el □ es pantalla completa sin marco', () => {
  assert.match(html, /id="mpMax" title="Pantalla completa">□</);
  assert.doesNotMatch(html, /id="mpMax"[^>]*data-max="mpw"/);
  assert.match(html, /qs\('#mpMax'\)\.addEventListener\('click',function\(e\)\{ e\.stopPropagation\(\); mpToggleFS\(\); \}\);/);
  assert.match(html, /doble clic en la barra maximiza o restaura \(lo hace wireWinChrome/);
  assert.doesNotMatch(html, /Clic en la barra \(sin arrastrar\) maximiza/);
  assert.doesNotMatch(html, /if\(el\.id==='mpw'&&typeof mpToggleFS==='function'\)\{ mpToggleFS\(\); return; \}/);
  assert.match(html, /#mpw\.fs \.tb,#mpw:fullscreen \.tb/);
  assert.match(html, /#mpw\.fs \.menubar,#mpw:fullscreen \.menubar/);
  assert.match(html, /#mpw\.fs \.sbar1,#mpw:fullscreen \.sbar1/);
});

test('t1393u: pantalla completa usa Fullscreen API con fallback CSS y sale con Escape', () => {
  assert.match(html, /el\.requestFullscreen\|\|el\.webkitRequestFullscreen/);
  assert.match(html, /function mpCssFS\(on\)\{/);
  assert.match(html, /v\.webkitEnterFullscreen/);
  assert.match(html, /if\(!mpApiFS\(\)&&!mpVidWebkitFS\(\)\) mpCssFS\(true\)/);
  assert.match(html, /p\.then\(check\)\.catch\(function\(\)\{ fallback\(\); \}\)/);
  assert.match(html, /window\.addEventListener\('keydown',function\(e\)\{\s*if\(e\.key!=='Escape'\) return;\s*if\(mpIsFs\(\)\)\{ mpExitFS\(\); e\.preventDefault\(\); e\.stopPropagation\(\); \}/);
});

test('t1394u: botones Anterior y Siguiente en la fila y lista de playlist en el ⏏', () => {
  assert.match(html, /id="mpPrev" type="button" title="Anterior"/);
  assert.match(html, /id="mpNext" type="button" title="Siguiente"/);
  assert.match(html, /id="mpEject" type="button" title="Lista de reproducción"/);
  assert.match(html, /id="mpList" role="listbox"/);
  assert.match(html, /function mpPrevPiece\(\)\{ mpSkip\(-1\); \}/);
  assert.match(html, /function mpNextPiece\(auto\)/);
  assert.match(html, /function mpGoTo\(i\)/);
  assert.match(html, /function mpToggleList\(\)/);
  assert.match(html, /qs\('#mpEject'\)\.addEventListener\('click',function\(e\)\{ e\.stopPropagation\(\); mpToggleList\(\); \}\);/);
  assert.doesNotMatch(html, /title="Expulsar"/);
});

test('t1396u: transición sin barras de color: doble buffer y no se llama mpCard al cambiar de pieza si ya hay fotograma', () => {
  assert.match(html, /id="mpVideo2"/);
  assert.match(html, /function mpIdleVid\(\)/);
  assert.match(html, /function mpLoadVideo\(url, opts\)/);
  assert.match(html, /function mpHasPicture\(\)/);
  assert.match(html, /function mpRevealNext\(next\)/);
  assert.match(html, /next\.addEventListener\('playing',ready\)/);
  assert.match(html, /next\.addEventListener\('canplay',ready\)/);
  assert.doesNotMatch(html, /if\(url\)\{[\s\S]{0,200}mpCard\(msg\|\('Sintonizando '/);
});

test('t1396u: pantalla completa pide el wrapper solo-vídeo y el fallback CSS cubre el viewport sin cromado', () => {
  assert.match(html, /id="mpStage"/);
  assert.match(html, /var el=stage\|\|qs\('#mpw'\)/);
  assert.match(html, /el\.requestFullscreen\|\|el\.webkitRequestFullscreen\|\|el\.mozRequestFullScreen/);
  assert.match(html, /#mpStage\.mp-fs-css/);
  assert.match(html, /position:fixed!important;inset:0!important/);
  assert.match(html, /z-index:2147483647!important/);
  assert.match(html, /document\.body\.appendChild\(stage\)/);
  assert.match(html, /navigationUI:'hide'/);
  assert.match(html, /document\.addEventListener\('mozfullscreenchange',mpOnFsChange\)/);
  assert.match(html, /#mpw:-moz-full-screen \.tb/);
});

test('t1396u: menú Archivo abre local (blob, no altera i\/x) e Importar abre Napster de admira.studio', () => {
  assert.match(html, /id="mp-menubar"/);
  assert.match(html, /id="mp-menu"/);
  assert.match(html, /id="mpFile"/);
  assert.match(html, /accept="video\/\*,audio\/\*,image\/\*"/);
  assert.match(html, /\{l:'Abrir\.\.\.',acc:'Ctrl\+O',fn:mpAbrirLocal\}/);
  assert.match(html, /\{l:'Importar\.\.\.',fn:mpImportar\}/);
  assert.match(html, /\{l:'Salir',fn:closeMedia\}/);
  assert.match(html, /URL\.createObjectURL\(f\)/);
  assert.match(html, /if\(MP\.localPlaying\) return 'local'/);
  assert.match(html, /function mpImportar\(\)/);
  assert.match(html, /openNap\(\)/);
  assert.match(html, /NAP\.importar=true/);
  assert.match(html, /function napImportarResult\(\)/);
  assert.match(html, /\/api\/win95\/napster/);
  assert.match(html, /t==='win95'\|\|t==='genero95'\|\|t==='windowsmediaplayer'\|\|t==='admiramediaplayer'/);
});
