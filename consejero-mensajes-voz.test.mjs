import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
await import('./consejeros-voces.js');
await import('./assets/consejero-mensajes.js');
const AdmiraVoces = globalThis.AdmiraVoces;
const voces = globalThis.AdmiraEntreVoces;

function store() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

const jobsElon = [
  { id: 'a1', de: 'Musk', para: 'Jobs', texto: 'Hola Jobs, soy Elon.', hora: '2026-11-12T09:00:00Z' },
  { id: 'a2', de: 'Jobs', para: 'Musk', texto: 'Hola Elon.', hora: '2026-11-12T09:01:00Z' },
];

test('textoDe usa el cuerpo completo y, si falta, el resumen', () => {
  assert.equal(voces.textoDe({ texto: 'cuerpo largo', resumen: 'corto' }), 'cuerpo largo');
  assert.equal(voces.textoDe({ texto: '   ', resumen: 'solo resumen' }), 'solo resumen');
  assert.equal(voces.textoDe({ resumen: 'solo resumen' }), 'solo resumen');
  assert.equal(voces.textoDe({ texto: '', resumen: '' }), '');
  assert.equal(voces.textoDe({}), '');
});

test('idDe prefiere el id y, si no hay, arma uno estable', () => {
  assert.equal(voces.idDe({ id: 'cm1', de: 'Musk', texto: 'hola' }), 'cm1');
  const a = voces.idDe({ de: 'Musk', para: 'Jobs', hora: 't', texto: 'hola' });
  const b = voces.idDe({ de: 'Musk', para: 'Jobs', hora: 't', texto: 'hola' });
  assert.equal(a, b);
  assert.ok(a.length > 0);
});

test('primera carga marca los existentes y no los devuelve para locutar', () => {
  const ls = store();
  assert.deepEqual(voces.iniciarOidos('Jobs', jobsElon, ls), []);
  assert.deepEqual(voces.noOidos('Jobs', jobsElon, ls).map((m) => m.id), []);
  assert.deepEqual(voces.pendientesDeLocutar('Jobs', jobsElon, ls), []);
});

test('un mensaje nuevo entrante de Elon a Jobs se locuta con Elon Musk y no se relée', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', jobsElon, ls);
  const nuevo = { id: 'a3', de: 'Musk', para: 'Jobs', texto: '¿Arrancamos la sala?', hora: '2026-11-12T09:05:00Z' };
  const pend = voces.pendientesDeLocutar('Jobs', jobsElon.concat(nuevo), ls);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].persona, 'Elon Musk');
  assert.equal(pend[0].texto, '¿Arrancamos la sala?');
  assert.deepEqual(voces.pendientesDeLocutar('Jobs', jobsElon.concat(nuevo), ls), []);
});

test('en la página de Musk, un mensaje nuevo de Jobs se locuta con Steve Jobs', () => {
  const ls = store();
  voces.iniciarOidos('Musk', jobsElon, ls);
  const nuevo = { id: 'b1', de: 'Jobs', para: 'Musk', texto: 'Menos ruido, más foco.' };
  const pend = voces.pendientesDeLocutar('Musk', jobsElon.concat(nuevo), ls);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].persona, 'Steve Jobs');
  assert.equal(pend[0].texto, 'Menos ruido, más foco.');
});

test('no locuta los mensajes propios ni los de agentes, aunque sean nuevos', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', [], ls);
  const propios = { id: 'p1', de: 'Jobs', para: 'Musk', texto: 'lo digo yo' };
  const agente = { id: 'ag1', de: 'Neo', para: 'Jobs', de_tipo: 'agente', texto: 'aviso de Neo' };
  assert.deepEqual(voces.pendientesDeLocutar('Jobs', [propios, agente], ls), []);
  // quedan oídos para no relolerlos si más tarde cambiara el criterio
  assert.deepEqual(voces.noOidos('Jobs', [propios, agente], ls), []);
});

test('si solo llega resumen, ese es el texto que se oye', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', [], ls);
  const pend = voces.pendientesDeLocutar('Jobs', [{ id: 'r1', de: 'Musk', para: 'Jobs', resumen: 'te resumo' }], ls);
  assert.equal(pend[0].texto, 'te resumo');
});

