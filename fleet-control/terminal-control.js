'use strict';
const { randomBytes } = require('node:crypto');
const key = x => String(x || '').toLowerCase().split('.')[0].replace(/[^a-z0-9]/g, '');
const aliases = { mbp16: /macbookpro16/, pro16: /macbookpro16/, mbp14: /macbookpro.*14/, pro14: /macbookpro.*14/, negro14: /macbookpro.*14/, mini: /macmini/, macmini: /macmini/, air: /macbookair/, mba: /macbookair/ };
const failure = (status, error) => Object.assign(new Error(error), { status });
const needsSecond = t => t.encargoStatus === 'in_progress' || t.encargoStatus === 'unknown';
const stamp = t => JSON.stringify([t.maquina, t.id, t.sesion, t.creada, t.runtime, t.encargoId, t.encargoStatus]);
function selectMachine(value, machines) {
  if (!value || value === '*') return machines;
  const k = key(value), exact = machines.filter(m => [m.id,m.host,m.name].some(x => key(x).replace(/local$/, '') === k));
  const found = exact.length ? exact : machines.filter(m => aliases[k]?.test(key(m.host) + key(m.name) + key(m.id)));
  if (!found.length) throw failure(400, 'equipo desconocido');
  if (found.length > 1) throw failure(400, 'alias ambiguo; usa el nombre completo del equipo');
  return found;
}
function createTerminalControl({ inventory, machines, execute, audit, now = Date.now }) {
  const plans = new Map();
  function admin(actor) { if (!actor?.admin || !actor?.jti || !actor?.email) throw failure(403,'sesión administradora requerida'); }
  function actorKey(actor) { return actor.email + ':' + actor.jti; }
  async function list(actor) { admin(actor); return inventory(); }
  async function plan(actor, body = {}) {
    admin(actor);
    // El contexto lo establece el servidor; no aceptamos un emisor enviado por el cliente.
    if (!actor.source || !['browser','tmux'].includes(actor.source.kind)) throw failure(409,'origen emisor no acreditado');
    if (actor.source.kind === 'tmux' && (!actor.source.maquina || !actor.source.sesion)) throw failure(409,'origen emisor no acreditado');
    const selected = selectMachine(body.machine, machines());
    const data = await inventory();
    const targets = [], missing = [], protectedSessions = [];
    for (const m of selected) {
      const d = data.maquinas.find(d => key(d.maquina) === key(m.host).replace(/local$/,'') || key(d.maquina) === key(m.id) || key(d.maquina) === key(m.name));
      if (!d?.disponible) { missing.push({ maquina: m.name || m.id, ultimoLatido: d?.ultimoLatido || null, motivo: d?.motivo || 'sin datos' }); continue; }
      for (const t of d.terminales) {
        const row = { ...t, maquina: d.maquina, machine: m.id };
        if (actor.source.kind === 'tmux' && key(actor.source.maquina) === key(d.maquina) && actor.source.sesion === t.sesion) protectedSessions.push(row);
        else targets.push(row);
      }
    }
    if (!body.machine || body.machine === '*') for (const d of data.maquinas) {
      if (!selected.some(m => [m.id,m.host,m.name].some(x => key(x) === key(d.maquina))))
        missing.push({maquina:d.maquina,ultimoLatido:d.ultimoLatido || null,motivo:'sin ruta de control registrada'});
    }
    for (const [id,p] of plans) if (p.expires < now()) plans.delete(id);
    if (plans.size >= 100) throw failure(429,'demasiadas confirmaciones pendientes');
    const id = randomBytes(24).toString('base64url'), expires = now() + 120000;
    const p = { id, owner: actorKey(actor), source: actor.source, expires, targets, missing, protectedSessions, stage: 'preview' };
    plans.set(id,p);
    audit({ ev: 'terminal_plan', by: actor.email, plan: id, targets: targets.map(t => ({machine:t.machine,session:t.sesion})), missing, protectedSessions });
    return { ok:true, plan:id, expires, targets, missing, protectedSessions, active:targets.filter(needsSecond), stage:p.stage };
  }
  async function confirm(actor, body = {}) {
    admin(actor);
    const p = plans.get(body.plan);
    if (!p || p.expires < now() || p.owner !== actorKey(actor) || JSON.stringify(p.source)!==JSON.stringify(actor.source)) throw failure(409,'plan ausente, caducado o de otra sesión; repite /terminal kill');
    if (body.confirm !== true) throw failure(400,'confirmación explícita requerida');
    if (p.stage === 'executing' || p.stage === 'done') throw failure(409,'plan ya consumido; no se repite el cierre');
    const risky = p.targets.filter(needsSecond);
    if (p.stage === 'preview' && risky.length) {
      p.stage = 'active';
      audit({ev:'terminal_confirmation',by:actor.email,plan:p.id,stage:'active'});
      return {ok:true,stage:'active',plan:p.id,active:risky,targets:p.targets,missing:p.missing,protectedSessions:p.protectedSessions};
    }
    if (p.stage === 'active' && body.confirmActive !== true) throw failure(409,'segunda confirmación requerida para encargos en curso o desconocidos');
    // Consumir antes de await: impide doble ejecución concurrente y reintentos de red.
    p.stage = 'executing';
    const results = [];
    try {
      const fresh = await inventory();
      for (const t of p.targets) {
        const d = fresh.maquinas.find(d => d.maquina === t.maquina);
        const current = d?.disponible && d.terminales.find(x => x.id === t.id);
        if (!current || stamp({...current,maquina:t.maquina}) !== stamp(t)) throw failure(409,'inventario o encargo cambió; repite la previsualización');
      }
      // Dos fases: copia de TODOS los destinos antes de cerrar uno solo.
      for (const machine of [...new Set(p.targets.map(t => t.machine))]) {
        const rows = p.targets.filter(t => t.machine === machine);
        const prepared = await execute(machine,{action:'prepare',plan:p.id,targets:rows,source:p.source,by:actor.email,confirmActive:risky.length > 0});
        if (!prepared.ok) throw failure(409,prepared.error || 'no se pudo guardar todos los paneles');
        results.push({machine,prepared});
      }
      for (const item of results) {
        item.result = await execute(item.machine,{action:'commit',plan:p.id,targets:p.targets.filter(t => t.machine === item.machine),source:p.source,by:actor.email,confirmActive:risky.length > 0});
        audit({ev:'terminal_kill',by:actor.email,plan:p.id,machine:item.machine,result:item.result});
      }
      p.stage = 'done';
      return {ok:results.every(x => x.result.ok),stage:'done',results,missing:p.missing,protectedSessions:p.protectedSessions};
    } catch (e) {
      p.stage='done';
      audit({ev:'terminal_failure',by:actor.email,plan:p.id,error:e.message,results});
      throw e;
    }
  }
  return { list,plan,confirm };
}
module.exports = { createTerminalControl, selectMachine, needsSecond };
