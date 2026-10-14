import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
await import('./mobile-players.js');
const {isMobile, observe, channelUrl, cardHtml} = globalThis.AdmiraMobilePlayers;
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const fleet = JSON.parse(read('../fleet-control/fleet.json')).machines;
const mobiles = fleet.filter(isMobile);
const now = 1791968241867;

test('ids comprobados y perfiles IoT iguales en las tres copias, sin acceso ni lote DS', () => {
  assert.deepEqual(mobiles.map(m => m.signage.screen), ['iphone17-mupi', 'samsung-galaxy-fold-8-mupi']);
  let expected;
  for (const path of ['../data/machines.json', '../docs/machines.json', '../machines.json']) {
    const profiles = JSON.parse(read(path)).machines.filter(m => mobiles.some(x => 'admira-' + x.id === m.id));
    assert.equal(profiles.length, 2);
    if (expected) assert.deepEqual(profiles, expected);
    expected = profiles;
    for (const p of profiles) {
      assert.equal(p.unitType, 'iot'); assert.equal(p.role, 'Player DS · móvil');
      assert.ok(p.location); assert.ok(p.note); assert.equal(p.status, 'unknown');
      assert.equal(p.ssh, undefined);
    }
  }
  for (const m of mobiles) {
    assert.equal(m.emoji, '📱'); assert.equal(m.signageBatch, false);
    assert.deepEqual(Object.keys(m.signage).sort(), ['screen', 'url']);
    assert.equal(m.signage.url, 'https://www.admira.tv/canal');
    assert.equal(m.host, undefined); assert.equal(m.user, undefined); assert.equal(m.ssh, undefined);
  }
});

test('online procede exclusivamente de un latido fresco para el screen exacto', () => {
  const iphone = {...mobiles[0], online: false, sshOnline: false};
  const screen = {screen: 'iphone17-mupi', online: false, last_seen: now - 33000, age_seconds: 33};
  assert.equal(observe(iphone, [screen], {now}).online, true);
  assert.equal(observe(iphone, [{...screen, age_seconds: 301}], {now}).online, false);
  assert.equal(observe(iphone, [{...screen, last_seen: now - 301000}], {now}).online, false);
  assert.equal(observe(iphone, [{...screen, age_seconds: 300, last_seen: now - 300000}], {now}).online, true);
});

test('presencia, perfil, relay y online de la API no rescatan un latido ausente o viejo', () => {
  const m = {...mobiles[1], online: true, sshOnline: true, viaAgent: true, viaGracia: true, status: 'online'};
  assert.equal(observe(m, [], {now}).online, false);
  assert.equal(observe(m, [{screen: 'dgx-spark', loc: m.signage.screen, last_seen: now}], {now}).online, false);
  for (const s of [
    {online: true}, {age_seconds: null, last_seen: null}, {age_seconds: -1},
    {age_seconds: '0', last_seen: '0'}, {last_seen: now + 3600000},
    {online: true, age_seconds: 301}
  ]) assert.equal(observe(m, [{screen: m.signage.screen, ...s}], {now}).online, false);
});

test('admite last_seen en segundos o ms y age_seconds sin timestamp', () => {
  const m = mobiles[0], screen = m.signage.screen;
  assert.equal(observe(m, [{screen, last_seen: (now - 20000) / 1000}], {now}).ageSeconds, 20);
  assert.equal(observe(m, [{screen, last_seen: now - 20000}], {now}).ageSeconds, 20);
  assert.equal(observe(m, [{screen, age_seconds: 20}], {now}).ageSeconds, 20);
  const failed = observe(m, [{screen, last_seen: now}], {now, available: false});
  assert.equal(failed.online, false); assert.equal(failed.ageSeconds, null);
  assert.match(cardHtml(failed), /consulta de latidos no disponible/);
});

