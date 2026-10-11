import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENTS, BOT_URL, MISSION_URL, agentKey, madridDay, recentStartDay, humanTitle, machineName,
  normalizeTask, markDuplicates, missionScore, readTodayMissions, loadDashboard
} from './pendiente-lib.mjs';

const NOW = Date.parse('2026-10-11T15:03:00Z');
const TODAY = '2026-10-11';
const CREATED_TODAY = '2026-10-11T08:00:00Z';
const CREATED_YESTERDAY = '2026-10-10T08:00:00Z';
const STATUSES = ['open', 'in_progress', 'unconcluded', 'resolved', 'cancelled'];
const response = (body, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => body});
const receipt = (id, overrides = {}) => ({
  id, target_persona: 'Neo', target_machine: 'MacBook Pro 16',
  status: 'pending', ts: CREATED_TODAY, from_name: 'Carlos',
  text: `Preparar la revisión humana del encargo número ${id}`, ...overrides
});
const mission = (id, overrides = {}) => ({
  id, persona: 'Neo', machine: 'MacBook Pro 16', status: 'open',
  created_at: CREATED_TODAY, ...overrides
});

// Follow the actual public API contract: status is filtered on the server and
// the returned filters.status confirms it. Never depend on private endpoints.
function publicSources({missions = {}, inboxes = {}, presence = [], missionReply, inboxReply, presenceReply} = {}) {
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    calls.push({url, options});
    if (url.origin + url.pathname === MISSION_URL) {
      const status = url.searchParams.get('status');
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      assert.ok(STATUSES.includes(status), 'one of the five mission states must be requested explicitly');
      assert.equal(limit, 200);
      assert.ok(Number.isInteger(offset) && offset >= 0 && offset % limit === 0);
      if (missionReply) return missionReply({status, offset, limit, url});
      const rows = missions[status] || [];
      return response({ok: true, missions: rows.slice(offset, offset + limit), total: rows.length, filters: {status}});
    }
    if (url.origin + url.pathname === BOT_URL + '/api/presence') {
      return presenceReply ? presenceReply() : response({ok: true, presence});
    }
    assert.equal(url.origin + url.pathname, BOT_URL + '/api/public/inbox');
    const persona = url.searchParams.get('persona');
    if (inboxReply) return inboxReply({persona, url});
    return response({ok: true, items: inboxes[persona] || []});
  };
  return {fetchImpl, calls};
}

test('Madrid creation days honor winter, summer and both DST transitions', () => {
  for (const [instant, day] of [
    ['2026-01-10T22:59:59Z', '2026-01-10'],
    ['2026-01-10T23:00:00Z', '2026-01-11'],
    ['2026-07-10T21:59:59Z', '2026-07-10'],
    ['2026-07-10T22:00:00Z', '2026-07-11'],
    ['2026-03-28T22:59:59Z', '2026-03-28'],
    ['2026-03-28T23:00:00Z', '2026-03-29'],
    ['2026-03-29T21:59:59Z', '2026-03-29'],
    ['2026-03-29T22:00:00Z', '2026-03-30'],
    ['2026-10-24T21:59:59Z', '2026-10-24'],
    ['2026-10-24T22:00:00Z', '2026-10-25'],
    ['2026-10-25T22:59:59Z', '2026-10-25'],
    ['2026-10-25T23:00:00Z', '2026-10-26']
  ]) assert.equal(madridDay(Date.parse(instant)), day, instant);
});

test('recent means today and the preceding two Madrid calendar dates, including DST', () => {
  assert.equal(recentStartDay(NOW), '2026-10-09');
  assert.equal(recentStartDay(Date.parse('2026-03-30T00:15:00Z')), '2026-03-28');
  assert.equal(recentStartDay(Date.parse('2026-10-26T00:15:00Z')), '2026-10-24');
  assert.equal(recentStartDay(Date.parse('2026-01-01T00:15:00Z')), '2025-12-30');
});

