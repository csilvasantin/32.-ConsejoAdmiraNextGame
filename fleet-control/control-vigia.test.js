'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('./control-vigia');

test('la versión canónica es el entero del agente Python, no el bash embebido', () => {
  assert.equal(V.versionAgenteCanonico('x\nCAPTURE_VERSION = 3\n'), 3);
  assert.equal(V.versionAgenteCanonico("read -r -d '' CAPTURE_SH <<'EOS'\n#!/bin/bash\nEOS\n"), null);
});

test('evaluar: ver+tocar sólo con captura real, inyector, Accesibilidad y pantalla libre', () => {
  const ok = V.evaluar({ stdout: '__V_CAP__=1\n__V_AGENT__=3\n__V_INPUT__=1\n__V_AX__=1\n__V_LOCK__=0\n', rc: 0, online: true, plataforma: 'macos', versionCanonico: 3 });
  assert.deepEqual([ok.ver, ok.tocar, ok.ready, ok.agenteOk, ok.why], [true, true, true, true, 'ver + tocar']);
  const viejo = V.evaluar({ stdout: '__V_CAP__=0\n__V_AGENT__=1\n__V_INPUT__=1\n__V_AX__=1\n__V_LOCK__=0\n', rc: 0, online: true, plataforma: 'macos', versionCanonico: 3 });
  assert.equal(viejo.why, 'agente de captura desactualizado'); assert.equal(viejo.ready, false);
  const alDiaSinImagen = V.evaluar({ stdout: '__V_CAP__=0\n__V_AGENT__=3\n__V_INPUT__=1\n__V_AX__=1\n__V_LOCK__=0\n', rc: 0, online: true, plataforma: 'macos', versionCanonico: 3 });
  assert.equal(alDiaSinImagen.why, 'la captura no responde'); assert.equal(alDiaSinImagen.agenteOk, true);
  const masNuevo = V.evaluar({ stdout: '__V_CAP__=1\n__V_AGENT__=4\n__V_INPUT__=1\n__V_AX__=1\n__V_LOCK__=0\n', rc: 0, online: true, plataforma: 'macos', versionCanonico: 3 });
  assert.equal(masNuevo.agenteOk, true);
  const sinInput = V.evaluar({ stdout: '__V_CAP__=1\n__V_AGENT__=3\n__V_INPUT__=0\n__V_AX__=1\n__V_LOCK__=0\n', rc: 0, online: true, plataforma: 'macos', versionCanonico: 3 });
  assert.equal(sinInput.why, 'sin inyector de entrada');
  const bloq = V.evaluar({ stdout: '__V_CAP__=1\n__V_AGENT__=3\n__V_INPUT__=1\n__V_AX__=1\n__V_LOCK__=1\n', rc: 0, online: true, plataforma: 'macos', versionCanonico: 3 });
  assert.equal(bloq.why, 'pantalla bloqueada'); assert.equal(bloq.ver, true);
  const sinAx = V.evaluar({ stdout: '__V_CAP__=1\n__V_AGENT__=3\n__V_INPUT__=1\n__V_AX__=0\n__V_LOCK__=0\n', rc: 0, online: true, plataforma: 'macos', versionCanonico: 3 });
  assert.equal(sinAx.why, 'sin permiso de Accesibilidad');
  const off = V.evaluar({ stdout: '', rc: 255, online: false, plataforma: 'macos', versionCanonico: 3 });
  assert.equal(off.why, 'sin ssh desde el hub');
});

test('reparación automática: no reinstala si el agente ya está al día', () => {
  assert.equal(V.necesitaReparacion({ online: true, ver: false, agenteOk: false, why: 'x' }, 'macos'), 'agente');
  assert.equal(V.necesitaReparacion({ online: true, ver: false, agenteOk: true, why: 'la captura no responde' }, 'macos'), null);
  assert.equal(V.necesitaReparacion({ online: true, ver: true, agenteOk: true, why: 'sin inyector de entrada' }, 'macos'), 'inyector');
  assert.equal(V.necesitaReparacion({ online: true, ver: true, agenteOk: true, why: 'ver + tocar' }, 'macos'), null);
  assert.equal(V.necesitaReparacion({ online: true, ver: false }, 'linux'), null);
});

