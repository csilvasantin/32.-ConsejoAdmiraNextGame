import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './council-conversacion.js';

const { colocar } = globalThis.CouncilConversacion;
const leer = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const html = leer('./index.html'), app = leer('./app.js'), copia = leer('./app.flt-100529.js');

test('mesa limpia por defecto: placas ocultas y sin «placas visibles al entrar»', () => {
    assert.match(html, /<div class="nameplates hidden" id="nameplates">/);
    assert.match(app, /let nameplatesVisible = false;/);
    assert.doesNotMatch(app, /\n\s*setNameplatesVisible\(true\);/);
    assert.equal(app, copia, 'app.js ≡ app.flt-100529.js');
    assert.match(leer('./council-conversacion.css'), /\.nameplates\.hidden, \.nameplates\.hidden \.np \{ visibility: hidden; pointer-events: none/);
});

test('el verbo CONVERSACIÓN es un conmutador (no un enlace) y carga su script y su estilo', () => {
    assert.match(html, /<button type="button" class="verb-btn" id="verb-conversacion" aria-pressed="false"/);
    assert.doesNotMatch(html, /<a class="verb-btn" href="\/conversacion"/);
    assert.match(html, /<link rel="stylesheet" href="council-conversacion\.css\?v=/);
    assert.match(html, /<script defer src="council-conversacion\.js\?v=/);
    // El enlace a la página completa sigue accesible desde los bocadillos.
    assert.match(leer('./council-conversacion.js'), /todas\.href = '\/conversacion'/);
});

test('el rótulo expone los datos que pintan los bocadillos (sin inventar nada)', () => {
    const r = leer('./assets/consejo-rotulo.js');
    for (const a of ['data-r-titulo', 'data-r-proyecto', 'data-r-estado', 'data-r-meta', 'data-r-led']) assert.ok(r.includes(a), a);
    assert.match(leer('./council-conversacion.js'), /d\.rEstado \|\| ''/);
});

const sol = (a, b) => a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top;

test('colocar: ningún bocadillo pisa a otro, todos dentro de la mesa y con la cola en su cabeza', () => {
    const W = 1600, H = 900, w = 179, h = 95;
    const xs = [10, 20, 33, 45, 58, 72, 82, 92], ys = [38, 32, 26, 25, 23, 27, 32, 38];
    const items = xs.map((x, i) => ({ ax: x / 100 * W, ay: ys[i] / 100 * H, w, h }));
    const pos = colocar(items, W, H, { cola: 10, topMin: 36 });
    pos.forEach((p, i) => {
        assert.ok(p.left >= 0 && p.left + w <= W, 'dentro en horizontal #' + i);
        assert.ok(p.top >= 0, 'dentro en vertical #' + i);
        assert.ok(p.tx >= 0 && p.tx <= w, 'la cola cae dentro del bocadillo #' + i);
        assert.ok(p.tallo >= 0);
        for (let j = 0; j < i; j++) assert.ok(!sol({ ...p, w, h }, { ...pos[j], w, h }), `#${i} no pisa a #${j}`);
    });
});

test('colocar: respeta obstáculos (botones Leyendas/Coetáneos)', () => {
    const items = [{ ax: 120, ay: 200, w: 100, h: 60 }];
    const sin = colocar(items, 800, 400, { cola: 10 })[0];
    const con = colocar(items, 800, 400, { cola: 10, obstaculos: [{ left: 0, right: 200, top: sin.top - 5, bottom: sin.top + 70 }] })[0];
    assert.notEqual(con.top, sin.top);
    assert.ok(con.top + 60 <= sin.top - 5 - 6 + 0.01 || con.top >= sin.top + 70 + 6 - 0.01);
});

test('leerPlacas solo usa lo que dicen las placas; sin dato → vacío (el bocadillo dirá «sin datos»)', () => {
    const np = {
        style: { left: '10%', top: '38%' }, classList: { contains: c => c === 'gold' },
        dataset: {}, getAttribute: k => (k === 'data-persona' ? 'Steve Jobs' : null),
        querySelector: s => (s === '.np-role' ? { textContent: 'CEO' } : null)
    };
    const doc = { querySelectorAll: () => ({ forEach: f => f(np) }) };
    const [p] = globalThis.CouncilConversacion.leerPlacas(doc);
    assert.equal(p.persona, 'Steve Jobs');
    assert.equal(p.titulo, 'Chief Executive Officer');
    assert.equal(p.estado, '');
    assert.equal(p.led, 'nodata');
    assert.equal(p.chat, '');
    assert.equal(p.online, true);
});