test('score counts mission creation today, never update or resolution today', () => {
  const rows = [
    mission('today-open'),
    mission('today-progress', {status: 'in_progress', persona: 'TrinityMBP16'}),
    mission('today-unconcluded', {status: 'unconcluded', persona: 'Oráculo'}),
    mission('today-resolved', {status: 'resolved'}),
    mission('today-done-alias', {status: 'done', assignee: 'Trinity', persona: null}),
    mission('today-cancelled', {status: 'cancelled'}),
    mission('today-unknown-owner', {status: 'open', persona: 'Another agent'}),
    mission('old-resolved-today', {status: 'resolved', created_at: CREATED_YESTERDAY, resolved_at: CREATED_TODAY}),
    mission('old-updated-today', {created_at: CREATED_YESTERDAY, updated_at: CREATED_TODAY}),
    mission('no-creation', {created_at: null, updated_at: CREATED_TODAY})
  ];
  const score = missionScore(rows, TODAY);
  assert.deepEqual(score, {total: 7, done: 2, open: 4, cancelled: 1, percent: 29, partial: false});
  assert.equal(score.total, score.done + score.open + score.cancelled);
  assert.deepEqual(missionScore(rows, TODAY, 'neo'), {total: 3, done: 1, open: 1, cancelled: 1, percent: 33, partial: false});
  assert.deepEqual(missionScore(rows, TODAY, 'trinity'), {total: 2, done: 1, open: 1, cancelled: 0, percent: 50, partial: false});
  assert.equal(missionScore(rows, TODAY, 'oraculo').total, 1);
});

test('creation at Madrid midnight belongs to today, in seconds or milliseconds', () => {
  const start = Date.parse('2026-10-10T22:00:00Z');
  const rows = [mission('before', {created_at: start - 1}), mission('start-ms', {created_at: start}), mission('start-sec', {created_at: start / 1000})];
  assert.equal(missionScore(rows, TODAY).total, 2);
});

test('agent aliases retain known personas without inventing identities', () => {
  assert.equal(agentKey('TrinityMBP16'), 'trinity');
  assert.equal(agentKey('Agente Oráculo'), 'oraculo');
  assert.equal(agentKey('NeoMacMini'), 'neo');
  assert.equal(agentKey('InfraSubNeoMini'), 'neo');
  assert.equal(agentKey('SubTrinityMBP16'), 'trinity');
  assert.equal(agentKey('NiobeMBP14'), 'niobe');
  assert.equal(agentKey('Smithson'), null);
  assert.equal(agentKey('unknown'), null);
});

test('inbox ack is pending while real in_progress and blocked states survive', () => {
  assert.equal(normalizeTask(receipt(1, {status: 'ack'})).status, 'pending');
  assert.equal(normalizeTask(receipt(2, {status: 'in_progress'})).status, 'in_progress');
  const task = normalizeTask(receipt(3, {status: 'blocked', text: '[AUTO]  Revisar  la carga humana ', deadline: '2026-10-12T08:30:00Z'}));
  assert.equal(task.status, 'blocked');
  assert.equal(task.title, 'Revisar la carga humana');
  assert.equal(task.requester, 'Carlos');
  assert.equal(task.deadline, Date.parse('2026-10-12T08:30:00Z'));
  assert.equal(new URL(task.url).searchParams.get('persona'), 'Neo');
});

test('human titles strip routing prefixes while retaining a readable task description', () => {
  assert.equal(humanTitle('[AUTO] [Carlos] Revisar los contadores del cuadrante'), 'Revisar los contadores del cuadrante');
  assert.equal(humanTitle('RE-TARGET MBP16 (solicitud de Carlos). Sustituye a #5711. desk:aabbcc Revisar los contadores del cuadrante'), 'Revisar los contadores del cuadrante');
  assert.equal(humanTitle(''), 'Encargo sin descripción publicada');
});

test('machine warning requires a published machine distinct from MBP16', () => {
  assert.equal(normalizeTask(receipt(1, {target_machine: 'MBP16'})).remote, false);
  assert.equal(normalizeTask(receipt(2, {target_machine: 'MacBookPro16'})).remote, false);
  assert.equal(normalizeTask(receipt(3, {target_machine: 'macbookpronegro14'})).remote, true);
  assert.equal(normalizeTask(receipt(4, {target_machine: 'GrokBot'})).remote, true);
  assert.equal(machineName('GrokBotBox'), 'GrokBotBox');
  assert.equal(normalizeTask(receipt(5, {target_machine: null})).remote, false);
  assert.equal(normalizeTask(receipt(5, {target_machine: null})).machine, 'Sin máquina publicada');
});