test('los oídos de Jobs y Musk no se pisan en el mismo navegador', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', jobsElon, ls);
  voces.iniciarOidos('Musk', jobsElon, ls);
  const nuevo = { id: 'x1', de: 'Jobs', para: 'Musk', texto: 'nuevo para Elon' };
  const pend = voces.pendientesDeLocutar('Musk', jobsElon.concat(nuevo), ls);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].id, 'x1');
  assert.equal(voces.pendientesDeLocutar('Jobs', jobsElon.concat(nuevo), ls).length, 0);
});

test('casting publicado: Jobs = Mónica (femenina provisional), Elon = Reed (sin cambiar el resto)', () => {
  const v = (name, lang) => ({ name, lang, voiceURI: name, localService: true });
  AdmiraVoces._setVoicesForTest([
    v('Mónica', 'es-ES'), v('Reed (Español (España))', 'es-ES'),
    v('Pablo', 'es-ES'), v('Juan', 'es-ES'),
  ]);
  const J = AdmiraVoces.casting('Steve Jobs');
  const E = AdmiraVoces.casting('Elon Musk');
  assert.equal(J.prefer[0], 'Monica');
  assert.equal(J.genero, 'f');
  assert.equal(J.rate, 0.95);
  assert.equal(J.pitch, 1.05);
  assert.equal(E.prefer[0], 'Reed');
  assert.equal(E.rate, 1.2);
  assert.equal(E.pitch, 1.3);
  assert.equal(AdmiraVoces.profile('Steve Jobs').voiceName, 'Mónica');
  assert.equal(AdmiraVoces.profile('Elon Musk').voiceName, 'Reed (Español (España))');
});

test('las páginas de Jobs y Elon cargan consejeros-voces.js y la nueva versión de consejero-mensajes.js', () => {
  for (const who of ['jobs', 'musk', 'wozniak', 'disney', 'lucas', 'huang']) {
    const html = readFileSync(new URL('./chat/' + who + '/index.html', import.meta.url), 'utf8');
    assert.match(html, /consejeros-voces.js\?v=20261116-grok-tts/);
    assert.match(html, /consejero-mensajes.js\?v=20261125-voz-inicial/);
    assert.match(html, /id="entre-consejeros"[^>]*data-voz-inicial="on"/);
    assert.match(html, /voz-turno-cliente\.js\?v=20261112-voz-propia/);
    const iVoces = html.indexOf('consejeros-voces.js');
    const iMsg = html.indexOf('consejero-mensajes.js');
    assert.ok(iVoces >= 0 && iVoces < iMsg, who + ': voces antes de mensajes');
  }
  const js = readFileSync(new URL('./assets/consejero-mensajes.js', import.meta.url), 'utf8');
  assert.match(js, /Activar voz/);
  assert.match(js, /Silenciar voz/);
  assert.match(js, /AdmiraVoces\.speak/);
  assert.match(js, /pointerdown/);
  assert.match(js, /keydown/);
  assert.match(js, /touchstart/);
  assert.match(js, /AdmiraVozTurno/);
  assert.match(js, /silencioSiSala/);
  assert.match(js, /pagehide/);
  assert.match(js, /beforeunload/);
  assert.match(js, /visibilitychange/);
  assert.doesNotMatch(js, /soltarCola/);
});

test('etiqueta: Jobs → Elon y Elon → Jobs (no dice Musk)', () => {
  assert.equal(voces.etiqueta({ de: 'Jobs', para: 'Musk' }), 'Jobs → Elon');
  assert.equal(voces.etiqueta({ de: 'Musk', para: 'Jobs' }), 'Elon → Jobs');
});

