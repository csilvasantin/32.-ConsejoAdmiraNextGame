import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clasificar, textoGlobo, latidoVigente, tituloCorto, horaMadrid,
  ultimoHecho, ultimoDe, asientoPublico, armarMesa, tieneBot,
  CADUCIDAD_SEG, PAPEL_POS, MESA, COLORES, mapaEstados, estadoDe, clavePersona,
  esActivo, llevaFlecha, llevaHalo, nuncaFlecha,
  CONSEJO_RANKING, CONSEJO_RANKING_TOTAL, enRanking,
  diaMadrid, inicioDiaMadridS, hechosHoy, etiquetaRanking, puestosHoy,
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
  assert.equal(tieneBot('Mira Murati'), false);
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
      assert.ok(['papel', 'placa', 'ninguno'].includes(p.sobre), 'sobre inválido de ' + s.persona);
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

test('halos: folio o placa con polígono real; flecha en la cabeza; sin silueta', () => {
  const L = PAPEL_POS.leyendas;
  assert.equal(L['Steve Jobs'].sobre, 'papel');
  assert.equal(L['Steve Wozniak'].sobre, 'papel');
  assert.equal(L['Tim Cook'].sobre, 'ninguno');
  assert.equal(L['Dieter Rams'].sobre, 'papel');
  assert.equal(L['Howard Schultz'].sobre, 'ninguno');
  assert.equal(L['George Lucas'].sobre, 'papel');
  assert.equal(L['Warren Buffett'].sobre, 'papel');
  assert.equal(L['Walt Disney'].sobre, 'papel');
  for (const gen of Object.keys(PAPEL_POS)) {
    for (const [nombre, p] of Object.entries(PAPEL_POS[gen])) {
      assert.ok(['papel', 'placa', 'ninguno'].includes(p.sobre), 'sobre inválido de ' + nombre);
      assert.ok(!('estado' in p), 'el estado no debe vivir en PAPEL_POS (' + nombre + ')');
    }
  }
  // Asignación r137 era incorrecta: el fajo del frente izquierdo está junto al
  // codo de Jobs; el folio con clip lo toca Woz. Cook no está en la foto.
  const jobs = L['Steve Jobs'];
  assert.ok(jobs.y > 68 && jobs.x > 18 && jobs.x < 28, 'Jobs ilumina el fajo del frente, no su silueta');
  assert.ok(jobs.flecha && jobs.flecha.y < 42 && jobs.flecha.x < 14, 'flecha de Jobs sobre su cabeza');
  const woz = L['Steve Wozniak'];
  assert.ok(woz.y < 65 && woz.w < 10, 'Woz ilumina el folio de sus manos, no el fajo del frente');
  assert.ok(woz.flecha && woz.flecha.y < 34 && woz.flecha.x > 18 && woz.flecha.x < 25, 'flecha de Woz sobre su cabeza');
  const cook = L['Tim Cook'];
  assert.equal(cook.flecha, null, 'Cook no está en la foto: sin flecha');
  assert.equal(cook.puntos.length, 0);
  const buffett = L['Warren Buffett'];
  assert.ok(buffett.x < 45 && buffett.y > 48, 'Buffett en sus folios, no en el cuerpo de Y');
  assert.equal(L['Carlos Silva'].nuncaFlecha, true, 'Carlos Y-3, en el centro, nunca flecha');
  assert.equal(llevaFlecha('Carlos Silva'), false, 'Carlos/Y no lleva flecha');
  assert.equal(llevaHalo('Carlos Silva'), false);
  assert.equal(L['Walt Disney'].sobre, 'papel');
  assert.ok(!L['Walt Disney'].figura && !L['Walt Disney'].nuncaFlecha, 'Disney no es la figura de Carlos');
  assert.ok(L['Walt Disney'].flecha && L['Walt Disney'].flecha.x > 75 && L['Walt Disney'].flecha.x < 85,
    'flecha de Disney sobre su cabeza (silla que era de Schultz), no sobre Carlos');
  assert.equal(llevaFlecha('Walt Disney'), true);
  assert.equal(llevaHalo('Walt Disney'), true);
  assert.equal(L['Howard Schultz'].flecha, null, 'Schultz no está en la foto: sin flecha');
  assert.equal(L['Howard Schultz'].puntos.length, 0);
  const C = PAPEL_POS.coetaneos;
  assert.equal(Object.keys(C).length, 6);
  assert.ok(!C['Ruth Porat'] && !C['Carlos Ratti'], 'Porat y Ratti ya no tienen asiento (#7520)');
  assert.ok(!C['Gwynne Shotwell'], 'Shotwell sale; entra Murati');
  for (const k of ['Elon Musk', 'Jensen Huang', 'Mira Murati', 'Jony Ive', 'John Lasseter', 'Ryan Reynolds']) {
    assert.equal(C[k].sobre, 'placa', k);
    assert.ok(C[k].puntos.length >= 4, k);
    assert.ok(C[k].flecha && Number.isFinite(C[k].flecha.x), 'flecha de ' + k);
  }
  // Lasseter está en la silla que era de Ratti; su placa no es la antigua (~56, 60).
  assert.ok(C['John Lasseter'].y > 74 && C['John Lasseter'].x > 68);
  assert.ok(C['Jensen Huang'].y < 75 && C['Jensen Huang'].x < 40, 'Huang ocupa la placa que era de Mira, a su lado');
  assert.ok(C['Mira Murati'].x > 40 && C['Mira Murati'].x < 52 && C['Mira Murati'].y < 76, 'Mira tiene placa nueva delante, sin tapar las demás');
});


