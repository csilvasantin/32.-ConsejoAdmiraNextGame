import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAJA_ANCHO_PREF, CAJA_ANCHO_MIN, CAJA_STORAGE_KEY,
  claveCaja, parsePrefs, prefDe, serializarPrefs, fusionarPref,
  anchoContraBordes, repartirAnchos, solapan,
} from './consejo-caja-prefs.mjs';

test('el ancho preferido es el de la caja de Carlos: 280 px', () => {
  assert.equal(CAJA_ANCHO_PREF, 280);
  assert.ok(CAJA_ANCHO_MIN >= 120);
  assert.equal(CAJA_STORAGE_KEY, 'admira-live:consejo-cajas:v1');
});

test('parsePrefs ignora basura y conserva cerrado, ancho y alto', () => {
  assert.deepEqual(parsePrefs(null), {});
  assert.deepEqual(parsePrefs('no-json'), {});
  assert.deepEqual(parsePrefs('[]'), {});
  const p = parsePrefs('{"Walt Disney":{"closed":true,"w":260,"h":90,"extra":1}}');
  assert.equal(prefDe(p, 'Walt Disney').closed, true);
  assert.equal(prefDe(p, 'Walt Disney').w, 260);
  assert.equal(prefDe(p, 'walt disney').h, 90);
  assert.equal(claveCaja('Carlos Silva'), 'carlossilva');
});

test('fusionarPref recuerda el cierre y el tamaño por persona', () => {
  let p = fusionarPref({}, 'George Lucas', { closed: true, w: 240, h: 100 });
  assert.equal(prefDe(p, 'George Lucas').closed, true);
  p = fusionarPref(p, 'George Lucas', { closed: false });
  assert.equal(prefDe(p, 'George Lucas').closed, undefined);
  assert.equal(prefDe(p, 'George Lucas').w, 240);
  const raw = JSON.parse(serializarPrefs(p));
  assert.equal(raw['George Lucas'].w, 240);
  assert.ok(!raw['George Lucas'].closed);
});

test('una caja aislada en el centro recibe 280 px y sin desplazamiento', () => {
  const r = repartirAnchos(
    [{ id: 'Carlos Silva', xPct: 50, preferred: 280, fixed: true }],
    { stageW: 1360 },
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].width, 280);
  assert.equal(r[0].shift, 0);
});

test('en el borde el ancho se recorta para no salirse, centrado', () => {
  const max = anchoContraBordes(90.735, 1360, 280);
  assert.ok(max >= 200 && max <= 280, 'Lucas cabe cerca de 280 (max=' + max + ')');
  const r = repartirAnchos(
    [{ id: 'George Lucas', xPct: 90.735, preferred: 280 }],
    { stageW: 1360 },
  );
  assert.ok(r[0].width <= max);
  assert.ok(r[0].width >= 200);
});

test('Walt y Lucas no se pisan y cubren su flecha; Carlos no se mueve', () => {
  const r = repartirAnchos([
    { id: 'Carlos Silva', xPct: 50, preferred: 280, fixed: true },
    { id: 'Walt Disney', xPct: 80, preferred: 280 },
    { id: 'George Lucas', xPct: 90.735, preferred: 280 },
  ], { stageW: 1360, gap: 8, pad: 6 });
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.equal(by['Carlos Silva'].width, 280);
  assert.equal(by['Carlos Silva'].shift, 0);
  assert.ok(by['Walt Disney'].width >= 200, 'Walt más ancha que 12em (w=' + by['Walt Disney'].width + ')');
  assert.ok(by['George Lucas'].width >= 200, 'Lucas más ancha que 12em (w=' + by['George Lucas'].width + ')');
  function box(it) {
    const x = it.xPct / 100 * 1360;
    return { left: x + it.shift - it.width / 2, right: x + it.shift + it.width / 2, top: 0, bottom: 10 };
  }
  const w = box(by['Walt Disney']);
  const l = box(by['George Lucas']);
  const c = box(by['Carlos Silva']);
  assert.ok(l.left - w.right >= 7, 'Walt y Lucas dejan hueco (gap=' + (l.left - w.right) + ')');
  assert.ok(w.left - c.right >= 7, 'Carlos y Walt dejan hueco (gap=' + (w.left - c.right) + ')');
  const flechaW = 80 / 100 * 1360;
  const flechaL = 90.735 / 100 * 1360;
  assert.ok(w.left - 0.5 <= flechaW && w.right + 0.5 >= flechaW, 'la caja de Walt cubre su flecha');
  assert.ok(l.left - 0.5 <= flechaL && l.right + 0.5 >= flechaL, 'la caja de Lucas cubre su flecha');
});

test('Jobs y Woz, juntos a la izquierda, también salen más anchos y sin pisarse', () => {
  const r = repartirAnchos([
    { id: 'Steve Jobs', xPct: 10.368, preferred: 280 },
    { id: 'Steve Wozniak', xPct: 21.471, preferred: 280 },
  ], { stageW: 1360 });
  assert.ok(r[0].width >= 160 && r[1].width >= 160);
  const boxes = r.map((it) => {
    const x = it.xPct / 100 * 1360;
    return { left: x + it.shift - it.width / 2, right: x + it.shift + it.width / 2, top: 0, bottom: 10 };
  });
  assert.ok(!solapan(boxes[0], boxes[1], -8));
});