test('possible repeats require long equivalent public text and preserve meaningful differences', () => {
  const title = 'Revisar el cuadrante de carga y comprobar los contadores de misiones #5754';
  const tasks = [
    normalizeTask(receipt(1, {text: title})),
    normalizeTask(receipt(2, {text: title.replace('#5754', '#5755')})),
    normalizeTask(receipt(3, {text: title + ' mañana'})),
    normalizeTask(receipt(4, {text: title + ' MacBook Pro 14'})),
    normalizeTask(receipt(5, {text: title + ' MacBook Pro 16'})),
    normalizeTask(receipt(6, {text: 'Revisar carga'})),
    normalizeTask(receipt(7, {text: 'Revisar carga'}))
  ];
  markDuplicates(tasks);
  assert.deepEqual(tasks[0].duplicateIds, [2]);
  assert.deepEqual(tasks[1].duplicateIds, [1]);
  for (const task of tasks.slice(2)) assert.deepEqual(task.duplicateIds, []);
});

test('explicit alarm references mark both open receipts as possible repeats', () => {
  const original = normalizeTask(receipt(5754, {text: 'Crear el cuadrante de carga'}));
  const reminder = normalizeTask(receipt(5755, {text: '[ALARMA origen #5754] Avanzar con el cuadrante'}));
  const reminder2 = normalizeTask(receipt(5756, {text: '[ALARMA: sigue con #5754] Revisar el resultado'}));
  const absent = normalizeTask(receipt(5757, {text: '[ALARMA avanzar en #1111] Continuar otra revisión'}));
  assert.equal(reminder.repeatOf, 5754);
  markDuplicates([original, reminder, reminder2, absent]);
  assert.deepEqual(original.duplicateIds, [5755, 5756]);
  assert.deepEqual(reminder.duplicateIds, [5754]);
  assert.deepEqual(reminder2.duplicateIds, [5754]);
  assert.deepEqual(absent.duplicateIds, []);
});

test('dashboard distinguishes open inbox load, daily missions and three calendar days', async () => {
  const fixture = publicSources({
    missions: {
      open: [mission('m1')],
      resolved: [mission('m2', {persona: 'Trinity', status: 'resolved'})],
      cancelled: [mission('m3', {persona: 'Neo', status: 'cancelled'})]
    },
    inboxes: {
      Neo: [
        receipt(10, {status: 'ack', ts: '2026-10-08T22:00:00Z'}),
        receipt(11, {status: 'in_progress'}),
        receipt(12, {status: 'blocked', target_machine: 'MBP14'}),
        receipt(13, {ts: '2026-10-08T21:59:59Z'}),
        receipt(14, {status: 'done'}),
        receipt(15, {status: 'cancelled'}),
        receipt(16, {target_persona: 'Trinity'})
      ],
      Cypher: [receipt(17, {target_persona: 'Cypher', status: 'in_progress'})],
      Niobe: [receipt(18, {target_persona: 'Niobe', status: 'done'})]
    }
  });
  const data = await loadDashboard({fetchImpl: fixture.fetchImpl, now: NOW});
  assert.equal(data.day, TODAY);
  assert.deepEqual(data.score, {total: 3, done: 1, open: 1, cancelled: 1, percent: 33, partial: false});
  const neo = data.agents.find(agent => agent.key === 'neo');
  assert.deepEqual(neo.counts, {in_progress: 1, pending: 2, blocked: 1, total: 4});
  assert.deepEqual(neo.recent.map(task => task.id), [12, 11, 10]);
  assert.deepEqual(neo.old.map(task => task.id), [13]);
  assert.deepEqual(neo.score, {total: 2, done: 0, open: 1, cancelled: 1, percent: 0, partial: false});
  assert.equal(data.agents.find(agent => agent.key === 'trinity').score.done, 1);
  assert.equal(data.remoteCount, 1);
  assert.deepEqual(data.agents.map(agent => agent.key), ['neo', 'trinity', 'oraculo', 'morfeo', 'smith', 'cypher']);
  assert.equal(data.agents.find(agent => agent.key === 'smith').engine, 'Grok (asignado)');
  assert.equal(data.agents.find(agent => agent.key === 'trinity').engine, 'Codex (asignado)');
  assert.equal(data.warnings.length, 0);
  assert.equal(fixture.calls.filter(call => call.url.pathname === '/api/public/inbox').length, AGENTS.length);
  for (const call of fixture.calls) assert.equal(call.options.cache, 'no-store');
});

