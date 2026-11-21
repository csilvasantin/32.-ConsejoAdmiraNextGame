/**
 * deepagents-lib.mjs — registro de la comunicación entre los deepagents (agentes de la flota)
 * y los consejeros. Lógica pura, sin red: la usan /api/deepagents/registro y sus tests.
 *
 * Carlos, 21-11-2026: «la comunicación de los deepagents como tú y los consejeros, para que
 * todo quede registrado en admira.live/deepagents».
 *
 * De dónde sale: la bandeja del MCP (consejero_mensaje / consejero_bandeja / consejero_responder,
 * Worker admira-live-mcp). Esa bandeja recorta a 500 y tira primero lo leído más antiguo, así que
 * aquí cada mensaje visto se ARCHIVA por mes en KV y ya no se pierde.
 */

/** Consejero que supervisa a cada deepagent (mcp/server/src/supervisores.js + sillas.js). */
export const SUPERVISOR = Object.freeze({
  Neo: "Jobs", Trinity: "Jobs",
  Morfeo: "Musk", Oraculo: "Musk", Merovingio: "Musk",
  Cypher: "Huang",
});
/** Todos los agentes de la flota que pueden aparecer en la bandeja. */
export const AGENTES = Object.freeze(["Neo", "Morfeo", "Trinity", "Oraculo", "Merovingio", "Cypher", "Smith", "Switch", "Niobe", "Link", "Persefone", "Seraph", "Arquitecto"]);
export const CAMPOS = Object.freeze(["id", "de", "para", "texto", "maquina", "hora", "leido", "leido_en", "responde_a", "de_tipo", "para_tipo", "maquina_para"]);
export const PREFIJO = "deepagents:registro:v1:";
export const CLAVE_MESES = PREFIJO + "meses";
export const claveMes = (mes) => PREFIJO + mes;
export const LIMITE_DEFECTO = 300;
export const LIMITE_MAX = 2000;
export const MESES_MAX = 24;

const sinTilde = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
/** «oráculo» → «Oraculo»; null si no es un agente de la flota. */
export function agente(nombre) {
  const n = sinTilde(nombre);
  return AGENTES.find((a) => a.toLowerCase() === n) || null;
}

/** Deja solo los campos publicables y normaliza tipos. null si no tiene id u hora válida. */
export function limpiar(m) {
  if (!m || typeof m !== "object" || !m.id || !Number.isFinite(Date.parse(m.hora))) return null;
  const o = {};
  for (const k of CAMPOS) o[k] = m[k] !== undefined ? m[k] : null;
  o.id = String(o.id);
  o.leido = !!o.leido;
  o.de_tipo = o.de_tipo || (agente(o.de) ? "agente" : "consejero");
  o.para_tipo = o.para_tipo || (agente(o.para) ? "agente" : "consejero");
  return o;
}

/** ¿Interviene un deepagent (como remitente o como destinatario)? */
export function conAgente(m) {
  return !!m && (m.de_tipo === "agente" || m.para_tipo === "agente");
}

/** El agente y el consejero de un mensaje agente ↔ consejero. */
export function pareja(m) {
  const a = m.de_tipo === "agente" ? m.de : m.para_tipo === "agente" ? m.para : null;
  const c = m.de_tipo === "agente" ? m.para : m.de;
  return a ? { agente: a, consejero: c, clave: `${a}↔${c}` } : null;
}

/** «2026-11» del mensaje, en UTC. */
export function mesDe(hora) {
  const t = Date.parse(hora);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 7) : null;
}

/**
 * Une mensajes nuevos a un archivo (por id). Un mensaje archivado nunca se borra; solo se
 * actualiza su acuse (leído / leído_en), que es lo único que cambia con el tiempo.
 * Devuelve { lista (orden cronológico), nuevos, cambiados }.
 */
export function unir(archivo, entrantes) {
  const porId = new Map();
  for (const m of Array.isArray(archivo) ? archivo : []) if (m && m.id) porId.set(String(m.id), m);
  let nuevos = 0, cambiados = 0;
  for (const crudo of Array.isArray(entrantes) ? entrantes : []) {
    const m = limpiar(crudo);
    if (!m) continue;
    const viejo = porId.get(m.id);
    if (!viejo) { porId.set(m.id, m); nuevos++; continue; }
    if (m.leido && !viejo.leido) { porId.set(m.id, { ...viejo, leido: true, leido_en: m.leido_en || viejo.leido_en || null }); cambiados++; }
  }
  const lista = [...porId.values()].sort((a, b) => String(a.hora).localeCompare(String(b.hora)) || String(a.id).localeCompare(String(b.id)));
  return { lista, nuevos, cambiados };
}

/** Reparte por mes. */
export function porMes(mensajes) {
  const out = {};
  for (const m of mensajes) { const k = mesDe(m.hora); if (k) (out[k] = out[k] || []).push(m); }
  return out;
}

/** Resumen por pareja agente ↔ consejero, la más reciente primero. */
export function parejas(mensajes) {
  const t = new Map();
  for (const m of mensajes) {
    const p = pareja(m);
    if (!p) continue;
    const f = t.get(p.clave) || { agente: p.agente, consejero: p.consejero, supervisor: SUPERVISOR[p.agente] || null, total: 0, del_agente: 0, del_consejero: 0, pendientes: 0, primero: m.hora, ultimo: m.hora };
    f.total++;
    if (m.de_tipo === "agente") f.del_agente++; else f.del_consejero++;
    if (!m.leido) f.pendientes++;
    if (String(m.hora) < String(f.primero)) f.primero = m.hora;
    if (String(m.hora) > String(f.ultimo)) f.ultimo = m.hora;
    t.set(p.clave, f);
  }
  return [...t.values()].sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo)));
}

/** Filtra por agente, consejero, texto y fecha mínima. */
export function filtrar(mensajes, { agente: a, consejero: c, q, desde } = {}) {
  const ag = a ? sinTilde(a) : "", co = c ? sinTilde(c) : "", texto = q ? sinTilde(q) : "";
  const t0 = desde ? Date.parse(desde) : NaN;
  return mensajes.filter((m) => {
    const p = pareja(m);
    if (ag && (!p || sinTilde(p.agente) !== ag)) return false;
    if (co && (!p || sinTilde(p.consejero) !== co)) return false;
    if (Number.isFinite(t0) && Date.parse(m.hora) < t0) return false;
    if (texto && !sinTilde(`${m.de} ${m.para} ${m.maquina || ""} ${m.texto || ""}`).includes(texto)) return false;
    return true;
  });
}
