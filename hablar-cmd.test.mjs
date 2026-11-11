// /hablar en inputs de chat: el literal nunca se envía al consejero (11-11-2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = dirname(fileURLToPath(import.meta.url));
await import('./hablar-cmd.js');
const H = globalThis.AdmiraHablarCmd;
const leer = (p) => readFileSync(join(dir, p), 'utf8');

test('parseLinea: solo intercepta /hablar y /talk; el resto es null (se envía como texto normal)', () => {
  assert.equal(H.parseLinea('Hola Woz'), null);
  assert.equal(H.parseLinea('quiero hablar con Woz'), null);
  assert.equal(H.parseLinea('/leyendas'), null);
  assert.equal(H.parseLinea(''), null);
  assert.ok(H.parseLinea('/hablar Woz'));
  assert.ok(H.parseLinea('/talk Elon'));
  assert.ok(H.parseLinea('/HABLAR woz'));
  assert.ok(H.parseLinea('/hablar'));
  assert.ok(H.parseLinea('/talk'));
  assert.ok(H.parseLinea('/hablar off'));
});

test('parseLinea nunca deja el literal /hablar… como pregunta o texto a enviar', () => {
  const casos = [
    '/hablar Woz',
    '/hablar Wozniak',
    '/hablar Woz ¿estás ahí?',
    '/hablar',
    '/hablar off',
    '/talk Musk hello',
    '/hablar Lasseter',
    '/hablar nadie'
  ];
  for (const t of casos) {
    const r = H.parseLinea(t, { generation: 'leyendas' });
    assert.ok(r, t);
    assert.notEqual(r.pregunta, t, t);
    assert.notEqual(r.texto, t, t);
    const blob = JSON.stringify(r);
    assert.ok(!blob.includes('/hablar'), 'el resultado no debe contener el verbo: ' + t + ' → ' + blob);
    assert.ok(!blob.includes('/talk') || r.accion === 'ayuda', t);
  }
  const conTexto = H.parseLinea('/hablar Woz ¿estás ahí?');
  assert.equal(conTexto.accion, 'conectar');
  assert.equal(conTexto.persona, 'Steve Wozniak');
  assert.equal(conTexto.pregunta, '¿estás ahí?');
});

test('por defecto: Jobs en Leyendas o sin contexto, Elon en Coetáneos', () => {
  assert.equal(H.defaultPersona('leyendas'), 'Steve Jobs');
  assert.equal(H.defaultPersona('coetaneos'), 'Elon Musk');
  assert.equal(H.defaultPersona('coetáneos'), 'Elon Musk');
  assert.equal(H.defaultPersona('peers'), 'Elon Musk');
  assert.equal(H.defaultPersona(null), 'Steve Jobs');
  assert.equal(H.defaultPersona(''), 'Steve Jobs');
  assert.equal(H.defaultPersona('desconocido'), 'Steve Jobs');
  assert.deepEqual(H.parseHablar(''), { accion: 'conectar', persona: 'Steve Jobs', porDefecto: true });
  assert.deepEqual(H.parseHablar('', { generation: 'leyendas' }), { accion: 'conectar', persona: 'Steve Jobs', porDefecto: true });
  assert.deepEqual(H.parseHablar('', { generation: 'coetaneos' }), { accion: 'conectar', persona: 'Elon Musk', porDefecto: true });
  assert.deepEqual(H.parseLinea('/hablar', { generation: 'leyendas' }), { accion: 'conectar', persona: 'Steve Jobs', porDefecto: true });
  assert.deepEqual(H.parseLinea('/hablar', { generation: 'coetaneos' }), { accion: 'conectar', persona: 'Elon Musk', porDefecto: true });
  assert.deepEqual(H.parseLinea('/talk', { generation: 'coetaneos' }), { accion: 'conectar', persona: 'Elon Musk', porDefecto: true });
  assert.deepEqual(H.parseLinea('/hablar', {}), { accion: 'conectar', persona: 'Steve Jobs', porDefecto: true });
});

test('mesaActiva lee data-generation del .council-image, igual que el sitio', () => {
  const doc = {
    querySelector(sel) {
      if (sel === '.council-image[data-generation]' || sel === '[data-generation]' || sel === '.council-image') {
        return { getAttribute(k) { return k === 'data-generation' ? this.g : null; }, g: this._g };
      }
      return null;
    },
    _g: 'coetaneos'
  };
  doc.querySelector('.council-image').g = 'coetaneos';
  // The mock above is a bit awkward; use a simpler element:
  const el = { attrs: { 'data-generation': 'coetaneos' }, getAttribute(k) { return this.attrs[k] || null; } };
  const doc2 = {
    querySelector(sel) {
      if (sel === '.council-image[data-generation]' || sel === '[data-generation]' || sel === '.council-image') return el;
      return null;
    }
  };
  assert.equal(H.mesaActiva(doc2), 'coetaneos');
  el.attrs['data-generation'] = 'leyendas';
  assert.equal(H.mesaActiva(doc2), 'leyendas');
  assert.equal(H.mesaActiva(null), null);
  assert.equal(H.mesaActiva({ querySelector() { return null; } }), null);
});