test('solo los consejeros activos llevan flecha y halo; Carlos nunca', () => {
  const L = PAPEL_POS.leyendas;
  // Jobs, Woz, Disney y Lucas llevan flecha. Buffett y Rams no están activados
  // (Carlos lo pidió antes; reaparecieron al abrir el ranking de 6). Carlos (Y-3) nunca.
  // Cook y Schultz no están en la foto.
  assert.deepEqual(
    Object.keys(L).filter((n) => llevaFlecha(n)),
    ['Steve Jobs', 'Steve Wozniak', 'Walt Disney', 'George Lucas'],
  );
  for (const n of ['Steve Jobs', 'Steve Wozniak', 'Walt Disney', 'George Lucas']) {
    assert.equal(esActivo(n), true, n);
    assert.equal(llevaFlecha(n), true, n);
    assert.equal(llevaHalo(n), true, n);
  }
  assert.equal(esActivo('Carlos Silva'), true);
  assert.equal(nuncaFlecha('Carlos Silva'), true);
  assert.equal(llevaFlecha('Carlos Silva'), false);
  for (const n of ['Warren Buffett', 'Dieter Rams', 'Howard Schultz', 'Tim Cook']) {
    assert.equal(esActivo(n), false, n);
    assert.equal(llevaFlecha(n), false, n);
    assert.equal(llevaHalo(n), false, n);
    if (n === 'Warren Buffett' || n === 'Dieter Rams') {
      assert.ok(L[n].flecha || (L[n].puntos && L[n].puntos.length >= 4), 'coords guardadas para reactivar ' + n);
    }
  }

  const C = PAPEL_POS.coetaneos;
  assert.deepEqual(
    Object.keys(C).filter((n) => llevaFlecha(n)),
    ['Elon Musk', 'Jensen Huang', 'Mira Murati', 'Jony Ive', 'John Lasseter', 'Ryan Reynolds'],
  );
  for (const n of Object.keys(C)) {
    assert.equal(esActivo(n), true, n);
    assert.equal(llevaFlecha(n), true, n);
    assert.equal(llevaHalo(n), true, n);
  }
});

test('flecha y papeles de un consejero leen el mismo mapa de estado', () => {
  const d = armarMesa({
    latidos: {
      Wozniak: { modo: 'trabajando', mision: 'flechas', encargo: 1, at: S - 10, hasta: S + 100 },
      Lucas: { modo: 'trabajando', mision: 'flechas', encargo: 2, at: S - 10, hasta: S + 100 },
      Jobs: { modo: 'reposo', at: S - 10 },
    },
    bandejas: {},
    ahoraMs: AHORA,
  });
  const mapa = mapaEstados(d.mesa);
  assert.equal(estadoDe('Steve Wozniak', mapa), 'trabajando');
  assert.equal(estadoDe('George Lucas', mapa), 'trabajando');
  assert.equal(estadoDe('Steve Jobs', mapa), 'libre');
  assert.equal(estadoDe('Mira Murati', mapa), 'desconocido');
  assert.equal(estadoDe('Steve Wozniak', mapa), estadoDe('steve wozniak', mapa));
  // Misma instantánea: el folio de Woz y su flecha no pueden divergir.
  assert.equal(estadoDe('Steve Wozniak', mapa), d.mesa.leyendas.find((s) => s.persona === 'Steve Wozniak').estado);
  assert.equal(clavePersona('Mira Murati'), 'miramurati');
});


test('el ranking de hoy es por mesa de 6: leyendas y coetáneos, no Cook ni Carlos', () => {
  assert.equal(CONSEJO_RANKING_TOTAL, 6);
  assert.deepEqual(CONSEJO_RANKING, [
    'Steve Jobs', 'Steve Wozniak', 'Warren Buffett', 'Walt Disney', 'Dieter Rams', 'George Lucas',
    'Elon Musk', 'Jensen Huang', 'Mira Murati', 'John Lasseter', 'Jony Ive', 'Ryan Reynolds',
  ]);
  for (const n of CONSEJO_RANKING) assert.equal(enRanking(n), true, n);
  for (const n of ['Carlos Silva', 'Tim Cook', 'Howard Schultz']) {
    assert.equal(enRanking(n), false, n);
  }
});

