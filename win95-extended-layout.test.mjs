import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TASKBAR_H, ICON_W, ICON_H, DEFAULT_ICON_POS,
  viewportSize, deskMetrics, deskGrid, factoryFits,
  autoIconPositions, mapUserIcon, mailFlexColumns,
  clampMailFold, clampMailSplit,
} from './win95-desk-layout-lib.mjs';

const raiz = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(raiz, rel), 'utf8');
const html = src('windows95/index.html');
const css = src('assets/win95-crt.css');
const crtJs = src('assets/win95-crt.js');

test('Extended usa 100dvh y mantiene la barra de tareas visible en el viewport', () => {
  assert.match(css, /html\.crt-extended #crt-shell/);
  assert.match(css, /height:\s*100vh/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /width:\s*100dvw/);
  assert.match(css, /max-height:\s*100dvh/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /html\.crt-extended #taskbar\s*\{[^}]*bottom:\s*0/s);
  assert.match(css, /html\.crt-extended #taskbar\s*\{[^}]*height:\s*28px/s);
  assert.match(css, /html\.crt-extended #taskbar\s*\{[^}]*z-index:\s*5000/s);
  assert.match(css, /html\.crt-extended, html\.crt-extended body/);
  assert.match(html, /function viewportSize\(/);
  assert.match(html, /visualViewport/);
  assert.match(html, /visualViewport\.addEventListener\('resize',fit\)/);
  assert.match(html, /DESK_H=Math\.max\(0, vp\.h-tb\)/);
  assert.match(crtJs, /visualViewport/);
  assert.match(html, /win95-desk-layout-lib\.mjs/);

  const ext = deskMetrics(true, { w: 800, h: 360 }, TASKBAR_H);
  assert.equal(ext.w, 800);
  assert.equal(ext.h, 360 - TASKBAR_H);
  assert.ok(ext.h + TASKBAR_H === 360, 'escritorio + taskbar = viewport visible');
  const classic = deskMetrics(false, { w: 800, h: 360 });
  assert.equal(classic.w, 640);
  assert.equal(classic.h, 452);

  const vp = viewportSize({
    innerWidth: 900, innerHeight: 500,
    visualViewport: { width: 900, height: 320, offsetLeft: 0, offsetTop: 0 },
    document: { documentElement: { clientWidth: 900, clientHeight: 500 } },
  });
  assert.equal(vp.h, 320, 'visualViewport manda sobre innerHeight (chrome iOS)');
});

test('al pasar a Extended la Papelera va a la esquina inferior derecha de la nueva resolución y vuelve en 4:3', () => {
  assert.equal(factoryFits(640, 452, DEFAULT_ICON_POS), true);
  const classic = autoIconPositions(640, 452);
  assert.deepEqual(classic.trash, { left: 564, top: 378 });
  assert.deepEqual(classic.inbox, { left: 564, top: 6 });
  assert.deepEqual(classic.mypc, { left: 4, top: 6 });
  assert.deepEqual(classic.media, { left: 4, top: 378 });

  const wide = autoIconPositions(1000, 700);
  const g = deskGrid(1000, 700);
  assert.equal(wide.trash.left, 1000 - 76, 'Papelera en el borde derecho nuevo');
  assert.equal(wide.trash.top, g.lastTop, 'Papelera en la fila inferior de la nueva altura');
  assert.ok(wide.trash.top + ICON_H <= 700);
  assert.equal(wide.inbox.left, 1000 - 76);
  assert.equal(wide.inbox.top, 6);
  assert.deepEqual(wide.mypc, { left: 4, top: 6 }, 'la columna izquierda conserva su sitio si cabe');
  assert.ok(wide.trash.left > classic.trash.left);
  assert.ok(wide.trash.top > classic.trash.top);

  const back = autoIconPositions(640, 452);
  assert.deepEqual(back.trash, classic.trash);
  assert.deepEqual(back.inbox, classic.inbox);

  assert.match(html, /function reflowDesktopIcons\(/);
  assert.match(html, /autoIconPositions/);
  assert.match(html, /markIconUserMoved/);
});

test('en un escritorio bajo los iconos se recolocan en más columnas y no se salen bajo la barra de tareas', () => {
  const shortH = 280;
  assert.equal(factoryFits(800, shortH, DEFAULT_ICON_POS), false);
  const pos = autoIconPositions(800, shortH);
  const g = deskGrid(800, shortH);
  assert.ok(g.rows < 7);
  assert.equal(pos.trash.left, 800 - 76);
  assert.equal(pos.trash.top, g.lastTop);
  Object.keys(pos).forEach(function (id) {
    assert.ok(pos[id].top + ICON_H <= shortH, id + ' no debe quedar bajo la taskbar');
    assert.ok(pos[id].left + ICON_W <= 800, id + ' no debe salirse a la derecha');
  });
  // Los de la columna principal aprovechan las filas nuevas (p. ej. media ya no está en 378).
  assert.ok(pos.media.top < 378);
  assert.ok(pos.media.top + ICON_H <= shortH);

  const moved = autoIconPositions(1000, 700, {
    userMoved: { readme: true },
    current: { readme: { left: 160, top: 68 } },
    prev: { w: 640, h: 452 },
  });
  assert.notDeepEqual(moved.readme, DEFAULT_ICON_POS.readme);
  assert.ok(moved.readme.left >= 0 && moved.readme.left <= 1000 - ICON_W);
  // La Papelera, no movida a mano, sigue anclada abajo-derecha.
  assert.deepEqual(moved.trash, autoIconPositions(1000, 700).trash);
});

test('Correo Admira tiene separadores redimensionables y Asunto absorbe el hueco a la derecha', () => {
  assert.match(html, /id="mlSplitV"/);
  assert.match(html, /id="mlSplitH"/);
  assert.match(html, /cursor:col-resize/);
  assert.match(html, /cursor:row-resize/);
  assert.match(html, /touch-action:none/);
  assert.match(html, /function layoutMailPanes\(/);
  assert.match(html, /function wireMailLayout\(/);
  assert.match(html, /function bindPointerDrag\(/);
  assert.match(html, /lv-resizer/);
  assert.match(html, /mailColsFor/);
  assert.match(html, /flex:'Asunto'/);
  assert.match(html, /--mail-fold/);
  assert.match(html, /--mail-split/);
  assert.match(html, /Bandeja de entrada/);
  assert.match(html, /Elementos eliminados/);
  assert.ok(/#mail \.mfold\{[^}]*width:var\(--mail-fold\)/s.test(html));

  const cols = mailFlexColumns(400, [
    { title: 'De', width: 96 },
    { title: 'Para', width: 88 },
    { title: 'Asunto', width: 80 },
    { title: 'Recibido', width: 88 },
  ], 'Asunto');
  const sum = cols.reduce((a, c) => a + c.width, 0);
  assert.equal(sum, 400, 'las columnas llenan todo el ancho, sin hueco gris a la derecha');
  const asunto = cols.find((c) => c.title === 'Asunto');
  const recibido = cols.find((c) => c.title === 'Recibido');
  assert.ok(asunto.width > 80, 'Asunto absorbe el espacio sobrante');
  assert.equal(recibido.width, 88);

  assert.equal(clampMailFold(50, 500), 120);
  assert.equal(clampMailFold(400, 500), Math.round(500 * 0.55));
  assert.equal(clampMailFold(176, 500), 176);
  const mid = clampMailSplit(200, 400, 71, 26);
  assert.ok(mid >= 71 + 56);
  assert.ok(mid <= 400 - 26 - 56);
  assert.ok(clampMailSplit(0, 400, 71, 26) >= 71 + 56);
});
