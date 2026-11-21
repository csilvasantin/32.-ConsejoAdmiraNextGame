/**
 * GET /api/consejo/comunicaciones
 * Recuento vivo de hilos Leyendas ↔ Coetáneos: encargos públicos + sesiones autónomas.
 * Misma auth que /api/consejo/sesion. Sin secretos en la respuesta.
 */
import { buildComunicaciones, INBOX_PUBLICO } from '../../../consejo-comunicaciones-lib.mjs';
import { SESION_KEY_PREF, SESION_INDICE } from '../../../consejo-sesion-lib.mjs';
import { autorizado, json, options } from '../council/_auth.mjs';

function kv(env) { return (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null; }

async function leerInbox() {
  try {
    const r = await fetch(INBOX_PUBLICO, { headers: { accept: 'application/json' } });
    if (!r.ok) return { items: [], error: `inbox ${r.status}` };
    const d = await r.json();
    return { items: Array.isArray(d && d.items) ? d.items : [], error: null };
  } catch (e) {
    return { items: [], error: e && e.message ? e.message : 'inbox inaccesible' };
  }
}

async function leerSesiones(store, limite) {
  if (!store) return [];
  let indice = [];
  try { indice = JSON.parse((await store.get(SESION_INDICE)) || '[]'); } catch { indice = []; }
  if (!Array.isArray(indice)) indice = [];
  const metas = indice.slice(0, limite);
  const out = [];
  for (const meta of metas) {
    if (!meta || !meta.id) continue;
    try {
      const raw = await store.get(SESION_KEY_PREF + meta.id);
      const d = raw ? JSON.parse(raw) : null;
      out.push(d && d.id ? d : meta);
    } catch {
      out.push(meta);
    }
  }
  return out;
}

export const onRequestOptions = ({ request }) => options(request, 'GET, OPTIONS');

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const auth = await autorizado(request, env);
  if (!auth.ok) return json({ ok: false, error: 'privado: entra en admira.live o usa el token de máquina' }, 401, origin, 'GET, OPTIONS');
  const url = new URL(request.url);
  const limite = Math.min(40, Math.max(1, Number(url.searchParams.get('limite')) || 20));
  const inbox = await leerInbox();
  const sesiones = await leerSesiones(kv(env), limite);
  const out = buildComunicaciones({ inbox: inbox.items, sesiones });
  if (inbox.error) out.aviso = 'La bandeja pública de encargos no ha respondido; las sesiones sí se listan si hay almacén.';
  return json(out, 200, origin, 'GET, OPTIONS');
}
