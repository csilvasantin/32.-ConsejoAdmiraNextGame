import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const leer = f => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const css = leer('council-grokbot.css'), app = leer('app.js'), copia = leer('app.flt-100529.js'), integ = leer('council-integration.js'), html = leer('index.html');

test('el aviso de bienvenida se marca y se ancla en el centro de la mesa, sin tapar cabezas ni bocadillos', () => {
  assert.match(app, /dataset\.aviso = "bienvenida"/);
  const regla = css.match(/\[data-aviso="bienvenida"\]:not\(\.grokbot-docked\)\{([^}]*)\}/);
  assert.ok(regla, 'regla del aviso en council-grokbot.css');
  assert.match(regla[1], /left:50%!important/);
  const top = +regla[1].match(/top:(\d+)%!important/)[1];
  assert.ok(top >= 55 && top <= 62, 'top en la zona libre de la mesa: ' + top);
  assert.match(css, /\[data-aviso="bienvenida"\]::after\{display:none\}/, 'sin cola: no señala a nadie');
});

test('un bocadillo de consejero normal quita la marca del aviso; la copia servida es idéntica', () => {
  assert.match(integ, /delete bubble\.dataset\.aviso/);
  assert.equal(copia, app);
  assert.match(html, /council-grokbot\.css\?v=20261016-aviso-centro/);
});