test('tarjeta móvil sólo ofrece enlace al canal y declara la limitación del Fold', () => {
  for (const m of mobiles) {
    const html = cardHtml(observe(m, [], {now}));
    assert.equal(channelUrl(m), 'https://www.admira.tv/canal?screen=' + m.signage.screen);
    assert.match(html, /⏻ abrir canal/); assert.match(html, /target="_blank" rel="noopener"/);
    assert.doesNotMatch(html, /data-a=|data-rc=|data-term=|data-fix=|ssh|hack|arrancar DS|apagar equipo/i);
    assert.match(html, /Abre el canal en este navegador/);
  }
  assert.match(cardHtml(observe(mobiles[1], [], {now})), /aún no envía latidos/);
  assert.match(cardHtml(observe(mobiles[1], [], {now})), /no que el móvil esté apagado/);
  const hostile = {...mobiles[0], name: '<img src=x onerror=alert(1)>', signage: {...mobiles[0].signage, screen: 'a&b'}};
  assert.match(channelUrl(hostile), /screen=a%26b$/);
  assert.doesNotMatch(cardHtml(hostile), /<img/);
});

test('relay no sondea ni ejecuta comandos móviles, conserva las máquinas existentes', async () => {
  const source = read('../fleet-control/server.js');
  const lookup = source.slice(source.indexOf('function isMobilePlayer('), source.indexOf('function machineKey('));
  const run = source.slice(source.indexOf('function run(machine,'), source.indexOf('/* ----- acciones predefinidas'));
  const calls = [];
  const backend = new Function('FLEET', 'spawn', lookup + run + '\nreturn {machineById, run};')({machines: fleet}, (...args) => {calls.push(args); throw Error('no debe ejecutar');});
  for (const m of mobiles) {
    assert.equal(backend.machineById(m.id), undefined);
    assert.equal((await backend.run(m, 'uptime')).rc, 1);
  }
  assert.equal(calls.length, 0);
  assert.equal(backend.machineById('macmini').id, 'macmini');
  assert.match(source, /FLEET\.machines\.filter\(m => !isMobilePlayer\(m\)\)\.map/);
  assert.match(source, /const targets = FLEET\.machines\.filter\(m => !isMobilePlayer\(m\)/);
});

test('móviles se renderizan aparte del conjunto de órdenes, capturas y HACKEO', () => {
  const html = read('./index.html');
  assert.match(html, /MACHINES=d\.machines\.filter\(m=>!isMobilePlayer\(m\)\)/);
  assert.match(html, /MACHINES=FLEET_MACHINES\.filter\(m=>!isMobilePlayer\(m\)\)/);
  assert.match(html, /ms=ms\.filter\(m=>!isMobilePlayer\(m\)\)\.concat\(MOBILE_MACHINES\)/);
  assert.match(html, /isMobilePlayer\(m\)\?AdmiraMobilePlayers\.cardHtml\(m\):`/);
  const hack = html.slice(html.indexOf('const HACK_MACHINES = ['), html.indexOf('];', html.indexOf('const HACK_MACHINES = [')));
  for (const m of mobiles) assert.ok(!hack.includes(m.id));
});

test('proxy de preview sólo lee signage/screens y no inventa ni conserva latidos ante un fallo', async t => {
  const {onRequest} = await import('../functions/api/control/mobile-screens.js');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({url, opts});
    return Response.json({screens:[{screen:'iphone17-mupi', last_seen:now, age_seconds:0, online:true, device:{private:'omitted'}}]});
  });
  const request = new Request('https://preview.test/api/control/mobile-screens');
  const r = await onRequest({request});
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await r.json()).screens, [{screen:'iphone17-mupi', last_seen:now, age_seconds:0}]);
  assert.equal(calls[0].url, 'https://api.admira.store/signage/screens');
  assert.equal(calls[0].opts.cache, 'no-store');
  const post = await onRequest({request:new Request(request.url, {method:'POST'})});
  assert.equal(post.status, 405); assert.equal(calls.length, 1);
  for (const response of [new Response('down', {status:503}), Response.json({bad:true})]) {
    globalThis.fetch = async () => response;
    const failed = await onRequest({request});
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), {error:'heartbeat_unavailable'});
  }
  globalThis.fetch = async () => {throw new Error('network down');};
  assert.equal((await onRequest({request})).status, 503);
});