test('inicio del día es 00:00 Europe/Madrid (CET en noviembre, CEST en julio)', () => {
  const nov = Date.UTC(2026, 10, 11, 16, 50, 0);
  assert.equal(diaMadrid(nov), '2026-11-11');
  assert.equal(inicioDiaMadridS(nov), Date.UTC(2026, 10, 10, 23, 0, 0) / 1000); // 00:00 CET = 23:00 UTC
  const justAfter = Date.UTC(2026, 10, 10, 23, 0, 1);
  assert.equal(diaMadrid(justAfter), '2026-11-11');
  assert.equal(inicioDiaMadridS(justAfter), Date.UTC(2026, 10, 10, 23, 0, 0) / 1000);
  const justBefore = Date.UTC(2026, 10, 10, 22, 59, 59);
  assert.equal(diaMadrid(justBefore), '2026-11-10');
  const jul = Date.UTC(2026, 6, 15, 10, 0, 0);
  assert.equal(diaMadrid(jul), '2026-07-15');
  assert.equal(inicioDiaMadridS(jul), Date.UTC(2026, 6, 14, 22, 0, 0) / 1000); // 00:00 CEST = 22:00 UTC
});

test('hechosHoy cuenta done de hoy y ignora cancelled, pending y los de ayer', () => {
  const desde = inicioDiaMadridS(AHORA);
  const items = [
    { id: 1, status: 'done', done_at: desde + 3600 },
    { id: 2, status: 'done', done_at: desde + 7200 },
    { id: 3, status: 'cancelled', done_at: desde + 8000 },
    { id: 4, status: 'pending', ts: desde + 9000 },
    { id: 5, status: 'done', done_at: desde - 10 },
    { id: 6, status: 'done', done_at: S + 10 }, // futuro respecto a ahoraS: no cuenta
  ];
  const h = hechosHoy(items, { desdeS: desde, hastaS: S });
  assert.equal(h.n, 2);
  assert.equal(h.ultimo, desde + 7200);
  assert.deepEqual(hechosHoy(null, { desdeS: desde, hastaS: S }), { n: null, ultimo: 0 });
  assert.deepEqual(hechosHoy([], { desdeS: desde, hastaS: S }), { n: 0, ultimo: 0 });
});

test('puestosHoy: más dones es 1/6; empate se desempata por el último done; si empatan del todo, comparten', () => {
  const p = puestosHoy([
    { persona: 'Steve Jobs', n: 10, ultimo: 100 },
    { persona: 'Walt Disney', n: 8, ultimo: 90 },
    { persona: 'Elon Musk', n: 5, ultimo: 80 },
    { persona: 'Steve Wozniak', n: 0, ultimo: 0 },
    { persona: 'George Lucas', n: 0, ultimo: 0 },
    { persona: 'Jensen Huang', n: 0, ultimo: 0 },
  ]);
  assert.equal(p.get('Steve Jobs'), 1);
  assert.equal(p.get('Walt Disney'), 2);
  assert.equal(p.get('Elon Musk'), 3);
  assert.equal(p.get('Steve Wozniak'), 4);
  assert.equal(p.get('George Lucas'), 4);
  assert.equal(p.get('Jensen Huang'), 4);
  const empate = puestosHoy([
    { persona: 'A', n: 3, ultimo: 50 },
    { persona: 'B', n: 3, ultimo: 80 },
    { persona: 'C', n: 1, ultimo: 90 },
  ]);
  assert.equal(empate.get('B'), 1, 'mismo recuento, gana el done más reciente');
  assert.equal(empate.get('A'), 2);
  assert.equal(empate.get('C'), 3);
  assert.equal(etiquetaRanking(10, 1), '10');
  assert.equal(etiquetaRanking(0, 4), '0');
  assert.equal(etiquetaRanking(null, null), '—');
});

