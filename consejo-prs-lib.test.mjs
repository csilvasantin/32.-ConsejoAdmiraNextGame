import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cabecerasGithub, tokenGithub, snapshotUsable, parsearSnapshot, snapshotPrs,
  snapshotDelJob, fusionarSnapshots, obtenerPrs, recogerPrsGithub,
  GH_UA, GH_ACCEPT, CACHE_PRS_S, KEY_PRS, normalizarPr,
} from './consejo-prs-lib.mjs';
import { urlsYokupPorAgente, misionYokupDePersona, personaYokupEs, atribuirPr } from './consejo-misiones-hoy.mjs';

test('cabeceras GitHub: User-Agent y Accept fijos; token opcional', () => {
  const sin = cabecerasGithub();
  assert.equal(sin['User-Agent'], GH_UA);
  assert.equal(sin['User-Agent'], 'admira-live-consejo');
  assert.equal(sin.Accept, GH_ACCEPT);
  assert.equal(sin.Accept, 'application/vnd.github+json');
  assert.equal(sin.Authorization, undefined);
  const con = cabecerasGithub(' ghp_x ');
  assert.equal(con.Authorization, 'Bearer ghp_x');
  assert.equal(tokenGithub({}), null);
  assert.equal(tokenGithub({ GITHUB_TOKEN: 'abc' }), 'abc');
  assert.equal(tokenGithub({ GH_TOKEN: 'z' }), 'z');
});

test('snapshot usable / inválido / caducado; el job no escribe un vacío de un fallo', () => {
  const ahora = 1_000_000;
  const snap = snapshotPrs({
    prs: [{ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 348, title: 'globo', merged_at: '2026-11-11T20:52:23Z', rama: 'woz/carlos-globo-jobs' }],
    fuente: 'github-api',
    ahoraMs: ahora,
    repos_ok: { 'csilvasantin/32.-ConsejoAdmiraNextGame': true },
  });
  assert.equal(snapshotUsable(snap, { ahoraMs: ahora + 60_000, maxEdadS: CACHE_PRS_S }), true);
  assert.equal(snapshotUsable(snap, { ahoraMs: ahora + (CACHE_PRS_S + 1) * 1000, maxEdadS: CACHE_PRS_S }), false);
  assert.equal(parsearSnapshot('no-json'), null);
  assert.equal(parsearSnapshot({ prs: 'x' }), null);
  assert.equal(snapshotDelJob({ prs: [] }, ahora).ok, false);
  assert.equal(snapshotDelJob({ prs: [], repos_ok: { a: true, b: true } }, ahora).ok, true, 'cero real si ambos repos ok');
  assert.equal(snapshotDelJob({ prs: [] , repos_ok: { a: true, b: false } }, ahora).ok, false);
  const ok = snapshotDelJob(snap, ahora);
  assert.equal(ok.ok, true);
  assert.equal(ok.snap.fuente, 'box-job');
  assert.equal(ok.snap.prs[0].rama, 'woz/carlos-globo-jobs');
});

test('si un repo falla se conservan los PRs de ese repo que ya había en KV, sin inventar', () => {
  const vivo = snapshotPrs({
    prs: [{ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 348, merged_at: '2026-11-11T20:52:23Z', rama: 'woz/x', title: 'a' }],
    fuente: 'github-api',
    ahoraMs: 10,
    repos_ok: { 'csilvasantin/32.-ConsejoAdmiraNextGame': true, 'csilvasantin/admira-next-web': false },
  });
  const reserva = snapshotPrs({
    prs: [
      { repo: 'csilvasantin/admira-next-web', number: 396, merged_at: '2026-11-11T16:49:18Z', rama: 'feat/ojos', title: 'cam' },
      { repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 1, merged_at: '2026-11-11T10:00:00Z', rama: 'woz/viejo', title: 'no' },
    ],
    fuente: 'box-job',
    ahoraMs: 1,
  });
  const m = fusionarSnapshots(vivo, reserva, ['csilvasantin/admira-next-web']);
  const nums = m.prs.map((p) => p.repo.split('/')[1] + '#' + p.number).sort();
  assert.deepEqual(nums, ['32.-ConsejoAdmiraNextGame#348', 'admira-next-web#396']);
});

