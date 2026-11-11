import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clasificar, textoGlobo, latidoVigente, tituloCorto, horaMadrid,
  ultimoHecho, ultimoDe, asientoPublico, armarMesa, tieneBot,
  CADUCIDAD_SEG, PAPEL_POS, MESA, COLORES,
} from './consejo-globo-lib.mjs';

const AHORA = Date.UTC(2026, 10, 11, 16, 50, 0); // 17:50 Madrid (UTC+1)
const S = Math.floor(AHORA / 1000);

test('pending e in_progress en cola no cuentan como trabajando', () => {
  const items = [
    { id: 10, status: 'pending', text: 'solo en cola', ts: S - 60 },
    { id: 11, status: 'in_progress', text: 'abierto en bandeja', ts: S - 60, ack_at: S - 50 },
  ];
  const s = asientoPublico(
    { persona: 'Steve Wozniak', rol: 'CTO' },
    { latidos: { Wozniak: { modo: 'reposo', at: S - 120, hasta: S - 60 } }, bandejas: { Wozniak: items }, ahoraS: S },
  );
  assert.equal(s.estado, 'libre');
  assert.equal(s.en_curso, null);
});

test('latido trabajando fresco (con # y título) → trabajando; caducado a los 30 min → libre con último', () => {
  const entrada = { modo: 'trabajando', mision: 'Cabecera por usuario', encargo: 7546, at: S - 5 * 60, hasta: S + 5 * 60 };
  assert.equal(latidoVigente(entrada, S), true);
  assert.equal(clasificar({ persona: 'Steve Wozniak', entrada, ahoraS: S }), 'trabajando');
  const vivo = asientoPublico({ persona: 'Steve Wozniak', rol: 'CTO' }, { latidos: { Wozniak: entrada }, bandejas: {}, ahoraS: S });
  assert.equal(vivo.estado, 'trabajando');
  assert.equal(vivo.texto, 'En curso: Cabecera por usuario (#7546)');
});

test('título del latido que ya trae el # no se duplica si solo hay misión', () => {
  const s = {
    estado: 'trabajando',
    en_curso: { numero: 7546, titulo: 'Cabecera por usuario y wake Hola Admira' },
  };
  assert.equal(textoGlobo(s, AHORA), 'En curso: Cabecera por usuario y wake Hola Admira (#7546)');
});