test('armarMesa recuenta por mesa de 6; la etiqueta es solo el número; PRs y Yokup entran en la unión', () => {
  const desde = inicioDiaMadridS(AHORA);
  const prs = [
    { repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 343, title: 'ranking flechas', merged_at: desde + 500, rama: 'woz/ranking-flechas' },
    { repo: 'csilvasantin/admira-next-web', number: 396, title: 'cámara Link 2', merged_at: desde + 510, rama: 'feat/ojos-link2-macstudio-20261111' },
    { repo: 'csilvasantin/admira-next-web', number: 401, title: 'sin marca', merged_at: desde + 520, rama: 'feat/otra-cosa' },
  ];
  const yokup = [
    { id: 'FLT-1', status: 'resolved', assignee: 'WozniakGrokBot', title: 'cierre', updated_at: (desde + 600) * 1000 },
    { id: 'FLT-102820', status: 'in_progress', assignee: 'WozniakGrokBot', title: 'no cuenta', updated_at: (desde + 700) * 1000 },
  ];
  const d = armarMesa({
    latidos: { Wozniak: { modo: 'trabajando', mision: 'ranking', at: S - 10, hasta: S + 100 } },
    bandejas: {
      Jobs: [
        { id: 10, status: 'done', text: 'a', done_at: desde + 100 },
        { id: 11, status: 'done', text: 'b', done_at: desde + 200 },
        { id: 12, status: 'cancelled', text: 'no', done_at: desde + 300 },
      ],
      Disney: [
        { id: 20, status: 'done', text: 'c', done_at: desde + 150 },
      ],
      Musk: [
        { id: 30, status: 'done', text: 'd', done_at: desde + 50 },
      ],
      Wozniak: [],
      Lucas: [],
      Huang: null,
      Ive: [{ id: 99, status: 'done', text: 'hoy de Ive', done_at: desde + 400 }],
      Lasseter: [],
    },
    prs,
    yokup,
    ahoraMs: AHORA,
  });
  assert.equal(d.ranking.total, 6);
  assert.equal(d.ranking.dia, '2026-11-11');
  const por = Object.fromEntries([...d.mesa.leyendas, ...d.mesa.coetaneos].map((s) => [s.persona, s]));
  assert.equal(por['Steve Wozniak'].hoy.n, 4, 'PR #343 + anw #396 expresa + Yokup resuelta + latido «ranking»; in_progress no cuenta');
  assert.equal(por['Steve Wozniak'].hoy.puesto, 1);
  assert.equal(por['Steve Wozniak'].hoy.etiqueta, '4');
  assert.deepEqual(por['Steve Wozniak'].hoy.por_fuente, { inbox: 0, yokup: 1, pr: 2, latido: 1 });
  assert.equal(por['Steve Jobs'].hoy.n, 2);
  assert.equal(por['Steve Jobs'].hoy.puesto, 2);
  assert.equal(por['Steve Jobs'].hoy.etiqueta, '2');
  assert.equal(por['Walt Disney'].hoy.n, 1);
  assert.equal(por['Walt Disney'].hoy.puesto, 3);
  assert.equal(por['Walt Disney'].hoy.etiqueta, '1');
  assert.equal(por['George Lucas'].hoy.n, 0);
  assert.equal(por['Warren Buffett'].hoy.n, 0);
  assert.equal(por['Dieter Rams'].hoy.n, 0);
  assert.equal(por['George Lucas'].hoy.puesto, 4);
  assert.equal(por['Warren Buffett'].hoy.puesto, 4);
  assert.equal(por['Elon Musk'].hoy.n, 1);
  assert.equal(por['Jony Ive'].hoy.n, 1);
  assert.equal(por['Jony Ive'].hoy.puesto, 1, 'mismo recuento que Musk, Ive cerró más tarde');
  assert.equal(por['Elon Musk'].hoy.puesto, 2);
  assert.equal(por['Elon Musk'].hoy.etiqueta, '1');
  assert.equal(por['Jensen Huang'].hoy.n, 0, 'bandeja falló, pero PRs/Yokup se leyeron: 0, no —');
  assert.equal(por['Jensen Huang'].hoy.etiqueta, '0');
  assert.equal(por['John Lasseter'].hoy.n, 0);
  assert.equal(por['Mira Murati'].hoy.n, 0);
  assert.equal(por['Ryan Reynolds'].hoy.n, 0);
  assert.equal(por['Tim Cook'].hoy.etiqueta, null, 'Cook no entra en el ranking de leyendas');
  const sinFuentes = armarMesa({
    latidos: {},
    bandejas: { Huang: null },
    prs: null,
    yokup: null,
    ahoraMs: AHORA,
  });
  const huang = sinFuentes.mesa.coetaneos.find((s) => s.persona === 'Jensen Huang');
  assert.equal(huang.hoy.n, null, 'si ninguna fuente se pudo leer, no se inventa el recuento');
  assert.equal(huang.hoy.etiqueta, '—');
  assert.equal(huang.hoy.puesto, null);
  const mapa = mapaEstados(d.mesa);
  assert.equal(estadoDe('Steve Wozniak', mapa), por['Steve Wozniak'].estado);
  assert.equal(por['Steve Wozniak'].estado, 'trabajando');
});
