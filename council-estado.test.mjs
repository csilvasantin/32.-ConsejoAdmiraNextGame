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

test('ficha: proyecto bajo el nombre y Misión con la tarea del latido si no hay encargo', () => {
  const walt = { persona: 'Walt Disney', rol: 'CCO', enlazado: true, estado: 'working', encargo: null, proyecto: 'digitalsignage.ai', ultimo_latido: S - 30,
    agentes: [{ persona: 'Disney', tipo: 'silla', etiqueta: 'DisneyGrokBot', vivo: true, foco: 'Portada v8.1', tarea: 'Ficha de la mesa con proyecto y misión', proyecto: 'digitalsignage.ai' }] };
  const f = E.ficha(walt, NOW);
  assert.equal(f.proyecto, 'digitalsignage.ai');
  assert.equal(f.filas[0][0], 'Misión');
  assert.equal(f.filas[0][1], 'Ficha de la mesa con proyecto y misión');
  assert.ok(!f.filas.some(x => x[0] === 'Ahora'));
  const sinProyecto = E.ficha({ ...walt, proyecto: null, agentes: [{ ...walt.agentes[0], proyecto: null, tarea: null }] }, NOW);
  assert.equal(sinProyecto.proyecto, null);
  assert.equal(sinProyecto.filas[0][1], 'Portada v8.1');
});

test('color por estado (#4678): trabajando verde, esperando amarillo, libre/sin datos blanco; píldora y contorno iguales', () => {
  assert.equal(E.COLORES.working, '#3ddc84');
  assert.equal(E.COLORES.ack, '#ffd60a');
  assert.equal(E.COLORES.blocked, '#ffd60a');
  assert.equal(E.COLORES.idle, '#ffffff');
  assert.equal(E.COLORES.nodata, '#ffffff');
  assert.equal(E.claseEstado({ enlazado: true, estado: 'working' }), 'working');
  assert.equal(E.claseEstado({ enlazado: true, estado: 'idle' }), 'idle');
  assert.equal(E.claseEstado({ enlazado: true, estado: 'blocked' }), 'blocked');
  assert.equal(E.claseEstado({ enlazado: true, estado: 'ack' }), 'ack');
  assert.equal(E.claseEstado({ enlazado: true, estado: null }), 'nodata');
  assert.equal(E.claseEstado({ enlazado: false, estado: 'working' }), 'nodata');
  assert.equal(E.claseEstado(null), 'nodata');
  assert.equal(E.claseEstado('working'), 'working');
  assert.equal(E.claseEstado(undefined), 'nodata');
});

test('contornos: cada silueta recibe data-estado-color según su silla', async () => {
  const mesa = { leyendas: [
    { persona: 'Walt Disney', enlazado: true, estado: 'working' },
    { persona: 'Steve Wozniak', enlazado: true, estado: 'idle' },
    { persona: 'Tim Cook', enlazado: false, estado: null }] };
  await E.cargar(true, async () => ({ ok: true, json: async () => ({ ok: true, mesa }) }));
  const mk = p => { const a = { 'data-persona': p }; return { a, getAttribute: k => a[k] ?? null, setAttribute: (k, v) => { a[k] = String(v); } }; };
  const els = ['Walt Disney', 'Steve Wozniak', 'Tim Cook', 'Nadie Nuevo'].map(mk);
  const doc = {
    getElementById: id => id === 'body-hotspots' ? { querySelectorAll: () => els } : (id === 'estado-css' ? {} : null),
    head: { appendChild() {} }
  };
  E.pintarContornos(doc);
  assert.deepEqual(els.map(e => e.a['data-estado-color']), ['working', 'idle', 'nodata', 'nodata']);
});

test('ficha: la caja del proyecto lleva la etiqueta «Proyecto:»', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('./council-estado.js', import.meta.url), 'utf8');
  assert.match(src, /etq\.textContent = 'Proyecto:'/);
  assert.match(src, /estado-pill\.working\{color:\$\{COLORES\.working\}\}/);
  assert.match(src, /path\.body-hotspot\[data-estado-color\]:hover/);
  assert.match(src, /path\.body-hotspot\[data-estado-color\]:hover[^}]*fill:transparent/);
  assert.match(src, /--silla-c:#e74c3c/);
  assert.match(src, /--silla-c:#3498db/);
});

