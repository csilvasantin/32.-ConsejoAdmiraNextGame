/**
 * Lectura de misiones Yokup resueltas por consejero.
 * El GET global ?status=resolved&limit=120 puede devolver 200 (yokup_ok)
 * y aun así dejar a un consejero en 0 porque el límite es una ventana
 * única, no un filtro por persona. Se pide ?agent=woz (jobs, disney, …)
 * en paralelo al listado global; si el filtro por agente responde, se
 * usa ese. No se inventan cifras si todo falla. rtc se deja como
 * último recurso breve, no en cadena tras un timeout.
 */
import { YOKUP_HOSTS, urlsYokupPorAgente } from './consejo-misiones-hoy.mjs';

export const YOKUP_RES_GLOBAL = 'https://api.yokup.com/fleet/missions?status=resolved&limit=120';
export const YOKUP_ALL = 'https://api.yokup.com/fleet/missions?limit=80';

async function leerJson(fetchImpl, url, ms = 5000) {
  const r = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': 'admira-live-consejo' },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(r.status + ' en ' + url);
  return r.json();
}

function misionesDe(d) {
  const lista = (d && (d.missions || d.items)) || [];
  return Array.isArray(lista) ? lista : [];
}

function fusionarPorId(partes) {
  const map = new Map();
  for (const m of partes) {
    if (!m) continue;
    const id = m.id || m.display_ref || JSON.stringify(m);
    if (!map.has(id)) map.set(id, m);
  }
  return [...map.values()];
}

async function porAgente(fetchImpl, host, errores, prefijo) {
  const consultas = urlsYokupPorAgente(host);
  const partes = await Promise.all(consultas.map((q) =>
    leerJson(fetchImpl, q.url)
      .then((d) => ({ bot: q.bot, ok: true, lista: misionesDe(d) }))
      .catch((e) => {
        errores[prefijo + q.bot] = String(e.message || e);
        return { bot: q.bot, ok: false, lista: null };
      }),
  ));
  const ok = partes.filter((p) => p.ok);
  return {
    ok: ok.length > 0,
    agentes_ok: ok.map((p) => p.bot),
    agentes_fallidos: partes.filter((p) => !p.ok).map((p) => p.bot),
    lista: fusionarPorId(ok.flatMap((p) => p.lista)),
  };
}

export async function leerYokup(fetchImpl, errores = {}) {
  const f = fetchImpl || fetch;
  const [agentes, global] = await Promise.all([
    porAgente(f, YOKUP_HOSTS[0], errores, 'yokup_agente_'),
    leerJson(f, YOKUP_RES_GLOBAL).then((d) => ({ ok: true, lista: misionesDe(d) })).catch((e) => {
      errores.yokup_global = String(e.message || e);
      return { ok: false, lista: null };
    }),
  ]);
  if (agentes.ok) {
    return { misiones: agentes.lista, modo: 'por-agente', host: YOKUP_HOSTS[0], agentes_ok: agentes.agentes_ok, agentes_fallidos: agentes.agentes_fallidos };
  }
  if (global.ok) {
    return { misiones: global.lista, modo: 'global-fallback', host: 'https://api.yokup.com', agentes_ok: [], agentes_fallidos: agentes.agentes_fallidos };
  }
  errores.yokup = errores.yokup_global || 'yokup no disponible';
  return { misiones: null, modo: null, host: null, agentes_ok: [], agentes_fallidos: agentes.agentes_fallidos };
}
