import test from 'node:test';
import assert from 'node:assert/strict';
import './council-estado.js';

const E = globalThis.CouncilEstado;
const NOW = 1_800_000_000_000, S = NOW / 1000;
const elon = {
  persona: 'Elon Musk', rol: 'CEO', enlazado: true, estado: 'working',
  encargo: { numero: 5000, etiqueta: '#5000.10.04', estado: 'in_progress', titulo: 'Tablero de estado del Consejo', de: 'Carlos', desde: S - 3600 },
  cola: { pending: 1, ack: 0, in_progress: 1, blocked: 0 }, ultimo_latido: S - 40,
  agentes: [{ persona: 'Merovingio', tipo: 'deepagent', etiqueta: 'Merovingio@GrokBotBox', maquina: 'GrokBotBox', runtime: 'Grok CLI', vivo: true, foco: null }]
};

test('el encargo va en palabras y el número solo entre paréntesis', () => {
  assert.equal(E.encargoEnPalabras(elon.encargo), 'Tablero de estado del Consejo (#5000.10.04)');
  assert.equal(E.encargoEnPalabras({ numero: 7, titulo: null }), 'encargo sin descripción legible (#7)');
});

test('ficha: estado, desde, deepagent·máquina y último latido reales', () => {
  const f = E.ficha(elon, NOW);
  const get = k => f.filas.find(x => x[0] === k)[1];
  assert.equal(get('Estado'), 'trabajando (working)');
  assert.match(get('Desde'), /^hace 1 h \(/);
  assert.match(get('Deepagent · máquina'), /Merovingio@GrokBotBox · GrokBotBox · Grok CLI · en línea/);
  assert.match(get('Último latido'), /^hace 40 s \(/);
  assert.equal(get('Bandeja'), '1 pendientes · 1 en curso');
});

test('sin dato → «sin datos»; sin agente → lo dice', () => {
  const nada = E.ficha(null, NOW);
  assert.ok(nada.filas.every(([, v]) => v === 'sin datos'));
  const cook = E.ficha({ persona: 'Tim Cook', enlazado: false, estado: null }, NOW);
  assert.match(cook.filas[0][1], /sin agente enlazado/);
  const sinLatido = E.ficha({ ...elon, ultimo_latido: null }, NOW);
  assert.equal(sinLatido.filas.find(x => x[0] === 'Último latido')[1], 'sin datos');
});

test('silla(): encuentra por nombre en cualquier generación', () => {
  const d = { mesa: { leyendas: [], coetaneos: [elon] } };
  assert.equal(E.silla(d, 'elon musk').persona, 'Elon Musk');
  assert.equal(E.silla(d, 'Jensen Huang'), null);
});

test('ocupados: working, ack y blocked cuentan; idle y sin datos no', () => {
  const l = ['working', 'ack', 'blocked', 'idle', null, undefined, 'working', 'idle'].map(estado => ({ estado }));
  assert.deepEqual(E.ocupados(l), { n: 4, total: 8 });
  assert.deepEqual(E.ocupados(null), { n: 0, total: 0 });
});

test('grupos plegados por defecto y el estado se recuerda', () => {
  const mem = {};
  globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  assert.equal(!!E.abiertos().leyendas, false);
  assert.equal(E.alternarGrupo('leyendas'), true);
  assert.equal(E.abiertos().leyendas, true);
  assert.equal(E.alternarGrupo('leyendas'), false);
});

test('hoja: clic ▲ → ▼, otra columna empieza ▲, Mayús+clic añade segundo orden', () => {
  let o = E.siguienteOrden([], 'estado', false);
  assert.deepEqual(o, [{ id: 'estado', dir: 'asc' }]);
  o = E.siguienteOrden(o, 'estado', false); assert.deepEqual(o, [{ id: 'estado', dir: 'desc' }]);
  o = E.siguienteOrden(o, 'latido', true); assert.deepEqual(o, [{ id: 'estado', dir: 'desc' }, { id: 'latido', dir: 'asc' }]);
  o = E.siguienteOrden(o, 'latido', true); assert.equal(o[1].dir, 'desc');
  o = E.siguienteOrden(o, 'desde', false); assert.deepEqual(o, [{ id: 'desde', dir: 'asc' }]);
});

test('hoja: Estado por ocupación y tiempos reales; «sin datos» siempre al final', () => {
  const l = [
    { persona: 'A', enlazado: true, estado: 'idle', ultimo_latido: S - 10 },
    { persona: 'B', enlazado: false, estado: null },
    { persona: 'C', enlazado: true, estado: 'working', ultimo_latido: S - 500, encargo: { desde: S - 50, titulo: 'x' } },
    { persona: 'D', enlazado: true, estado: 'blocked', ultimo_latido: S - 100, encargo: { desde: S - 9000, titulo: 'y' } },
    { persona: 'E', enlazado: true, estado: 'ack', ultimo_latido: null, encargo: { desde: S - 600, titulo: 'z' } }
  ];
  const ids = o => E.ordenar(l, o, NOW).map(s => s.persona).join('');
  assert.equal(ids([{ id: 'estado', dir: 'asc' }]), 'DCEAB');
  assert.equal(ids([{ id: 'estado', dir: 'desc' }]), 'AECDB');
  assert.equal(ids([{ id: 'latido', dir: 'desc' }]), 'ADCBE');
  assert.equal(ids([{ id: 'desde', dir: 'asc' }]), 'DECAB');
  assert.equal(ids([]), 'ABCDE');
});