test('portada: la transcripción locuta ambos sentidos y no relée lo ya visto', () => {
  const ls = store();
  const par = [
    { id: 'cmmwdd8mdbfyqplc', de: 'Jobs', para: 'Musk', texto: 'Hola Elon', hora: '2026-11-12T09:49:00Z' },
    { id: 'r2', de: 'Musk', para: 'Jobs', texto: 'Te oigo', hora: '2026-11-12T09:49:40Z' },
  ];
  voces.iniciarOidos('Jobs', par, ls);
  assert.deepEqual(voces.pendientesTranscripcion('Jobs', par, ls), []);
  const nuevo = { id: 'r3', de: 'Jobs', para: 'Musk', texto: 'Seguimos', hora: '2026-11-12T09:50:00Z' };
  const pend = voces.pendientesTranscripcion('Jobs', par.concat(nuevo), ls);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].persona, 'Steve Jobs');
  assert.equal(pend[0].etiqueta, 'Jobs → Elon');
  assert.deepEqual(voces.pendientesTranscripcion('Jobs', par.concat(nuevo), ls), []);
});

test('mergePorHora intercala por hora la transcripción y los turnos de esta visita', () => {
  const hilos = [{ id: 'v1', rol: 'carlos', texto: 'Sigo aquí', ts: '2026-11-12T09:50:00Z' }];
  const entres = [
    { id: 'a', de: 'Jobs', para: 'Musk', texto: 'Hola', hora: '2026-11-12T09:49:00Z' },
    { id: 'b', de: 'Musk', para: 'Jobs', texto: 'Te oigo', hora: '2026-11-12T09:51:00Z' },
  ];
  const mix = voces.mergePorHora(hilos, entres);
  assert.deepEqual(mix.map((x) => x.tipo), ['entre', 'hilo', 'entre']);
  assert.equal(mix[0].m.texto, 'Hola');
  assert.equal(mix[1].t.texto, 'Sigo aquí');
  assert.equal(mix[2].m.texto, 'Te oigo');
});


test('voz activa por defecto; solo se silencia si localStorage dice off', () => {
  assert.equal(voces.leerVozOn(store()), true);
  assert.equal(voces.leerVozOn(null), true);
  const ls = store();
  ls.setItem(voces.LS_VOZ, 'off');
  assert.equal(voces.leerVozOn(ls), false);
  voces.escribirVozOn(true, ls);
  assert.equal(voces.leerVozOn(ls), true);
  voces.escribirVozOn(false, ls);
  assert.equal(voces.leerVozOn(ls), false);
});

function paginaVoz({ ls = store(), porVisita = true, autenticada = true, turno = null } = {}) {
  const nodes = [], events = new Map(), sonidos = [];
  function node(tag) {
    const attrs = {}, listeners = new Map();
    const el = {
      tag, children: [], hidden: false, textContent: '', style: {},
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] ?? null; },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      append(...children) { children.forEach((child) => this.appendChild(child)); },
      insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); child.parentNode = this; },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      addEventListener(k, fn) { listeners.set(k, fn); },
      click() { listeners.get('click')?.(); },
      querySelectorAll() { return this.children.filter((child) => child.getAttribute?.('data-filtro')); },
    };
    nodes.push(el);
    return el;
  }
  const sec = node('section'); sec.id = 'entre-consejeros'; sec.setAttribute('data-silla', 'Jobs');
  if (porVisita) sec.setAttribute('data-voz-inicial', 'on');
  const lista = node('div'); lista.id = 'entre-lista'; sec.appendChild(lista);
  const hilo = node('section'); hilo.id = 'hilo';
  const doc = {
    readyState: 'loading', head: node('head'),
    createElement: node, createTextNode: (text) => ({ textContent: text }),
    getElementById: (id) => nodes.find((el) => el.id === id) || null,
    addEventListener(k, fn) { events.set(k, fn); },
  };
  let sesion = autenticada, peticiones = 0;
  const root = {
    document: doc, localStorage: ls, AdmiraVozTurno: turno,
    ChatHiloClient: { credencial: () => sesion ? 'sesion' : '' },
    AdmiraVoces: {
      supported: () => true,
      speak(persona, texto, opts) { sonidos.push({ persona, texto }); opts.onend(); return true; },
      stop() {},
    },
    fetch() { peticiones++; return Promise.resolve({ ok: true, json: async () => ({ ok: true, mensajes: [] }) }); },
    addEventListener(k, fn) { events.set(k, fn); }, removeEventListener() {}, setInterval() {},
  };
  root.window = root;
  vm.runInNewContext(readFileSync(new URL('./assets/consejero-mensajes.js', import.meta.url), 'utf8'), root);
  return {
    api: root.AdmiraEntreVoces, sonidos,
    boton: doc.getElementById('entre-activar-voz'), aviso: doc.getElementById('entre-voz-aviso'),
    peticiones: () => peticiones,
    async sesion(on) { sesion = on; events.get('chat-hilo-sesion')(); await new Promise(setImmediate); },
    evento(k) { if (k === 'visibilitychange') doc.hidden = true; events.get(k)?.(); },
  };
}

