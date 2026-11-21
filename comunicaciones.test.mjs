import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  personaEnRemitente,
  esCruce,
  asMs,
  formatearDuracion,
  fromInboxItem,
  fromSesion,
  fromMensaje,
  buildComunicaciones,
  etiquetaContador,
  urlsInboxPublico,
  urlsMensajes,
  juntarInbox,
} from './consejo-comunicaciones-lib.mjs';
import * as api from './functions/api/consejo/comunicaciones.js';
import { COOKIE, emitir } from './functions/_puerta.js';

const AHORA = Date.parse('2026-11-21T11:00:00Z');

test('reconoce remitentes reales sin confundir Carlos con Carlo Ratti', () => {
  assert.equal(personaEnRemitente('status-web · Elon Musk (por encargo de Carlos)'), 'Elon Musk');
  assert.equal(personaEnRemitente('Jobs'), 'Steve Jobs');
  assert.equal(personaEnRemitente('JobsGrokBot'), 'Steve Jobs');
  assert.equal(personaEnRemitente('status-web · Woz (rutina Tres mejoras de Alsea)'), 'Steve Wozniak');
  assert.equal(personaEnRemitente('Disney (Walt/Niobe) por orden de Carlos'), 'Walt Disney');
  assert.equal(personaEnRemitente('HuangGrokBot'), 'Jensen Huang');
  assert.equal(personaEnRemitente('status-web · Mira/Trinity por orden de Carlos'), null);
});

test('solo cuenta cruces Leyendas ↔ Coetáneos', () => {
  assert.equal(esCruce('Elon Musk', 'Steve Jobs'), true);
  assert.equal(esCruce('Steve Jobs', 'Steve Wozniak'), false);
  assert.equal(esCruce('Elon Musk', 'Jensen Huang'), false);
  assert.equal(esCruce('Elon Musk', 'Neo'), false);
});

test('#7637 Musk → Jobs entra con hora Madrid y duración real', () => {
  const row = fromInboxItem({
    id: 7637,
    ts: 1795252896,
    from_name: 'status-web · Elon Musk (por encargo de Carlos)',
    target_persona: 'Jobs',
    status: 'done',
    done_at: 1795252985,
    etiqueta: '#7637.11.21',
    text: 'Steve, pregunta de Carlos: ¿qué has cambiado en los encabezados de los consejeros?',
  }, AHORA);
  assert.ok(row);
  assert.equal(row.de, 'Elon Musk');
  assert.equal(row.para, 'Steve Jobs');
  assert.equal(row.fuente, 'encargo');
  assert.equal(row.estado, 'respondido');
  assert.equal(row.etiqueta, '#7637.11.21');
  assert.equal(row.inicio, 1795252896 * 1000);
  assert.equal(row.duracion_ms, (1795252985 - 1795252896) * 1000);
  assert.equal(row.duracion, '1 min 29 s');
  assert.match(row.inicio_madrid, /21\/11\/2026/);
  assert.match(row.inicio_madrid, /10:21:36/);
  assert.equal(row.en_curso, false);
});

test('un encargo de Disney a Wozniak (misma generación) no aparece', () => {
  assert.equal(fromInboxItem({
    id: 7546,
    ts: 1794406712,
    from_name: 'status-web · Disney (Walt/Niobe) por orden de Carlos',
    target_persona: 'Wozniak',
    status: 'in_progress',
    text: 'Admira Live app',
  }, AHORA), null);
});

test('una sesión autónoma cuenta como comunicación Leyendas ↔ Coetáneos', () => {
  const row = fromSesion({
    id: 'sdemo1',
    tema: 'afinar encabezados del Consejo',
    estado: 'parada',
    creado: Date.parse('2026-11-21T09:00:00Z'),
    actualizado: Date.parse('2026-11-21T09:12:00Z'),
    roster: ['Steve Jobs', 'Elon Musk'],
    turnos: [
      { persona: 'Steve Jobs', texto: 'Empezamos.' },
      { persona: 'Elon Musk', texto: 'De acuerdo, vamos al grano.' },
    ],
  }, AHORA);
  assert.equal(row.de, 'Steve Jobs');
  assert.equal(row.para, 'Elon Musk');
  assert.equal(row.fuente, 'sesion');
  assert.equal(row.estado, 'cerrado');
  assert.equal(row.duracion, '12 min');
  assert.equal(row.url, 'https://www.admira.live/conversacion#sesion-sdemo1');
});

test('el recuento junta inbox y sesiones, sin inventar filas', () => {
  const out = buildComunicaciones({
    inbox: [
      {
        id: 7637, ts: 1795252896, from_name: 'status-web · Elon Musk (por encargo de Carlos)',
        target_persona: 'Jobs', status: 'done', done_at: 1795252985, etiqueta: '#7637.11.21',
        text: 'encabezados',
      },
      {
        id: 7619, ts: 1795043931, from_name: 'status-web · JobsGrokBot',
        target_persona: 'Jobs', status: 'done', text: 'parte del día',
      },
    ],
    sesiones: [],
  }, AHORA);
  assert.equal(out.total, 1);
  assert.equal(out.comunicaciones[0].etiqueta, '#7637.11.21');
  assert.equal(etiquetaContador(1), '1 comunicación');
  assert.equal(etiquetaContador(0), '0 comunicaciones');
});

