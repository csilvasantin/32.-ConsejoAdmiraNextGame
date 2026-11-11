import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
function cargar(datos) {
  const sil = readFileSync(join(root, 'assets/council-silhouettes.js'), 'utf8');
  const rec = readFileSync(join(root, 'assets/council-recorte.js'), 'utf8');
  const doc = { querySelector: () => null, getElementById: () => null, addEventListener() {}, readyState: 'complete', createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} } };
  const win = { document: doc, addEventListener() {}, location: { pathname: '/', hash: '' } };
  win.window = win;
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(datos) });
  const ctx = vm.createContext({ ...win, window: win, document: doc, fetch: win.fetch, console });
  vm.runInContext(sil.replace('window.COUNCIL_SILHOUETTES', 'window.COUNCIL_SILHOUETTES'), ctx);
  vm.runInContext(rec, ctx);
  return win;
}
const viejo = { updatedAt: '2026-10-04T17:00:20.298Z', polys: { leyendas: { 'Walt Disney': [[0.52, 0.3], [0.63, 0.3], [0.6, 0.6]] } } };

test('recortes del 4-oct (foto de 8 sillas) no pisan la silueta de Disney', async () => {
  const w = cargar(viejo);
  await w.CouncilRecorte.reload();
  assert.equal(w.CouncilRecorte.vigente('leyendas'), false);
  assert.equal(w.CouncilRecorte.pathFor('leyendas', 'Walt Disney', 1360, 768), null);
});

test('un recorte guardado tras la foto actual sí se usa', async () => {
  const w = cargar({ ...viejo, updatedAt: '2026-11-12T10:00:00Z' });
  await w.CouncilRecorte.reload();
  assert.match(w.CouncilRecorte.pathFor('leyendas', 'Walt Disney', 1360, 768), /^M/);
});

test('la máscara de Disney cubre su cabeza real (x 1040-1124, y 244-342) en la silla del traje', () => {
  const w = cargar({ polys: {} });
  const d = w.COUNCIL_SILHOUETTES.leyendas.paths['Walt Disney'];
  const pts = d.replace(/Z/g, '').split('L').map((c) => c.replace('M', '').trim().split(/\s+/).map(Number));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  assert.ok(Math.min(...xs) >= 1020 && Math.max(...xs) <= 1155);
  assert.ok(Math.min(...ys) <= 250 && Math.max(...ys) >= 480);
  const cabeza = pts.filter((p) => p[1] < 340).map((p) => p[0]);
  assert.ok(Math.min(...cabeza) <= 1045 && Math.max(...cabeza) <= 1125, 'la cabeza ya no está desplazada a la derecha');
});
