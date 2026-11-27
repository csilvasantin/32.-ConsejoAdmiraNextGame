/**
 * GET /api/lanzadera/estado — estado vivo por zona y por pantalla (Carlos, 27-nov-2026).
 * Detrás del login. Cruza el censo real de flota (latidos de bot.yokup.com/api/presence) con la
 * última orden y el acuse de cada pantalla. «En marcha» solo con acuse ok del equipo.
 * 03, 04 y 03V salen como «Pendiente ID». Solo lectura.
 */
import { json, sesion, leerEstado, leerCenso } from '../../_lanzadera.js';
import { construirEstado } from '../../../lanzadera-ejecucion-lib.mjs';

export async function onRequestGet({ request, env, fetchImpl }) {
  const f = fetchImpl || fetch;
  const s = await sesion(request, env, f);
  if (!s.ok) return json({ ok: false, error: s.error }, s.status);
  const ahora = Date.now();
  const [{ estado, persistencia }, censo] = await Promise.all([leerEstado(env), leerCenso(f, ahora)]);
  return json({ ...construirEstado(estado, censo.vivos, censo.ok, ahora), persistencia });
}