test('formatea duraciones y trata segundos y milisegundos', () => {
  assert.equal(asMs(1795252896), 1795252896000);
  assert.equal(asMs(1795252896000), 1795252896000);
  assert.equal(formatearDuracion(89000), '1 min 29 s');
  assert.equal(formatearDuracion(2 * 3600 * 1000 + 15 * 60 * 1000), '2 h 15 min');
  assert.match(formatearDuracion(5000, { enCurso: true }), /en curso · 5 s/);
});

test('la home y Conversación enlazan la sección visible', () => {
  const home = fs.readFileSync('index.html', 'utf8');
  assert.match(home, /href="\/comunicaciones"/);
  assert.match(home, /id="badge-comunicaciones"/);
  assert.match(home, /comunicaciones-widget\.js/);
  const conv = fs.readFileSync('conversacion.html', 'utf8');
  assert.match(conv, /href="\/comunicaciones"/);
  assert.match(fs.readFileSync('comunicaciones.html', 'utf8'), /id="contador"/);
  for (const file of ['comunicaciones-page.js', 'comunicaciones-widget.js', 'comunicaciones.html']) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /CONSEJERO_MENSAJES_TOKEN|x-mensajes-token|Bearer |api[_-]?key/i);
  }
  assert.match(fs.readFileSync('comunicaciones-page.js', 'utf8'), /participantes/);
});

test('una sesión de la misma generación, o sin hablantes, no se inventa', () => {
  assert.equal(fromSesion({
    id: 's1', creado: AHORA - 60000, actualizado: AHORA, estado: 'parada',
    roster: ['Steve Jobs', 'Steve Wozniak'],
    turnos: [{ persona: 'Steve Jobs', texto: 'hola' }],
  }, AHORA), null);
  assert.equal(fromSesion({
    id: 's2', creado: AHORA - 60000, estado: 'en_curso', tema: 'plenario vacío', turnos: 3,
  }, AHORA), null);
});

test('el mensaje privado Musk → Jobs del 21-nov 12:07 Madrid entra; agente o misma generación no', () => {
  const row = fromMensaje({
    id: 'cm7637',
    de: 'Musk',
    para: 'Jobs',
    texto: 'Sobre #7637: los encabezados.',
    hora: '2026-11-21T11:07:00.000Z',
    leido: true,
    leido_en: '2026-11-21T11:09:00.000Z',
    de_tipo: 'consejero',
    para_tipo: 'consejero',
    maquina: 'GrokBot',
    aviso: { token: 'no-sale' },
  }, AHORA);
  assert.ok(row);
  assert.equal(row.de, 'Elon Musk');
  assert.equal(row.para, 'Steve Jobs');
  assert.equal(row.fuente, 'mensaje');
  assert.match(row.inicio_madrid, /21\/11\/2026/);
  assert.match(row.inicio_madrid, /12:07:00/);
  assert.equal(row.duracion_ms, 120000);
  assert.equal(row.duracion, '2 min');
  assert.equal(row.url, 'https://www.admira.live/chat/jobs/#entre-consejeros');
  assert.equal(row.maquina, undefined);
  assert.equal(fromMensaje({
    id: 'a', de: 'Musk', para: 'Huang', hora: '2026-11-21T11:07:00Z',
    de_tipo: 'consejero', para_tipo: 'consejero',
  }, AHORA), null);
  assert.equal(fromMensaje({
    id: 'b', de: 'Neo', para: 'Jobs', hora: '2026-11-21T11:07:00Z',
    de_tipo: 'agente', para_tipo: 'consejero',
  }, AHORA), null);
});

test('el recuento suma el mensaje privado sin duplicar el encargo', () => {
  const encargo = {
    id: 7637, ts: 1795252896, from_name: 'status-web · Elon Musk (por encargo de Carlos)',
    target_persona: 'Jobs', status: 'done', done_at: 1795252985, etiqueta: '#7637.11.21', text: 'encabezados',
  };
  const out = buildComunicaciones({
    inbox: juntarInbox([[encargo], [encargo]]),
    sesiones: [],
    mensajes: [{
      id: 'cm7637', de: 'Musk', para: 'Jobs', texto: 'Sobre #7637',
      hora: '2026-11-21T11:07:00.000Z', leido: true, leido_en: '2026-11-21T11:09:00.000Z',
    }],
  }, AHORA);
  assert.equal(out.total, 2);
  assert.equal(out.fuentes.encargos, 1);
  assert.equal(out.fuentes.mensajes, 1);
  assert.equal(out.comunicaciones[0].fuente, 'mensaje');
});

