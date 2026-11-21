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
  buildComunicaciones,
  etiquetaContador,
} from './consejo-comunicaciones-lib.mjs';

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
});
