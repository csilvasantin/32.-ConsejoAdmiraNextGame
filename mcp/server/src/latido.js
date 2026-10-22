/*
 * latido.js — «el consejero sale iluminado en cuanto empieza una misión» (Carlos, 22-oct-2026 07:43:
 * escribía a Woz para pasarle una misión y en /consumos salía gris «en espera»).
 *
 * Un consejero de Grok Bot no tiene vigilante ni latido propio cada 60 s, y su consumo llega con retraso
 * (pool de Merovingio). Aquí declara él mismo su estado con la tool consejero_latido:
 *   modo trabajando (misión, proyecto, minutos de vigencia: 10 por defecto, máx. 60) o reposo.
 * Sin renovar, caduca solo (vuelve a reposo al pasar `hasta`). También se marca solo al acusar un
 * encargo (ack / in_progress → trabajando 10 min; done / blocked → reposo) con encargo_responder o
 * telegram_responder. Se guarda en el KV ADMIRA_LIVE_DESDE (un documento pequeño) y se lee, pública y
 * sin secretos, en GET /consejeros/latido → admira.live/api/flota/trabajando lo pinta verde al instante.
 */
export const CLAVE_LATIDO = 'consejero-latido:v1';
export const MIN_DEFECTO = 10;
export const MIN_MAX = 60;

const texto = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export async function leerLatidos(kv) {
  if (!kv || typeof kv.get !== 'function') return {};
  try { const d = await kv.get(CLAVE_LATIDO, 'json'); return d && typeof d === 'object' && d.consejeros ? d.consejeros : {}; } catch (_) { return {}; }
}

/** Entrada nueva (pura). */
export function entradaLatido({ modo = 'trabajando', mision = '', proyecto = '', minutos, encargo, origen = 'consejero_latido' } = {}, previa = null, ahoraS = Math.floor(Date.now() / 1000)) {
  const trabajando = modo !== 'reposo';
  const min = Math.max(1, Math.min(MIN_MAX, Number(minutos) || MIN_DEFECTO));
  const sigue = previa && previa.modo === 'trabajando' && Number(previa.hasta) > ahoraS;
  return {
    modo: trabajando ? 'trabajando' : 'reposo',
    mision: texto(mision, 160) || (trabajando && sigue ? previa.mision : '') || null,
    proyecto: texto(proyecto, 60) || (sigue ? previa.proyecto : '') || null,
    encargo: encargo ? Number(encargo) : (trabajando && sigue ? previa.encargo || null : null),
    desde: trabajando ? (sigue ? Number(previa.desde) || ahoraS : ahoraS) : ahoraS,
    at: ahoraS,
    hasta: trabajando ? ahoraS + min * 60 : ahoraS,
    origen,
  };
}

/** Vista pública: modo efectivo (caducado → reposo). */
export function vigentes(consejeros, ahoraS = Math.floor(Date.now() / 1000)) {
  const out = {};
  for (const [p, e] of Object.entries(consejeros || {})) {
    if (!e) continue;
    const vivo = e.modo === 'trabajando' && Number(e.hasta) > ahoraS;
    out[p] = { ...e, modo: vivo ? 'trabajando' : 'reposo', caducado: e.modo === 'trabajando' && !vivo, quedaS: vivo ? Number(e.hasta) - ahoraS : 0 };
  }
  return out;
}

export async function latir(kv, persona, args = {}, ahoraS = Math.floor(Date.now() / 1000)) {
  if (!kv || typeof kv.put !== 'function') throw new Error('sin KV ADMIRA_LIVE_DESDE: no se puede guardar el latido');
  if (!persona) throw new Error('sin identidad de consejero: entra con tu clave de silla o pasa como=<tu apellido>');
  const todos = await leerLatidos(kv);
  const e = entradaLatido(args, todos[persona] || null, ahoraS);
  todos[persona] = e;
  await kv.put(CLAVE_LATIDO, JSON.stringify({ consejeros: todos }));
  return { ok: true, persona, ...e, quedaS: e.hasta - ahoraS, ver: 'https://www.admira.live/consumos' };
}

/** Señal automática al acusar un encargo (nunca rompe la respuesta). */
export async function latidoPorEncargo(kv, identidad, estado, encargo) {
  try {
    if (!identidad || identidad.tipo !== 'consejero' || !identidad.persona || !kv) return null;
    if (estado === 'ack' || estado === 'in_progress') return await latir(kv, identidad.persona, { modo: 'trabajando', mision: encargo ? `encargo #${encargo}` : '', encargo, origen: 'encargo ' + estado });
    if (estado === 'done' || estado === 'blocked') return await latir(kv, identidad.persona, { modo: 'reposo', origen: 'encargo ' + estado });
  } catch (_) {}
  return null;
}

/**
 * Señal automática por actividad (Carlos, 22-10-2026 19:37: «Jobs, Woz, Walt y Lucas activos toda la tarde y
 * /consumos dice Consejeros: 0 trabajando»). Tras un handOFF o un «done» el consejero queda en reposo y, aunque siga
 * encargando, escribiendo o reportando consumo, nadie renovaba su latido. Ahora cualquier acción suya por el MCP
 * (agente_encargar, consejero_mensaje, consumo_reportar) lo marca trabajando 10 min, conservando la misión vigente.
 * Nunca rompe la respuesta.
 */
export async function latidoPorActividad(kv, identidad, que = '') {
  try {
    if (!identidad || identidad.tipo !== 'consejero' || !identidad.persona || !kv) return null;
    return await latir(kv, identidad.persona, { modo: 'trabajando', mision: '', origen: 'actividad ' + texto(que, 40) }, undefined);
  } catch (_) {}
  return null;
}
