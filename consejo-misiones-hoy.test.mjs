import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atribuirPr, unirMisionesHoy, etiquetaHoy, grupoDe, RANKING_GRUPOS, seg, misionesPrHoy,
} from './consejo-misiones-hoy.mjs';

test('atribuirPr: prefijo de rama, lista expresa de Carlos, y sin marca no se inventa', () => {
  assert.equal(atribuirPr({ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 343, rama: 'woz/ranking-flechas' }).bot, 'Wozniak');
  assert.equal(atribuirPr({ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 339, rama: 'woz/hablar' }).regla.startsWith('rama:'), true);
  assert.equal(atribuirPr({ repo: 'csilvasantin/admira-next-web', number: 396, rama: 'feat/ojos-link2-macstudio-20261111' }).bot, 'Wozniak');
  assert.equal(atribuirPr({ repo: 'csilvasantin/admira-next-web', number: 398, rama: 'feat/ojos-studio-cam1-cam2-20261111' }).regla, 'carlos-t1212u');
  assert.equal(atribuirPr({ repo: 'csilvasantin/admira-next-web', number: 401, rama: 'feat/otra' }).bot, null);
  assert.equal(atribuirPr({ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 342, rama: 'fix/leyendas-disney-schultz' }).bot, null);
  assert.equal(atribuirPr({ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 332, rama: 'jobs/lo-que-sea' }).bot, 'Jobs');
});

test('unirMisionesHoy no duplica y no cuenta in_progress; n es null solo si no hay fuentes', () => {
  const desde = 1000, hasta = 2000;
  const u = unirMisionesHoy({
    persona: 'Steve Wozniak', bot: 'Wozniak',
    inbox: [{ id: 343, status: 'done', text: 'ConsejoAdmiraNextGame #343 ranking', done_at: 1100 }],
    prs: [{ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 343, title: 'ranking', merged_at: 1100, rama: 'woz/ranking' }],
    yokup: [
      { id: 'FLT-1', status: 'resolved', assignee: 'Wozniak', title: 'cierre', updated_at: 1200 },
      { id: 'FLT-102820', status: 'in_progress', assignee: 'WozniakGrokBot', title: 'abierta', updated_at: 1300 },
    ],
    desdeS: desde, hastaS: hasta,
  });
  assert.equal(u.n, 2, 'PR e inbox del mismo #343 se deduplican; Yokup resuelta suma; in_progress no');
  assert.equal(u.por_fuente.pr, 1);
  assert.equal(u.por_fuente.inbox, 0);
  assert.equal(u.por_fuente.yokup, 1);
  assert.equal(unirMisionesHoy({ persona: 'X', bot: 'X', inbox: null, prs: null, yokup: null, desdeS: desde, hastaS: hasta }).n, null);
  assert.equal(unirMisionesHoy({ persona: 'X', bot: 'X', inbox: [], prs: null, yokup: null, desdeS: desde, hastaS: hasta }).n, 0);
  assert.equal(etiquetaHoy(0), '0');
  assert.equal(etiquetaHoy(null), '—');
});

test('grupos de ranking: 6 leyendas y 6 coetáneos', () => {
  assert.equal(RANKING_GRUPOS.leyendas.length, 6);
  assert.equal(RANKING_GRUPOS.coetaneos.length, 6);
  assert.equal(grupoDe('Steve Wozniak'), 'leyendas');
  assert.equal(grupoDe('Mira Murati'), 'coetaneos');
  assert.equal(grupoDe('Tim Cook'), null);
  assert.equal(grupoDe('Carlos Silva'), null);
});

test('seg entiende epoch s/ms y merged_at ISO de GitHub', () => {
  assert.equal(seg('2026-11-11T20:52:23Z'), Date.parse('2026-11-11T20:52:23Z') / 1000);
  assert.equal(seg(1794431020), 1794431020);
  assert.equal(seg(1794431020000), 1794431020);
  const desde = Date.parse('2026-11-10T23:00:00Z') / 1000;
  const hasta = Date.parse('2026-11-11T22:59:59Z') / 1000;
  const u = misionesPrHoy([
    { repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 348, title: 'globo', merged_at: '2026-11-11T20:52:23Z', rama: 'woz/carlos-globo-jobs' },
    { repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 300, title: 'ayer', merged_at: '2026-11-10T10:00:00Z', rama: 'woz/ayer' },
  ], { bot: 'Wozniak', desdeS: desde, hastaS: hasta });
  assert.equal(u.ok, true);
  assert.equal(u.lista.length, 1);
  assert.equal(u.lista[0].numero, 348);
});
