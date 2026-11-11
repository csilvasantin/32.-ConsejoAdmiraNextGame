import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(root, 'assets/council-silhouettes.js'), 'utf8');
const m = raw.match(/window\.COUNCIL_SILHOUETTES = (\{.*\});\s*$/s);
assert.ok(m, 'silhouettes JS exporta el objeto');
const data = JSON.parse(m[1]);

const LEY_OK = [
  'Steve Jobs', 'Steve Wozniak', 'Warren Buffett', 'Carlos Silva',
  'Dieter Rams', 'Howard Schultz', 'George Lucas',
];
const paths = data.leyendas.paths;
assert.deepEqual(Object.keys(paths), LEY_OK, 'leyendas: una máscara por figura visible, en orden');
assert.equal('Tim Cook' in paths, false, 'Tim Cook no está en la foto de leyendas');
assert.equal('Walt Disney' in paths, false, 'Walt Disney no está en la foto de leyendas');

function parsePath(s) {
  return s.replace(/Z/g, '').split(/L/).map((c) => {
    c = c.trim().replace(/^M\s*/, '');
    const [x, y] = c.split(/\s+/).map(Number);
    return [x, y];
  }).filter((p) => p.length === 2 && Number.isFinite(p[0]));
}
function bbox(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const W = data.leyendas.width;
const boxes = Object.fromEntries(LEY_OK.map((n) => [n, bbox(parsePath(paths[n]))]));
// Buffett es el tercero por la izquierda (antes caía la máscara de Cook).
assert.ok(boxes['Warren Buffett'].minX / W > 0.25 && boxes['Warren Buffett'].maxX / W < 0.40,
  `Buffett x ${boxes['Warren Buffett'].minX}-${boxes['Warren Buffett'].maxX}`);
// Carlos Y-3 en el centro; no debe invadir a Buffett ni a Rams.
assert.ok(boxes['Carlos Silva'].minX / W > 0.40 && boxes['Carlos Silva'].maxX / W < 0.65,
  `Carlos x ${boxes['Carlos Silva'].minX}-${boxes['Carlos Silva'].maxX}`);
assert.ok(boxes['Warren Buffett'].maxX < boxes['Carlos Silva'].minX, 'Buffett y Carlos no se pisan');
assert.ok(boxes['Carlos Silva'].maxX < boxes['Dieter Rams'].minX, 'Carlos y Rams no se pisan');

// Las cajas de figuras vecinas no se cruzan (L→R).
for (let i = 0; i < LEY_OK.length - 1; i++) {
  const a = boxes[LEY_OK[i]], b = boxes[LEY_OK[i + 1]];
  assert.ok(a.maxX <= b.minX, `cajas ${LEY_OK[i]} y ${LEY_OK[i + 1]} se cruzan`);
}

const COE_OK = ['Elon Musk', 'Jensen Huang', 'Mira Murati', 'John Lasseter', 'Jony Ive', 'Ryan Reynolds'];
assert.deepEqual(Object.keys(data.coetaneos.paths), COE_OK);
assert.equal('Ruth Porat' in data.coetaneos.paths, false);
assert.equal('Carlos Ratti' in data.coetaneos.paths, false);
assert.equal('Gwynne Shotwell' in data.coetaneos.paths, false);