test('fresh declared runtime and machine are displayed; stale presence cannot invent a current engine', async () => {
  const fixture = publicSources({presence: [
    {persona: 'TrinityMBP16', machine: 'MBP16', runtime: 'Codex', updated: (NOW - 60_000) / 1000},
    {persona: 'NeoMini', machine: 'MacMini', runtime: 'Claude', updated: NOW - 60_000},
    {persona: 'NeoMBP16', machine: 'MBP16', runtime: 'Codex', updated: NOW - 2 * 60_000},
    {persona: 'Smith', machine: 'GrokBotBox', runtime: 'Claude', updated: NOW - 16 * 60_000}
  ]});
  const data = await loadDashboard({fetchImpl: fixture.fetchImpl, now: NOW});
  assert.equal(data.agents.find(agent => agent.key === 'trinity').engine, 'Codex');
  assert.equal(data.agents.find(agent => agent.key === 'neo').engine, 'Claude · Codex');
  assert.deepEqual(data.agents.find(agent => agent.key === 'neo').machines, ['Mac Mini', 'MacBook Pro 16']);
  assert.equal(data.agents.find(agent => agent.key === 'smith').engine, 'Grok (asignado)');
  assert.deepEqual(data.agents.find(agent => agent.key === 'smith').machines, ['Sin máquina publicada']);
});

test('presence failure preserves inbox and mission information with an explicitly assigned engine', async () => {
  const fixture = publicSources({presenceReply: () => { throw new Error('offline'); }, inboxes: {Neo: [receipt(1)]}});
  const data = await loadDashboard({fetchImpl: fixture.fetchImpl, now: NOW});
  assert.equal(data.agents.find(agent => agent.key === 'neo').counts.total, 1);
  assert.equal(data.agents.find(agent => agent.key === 'neo').engine, 'Claude (asignado)');
  assert.equal(data.score.total, 0);
  assert.deepEqual(data.warnings, []);
});

test('all five mission states paginate independently and stop at yesterday only within that state', async () => {
  const openFirst = Array.from({length: 200}, (_, index) => mission(`open-${index}`));
  const resolvedFirst = Array.from({length: 200}, (_, index) => mission(`resolved-${index}`, {status: 'resolved'}));
  const fixture = publicSources({missionReply: ({status, offset}) => {
    let rows = [];
    if (status === 'open') rows = offset === 0 ? openFirst : [mission('open-last'), mission('open-yesterday', {created_at: CREATED_YESTERDAY})];
    if (status === 'resolved') rows = offset === 0 ? resolvedFirst : [mission('resolved-last', {status: 'resolved'}), mission('resolved-yesterday', {status: 'resolved', created_at: CREATED_YESTERDAY})];
    if (status === 'in_progress') rows = [mission('progress-yesterday', {status: 'in_progress', created_at: CREATED_YESTERDAY})];
    if (status === 'cancelled') rows = [mission('cancelled-last', {status: 'cancelled'})];
    return response({ok: true, missions: rows, total: 9999, filters: {status}});
  }});
  const data = await readTodayMissions(fixture.fetchImpl, NOW);
  assert.equal(data.partial, false);
  assert.equal(data.missions.length, 403);
  assert.equal(data.missions.filter(row => row.status === 'resolved').length, 201);
  assert.equal(data.missions.some(row => row.id.endsWith('yesterday')), false);
  const calls = fixture.calls.map(call => [call.url.searchParams.get('status'), Number(call.url.searchParams.get('offset'))]);
  for (const status of STATUSES) assert.ok(calls.some(([requested, offset]) => requested === status && offset === 0));
  assert.ok(calls.some(([status, offset]) => status === 'open' && offset === 200));
  assert.ok(calls.some(([status, offset]) => status === 'resolved' && offset === 200));
  assert.equal(calls.length, 7);
});

test('pagination continues on full today pages and deduplicates missions by id', async () => {
  const first = Array.from({length: 200}, (_, index) => mission(`m-${index}`));
  const fixture = publicSources({missionReply: ({status, offset}) => response({
    ok: true, filters: {status},
    missions: status === 'open' ? (offset === 0 ? first : [first[0], mission('last')]) : []
  })});
  const data = await readTodayMissions(fixture.fetchImpl, NOW);
  assert.equal(data.missions.length, 201);
  assert.equal(data.partial, false);
});

test('unconfirmed or mixed-status API responses cannot silently become a complete scoreboard', async () => {
  const fixture = publicSources({missionReply: ({status}) => response({
    ok: true, filters: {status: status === 'open' ? 'all' : status},
    missions: status === 'open' ? [mission('hidden-today'), mission('mixed-old', {status: 'resolved', created_at: CREATED_YESTERDAY})] : []
  })});
  const data = await loadDashboard({fetchImpl: fixture.fetchImpl, now: NOW});
  assert.equal(data.score.partial, true);
  assert.equal(data.score.total, 0);
  assert.match(data.warnings.join(' '), /parcial.*1 de 5/);
});