test('obtenerPrs: usa KV fresco, si no llama a GitHub con las cabeceras, y cae al KV si GitHub falla', async () => {
  const ahora = 5_000_000;
  const pr = { repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 345, title: 'r', merged_at: '2026-11-11T20:35:30Z', rama: 'woz/ranking-v2-mac' };
  const store = {
    data: { [KEY_PRS]: JSON.stringify(snapshotPrs({ prs: [pr], fuente: 'box-job', ahoraMs: ahora - 30_000, repos_ok: { x: true } })) },
    async get(k) { return this.data[k] || null; },
    async put(k, v) { this.data[k] = v; },
  };
  const visto = [];
  const fetchImpl = async (url, opts) => {
    visto.push({ url, headers: opts.headers });
    return new Response('no', { status: 403 });
  };
  const cache = await obtenerPrs({ fetchImpl, kv: store, ahoraMs: ahora });
  assert.equal(cache.cache, true);
  assert.equal(cache.prs[0].number, 345);
  assert.equal(visto.length, 0, 'KV fresco: no se llama a GitHub');

  store.data[KEY_PRS] = JSON.stringify(snapshotPrs({ prs: [pr], fuente: 'box-job', ahoraMs: ahora - (CACHE_PRS_S + 60) * 1000, repos_ok: { x: true } }));
  const fallido = await obtenerPrs({ fetchImpl, kv: store, ahoraMs: ahora });
  assert.ok(visto.length >= 2, 'caducado: se llama a los dos repos');
  assert.equal(visto[0].headers['User-Agent'], 'admira-live-consejo');
  assert.equal(visto[0].headers.Accept, 'application/vnd.github+json');
  assert.equal(fallido.cache, true);
  assert.match(fallido.fuente, /kv-stale/);
  assert.equal(fallido.prs[0].number, 345);

  const fetchOk = async (url, opts) => {
    visto.push({ url, headers: opts.headers });
    const repo = url.includes('admira-next-web') ? 'csilvasantin/admira-next-web' : 'csilvasantin/32.-ConsejoAdmiraNextGame';
    const n = repo.includes('next-web') ? 396 : 348;
    const rama = n === 396 ? 'feat/ojos-link2-macstudio-20261111' : 'woz/carlos-globo-jobs';
    return new Response(JSON.stringify([{ number: n, title: 'ok', merged_at: '2026-11-11T20:00:00Z', head: { ref: rama } }]), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  delete store.data[KEY_PRS];
  const vivo = await obtenerPrs({ fetchImpl: fetchOk, kv: store, ahoraMs: ahora });
  assert.equal(vivo.cache, false);
  assert.equal(vivo.prs.length, 2);
  assert.equal(vivo.fuente, 'github-api');
});

test('recogerPrsGithub no inventa si ambos repos fallan; un repo solo no anula el otro', async () => {
  const f = async (url) => new Response('no', { status: url.includes('next-web') ? 404 : 403 });
  const r = await recogerPrsGithub({ fetchImpl: f });
  assert.equal(r.prs, null);
  const mixto = async (url) => {
    if (url.includes('next-web')) return new Response('no', { status: 404 });
    return new Response(JSON.stringify([{ number: 348, title: 'g', merged_at: '2026-11-11T20:52:23Z', head: { ref: 'woz/x' } }]), { status: 200 });
  };
  const m = await recogerPrsGithub({ fetchImpl: mixto });
  assert.equal(m.prs.length, 1);
  assert.equal(m.prs[0].number, 348);
  assert.equal(m.repos_ok['csilvasantin/admira-next-web'], false);
});

test('Yokup: ?agent= por consejero; WozniakGrokBot y agent_key cuentan; in_progress no', () => {
  const urls = urlsYokupPorAgente();
  assert.ok(urls.find((u) => u.bot === 'Wozniak' && u.url.includes('agent=woz')));
  assert.ok(urls.every((u) => u.url.includes('status=resolved')));
  assert.equal(personaYokupEs('Steve Wozniak', 'Wozniak', 'WozniakGrokBot'), true);
  assert.equal(misionYokupDePersona({ persona: 'TrinityMBP14', duplicate: { agent_key: 'wozniak' } }, { persona: 'Steve Wozniak', bot: 'Wozniak' }), true);
  assert.equal(misionYokupDePersona({ assignee: 'JobsGrokBot' }, { persona: 'Steve Wozniak', bot: 'Wozniak' }), false);
});

test('atribución: woz/* y la lista expresa de Carlos; feat/fix sin marca no se inventa', () => {
  assert.equal(atribuirPr({ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 348, rama: 'woz/carlos-globo-jobs' }).bot, 'Wozniak');
  assert.equal(atribuirPr({ repo: 'csilvasantin/admira-next-web', number: 396, rama: 'feat/ojos-link2-macstudio-20261111' }).bot, 'Wozniak');
  assert.equal(atribuirPr({ repo: 'csilvasantin/admira-next-web', number: 398, rama: 'feat/ojos-studio-cam1-cam2-20261111' }).bot, 'Wozniak');
  assert.equal(atribuirPr({ repo: 'csilvasantin/32.-ConsejoAdmiraNextGame', number: 347, rama: 'fix/disney-hover-recorte-20261111' }).bot, null);
  assert.equal(normalizarPr({ number: 1, title: 'x', head: { ref: 'woz/a' } }, 'csilvasantin/32.-ConsejoAdmiraNextGame'), null, 'sin merged_at no cuenta');
});