test('las URLs de bandeja y de mensajes no llevan secreto', () => {
  const urls = urlsInboxPublico();
  assert.ok(urls.some((u) => u.includes('persona=Jobs')));
  for (const u of urls) {
    assert.ok(u.startsWith('https://bot.yokup.com/api/public/inbox'));
    assert.doesNotMatch(u, /token|key|secret|Bearer/i);
  }
  const msgs = urlsMensajes('https://mcp.admira.live');
  assert.ok(msgs.some((u) => u === 'https://mcp.admira.live/consejero/mensajes?con=Jobs&max=500'));
  assert.ok(msgs.some((u) => u.includes('con=Musk')));
  assert.equal(urlsMensajes('http://mcp.admira.live').length, 0);
  assert.equal(urlsMensajes('https://user:tok@mcp.admira.live').length, 0);
});

const TOKEN = 'sekreto-de-prueba-no-imprimir-32';
const MENSAJE = {
  id: 'cm7637', de: 'Musk', para: 'Jobs', texto: 'Sobre #7637: los encabezados.',
  hora: '2026-11-21T11:07:00.000Z', leido: true, leido_en: '2026-11-21T11:09:00.000Z',
  maquina: 'GrokBot', aviso: { token: TOKEN },
};

function fetchFalso(vistos, { mensajes = [], estadoMensajes = 200 } = {}) {
  return async (u, init) => {
    vistos.push({ u: String(u), h: (init && init.headers) || {} });
    if (String(u).includes('/consejero/mensajes')) {
      return new Response(JSON.stringify({ ok: true, mensajes }), { status: estadoMensajes });
    }
    if (String(u).includes('persona=Jobs')) {
      return new Response(JSON.stringify({ items: [{
        id: 7637, ts: 1795252896, from_name: 'status-web · Elon Musk (por encargo de Carlos)',
        target_persona: 'Jobs', status: 'done', done_at: 1795252985, etiqueta: '#7637.11.21', text: 'encabezados',
      }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
}

test('sin sesión no se lee nada', async () => {
  const vistos = [];
  const r = await api.onRequestGet({
    request: new Request('https://evil.example/api/consejo/comunicaciones'),
    env: { CONSEJERO_MENSAJES_TOKEN: TOKEN },
    fetchImpl: fetchFalso(vistos),
  });
  assert.equal(r.status, 401);
  assert.equal(vistos.length, 0);
});

test('el atajo por Origin no abre los mensajes privados ni devuelve el token', async () => {
  const vistos = [];
  const r = await api.onRequestGet({
    request: new Request('https://www.admira.live/api/consejo/comunicaciones?limite=40', {
      headers: { origin: 'https://www.admira.live' },
    }),
    env: { CONSEJERO_MENSAJES_TOKEN: TOKEN },
    fetchImpl: fetchFalso(vistos, { mensajes: [MENSAJE] }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(!vistos.some((v) => v.u.includes('/consejero/mensajes')));
  assert.equal(d.fuentes.mensajes, 0);
  assert.equal(d.fuentes.encargos, 1);
  assert.equal(JSON.stringify(d).includes(TOKEN), false);
  assert.equal(JSON.stringify(d).includes('GrokBot'), false);
});

test('con la sesión de admira.live el mensaje Musk → Jobs entra y el token no sale', async () => {
  const secreto = 'prueba-puerta-comunicaciones-32b';
  const ahora = Math.floor(Date.now() / 1000);
  const { valor } = await emitir(secreto, 'persona', 'csilvasantin@gmail.com', ahora);
  const vistos = [];
  const r = await api.onRequestGet({
    request: new Request('https://www.admira.live/api/consejo/comunicaciones?limite=40', {
      headers: { origin: 'https://www.admira.live', cookie: `${COOKIE}=${valor}` },
    }),
    env: { PUERTA_FIRMA: secreto, CONSEJERO_MENSAJES_TOKEN: TOKEN },
    fetchImpl: fetchFalso(vistos, { mensajes: [MENSAJE] }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.fuentes.mensajes, 1);
  assert.equal(d.fuentes.encargos, 1);
  assert.equal(d.total, 2);
  const msg = d.comunicaciones.find((c) => c.fuente === 'mensaje');
  assert.equal(msg.de, 'Elon Musk');
  assert.equal(msg.para, 'Steve Jobs');
  assert.match(msg.inicio_madrid, /12:07:00/);
  const llamadas = vistos.filter((v) => v.u.includes('/consejero/mensajes'));
  assert.ok(llamadas.some((v) => v.u === 'https://mcp.admira.live/consejero/mensajes?con=Jobs&max=500'));
  assert.ok(llamadas.every((v) => v.h['x-mensajes-token'] === TOKEN));
  assert.equal(new Set(llamadas.map((v) => v.u)).size, llamadas.length);
  const cuerpo = JSON.stringify(d);
  assert.equal(cuerpo.includes(TOKEN), false);
  assert.equal(cuerpo.includes('GrokBot'), false);
  assert.equal(cuerpo.includes('aviso'), false);
});
