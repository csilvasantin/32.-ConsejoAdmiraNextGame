/**
 * GET /api/consejo/comunicaciones
 * Recuento vivo de hilos Leyendas ↔ Coetáneos: encargos públicos, sesiones autónomas
 * y, con la sesión de admira.live, mensajes privados consejero_mensaje.
 * El token de la bandeja solo viaja de este servidor al Worker. Nunca sale en el JSON.
 */
import {
  buildComunicaciones, juntarInbox, urlsMensajes, urlsInboxPublico,
} from '../../../consejo-comunicaciones-lib.mjs';
import { SESION_KEY_PREF, SESION_INDICE } from '../../../consejo-sesion-lib.mjs';
import { autorizado, json, options } from '../council/_auth.mjs';

function kv(env) { return (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null; }

const SESION_PRIVADA = new Set(['maquina', 'persona', 'agente', 'kiosco']);

/** La cookie de la puerta o el token de máquina. El atajo por Origin no abre los mensajes privados. */
export function sesionParaMensajes(auth) {
  return !!(auth && SESION_PRIVADA.has(auth.via));
}

async function leerLista(fetchImpl, url) {
  try {
    const r = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { items: [], fallo: true };
    const d = await r.json();
    return { items: Array.isArray(d && d.items) ? d.items : [], fallo: false };
  } catch {
    return { items: [], fallo: true };
  }
}

export async function leerInbox(fetchImpl = fetch) {
  const resultados = await Promise.all(urlsInboxPublico().map((u) => leerLista(fetchImpl, u)));
  const fallos = resultados.filter((r) => r.fallo).length;
  return {
    items: juntarInbox(resultados.map((r) => r.items)),
    error: fallos === resultados.length ? 'inbox' : (fallos ? 'parcial' : null),
  };
}

function mensajeSano(m) {
  if (!m || typeof m !== 'object') return null;
  return {
    id: m.id ?? null,
    de: m.de ?? null,
    para: m.para ?? null,
    texto: m.texto ?? '',
    hora: m.hora ?? null,
    leido: !!m.leido,
    leido_en: m.leido_en || null,
    responde_a: m.responde_a || null,
    de_tipo: m.de_tipo || 'consejero',
    para_tipo: m.para_tipo || 'consejero',
  };
}

export async function leerMensajes(env, fetchImpl = fetch) {
  const urls = urlsMensajes(env && env.MCP_BASE);
  if (!urls.length) return { items: [], error: 'mensajes' };
  const headers = { accept: 'application/json' };
  const tok = String((env && env.CONSEJERO_MENSAJES_TOKEN) || '').trim();
  if (tok) headers['x-mensajes-token'] = tok;
  const tandas = await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return { items: [], fallo: true };
      const d = await r.json();
      return {
        items: (Array.isArray(d && d.mensajes) ? d.mensajes : []).map(mensajeSano).filter(Boolean),
        fallo: false,
      };
    } catch {
      return { items: [], fallo: true };
    }
  }));
  const vistos = new Set();
  const items = [];
  for (const tanda of tandas) {
    for (const m of tanda.items) {
      const id = String(m.id);
      if (vistos.has(id)) continue;
      vistos.add(id);
      items.push(m);
    }
  }
  const fallos = tandas.filter((t) => t.fallo).length;
  return { items, error: fallos === tandas.length ? 'mensajes' : (fallos ? 'parcial' : null) };
}

async function leerSesiones(store) {
  if (!store) return [];
  let indice = [];
  try { indice = JSON.parse((await store.get(SESION_INDICE)) || '[]'); } catch { indice = []; }
  if (!Array.isArray(indice)) indice = [];
  const out = [];
  for (const meta of indice.slice(0, 40)) {
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

function avisoDe(inbox, mensajes) {
  const partes = [];
  if (inbox && inbox.error === 'inbox') partes.push('La bandeja pública de encargos no ha respondido.');
  else if (inbox && inbox.error === 'parcial') partes.push('Alguna bandeja pública de encargos no ha respondido; el contador usa las que sí.');
  if (mensajes && mensajes.error === 'mensajes') partes.push('Los mensajes privados entre consejeros no se han podido leer en este momento.');
  else if (mensajes && mensajes.error === 'parcial') partes.push('Alguna bandeja privada de consejeros no ha respondido; el contador usa las que sí.');
  return partes.join(' ');
}

export const onRequestOptions = ({ request }) => options(request, 'GET, OPTIONS');

export async function onRequestGet({ request, env, fetchImpl }) {
  const f = fetchImpl || fetch;
  const origin = request.headers.get('Origin') || '';
  const auth = await autorizado(request, env);
  if (!auth.ok) return json({ ok: false, error: 'privado: entra en admira.live o usa el token de máquina' }, 401, origin, 'GET, OPTIONS');
  const url = new URL(request.url);
  const limite = Math.min(40, Math.max(1, Number(url.searchParams.get('limite')) || 20));
  const privados = sesionParaMensajes(auth);
  const [inbox, sesiones, mensajes] = await Promise.all([
    leerInbox(f),
    leerSesiones(kv(env)),
    privados ? leerMensajes(env, f) : Promise.resolve({ items: [], error: null }),
  ]);
  const out = buildComunicaciones({ inbox: inbox.items, sesiones, mensajes: mensajes.items });
  const aviso = avisoDe(inbox, mensajes);
  if (aviso) out.aviso = aviso;
  if (out.comunicaciones.length > limite) out.comunicaciones = out.comunicaciones.slice(0, limite);
  return json(out, 200, origin, 'GET, OPTIONS');
}