test('/chat arranca con voz aunque la portada esté silenciada; silenciar y reactivar solo afectan esta visita', () => {
  const ls = store(); ls.setItem(voces.LS_VOZ, 'off');
  const p = paginaVoz({ ls });
  assert.equal(p.boton.hidden, false);
  assert.equal(p.boton.textContent, 'Silenciar voz');
  assert.match(p.aviso.textContent, /Voz activa/);
  p.api.locutarHiloSiToca([{ id: 'viejo', rol: 'jobs', texto: 'histórico' }]);
  assert.equal(p.sonidos.length, 0, 'no se relee el histórico al activar la voz');
  p.api.locutarHiloSiToca([{ id: 'nuevo', rol: 'jobs', texto: 'respuesta nueva' }]);
  assert.equal(p.sonidos.length, 1, 'una respuesta nueva se oye sin pulsar Activar voz');
  p.boton.click();
  assert.equal(p.boton.textContent, 'Activar voz');
  p.api.locutarHiloSiToca([{ id: 'silenciado', rol: 'jobs', texto: 'no debe oírse' }]);
  assert.equal(p.sonidos.length, 1);
  p.boton.click();
  assert.equal(p.boton.textContent, 'Silenciar voz');
  const trasReactivar = p.sonidos.length;
  p.api.locutarHiloSiToca([{ id: 'reactivado', rol: 'jobs', texto: 'vuelve a oírse' }]);
  assert.equal(p.sonidos.length, trasReactivar + 1);
  assert.equal(p.sonidos.at(-1).texto, 'vuelve a oírse');
  assert.equal(voces.leerVozOn(ls), false, 'la preferencia de la portada no cambia');
  p.boton.click();
  assert.equal(paginaVoz({ ls }).boton.textContent, 'Silenciar voz', 'otra visita vuelve a arrancar con voz');
});

test('/chat mantiene los controles de voz ocultos hasta restaurar sesión y los oculta al salir', async () => {
  const p = paginaVoz({ autenticada: false });
  assert.equal(p.boton.hidden, true);
  assert.equal(p.aviso.hidden, true);
  assert.equal(p.peticiones(), 0);
  await p.sesion(true);
  assert.equal(p.boton.hidden, false);
  assert.equal(p.aviso.hidden, false);
  assert.equal(p.boton.textContent, 'Silenciar voz');
  assert.equal(p.peticiones(), 1);
  await p.sesion(false);
  assert.equal(p.boton.hidden, true);
  assert.equal(p.aviso.hidden, true);
  assert.equal(p.peticiones(), 1, 'sin sesión no se pide la bandeja privada');
});

test('sin opt-in se conserva la preferencia persistente compartida de voz', () => {
  const ls = store(); ls.setItem(voces.LS_VOZ, 'off');
  const p = paginaVoz({ ls, porVisita: false });
  assert.equal(p.boton.textContent, 'Activar voz');
  p.boton.click();
  assert.equal(voces.leerVozOn(ls), true);
  p.boton.click();
  assert.equal(voces.leerVozOn(ls), false);
});

for (const motivo of ['silenciar', 'cerrar sesión', 'pagehide', 'visibilitychange']) {
  test('/chat libera un turno tardío sin hablar después de ' + motivo, async () => {
    let conceder, liberados = 0;
    const p = paginaVoz({ turno: { aguardarTurno: () => new Promise((resolve) => { conceder = resolve; }) } });
    p.api.locutarHiloSiToca([]);
    p.api.locutarHiloSiToca([{ id: 'tardío', rol: 'jobs', texto: 'respuesta pendiente de turno' }]);
    assert.equal(typeof conceder, 'function');
    if (motivo === 'silenciar') {
      p.boton.click();
      p.boton.click(); // Reactivar no debe resucitar la petición anterior al silencio.
    } else if (motivo === 'cerrar sesión') await p.sesion(false);
    else p.evento(motivo);
    conceder({ concedido: true, liberar() { liberados++; } });
    await new Promise(setImmediate);
    assert.equal(p.sonidos.length, 0);
    assert.equal(liberados, 1, 'se devuelve el turno concedido para que otra página pueda hablar');
  });
}

