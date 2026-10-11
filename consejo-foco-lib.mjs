/**
 * consejo-foco-lib.mjs — foco de cada consejero y agente (r26 · Carlos, 11-10-2026 11:31). Funciones PURAS.
 * Carlos: «el subtítulo de cada consejero debe rotar cada 15 s y enseñar su PROYECTO PRINCIPAL y el DEEPAGENT con el que
 * trabaja (p. ej. «admira.live · Morfeo»); para los agentes, su proyecto actual (Trinity «admira.biz»)».
 * Fuentes, de más a menos fiable:
 *  · consejero: el foco que él mismo fija (POST /api/consejo/foco, KV consejo:foco:v1) → si no, el proyecto de su
 *    latido de presencia → si no, «Training» (Carlos, 11:33). Solo Musk tiene valor POR DEFECTO (defecto:true):
 *    «admira.live · Morfeo».
 *  · agente: el proyecto en el que quema tokens ahora (pulso) o el de su latido → si no, su pilar del reparto del finde
 *    (/reparto/reparto-finde.json, copiado aquí en REPARTO; un test vigila que coincidan).
 */
export const KEY_FOCO = "consejo:foco:v1";
// r26 (Carlos, 11:33): solo Musk tiene valor por defecto; cualquier otro consejero sin foco reportado sale «Training».
export const FOCO_DEFECTO = {
  Musk: { proyecto: "admira.live", deepagent: "Morfeo" },
};
export const TRAINING = "Training";
/** Reparto del finde largo 10-12 oct 2026 (agente → pilar), de /reparto/reparto-finde.json. */
export const REPARTO = { Morfeo: "admira.store", Neo: "admira.tv", Smith: "admira.app", "Oráculo": "admira.studio", Trinity: "admira.biz" };
export const REPARTO_HASTA = "2026-10-12T23:59:59+02:00";

const texto = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const llave = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Valida un POST { consejero, proyecto, deepagent?, nota? }. → { ok, consejero, foco } | { ok:false, error }. */
export function normalizarFoco(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { ok: false, error: "cuerpo JSON requerido" };
  const consejero = texto(body.consejero || body.persona, 40);
  const proyecto = texto(body.proyecto || body.project, 60);
  if (!consejero) return { ok: false, error: "consejero requerido (p. ej. «Musk»)" };
  if (!proyecto && !body.borrar) return { ok: false, error: "proyecto requerido (p. ej. «admira.live»); borrar:true vuelve al valor por defecto" };
  return { ok: true, consejero, borrar: body.borrar === true,
    foco: { proyecto, deepagent: texto(body.deepagent, 40) || null, nota: texto(body.nota, 160) || null, actualizado: new Date(ahora).toISOString() } };
}

/** Aplica un foco al documento KV { focos: { Nombre: foco } }. */
export function aplicarFoco(doc, n) {
  const d = doc && typeof doc === "object" && doc.focos ? { focos: { ...doc.focos } } : { focos: {} };
  const k = Object.keys(d.focos).find((x) => llave(x) === llave(n.consejero)) || n.consejero;
  if (n.borrar) delete d.focos[k]; else d.focos[k] = n.foco;
  return d;
}

/** Foco de una ficha → { proyecto, deepagent, fuente, defecto, actualizado } | null. */
export function focoDe(t, doc, ahora = Date.now()) {
  if (!t || !t.agente) return null;
  const propios = (doc && doc.focos) || {};
  const k = Object.keys(propios).find((x) => llave(x) === llave(t.agente));
  const f = k ? propios[k] : null;
  if (t.consejero) {
    if (f && f.proyecto) return { proyecto: f.proyecto, deepagent: f.deepagent || null, fuente: "consejero", defecto: false, actualizado: f.actualizado || null };
    if (t.proyecto && !t.via && t.proyecto !== "otros") return { proyecto: t.proyecto, deepagent: (FOCO_DEFECTO[t.agente] || {}).deepagent || null, fuente: "latido", defecto: false, actualizado: null };
    const d = FOCO_DEFECTO[t.agente];
    return d ? { ...d, fuente: "defecto", defecto: true, actualizado: null } : { proyecto: TRAINING, deepagent: null, fuente: "training", defecto: false, actualizado: null };
  }
  if (f && f.proyecto) return { proyecto: f.proyecto, deepagent: f.deepagent || null, fuente: "agente", defecto: false, actualizado: f.actualizado || null };
  if (t.proyecto && t.proyecto !== "otros") return { proyecto: t.proyecto, deepagent: null, fuente: "ahora", defecto: false, actualizado: null };
  const r = ahora <= Date.parse(REPARTO_HASTA) ? REPARTO[t.agente] : null;
  return r ? { proyecto: r, deepagent: null, fuente: "reparto", defecto: false, actualizado: null } : null;
}
