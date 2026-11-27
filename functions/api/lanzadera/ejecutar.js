/**
 * POST /api/lanzadera/ejecutar { zona, accion } — de plan a ejecución real (Carlos, 27-nov-2026).
 *   zona:   reuniones | interactivos | mupis | todo
 *   accion: admiranext | portaventura | negro | apagar | encender
 * Detrás del login (sesión de persona o Google; kiosco y agente no lanzan). Mismo origen.
 * Encola una orden por pantalla en la cola de la lanzadera (KV) para el equipo que la pinta y
 * devuelve por pantalla: despachado | sin_conexion | pendiente_id. Nunca «en marcha»: eso solo
 * lo da el acuse del propio equipo (/api/lanzadera/cola). Nunca da órdenes al Studio ni al Mini.
 */
import { json, sesion, mismoOrigen, leerEstado, guardarEstado, leerCenso } from '../../_lanzadera.js';
import { validarPeticion, planDeEjecucion, resolverDespacho, anotarDespacho, respuestaEjecucion } from '../../../lanzadera-ejecucion-lib.mjs';

export async function onRequestPost({ request, env, fetchImpl }) {
  const f = fetchImpl || fetch;
  if (!mismoOrigen(request)) return json({ ok: false, error: 'origen' }, 403);
  const s = await sesion(request, env, f, { escritura: true });
  if (!s.ok) return json({ ok: false, error: s.error }, s.status);
  const texto = await request.text();
  if (texto.length > 2000) return json({ ok: false, error: 'cuerpo demasiado grande' }, 413);
  let body;
  try { body = JSON.parse(texto || '{}'); } catch (e) { return json({ ok: false, error: 'json inválido' }, 400); }
  const v = validarPeticion(body);
  if (!v.ok) return json({ ok: false, error: v.error }, 400);
  const ahora = Date.now();
  const plan = planDeEjecucion(v.zona, v.accion, ahora);
  const censo = await leerCenso(f, ahora);
  const resultados = resolverDespacho(plan, censo.vivos, censo.ok);
  const { estado } = await leerEstado(env);
  const persistencia = await guardarEstado(env, anotarDespacho(estado, plan, resultados, ahora));
  return json({ ...respuestaEjecucion(plan, resultados), censo: censo.ok ? 'ok' : 'sin respuesta', persistencia });
}

export function onRequestGet() {
  return json({ ok: false, error: 'usa POST { zona, accion }' }, 405);
}
