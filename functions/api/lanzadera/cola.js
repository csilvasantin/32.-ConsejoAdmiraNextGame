/**
 * /api/lanzadera/cola — lo que recoge cada equipo de la flota (token de máquina, X-Council-Token).
 *   GET  ?maquina=AdmiraNeXT01  → órdenes vivas para ese equipo (abrir Chrome en segundo plano, sin foco).
 *   POST { pantalla, orden, ok, nota? } → acuse del equipo. Solo con ok:true la pantalla pasa a
 *        «En marcha» (o «En negro»). El Studio y el Mini no tienen órdenes nunca.
 */
import { json, esMaquina, leerEstado, guardarEstado } from '../../_lanzadera.js';
import { ordenesDeMaquina, anotarAcuse } from '../../../lanzadera-ejecucion-lib.mjs';

function permiso(request, env) {
  const ok = esMaquina(request, env);
  if (ok === null) return json({ ok: false, error: 'cola cerrada: falta el token de máquina en el proyecto' }, 503);
  if (!ok) return json({ ok: false, error: 'no autorizado: manda X-Council-Token' }, 401);
  return null;
}

export async function onRequestGet({ request, env }) {
  const no = permiso(request, env);
  if (no) return no;
  const maquina = new URL(request.url).searchParams.get('maquina') || '';
  if (!/^[A-Za-z0-9 ._-]{2,40}$/.test(maquina)) return json({ ok: false, error: 'maquina' }, 400);
  const { estado } = await leerEstado(env);
  const ordenes = ordenesDeMaquina(estado, maquina).map(({ machineId, ...o }) => o);
  return json({ ok: true, maquina, ordenes });
}

export async function onRequestPost({ request, env }) {
  const no = permiso(request, env);
  if (no) return no;
  let body;
  try { body = JSON.parse((await request.text()) || '{}'); } catch (e) { return json({ ok: false, error: 'json inválido' }, 400); }
  const { estado } = await leerEstado(env);
  const r = anotarAcuse(estado, body, Date.now());
  if (r.error) return json({ ok: false, error: r.error }, 409);
  await guardarEstado(env, r.estado);
  return json({ ok: true, pantalla: String(body.pantalla), confirmado: body.ok === true });
}
