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
  assert.match(html, /if\(!MP\.known\) return '';/);
  assert.match(html, /if\(!x\) return '0\/0';/);
  assert.match(html, /function mpUpdatePos\(\)\{/);
  assert.match(html, /#mpw\.fs #mpPos,#mpw:fullscreen #mpPos/);
});

test('t1393u: clic en la barra maximiza la ventana; el botón del medio pide pantalla completa', () => {
  assert.match(html, /id="mpMax" title="Pantalla completa">□</);
  assert.doesNotMatch(html, /id="mpMax"[^>]*data-max="mpw"/);
  assert.match(html, /qs\('#mpMax'\)\.addEventListener\('click',function\(e\)\{ e\.stopPropagation\(\); mpToggleFS\(\); \}\);/);
  assert.match(html, /Clic en la barra \(sin arrastrar\) maximiza o restaura la ventana/);
  assert.match(html, /if\(w\.classList\.contains\('max'\)\) winRestore\(w\); else winMaximize\(w\);/);
  // ya no se usa el □ / doble clic de la barra para pantallazo completo mezclado con maximizar
  assert.doesNotMatch(html, /if\(el\.id==='mpw'&&typeof mpToggleFS==='function'\)\{ mpToggleFS\(\); return; \}/);
});

test('t1393u: pantalla completa usa Fullscreen API con fallback CSS y sale con Escape', () => {
  assert.match(html, /el\.requestFullscreen\|\|el\.webkitRequestFullscreen/);
  assert.match(html, /function mpCssFS\(on\)\{/);
  assert.match(html, /v\.webkitEnterFullscreen/);
  assert.match(html, /window\.addEventListener\('keydown',function\(e\)\{\s*if\(e\.key!=='Escape'\) return;\s*if\(mpIsFs\(\)\)\{ mpExitFS\(\); e\.preventDefault\(\); e\.stopPropagation\(\); \}/);
});
