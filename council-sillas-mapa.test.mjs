import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAPEL_POS, MESA, asientoPublico, llevaFlecha, nuncaFlecha, clasificar,
} from './consejo-globo-lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));

function siluetas() {
  const raw = readFileSync(join(root, 'assets/council-silhouettes.js'), 'utf8');
  const m = raw.match(/window\.COUNCIL_SILHOUETTES = (\{.*\});\s*$/s);
  assert.ok(m, 'silhouettes JS exporta el objeto');
  return JSON.parse(m[1]);
}

function nameplates() {
  const src = readFileSync(join(root, 'app.js'), 'utf8');
  const m = src.match(/const NAMEPLATE_POS = \{([\s\S]*?)\n    \};/);
  assert.ok(m, 'NAMEPLATE_POS está en app.js');
  // Evalúa solo el literal (sin funciones) dentro de un wrapper.
  const obj = Function(`"use strict"; return { ${m[1]} };`)();
  assert.ok(obj.leyendas && obj.coetaneos, 'NAMEPLATE_POS tiene las dos generaciones');
  return obj;
}

function metaVacio() {
  return JSON.parse(readFileSync(join(root, 'assets/consejo-vacio/meta.json'), 'utf8'));
}

function papelEnGlobo() {
  const src = readFileSync(join(root, 'council-globo.js'), 'utf8');
  const m = src.match(/const PAPEL = (\{[\s\S]*?\});\n  const CSS/);
  assert.ok(m, 'PAPEL está en council-globo.js');
  return Function(`"use strict"; return ${m[1]};`)();
}