test('alias de consejeros: Woz/Wozniak, Jobs/Steve, Elon/Musk, Walt/Disney, Lucas/George, Huang/Jensen, Lasseter/John', () => {
  const alias = {
    Woz: 'Steve Wozniak', Wozniak: 'Steve Wozniak', woz: 'Steve Wozniak',
    Jobs: 'Steve Jobs', Steve: 'Steve Jobs',
    Elon: 'Elon Musk', Musk: 'Elon Musk',
    Walt: 'Walt Disney', Disney: 'Walt Disney',
    Lucas: 'George Lucas', George: 'George Lucas',
    Huang: 'Jensen Huang', Jensen: 'Jensen Huang',
    Lasseter: 'John Lasseter', John: 'John Lasseter',
    Ive: 'Jony Ive', Jony: 'Jony Ive'
  };
  for (const [a, persona] of Object.entries(alias)) {
    const r = H.parseHablar(a);
    assert.equal(r.accion, 'conectar', a);
    assert.equal(r.persona, persona, a);
  }
});

test('colgar, ayuda y error no se envían; /hablar a secas ya no es ayuda', () => {
  assert.deepEqual(H.parseHablar('off'), { accion: 'colgar' });
  assert.deepEqual(H.parseHablar('adios'), { accion: 'colgar' });
  assert.deepEqual(H.parseLinea('/hablar off'), { accion: 'colgar' });
  assert.deepEqual(H.parseLinea('/talk bye'), { accion: 'colgar' });
  assert.deepEqual(H.parseHablar('help'), { accion: 'ayuda' });
  assert.deepEqual(H.parseHablar('ayuda'), { accion: 'ayuda' });
  assert.equal(H.parseHablar('nadie').accion, 'error');
  assert.equal(H.parseLinea('/hablar nadie').accion, 'error');
  const conv = { persona: 'Steve Jobs', generation: 'leyendas' };
  assert.deepEqual(H.parseHablar('¿seguimos?', conv), { accion: 'preguntar', persona: 'Steve Jobs', texto: '¿seguimos?' });
});

test('reconocidos sin línea directa (Lasseter, Ive) no tienen url de chat', () => {
  assert.equal(H.tieneLinea('Steve Wozniak'), true);
  assert.equal(H.tieneLinea('Elon Musk'), true);
  assert.equal(H.tieneLinea('John Lasseter'), false);
  assert.equal(H.tieneLinea('Jony Ive'), false);
  assert.equal(H.claveDe('Steve Wozniak'), 'wozniak');
  assert.equal(H.urlChat('Steve Wozniak'), '/chat/wozniak/');
  assert.equal(H.urlChat('John Lasseter'), null);
});

test('la home carga el parser antes del panel y la CLI lo registra', () => {
  const home = leer('index.html');
  assert.match(home, /hablar-cmd\.js\?v=20261111-hablar-2/);
  const cmdAt = home.indexOf('hablar-cmd.js');
  const integAt = home.indexOf('council-integration.js');
  assert.ok(cmdAt >= 0 && integAt > cmdAt, 'hablar-cmd.js debe cargarse antes de council-integration.js');
  const app = leer('app.flt-100529.js');
  assert.match(app, /AdmiraHablarCmd/);
  assert.match(app, /'\/hablar'/);
  assert.match(app, /'\/talk'/);
  const integ = leer('council-integration.js');
  assert.match(integ, /parseLinea/);
  assert.match(integ, /AdmiraHablarCmd/);
  const hola = leer('hola/index.html');
  assert.match(hola, /hablar-cmd\.js/);
  const jobs = leer('chat/jobs/index.html');
  assert.match(jobs, /hablar-pagina\.js/);
});

test('la home carga el tema retro del Experto después de experto.css', () => {
  const home = leer('index.html');
  const cssAt = home.indexOf('suite/experto.css');
  const retroAt = home.indexOf('experto-retro.css');
  assert.ok(cssAt >= 0 && retroAt > cssAt, 'experto-retro.css debe ir después de experto.css');
  const retro = leer('assets/experto-retro.css');
  assert.match(retro, /#100b05/);
  assert.match(retro, /#9c7326/);
  assert.match(retro, /#ffdf73/);
  assert.match(retro, /Press Start 2P/);
  assert.match(retro, /#ax-live-experto/);
});
