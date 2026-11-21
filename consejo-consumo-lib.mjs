/**
 * Consumo REAL de los consejeros del motor Cloudflare (r225, 21-11-2026 — Carlos: «como me puedes decir 0 Tokens por
 * hora !! … y los consejeros y los agentes trabajando»).
 *
 * Hasta hoy /api/council/* y /api/consejo/sesion llamaban a grok-4.6 (x.ai) y guardaban los tokens solo en la sesión:
 * /consumos no los veía. Ahora cada respuesta buena de preguntarConsejero apunta sus tokens del API (usage.prompt_tokens +
 * usage.completion_tokens, los que devuelve x.ai; nada estimado) y se vuelcan al pulso de la máquina «Cloudflare» como
 * un agente más (motor grok, proyecto admira.live), con el mismo formato que manda un Mac.
 *
 * KV (CONSUMOS_KV o RECORTE_KV):
 *   consumos:consejo-cf:v1:<YYYY-MM-DD>:<ts>-<rnd>  valor vacío, metadata { t: tokens, ts } (una clave por llamada:
 *        sin carreras de lectura-escritura entre consejeros que responden a la vez), caduca a los 2 días.
 *   consumos:consejo-cf:v1:pendiente  marca para que /api/consumos/velocidad vuelque lo que quedó sin volcar por la regla
 *        de ≤ 1 escritura/50 s por máquina.
 * Nunca rompe una respuesta del Consejo: todo va en try/catch.
 */
import { normalizarPulso, aplicarPulso, KEY_PREFIX, KEY_INDICE } from "./consumos-pulso-lib.mjs";

export const MAQUINA_CF = "Cloudflare";
export const AGENTE_CF = "Consejeros (Cloudflare)";
export const PROYECTO_CF = "admira.live";
export const PREFIJO_CF = "consumos:consejo-cf:v1:";
export const KEY_PENDIENTE_CF = PREFIJO_CF + "pendiente";

/** La lista de KV tarda hasta ~60 s en enseñar una clave nueva: la marca de pendiente se quita pasado ese margen. */
export const MARGEN_LISTA_MS = 70 * 1000;
async function limpiaPendiente(store, ahora) {
  try { const p = Number(await store.get(KEY_PENDIENTE_CF)); if (!p || ahora - p > MARGEN_LISTA_MS) await store.delete(KEY_PENDIENTE_CF); } catch (e) {}
}
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

/** Día de Madrid «YYYY-MM-DD». */
export function diaMadrid(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Tokens reales de una respuesta del API (entrada + salida). null si el API no los dio. */
export function tokensDe(r) {
  const i = Number(r && r.input_tokens), o = Number(r && r.output_tokens);
  const ok = (x) => Number.isFinite(x) && x >= 0;
  if (!ok(i) && !ok(o)) return null;
  const t = Math.round((ok(i) ? i : 0) + (ok(o) ? o : 0));
  return t > 0 ? t : null;
}

/** Suma las claves del día (metadata t) → { tokHoy, ultimoEvento, llamadas }. */
export async function sumaDia(store, dia) {
  let tokHoy = 0, ultimo = 0, llamadas = 0, cursor;
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const l = await store.list({ prefix: PREFIJO_CF + dia + ":", cursor });
    for (const k of l.keys || []) {
      const m = k.metadata || {};
      const t = Number(m.t);
      if (Number.isFinite(t) && t > 0) { tokHoy += t; llamadas++; }
      if (Number(m.ts) > ultimo) ultimo = Number(m.ts);
    }
    if (l.list_complete || !l.cursor) break;
    cursor = l.cursor;
  }
  return { tokHoy, ultimoEvento: ultimo ? new Date(ultimo).toISOString() : null, llamadas };
}

/** Cuerpo de pulso (el mismo formato que un Mac) para la máquina «Cloudflare». */
export function pulsoConsejo({ tokHoy, ultimoEvento, llamadas, modelo }) {
  return normalizarPulso({
    maquina: MAQUINA_CF,
    agentes: [{ agente: AGENTE_CF, motor: "grok", cuenta: "xAI API (Cloudflare)", tokHoy, cacheHoy: 0, ultimoEvento,
      porProyecto: { [PROYECTO_CF]: tokHoy }, porEventos: true, modelo: modelo || "grok-4.6", fuente: "api-usage",
      nota: `Consejeros del motor Cloudflare: ${llamadas} respuestas hoy · tokens del campo usage de la API` }],
  });
}