function bboxPath(s) {
  const pts = s.replace(/Z/g, '').split(/L/).map((c) => {
    c = c.trim().replace(/^M\s*/, '');
    const [x, y] = c.split(/\s+/).map(Number);
    return [x, y];
  }).filter((p) => p.length === 2 && Number.isFinite(p[0]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function overlap(a, b) {
  const ix = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const iy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return ix > 0 && iy > 0;
}

const LEY_VISIBLES = [
  'Steve Jobs', 'Steve Wozniak', 'Warren Buffett', 'Carlos Silva',
  'Dieter Rams', 'Walt Disney', 'George Lucas',
];
const LEY_AUSENTES = ['Tim Cook', 'Howard Schultz'];
const COE_VISIBLES = ['Elon Musk', 'Jensen Huang', 'Mira Murati', 'Jony Ive', 'John Lasseter', 'Ryan Reynolds'];
const COE_AUSENTES = ['Ruth Porat', 'Carlos Ratti', 'Gwynne Shotwell'];

test('mapeo nombre-silla en Leyendas y Coetáneos: siluetas, placas, papeles y recortes coinciden', () => {
  const sil = siluetas();
  const plates = nameplates();
  const meta = metaVacio();
  const papelJs = papelEnGlobo();

  // PAPEL del cliente (council-globo.js) y de la lib no pueden divergir en nombres ni flechas.
  for (const gen of ['leyendas', 'coetaneos']) {
    const a = PAPEL_POS[gen], b = papelJs[gen];
    assert.deepEqual(Object.keys(a), Object.keys(b), `PAPEL keys ${gen} lib vs cliente`);
    for (const nombre of Object.keys(a)) {
      assert.deepEqual(a[nombre].flecha, b[nombre].flecha, `flecha ${gen}/${nombre}`);
      assert.equal(a[nombre].activo, b[nombre].activo, `activo ${gen}/${nombre}`);
      assert.equal(!!a[nombre].nuncaFlecha, !!b[nombre].nuncaFlecha, `nuncaFlecha ${gen}/${nombre}`);
    }
  }

  // Leyendas: figuras visibles de izquierda a derecha.
  assert.deepEqual(Object.keys(sil.leyendas.paths), LEY_VISIBLES);
  const plateLey = plates.leyendas.map((p) => p.persona);
  assert.deepEqual(plateLey, LEY_VISIBLES, 'NAMEPLATE_POS.leyendas en el mismo orden visual');
  for (const n of LEY_AUSENTES) {
    assert.equal(n in sil.leyendas.paths, false, `${n} no debe tener máscara en leyendas`);
    assert.equal(plateLey.includes(n), false, `${n} no debe tener placa en leyendas`);
  }
  const cutsLey = Object.keys(meta.leyendas.cutouts).map((k) => (k === 'Carlos' ? 'Carlos Silva' : k));
  for (const n of LEY_VISIBLES) {
    assert.ok(cutsLey.includes(n), `meta.json leyendas debe recortar a ${n}`);
    assert.ok(PAPEL_POS.leyendas[n], `PAPEL_POS.leyendas debe incluir a ${n}`);
  }
  assert.deepEqual(meta.leyendas.sinArte, LEY_AUSENTES);

  // Disney está a la derecha (silla que era de Schultz), no en el centro (Carlos).
  const W = sil.leyendas.width, H = sil.leyendas.height;
  const boxD = bboxPath(sil.leyendas.paths['Walt Disney']);
  const boxC = bboxPath(sil.leyendas.paths['Carlos Silva']);
  const boxR = bboxPath(sil.leyendas.paths['Dieter Rams']);
  const boxL = bboxPath(sil.leyendas.paths['George Lucas']);
  assert.ok(boxD.minX / W > 0.72 && boxD.maxX / W < 0.88, `Disney máscara x=${boxD.minX}-${boxD.maxX}`);
  assert.ok(boxC.minX / W > 0.40 && boxC.maxX / W < 0.65, 'Carlos sigue en el centro');
  assert.ok(boxR.maxX <= boxD.minX && boxD.maxX <= boxL.minX, 'Rams · Disney · Lucas de izquierda a derecha');
  const cutD = meta.leyendas.cutouts['Walt Disney'];
  const cutBox = { minX: cutD.x, maxX: cutD.x + cutD.w, minY: cutD.y, maxY: cutD.y + cutD.h };
  assert.ok(overlap(boxD, cutBox), 'la máscara de Disney cubre su recorte, no el de Schultz');
  const disneyPlate = plates.leyendas.find((p) => p.persona === 'Walt Disney');
  assert.equal(disneyPlate.role, 'CCO');
  assert.ok(disneyPlate.x > 75 && disneyPlate.x < 88, `placa de Disney x=${disneyPlate.x}, no en el centro`);
  assert.ok(PAPEL_POS.leyendas['Walt Disney'].flecha.x > 75, 'flecha de Disney sobre su cabeza');
  assert.equal(llevaFlecha('Walt Disney'), true);
  assert.equal(nuncaFlecha('Carlos Silva'), true);
  assert.equal(llevaFlecha('Carlos Silva'), false);
  assert.equal(llevaFlecha('Howard Schultz'), false);
  assert.equal(PAPEL_POS.leyendas['Howard Schultz'].flecha, null);

  // Coetáneos: las 6 figuras de la foto, sin Porat/Ratti/Shotwell.
  for (const n of COE_VISIBLES) {
    assert.ok(n in sil.coetaneos.paths, `máscara coetáneos: ${n}`);
    assert.ok(plates.coetaneos.some((p) => p.persona === n), `placa coetáneos: ${n}`);
    assert.ok(PAPEL_POS.coetaneos[n], `PAPEL coetáneos: ${n}`);
    assert.ok(meta.coetaneos.cutouts[n], `recorte coetáneos: ${n}`);
  }
  for (const n of COE_AUSENTES) {
    assert.equal(n in sil.coetaneos.paths, false, `${n} no está en la mesa de coetáneos`);
    assert.equal(plates.coetaneos.some((p) => p.persona === n), false, `${n} no lleva placa`);
    assert.equal(n in (PAPEL_POS.coetaneos || {}), false, `${n} no lleva flecha/halo`);
  }
  const musk = bboxPath(sil.coetaneos.paths['Elon Musk']);
  const huang = bboxPath(sil.coetaneos.paths['Jensen Huang']);
  const murati = bboxPath(sil.coetaneos.paths['Mira Murati']);
  const ive = bboxPath(sil.coetaneos.paths['Jony Ive']);
  const lasseter = bboxPath(sil.coetaneos.paths['John Lasseter']);
  const reynolds = bboxPath(sil.coetaneos.paths['Ryan Reynolds']);
  const Wc = sil.coetaneos.width;
  assert.ok(musk.minX < huang.minX && huang.minX < murati.minX, 'Musk · Huang · Murati de izq. a der.');
  assert.ok(ive.minX > murati.maxX, 'Ive a la derecha de Murati');
  assert.ok(reynolds.minX / Wc > 0.75, 'Reynolds es el de la extrema derecha');
  // Lasseter (camisa hawaiana) está a la derecha de Ive y a la izquierda de Reynolds.
  assert.ok(lasseter.minX < reynolds.minX, 'Lasseter a la izquierda de Reynolds');
});

test('el estado del globo de Disney sale del latido, nunca «desconocido» por un mapa ajeno', () => {
  const S = Math.floor(Date.UTC(2026, 10, 11, 19, 40, 0) / 1000);
  const libre = asientoPublico(
    { persona: 'Walt Disney', rol: 'CCO' },
    { latidos: {}, bandejas: {}, ahoraS: S },
  );
  assert.equal(clasificar({ persona: 'Walt Disney', entrada: null, ahoraS: S }), 'libre');
  assert.equal(libre.estado, 'libre');
  assert.notEqual(libre.texto, 'desconocido');

  const entrada = { modo: 'trabajando', mision: 'prueba estado mesa', encargo: 7416, at: S - 60, hasta: S + 600 };
  const trab = asientoPublico(
    { persona: 'Walt Disney', rol: 'CCO' },
    { latidos: { Disney: entrada }, bandejas: {}, ahoraS: S },
  );
  assert.equal(trab.estado, 'trabajando');
  assert.match(trab.texto, /En curso: prueba estado mesa \(#7416\)/);

  // Schultz no tiene bot: si se le atribuyera la silla, el cartel diría «desconocido».
  const sch = asientoPublico(
    MESA.leyendas.find((s) => s.persona === 'Howard Schultz'),
    { latidos: { Disney: entrada }, bandejas: {}, ahoraS: S },
  );
  assert.equal(sch.estado, 'desconocido');
});

// Las dos copias de app.js deben llevar el mismo mapa de sillas (un desajuste ya hizo
// que una vía mostrara Schultz sobre Disney).
test('app.js y app.flt-100529.js comparten el NAMEPLATE_POS de las dos generaciones', () => {
  const a = readFileSync(join(root, 'app.js'), 'utf8');
  const b = readFileSync(join(root, 'app.flt-100529.js'), 'utf8');
  const re = /const NAMEPLATE_POS = \{[\s\S]*?\n    \};/;
  const ma = a.match(re), mb = b.match(re);
  assert.ok(ma && mb, 'NAMEPLATE_POS en ambas copias');
  assert.equal(ma[0], mb[0]);
  assert.match(ma[0], /persona: "Walt Disney"/);
  assert.doesNotMatch(ma[0], /persona: "Howard Schultz"/);
});
