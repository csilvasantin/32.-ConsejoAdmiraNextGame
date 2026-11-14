import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
globalThis.window = globalThis;
await import('./hablar-cmd.js');
const H = globalThis.AdmiraHablarCmd;
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(readFileSync(new URL('./assets/consejo-demo.js', import.meta.url), 'utf8'), ctx);
const D = ctx.CouncilDemoLib;

test('paso 3: el comando de la demo es un /conversacion válido (t1341u) sobre PortAventuraNeXT', () => {
  const cmd = D.comandoConversacion('disney', 'elon', 'Carlo Bonomi');
  const l = H.parseLinea(cmd);
  assert.equal(l.accion, 'conversacion');
  assert.equal(l.a, 'Walt Disney');
  assert.equal(l.b, 'Elon Musk');
  assert.match(l.tema, /PortAventuraNeXT/);
  assert.match(l.tema, /El parque que se cuenta solo/);
  assert.match(l.tema, /la web de PortAventuraNeXT/);
  assert.match(l.tema, /En la cabecera de la mesa escucha Carlo Bonomi$/);
  assert.match(H.promptConversacion(l), /consejero_mensaje/);
});

test('paso 3: otros pares y nombres desconocidos caen al par por defecto', () => {
  assert.equal(H.parseLinea(D.comandoConversacion('jobs', 'jensen', '')).b, 'Jensen Huang');
  assert.equal(D.limpio('Pepe', 'disney'), 'disney');
  assert.equal(D.limpio('ELON', 'disney'), 'elon');
  assert.doesNotMatch(D.tema(''), /cabecera/);
});

test('la home carga la barra de demo antes de app.flt y solo con ?demo=', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /consejo-cabecera\.js\?v=[^"]+"><\/script>\s*<script defer src="assets\/consejo-demo\.js\?v=[^"]+"><\/script>\s*<script defer src="app\.flt-100529\.js/);
  const js = readFileSync(new URL('./assets/consejo-demo.js', import.meta.url), 'utf8');
  assert.match(js, /q\.get\('demo'\)/);
  assert.match(js, /CouncilInterface/);
  assert.match(js, /flujo=pan&amp;cabecera=bonomi/);
});