test('hilo principal: la primera carga no relée el histórico; una respuesta NUEVA del consejero se locuta', () => {
  const ls = store();
  const hist = [
    { id: 'h1', rol: 'carlos', texto: 'Hola Jobs', ts: '2026-11-12T10:00:00Z' },
    { id: 'h2', rol: 'jobs', texto: 'Hola, Carlos. Cuéntame.', ts: '2026-11-12T10:00:10Z' },
  ];
  assert.deepEqual(voces.iniciarOidosHilo('Jobs', hist, ls), []);
  assert.deepEqual(voces.pendientesHiloDeLocutar('Jobs', hist, ls), []);
  const nueva = { id: 'h3', rol: 'jobs', texto: 'He visto la sala.', ts: '2026-11-12T10:01:00Z' };
  const pend = voces.pendientesHiloDeLocutar('Jobs', hist.concat(nueva), ls);
  assert.equal(pend.length, 1);
  assert.equal(pend[0].persona, 'Steve Jobs');
  assert.equal(pend[0].texto, 'He visto la sala.');
  assert.deepEqual(voces.pendientesHiloDeLocutar('Jobs', hist.concat(nueva), ls), []);
});

test('hilo principal: no locuta los turnos de Carlos ni el histórico ya marcado', () => {
  const ls = store();
  voces.iniciarOidosHilo('Jobs', [], ls);
  const deCarlos = { id: 'c1', rol: 'carlos', texto: '¿Me oyes?' };
  assert.deepEqual(voces.pendientesHiloDeLocutar('Jobs', [deCarlos], ls), []);
});

test('no locuta avisos de sistema, encargos, Carlos ni remitentes sin consejero', () => {
  const ls = store();
  voces.iniciarOidos('Jobs', [], ls);
  const sistema = { id: 's1', de: 'sistema', para: 'Jobs', texto: 'Chat limpio', hora: '2026-11-12T10:40:00Z' };
  const encargo = { id: 's2', de: 'encargo', para: 'Jobs', texto: 'Enviado · esperando al bot', hora: '2026-11-12T10:40:01Z' };
  const alguien = { id: 's3', de: 'bandeja', para: 'Jobs', texto: 'Aviso de la bandeja', hora: '2026-11-12T10:40:02Z' };
  assert.deepEqual(voces.pendientesDeLocutar('Jobs', [sistema, encargo, alguien], ls), []);
  voces.iniciarOidosHilo('Jobs', [], ls);
  assert.deepEqual(voces.pendientesHiloDeLocutar('Jobs', [
    { id: 'h-sis', rol: 'sistema', texto: 'Chat limpio' },
    { id: 'h-enc', rol: 'encargo', texto: 'Escribiendo…' },
    { id: 'h-car', rol: 'carlos', texto: '¿Me oyes?' },
  ], ls), []);
  assert.equal(voces.esConsejero('Jobs'), true);
  assert.equal(voces.esConsejero('Elon Musk'), true);
  assert.equal(voces.esConsejero('sistema'), false);
  assert.equal(voces.esConsejero('carlos'), false);
});

test('/hola ya no locuta textos de sistema con la narradora ni la voz del sistema', () => {
  const hola = readFileSync(new URL('./hola/index.html', import.meta.url), 'utf8');
  assert.match(hola, /Nunca la narradora ni la voz del sistema/);
  assert.doesNotMatch(hola, /else u\.lang="es-ES"/);
  assert.match(hola, /consejeros-voces.js\?v=20261116-grok-tts/);
  const src = readFileSync(new URL('./consejeros-voces.js', import.meta.url), 'utf8');
  assert.match(src, /synth\.cancel\(\)/);
});