test('transición: avisa sólo cuando cambia el estado, nunca en la primera lectura', () => {
  assert.equal(V.transicion(null, { ready: false, why: 'x' }, 'Rosa'), null);
  assert.equal(V.transicion({ ready: true }, { ready: true }, 'Rosa'), null);
  assert.match(V.transicion({ ready: true }, { ready: false, why: 'pantalla bloqueada' }, 'Rosa'), /🔴 Rosa .*pantalla bloqueada/);
  assert.match(V.transicion({ ready: false }, { ready: true }, 'Rosa'), /🟢 Rosa/);
});

test('ronda: prueba, repara una vez por hora y persiste', async () => {
  let reparaciones = 0, avisos = [], persistido = null, llamadas = 0;
  const v = V.crear({
    maquinas: () => [{ id: 'rosa', name: 'Rosa' }],
    platOf: () => 'macos',
    run: async () => { llamadas++; return llamadas === 1 ? { rc: 0, stdout: '__V_CAP__=0\n__V_AGENT__=1\n__V_INPUT__=1\n__V_AX__=1\n__V_LOCK__=0\n' } : { rc: 0, stdout: '__V_CAP__=1\n__V_AGENT__=3\n__V_INPUT__=1\n__V_AX__=1\n__V_LOCK__=0\n' }; },
    reparar: async () => { reparaciones++; return true; },
    avisar: async (t) => { avisos.push(t); },
    audit: () => {},
    persistir: (e) => { persistido = e; },
    versionCanonico: 3,
    ahora: () => 1000,
  });
  const e = await v.ronda();
  assert.equal(reparaciones, 1);
  assert.equal(e.rosa.ready, true, 'tras reparar, la segunda sonda da ver+tocar');
  assert.equal(e.rosa.reparado.tipo, 'agente');
  assert.ok(avisos.some((a) => /reparación automática de agente aplicada/.test(a)));
  assert.equal(persistido.rosa.why, 'ver + tocar');
  await v.ronda();
  assert.equal(reparaciones, 1, 'no repara otra vez dentro de la hora (ya está bien)');
});

test('la sonda de cada plataforma emite los cinco marcadores', () => {
  for (const p of ['macos', 'linux', 'windows']) {
    const c = V.comandoSonda(p);
    for (const k of ['CAP', 'AGENT', 'INPUT', 'AX', 'LOCK']) assert.match(c, new RegExp('__V_' + k + '__'), p + ' ' + k);
  }
  assert.equal(V.comandoSonda('ios'), null);
  assert.doesNotMatch(V.comandoSonda('macos'), /capture\.req/, 'la sonda macOS no usa el buzón compartido');
  assert.match(V.comandoSonda('macos'), /capture-queue/);
});

test('fuera de la red: avisa UNA vez al superar 1 h sin SSH y se limpia al volver', async () => {
  let avisos = [], t = 0, online = false;
  const v = V.crear({
    maquinas: () => [{ id: 'dgx', name: 'DGX' }], platOf: () => 'linux',
    run: async () => online ? { rc: 0, stdout: '__V_CAP__=1\n__V_AGENT__=linux\n__V_INPUT__=1\n__V_AX__=1\n__V_LOCK__=0\n' } : { rc: 255, stdout: '' },
    reparar: async () => false, avisar: async (x) => { avisos.push(x); }, audit: () => {}, persistir: () => {},
    versionCanonico: 3, ahora: () => t,
  });
  t = 0; await v.ronda(); assert.equal(avisos.length, 0);
  t = 30 * 60000; await v.ronda(); assert.equal(avisos.length, 0, 'a la media hora aún no');
  t = 61 * 60000; await v.ronda(); assert.equal(avisos.filter((a) => /lleva más de 1 h/.test(a)).length, 1);
  t = 90 * 60000; await v.ronda(); assert.equal(avisos.filter((a) => /lleva más de 1 h/.test(a)).length, 1, 'no repite');
  online = true; t = 100 * 60000; await v.ronda(); assert.equal(v.estado.dgx.fueraDesde, undefined);
});

test('comandoWol: paquete mágico por broadcast (y a la IP local si se conoce)', () => {
  const c = V.comandoWol('1C:F6:4C:3B:F0:17', '192.168.1.34');
  assert.match(c, /base64 -d \| python3 -$/);
  const py = Buffer.from(c.match(/^echo (\S+) \|/)[1], 'base64').toString('utf8');
  assert.match(py, /1cf64c3bf017/); assert.match(py, /255\.255\.255\.255/); assert.match(py, /192\.168\.1\.34/); assert.match(py, /except Exception/);
  assert.equal(V.comandoWol('no-es-mac'), null);
});