test('hace más de 30 min sin nuevo latido, aunque `hasta` siga abierto, pasa a libre con último', () => {
  const entrada = { modo: 'trabajando', mision: 'mesa del Consejo', encargo: 7600, at: S - CADUCIDAD_SEG - 1, hasta: S + 3600 };
  assert.equal(latidoVigente(entrada, S), false);
  const s = asientoPublico({ persona: 'Steve Jobs', rol: 'CEO' }, { latidos: { Jobs: entrada }, bandejas: { Jobs: [] }, ahoraS: S });
  assert.equal(s.estado, 'libre');
  assert.match(s.texto, /Libre\. Último: mesa del Consejo \(#7600\) a las /);
  assert.equal(s.ultimo.cuando, S - CADUCIDAD_SEG - 1);
});

test('hasta cumplido → libre aunque at sea reciente', () => {
  const entrada = { modo: 'trabajando', mision: 'x', encargo: 1, at: S - 60, hasta: S };
  assert.equal(latidoVigente(entrada, S), false);
  assert.equal(clasificar({ persona: 'Elon Musk', entrada, ahoraS: S }), 'libre');
});

test('consejero con bot y sin latido es libre, nunca desconocido', () => {
  assert.equal(tieneBot('Steve Jobs'), true);
  assert.equal(tieneBot('Jony Ive'), true);
  assert.equal(clasificar({ persona: 'Jony Ive', entrada: null, ahoraS: S }), 'libre');
  const s = asientoPublico({ persona: 'Jony Ive', rol: 'CDO' }, { latidos: {}, bandejas: {}, ahoraS: S });
  assert.equal(s.estado, 'libre');
  assert.equal(s.texto, 'Libre');
});

test('asiento sin bot → desconocido / amarillo', () => {
  assert.equal(tieneBot('Tim Cook'), false);
  assert.equal(tieneBot('Gwynne Shotwell'), false);
  assert.equal(clasificar({ persona: 'Tim Cook', entrada: null, ahoraS: S }), 'desconocido');
  const s = asientoPublico({ persona: 'Tim Cook', rol: 'COO' }, { latidos: {}, bandejas: {}, ahoraS: S });
  assert.equal(s.estado, 'desconocido');
  assert.equal(s.texto, 'desconocido');
});

test('último hecho sale de encargos done con hora de Madrid; pending no entra', () => {
  const items = [
    { id: 1, status: 'pending', text: 'cola', ts: S - 10 },
    { id: 2, status: 'in_progress', text: 'curso', ts: S - 20, ack_at: S - 15 },
    { id: 3, status: 'cancelled', text: 'anulado', done_at: S - 30 },
    { id: 7533, status: 'done', text: 'hilo compartido admira.live', done_at: Date.UTC(2026, 10, 11, 13, 35, 11) / 1000 },
  ];
  const u = ultimoHecho(items, S);
  assert.equal(u.numero, 7533);
  assert.equal(u.titulo, 'hilo compartido admira.live');
  const s = asientoPublico(
    { persona: 'Steve Jobs', rol: 'CEO' },
    { latidos: { Jobs: { modo: 'reposo', at: S - 100, mision: null, encargo: null } }, bandejas: { Jobs: items }, ahoraS: S },
  );
  assert.equal(s.estado, 'libre');
  assert.equal(s.texto, 'Libre. Último: hilo compartido admira.live (#7533) a las 14:35');
});

test('misión de un latido caducado gana al done más viejo', () => {
  const entrada = { modo: 'reposo', caducado: true, mision: 'Cabecera #7546', encargo: 7546, at: S - 4000 };
  const items = [{ id: 7421, status: 'done', text: 'una clavija', done_at: S - 800000 }];
  const u = ultimoDe(entrada, items, S);
  assert.equal(u.numero, 7546);
  assert.equal(u.cuando, S - 4000);
});

test('título corto no expone un texto largo privado', () => {
  const t = tituloCorto('Primera línea pública\n' + 'secreto '.repeat(80), 80);
  assert.ok(t.length <= 80);
  assert.doesNotMatch(t, /secreto secreto/);
});

test('hora de Madrid: mismo día solo HH:MM; otro día con fecha', () => {
  assert.equal(horaMadrid(Date.UTC(2026, 10, 11, 14, 36, 23) / 1000, AHORA), '15:36');
  assert.match(horaMadrid(Date.UTC(2026, 10, 4, 19, 9, 0) / 1000, AHORA), /4\s+nov/i);
});

test('armarMesa cubre las dos generaciones y todos los papeles tienen posición', () => {
  const d = armarMesa({ latidos: { Wozniak: { modo: 'trabajando', mision: 'globo', encargo: 1, at: S - 10, hasta: S + 100 } }, bandejas: {}, ahoraMs: AHORA });
  assert.equal(d.mesa.leyendas.length, 8);
  assert.equal(d.mesa.coetaneos.length, 6);
  const woz = d.mesa.leyendas.find((s) => s.persona === 'Steve Wozniak');
  assert.equal(woz.estado, 'trabajando');
  const cook = d.mesa.leyendas.find((s) => s.persona === 'Tim Cook');
  assert.equal(cook.estado, 'desconocido');
  for (const gen of Object.keys(MESA)) {
    for (const s of MESA[gen]) {
      const p = PAPEL_POS[gen][s.persona];
      assert.ok(p, 'falta posición de ' + s.persona);
      assert.ok(['papel', 'placa', 'cuerpo', 'ninguno'].includes(p.sobre), 'sobre inválido de ' + s.persona);
      if (p.sobre !== 'ninguno') {
        assert.ok(p.w > 0 && p.h > 0, 'caja vacía de ' + s.persona);
        assert.ok(Array.isArray(p.puntos) && p.puntos.length >= 4, 'polígono corto de ' + s.persona);
      } else {
        assert.ok(p.w === 0 && p.h === 0, 'ninguno debe ir sin caja ' + s.persona);
        assert.equal(p.puntos.length, 0, 'ninguno no lleva puntos ' + s.persona);
      }
    }
  }
  assert.equal(COLORES.trabajando, '#e23d3d');
  assert.equal(COLORES.libre, '#3ddc84');
  assert.equal(COLORES.desconocido, '#ffd60a');
});

test('halos: folio o placa con polígono real; nada en el asiento de Disney', () => {
  const L = PAPEL_POS.leyendas;
  assert.equal(L['Steve Wozniak'].sobre, 'papel');
  assert.equal(L['Tim Cook'].sobre, 'papel');
  assert.equal(L['Dieter Rams'].sobre, 'papel');
  assert.equal(L['Howard Schultz'].sobre, 'papel');
  assert.equal(L['George Lucas'].sobre, 'papel');
  assert.equal(L['Steve Jobs'].sobre, 'cuerpo');
  assert.equal(L['Warren Buffett'].sobre, 'papel');
  assert.equal(L['Walt Disney'].sobre, 'ninguno');
  // El fallo de r134/r136: óvalo genérico (o halo en madera vacía / en Y).
  // Disney (Y en ese asiento) no lleva halo. Buffett ilumina sus folios, no el cuerpo de Y.
  const jobs = L['Steve Jobs'];
  assert.ok(jobs.x < 16, 'Jobs no debe usurpar los folios de Woz');
  const cook = L['Tim Cook'];
  assert.ok(cook.w < 10 && cook.h < 8, 'Cook ya no cubre tres pilas y madera vacía');
  const buffett = L['Warren Buffett'];
  assert.ok(buffett.x < 45 && buffett.y > 48, 'Buffett en sus folios, no en el cuerpo de Y');
  const C = PAPEL_POS.coetaneos;
  assert.equal(Object.keys(C).length, 6);
  assert.ok(!C['Ruth Porat'] && !C['Carlos Ratti'], 'Porat y Ratti ya no tienen asiento (#7520)');
  for (const k of ['Elon Musk', 'Jensen Huang', 'Gwynne Shotwell', 'Jony Ive', 'John Lasseter', 'Ryan Reynolds']) {
    assert.equal(C[k].sobre, 'placa', k);
    assert.ok(C[k].puntos.length >= 4, k);
  }
  // Lasseter está en la silla que era de Ratti; su placa no es la antigua (~56, 60).
  assert.ok(C['John Lasseter'].y > 74 && C['John Lasseter'].x > 68);
});