/** Vuelca la suma del día al pulso de la máquina Cloudflare (si han pasado ≥ 50 s desde el último). */
export async function volcarConsumoConsejo(env, ahora = Date.now(), modelo) {
  const store = kv(env);
  if (!store || typeof store.list !== "function") return { ok: false, motivo: "sin KV" };
  const s = await sumaDia(store, diaMadrid(ahora));
  const clave = KEY_PREFIX + MAQUINA_CF;
  let doc = null;
  try { const raw = await store.get(clave); doc = raw ? JSON.parse(raw) : null; } catch (e) {}
  const nueva = !doc;
  const prev = doc && doc.agentes && doc.agentes[AGENTE_CF];
  if (!s.tokHoy && !prev) { await limpiaPendiente(store, ahora); return { ok: true, guardado: false, motivo: "sin consumo hoy" }; }
  if (prev && prev.tokHoy === s.tokHoy && diaMadrid(prev.ultimoPulso || 0) === diaMadrid(ahora)) {
    await limpiaPendiente(store, ahora);
    return { ok: true, guardado: false, motivo: "al día", ...s };
  }
  const n = pulsoConsejo({ ...s, modelo });
  if (!n.ok) return { ok: false, motivo: n.error };
  // Primer volcado del día: punto a 0 un minuto antes para que la serie cuente también los tokens de esa primera respuesta.
  const serie = prev && Array.isArray(prev.serie) ? prev.serie : [];
  const ultimoPunto = serie.length ? serie[serie.length - 1] : null;
  if (s.tokHoy > 0 && (!ultimoPunto || diaMadrid(ultimoPunto[0] * 1000) !== diaMadrid(ahora)) && (!doc || !doc.ultimoPulso || ahora - doc.ultimoPulso >= 2 * 60 * 1000)) {
    const cero = pulsoConsejo({ tokHoy: 0, ultimoEvento: null, llamadas: 0, modelo });
    if (cero.ok) doc = aplicarPulso(doc, cero.pulso, ahora - 60 * 1000).doc;
  }
  const r = aplicarPulso(doc, n.pulso, ahora);
  if (!r.guardar) return { ok: true, guardado: false, motivo: "menos de 50 s", ...s };
  await store.put(clave, JSON.stringify(r.doc));
  await limpiaPendiente(store, ahora);
  if (nueva) {
    try {
      const raw = await store.get(KEY_INDICE); const idx = raw ? JSON.parse(raw) : [];
      if (Array.isArray(idx) && !idx.includes(MAQUINA_CF)) await store.put(KEY_INDICE, JSON.stringify([...idx, MAQUINA_CF].slice(-20)));
    } catch (e) {}
  }
  return { ok: true, guardado: true, ...s };
}

/** Apunta los tokens reales de una respuesta de consejero y trata de volcarlos. Nunca lanza. */
export async function registrarConsumoConsejo(env, r, ahora = Date.now()) {
  try {
    const store = kv(env);
    const t = tokensDe(r);
    if (!store || !t) return { ok: false, motivo: !store ? "sin KV" : "sin tokens del API" };
    const rnd = Math.random().toString(36).slice(2, 8);
    await store.put(`${PREFIJO_CF}${diaMadrid(ahora)}:${ahora}-${rnd}`, "", { expirationTtl: 2 * 86400, metadata: { t, ts: ahora, llm: String((r && r.llm) || "").slice(0, 20) } });
    // La lista de KV es eventualmente consistente: la clave recién escrita puede no salir aún; se marca pendiente
    // para que el siguiente volcado (otra respuesta o /api/consumos/velocidad) la cuente.
    await store.put(KEY_PENDIENTE_CF, String(ahora), { expirationTtl: 2 * 86400 });
    return await volcarConsumoConsejo(env, ahora, r && r.llm);
  } catch (e) {
    return { ok: false, motivo: String((e && e.message) || e) };
  }
}

/** Para /api/consumos/velocidad: si hay consumo de consejeros sin volcar y ya pasaron 50 s, se vuelca. Nunca lanza. */
export async function volcarSiPendiente(env, ahora = Date.now()) {
  try {
    const store = kv(env);
    if (!store) return null;
    const p = await store.get(KEY_PENDIENTE_CF);
    if (!p) return null;
    return await volcarConsumoConsejo(env, ahora);
  } catch (e) { return null; }
}