test('ficha: «Desde» usa s.desde del feed (libre) con hora de Madrid; «sin datos» solo sin historial', () => {
  const ahora = Date.UTC(2026, 9, 4, 17, 15, 0); // 19:15 Madrid
  const base = { enlazado: true, estado: 'idle', agentes: [], cola: null };
  const f = E.ficha({ ...base, desde: Math.floor(Date.UTC(2026, 9, 4, 17, 1, 0) / 1000) }, ahora);
  assert.equal(f.filas.find((x) => x[0] === 'Desde')[1], 'hace 14 min (19:01)');
  const g = E.ficha({ ...base, desde: null }, ahora);
  assert.equal(g.filas.find((x) => x[0] === 'Desde')[1], 'sin datos');
});

test('parpadeo: la primera carga no avisa; cambia estado, misión o foco → avisa solo a ese', () => {
  const d1 = { mesa: { leyendas: [elon, { persona: 'George Lucas', enlazado: true, estado: 'idle', agentes: [{ foco: 'a' }] }] } };
  const h1 = E.huellas(d1);
  assert.deepEqual(E.cambiados(null, h1), []);
  assert.deepEqual(E.cambiados(h1, E.huellas(d1)), []);
  const lucasFoco = { mesa: { leyendas: [elon, { persona: 'George Lucas', enlazado: true, estado: 'idle', agentes: [{ foco: 'b' }] }] } };
  assert.deepEqual(E.cambiados(h1, E.huellas(lucasFoco)), ['georgelucas']);
  const elonEstado = { mesa: { leyendas: [{ ...elon, estado: 'idle' }, d1.mesa.leyendas[1]] } };
  assert.deepEqual(E.cambiados(h1, E.huellas(elonEstado)), ['elonmusk']);
  const elonMision = { mesa: { leyendas: [{ ...elon, encargo: { ...elon.encargo, numero: 5001, titulo: 'Otro' } }, d1.mesa.leyendas[1]] } };
  assert.deepEqual(E.cambiados(h1, E.huellas(elonMision)), ['elonmusk']);
  // El último latido por sí solo no es un cambio.
  assert.deepEqual(E.cambiados(h1, E.huellas({ mesa: { leyendas: [{ ...elon, ultimo_latido: S }, d1.mesa.leyendas[1]] } })), []);
});

test('#5097 ficha Jobs: DeepAgent desde Jobs/Smith en foco; no «silla JobsGrokBot»', () => {
  const jobs = {
    persona: 'Steve Jobs', rol: 'CEO', enlazado: true, estado: 'working',
    proyecto: 'admiranext', encargo: { numero: 5105, etiqueta: '#5105.10.04', titulo: 'Ronda matinal 6 agentes', de: 'status-web', desde: S - 120 },
    cola: { pending: 0, ack: 2, in_progress: 1, blocked: 0 }, ultimo_latido: S - 5,
    maquina_silla: 'MacBookAirAzul',
    agentes: [{ persona: 'Jobs', tipo: 'silla', etiqueta: 'JobsGrokBot', runtime: 'Grok', maquina: 'GrokBot', vivo: true,
      modo: 'trabajando', foco: 'Jobs/Smith: #5105 prueba bandera ASCII', tarea: '#5105 prueba bandera ASCII', proyecto: 'admiranext' }]
  };
  const f = E.ficha(jobs, NOW);
  const get = k => f.filas.find(x => x[0] === k)[1];
  assert.equal(get('Estado'), 'trabajando (working)');
  assert.equal(get('Misión'), '#5105 prueba bandera ASCII');
  assert.match(get('Deepagent · máquina'), /^Jobs\/Smith/);
  assert.doesNotMatch(get('Deepagent · máquina'), /silla JobsGrokBot/);
  assert.match(get('Deepagent · máquina'), /en línea/);
  assert.match(get('Deepagent · máquina'), /MacBookAirAzul/);
  assert.equal(E.deepDesdeLatido(jobs), 'Jobs/Smith');
});

test('#5097 sin latido y encargo «Ronda matinal» no se usa como misión', () => {
  const jobs = {
    persona: 'Steve Jobs', enlazado: true, estado: 'idle', encargo: { numero: 1, titulo: 'Ronda matinal 6 agentes' },
    ultimo_latido: S - 900, agentes: [{ tipo: 'silla', etiqueta: 'JobsGrokBot', vivo: false }]
  };
  const f = E.ficha(jobs, NOW);
  assert.equal(f.filas.find(x => x[0] === 'Misión')[1], 'nada en curso');
  assert.match(f.filas.find(x => x[0] === 'Deepagent · máquina')[1], /silla JobsGrokBot/);
});