test('a confirmed filter with rows from another state is rejected before using its chronological cutoff', async () => {
  const fixture = publicSources({missionReply: ({status}) => response({
    ok: true, filters: {status},
    missions: status === 'open' ? [
      mission('today-open'),
      mission('old-resolved-mixed-into-open', {status: 'resolved', created_at: CREATED_YESTERDAY})
    ] : []
  })});
  const data = await readTodayMissions(fixture.fetchImpl, NOW);
  assert.equal(data.partial, true, 'a mixed page must not claim the state was loaded completely');
  assert.equal(data.failed, 1);
  assert.equal(data.unavailable, false);
});

test('a failed mission state leaves other states visible and marks all scores partial', async () => {
  const fixture = publicSources({missionReply: ({status}) => {
    if (status === 'cancelled') return response({error: 'unavailable'}, 503);
    return response({ok: true, filters: {status}, missions: status === 'resolved' ? [mission('complete', {persona: 'Trinity', status})] : []});
  }});
  const data = await loadDashboard({fetchImpl: fixture.fetchImpl, now: NOW});
  assert.equal(data.score.total, 1);
  assert.equal(data.score.done, 1);
  assert.equal(data.score.partial, true);
  for (const agent of data.agents) assert.equal(agent.score.partial, true);
  assert.match(data.warnings.join(' '), /parcial.*1 de 5/);
});

test('an unavailable mission source shows unknown values, not false zero work', async () => {
  const fixture = publicSources({missionReply: () => { throw new Error('offline'); }});
  const data = await loadDashboard({fetchImpl: fixture.fetchImpl, now: NOW});
  assert.deepEqual(data.score, {total: null, done: null, open: null, cancelled: null, percent: null, partial: true});
  for (const agent of data.agents) assert.equal(agent.score.total, null);
  assert.match(data.warnings.join(' '), /sin datos.*5 de 5/);
});

test('failed inbox counters are unknown and optional unavailable agents remain visible', async () => {
  const fixture = publicSources({inboxReply: ({persona}) => {
    if (persona === 'Neo') return response({ok: false});
    if (persona === 'Niobe') return response({ok: true, items: {}});
    return response({ok: true, items: []});
  }});
  const data = await loadDashboard({fetchImpl: fixture.fetchImpl, now: NOW});
  for (const key of ['neo', 'niobe']) {
    const agent = data.agents.find(row => row.key === key);
    assert.ok(agent);
    assert.deepEqual(agent.counts, {in_progress: null, pending: null, blocked: null, total: null});
    assert.equal(agent.partial, true);
    assert.ok(agent.error);
  }
  assert.equal(data.score.total, 0, 'a valid empty missions response is independently known');
  assert.match(data.warnings.join(' '), /Neo: bandeja sin datos/);
  assert.match(data.warnings.join(' '), /Niobe: bandeja sin datos/);
});

test('80 public receipts mark load partial even when some receipts are already closed', async () => {
  const rows = Array.from({length: 80}, (_, index) => receipt(index + 1, {status: index === 0 ? 'pending' : 'done'}));
  const fixture = publicSources({inboxes: {Neo: rows, Trinity: rows.slice(0, 79).map(row => ({...row, target_persona: 'Trinity'}))}});
  const data = await loadDashboard({fetchImpl: fixture.fetchImpl, now: NOW});
  const neo = data.agents.find(agent => agent.key === 'neo');
  assert.equal(neo.partial, true);
  assert.equal(neo.counts.total, 1);
  assert.equal(data.agents.find(agent => agent.key === 'trinity').partial, false);
  assert.match(data.warnings.join(' '), /Neo.*80 encargos.*incompletos/);
});

test('a pagination cap cannot turn an incomplete mission state into a complete count', async () => {
  const fixture = publicSources({missionReply: ({status, offset}) => response({
    ok: true, filters: {status},
    missions: status === 'open' ? Array.from({length: 200}, (_, index) => mission(`page-${offset + index}`)) : []
  })});
  const data = await readTodayMissions(fixture.fetchImpl, NOW);
  assert.equal(data.partial, true);
  assert.equal(data.failed, 1);
  assert.equal(data.unavailable, false);
  assert.equal(fixture.calls.filter(call => call.url.searchParams.get('status') === 'open').length, 25);
});
