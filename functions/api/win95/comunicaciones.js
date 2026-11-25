/**
 * GET /api/win95/comunicaciones — las comunicaciones entre consejeros como ficheros .txt para la
 * carpeta Miscelánea de admira.live/windows95 (Carlos, 25-11-2026 21:00).
 * Solo lectura, mismo origen y detrás de la verja: cookie de la puerta o sesión de Google.
 * Fuentes reales (las de /api/consejo/comunicaciones): mensajes consejero_mensaje del Worker
 * mcp.admira.live (el token viaja solo de este servidor al Worker), encargos públicos de
 * bot.yokup.com entre consejeros y sesiones autónomas del Consejo. Texto saneado: sin tokens,
 * claves, contraseñas, IPs ni MACs (win95-comunicaciones-lib.mjs). Nunca escribe nada.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle } from "../../../chat-hilo-lib.mjs";
import { leerInbox, leerMensajes } from "../consejo/comunicaciones.js";
import { SESION_KEY_PREF, SESION_INDICE } from "../../../consejo-sesion-lib.mjs";
import { construirFicheros, fechaMadrid, horaMadrid } from "../../../win95-comunicaciones-lib.mjs";

const CABECERAS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};
const json = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: CABECERAS });

async function autorizado(request, env, f) {
  if (await verificar(env && env.PUERTA_FIRMA, leerCookie(request))) return true;
  return !!(await emailGoogle(request, env, f));
}

const kvSesiones = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;
async function leerSesiones(store) {
  if (!store) return [];
  let indice = [];
  try { indice = JSON.parse((await store.get(SESION_INDICE)) || "[]"); } catch { indice = []; }
  if (!Array.isArray(indice)) return [];
  const out = await Promise.all(indice.slice(0, 20).map(async (meta) => {
    if (!meta || !meta.id) return null;
    try { const raw = await store.get(SESION_KEY_PREF + meta.id); const d = raw ? JSON.parse(raw) : null; return d && d.id ? d : null; } catch { return null; }
  }));
  return out.filter(Boolean);
}

export async function construir({ env, fetchImpl, ahora } = {}) {
  const f = fetchImpl || fetch;
  const t = ahora || Date.now();
  const [inbox, mensajes, sesiones] = await Promise.all([
    leerInbox(f).catch(() => ({ items: [], error: "inbox" })),
    leerMensajes(env, f).catch(() => ({ items: [], error: "mensajes" })),
    leerSesiones(kvSesiones(env)).catch(() => []),
  ]);
  const ficheros = construirFicheros({ mensajes: mensajes.items, encargos: inbox.items, sesiones }, t);
  const avisos = [];
  if (inbox.error) avisos.push(inbox.error === "inbox" ? "La bandeja pública de encargos no ha respondido." : "Alguna bandeja de encargos no ha respondido.");
  if (mensajes.error) avisos.push(mensajes.error === "mensajes" ? "Los mensajes privados entre consejeros no se han podido leer ahora." : "Alguna bandeja privada de consejeros no ha respondido.");
  return {
    ok: true,
    generado: t,
    generado_madrid: `${fechaMadrid(t)} ${horaMadrid(t)}`,
    fuentes: { mensajes: mensajes.items.length, encargos: inbox.items.length, sesiones: sesiones.length },
    aviso: avisos.join(" "),
    ficheros,
  };
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const f = fetchImpl || fetch;
  if (!(await autorizado(request, env, f))) return json({ ok: false, error: "sesion" }, 401);
  return json(await construir({ env, fetchImpl: f }));
}
