import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atribuirPr, unirMisionesHoy, etiquetaHoy, grupoDe, RANKING_GRUPOS,
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
