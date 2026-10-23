/**
 * Histórico de /consumos (Carlos, 23-10-2026 08:29 · mejora 5): qué hizo un AGENTE o un PROYECTO hoy, ayer, esta semana
 * (lunes–hoy) y este mes (día 1–hoy), Europe/Madrid. Mismo formato para los dos: tokens, encargos aceptados/cerrados (con
 * título) y misiones. NADA se inventa: cada bloque dice desde cuándo hay datos y, si el periodo no tiene cobertura,
 * «sin datos todavía» (null).
 * Fuentes:
 *  · Tokens por agente: libro histórico KV (desde 23-10-2026, tokHoy del pulso por agente) y, si falta el día, partes
 *    diarios de Yokup (fleet/consumo?dias=31, sin caché; ~31 días). Las ESTIMACIONES (reparto) no cuentan.
 *  · Tokens por proyecto: SOLO el libro histórico KV (porProyecto del pulso), desde 23-10-2026. Antes no hay dato.
 *  · Encargos: bandeja pública de Yokup (80 últimos por persona, ~4 días) + libro KV de encargos (desde 23-10-2026).
 *  · Misiones: api.yokup.com/fleet/missions (500 últimas resueltas, ~3 semanas, + 500 últimas de cualquier estado).
 */
import { madrid, diasPeriodo } from "./consumos-velocidad-lib.mjs";
import { persona as personaCenso, llave } from "./flota-matriz-lib.mjs";

export const KEY_HIST = "historico:dia:v1";
export const KEY_ENCARGOS = "historico:encargos:v1";
export const RETENCION_DIAS = 40;
export const MAX_ENCARGOS = 3000;
const sumaDias = (dia, n) => { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const claveProyecto = (p) => llave(String(p || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\.com$/, ""));
export const claveAgente = (a) => { const s = String(a || "").replace(/\s*·.*$/, ""); return llave(personaCenso(s) || s); };

/** Periodos: [{ id, desde, hasta }] (días AAAA-MM-DD, Madrid). */
export function periodos(ahoraMs) {
  const d = diasPeriodo(ahoraMs);
  return [{ id: "hoy", desde: d.hoy, hasta: d.hoy }, { id: "ayer", desde: d.ayer, hasta: d.ayer }, { id: "semana", desde: d.lunes, hasta: d.hoy }, { id: "mes", desde: d.dia1, hasta: d.hoy }];
}
export function diasEntre(desde, hasta) { const o = []; for (let d = desde; d <= hasta; d = sumaDias(d, 1)) o.push(d); return o; }

/** Libro histórico: anota el máximo tokHoy de cada agente y proyecto del día; poda > 40 días. Pura. */
export function anotarHistorico(libro, dia, porAgente, porProyecto, ahoraMs) {
  const out = {}, corte = sumaDias(dia, -RETENCION_DIAS);
  for (const [k, v] of Object.entries(libro && typeof libro === "object" ? libro : {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k >= corte && v) out[k] = v;
  const e = out[dia] ? { agentes: { ...(out[dia].agentes || {}) }, proyectos: { ...(out[dia].proyectos || {}) } } : { agentes: {}, proyectos: {} };
  for (const a of porAgente || []) { if (a && a.conRetraso) continue; // cuenta Cursor compartida: no atribuible (r57)
    const k = claveAgente(a && a.agente), t = Number(a && a.tokHoy); if (k && Number.isFinite(t) && t > 0) e.agentes[k] = Math.max(e.agentes[k] || 0, Math.round(t)); }
  for (const p of porProyecto || []) { const k = claveProyecto(p && p.proyecto), t = Number(p && p.tokHoy); if (k && k !== "otros" && Number.isFinite(t) && t > 0) e.proyectos[k] = Math.max(e.proyectos[k] || 0, Math.round(t)); }
  out[dia] = { ...e, ts: ahoraMs };
  return out;
}

/** Libro de encargos: une por id (el estado más nuevo gana), poda > 40 días y a MAX_ENCARGOS. Pura. */
export function anotarEncargos(lista, items, ahoraMs) {
  const m = new Map((Array.isArray(lista) ? lista : []).map((x) => [x.id, x]));
  for (const x of items || []) {
    if (!x || !x.id) continue;
    m.set(x.id, { id: x.id, etiqueta: x.etiqueta || null, persona: x.target_persona || null, proyecto: x.project_id || null, texto: String(x.text || "").slice(0, 160),
      status: x.status || null, ts: Number(x.ts) || null, ack_at: Number(x.ack_at) || null, done_at: Number(x.done_at) || null, de: x.from_name || null });
  }
  const corte = ahoraMs / 1000 - RETENCION_DIAS * 86400;
  return [...m.values()].filter((x) => (x.done_at || x.ack_at || x.ts || 0) >= corte).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, MAX_ENCARGOS);
}

const diaDe = (s) => (s ? madrid(s * 1000).dia : null);
const casa = (tipo, nombre) => { const k = tipo === "proyecto" ? claveProyecto(nombre) : claveAgente(nombre); return (v) => !!v && (tipo === "proyecto" ? claveProyecto(v) : claveAgente(v)) === k; };

/** Tokens por día de la entidad: { dia: { tok, fuente } } y desde cuándo hay cobertura. */
export function tokensPorDia({ tipo, nombre, libro, partes }) {
  const out = {}, k = tipo === "proyecto" ? claveProyecto(nombre) : claveAgente(nombre);
  let desde = null;
  for (const [dia, e] of Object.entries(libro || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    desde = !desde || dia < desde ? dia : desde;
    const t = e && (tipo === "proyecto" ? e.proyectos : e.agentes) && (tipo === "proyecto" ? e.proyectos : e.agentes)[k];
    out[dia] = { tok: Number(t) || 0, fuente: "libro histórico" };
  }
  if (tipo === "agente" && Array.isArray(partes)) {
    const por = {};
    for (const p of partes) {
      const d = p && p.datos;
      if (!p || !d || !/^\d{4}-\d{2}-\d{2}$/.test(p.dia) || !Number.isFinite(d.total) || /ESTIMACI[OÓ]N/i.test(d.causa || "")) continue;
      desde = !desde || p.dia < desde ? p.dia : desde;
      if (claveAgente(d.persona || p.owner) !== k) continue;
      const o = (por[p.dia] = por[p.dia] || {}), ko = p.owner + "|" + p.machine;
      o[ko] = Math.max(o[ko] || 0, Math.max(0, d.total - (Number(d.cache) || 0)));
    }
    for (const [dia, o] of Object.entries(por)) if (!out[dia] || !out[dia].tok) out[dia] = { tok: Object.values(o).reduce((a, b) => a + b, 0), fuente: "partes Yokup (sin caché)" };
  }
  return { dias: out, desde };
}

/** Histórico de una entidad. fuentes: { libro, partes, encargos:[items], misiones:[...], minPartes, minEncargos, minMisiones }. */
export function historico({ tipo, nombre, ahoraMs, libro = null, partes = null, encargos = [], misiones = null }) {
  const es = casa(tipo, nombre);
  const tk = tokensPorDia({ tipo, nombre, libro, partes });
  const encDe = (encargos || []).filter((x) => (tipo === "proyecto" ? es(x.proyecto) : es(x.persona)));
  const minEnc = (encargos || []).reduce((m, x) => { const d = diaDe(x.ts || x.ack_at || x.done_at); return d && (!m || d < m) ? d : m; }, null);
  const misDe = (misiones || []).filter((m) => (tipo === "proyecto" ? es(m.project_id || m.project) : es(m.assignee) || es(m.persona)));
  const minMis = (misiones || []).reduce((m, x) => { const d = diaDe(Math.floor((x.created_at || 0) / 1000)); return d && (!m || d < m) ? d : m; }, null);
  const tit = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 140);
  return {
    tipo, nombre,
    periodos: periodos(ahoraMs).map((p) => {
      const dias = diasEntre(p.desde, p.hasta);
      const conTok = dias.filter((d) => tk.dias[d]);
      const cub = (min) => (min && min <= p.hasta ? (min > p.desde ? "parcial" : "completa") : null);
      const enRango = (s) => { const d = diaDe(s); return d && d >= p.desde && d <= p.hasta; };
      const cubTok = tk.desde && tk.desde <= p.hasta ? (tk.desde > p.desde ? "parcial" : "completa") : null;
      return {
        id: p.id, desde: p.desde, hasta: p.hasta,
        tokens: cubTok && conTok.length ? { total: conTok.reduce((n, d) => n + tk.dias[d].tok, 0), diasConDatos: conTok.length, dias: dias.length, cobertura: cubTok, datosDesde: tk.desde,
          fuentes: [...new Set(conTok.map((d) => tk.dias[d].fuente))] } : null,
        encargos: cub(minEnc) ? { cobertura: cub(minEnc), datosDesde: minEnc,
          aceptados: encDe.filter((x) => enRango(x.ack_at)).map((x) => ({ id: x.id, etiqueta: x.etiqueta, titulo: tit(x.texto), persona: x.persona, proyecto: x.proyecto, cuando: x.ack_at })),
          cerrados: encDe.filter((x) => /^(done|completed)$/.test(x.status || "") && enRango(x.done_at)).map((x) => ({ id: x.id, etiqueta: x.etiqueta, titulo: tit(x.texto), persona: x.persona, proyecto: x.proyecto, cuando: x.done_at })) } : null,
        misiones: cub(minMis) ? { cobertura: cub(minMis), datosDesde: minMis,
          lista: misDe.filter((m) => enRango(Math.floor((m.status === "resolved" ? m.updated_at : m.created_at) / 1000)) || enRango(Math.floor(m.created_at / 1000)))
            .map((m) => ({ id: m.id, titulo: tit(m.subject), estado: m.status, proyecto: m.project_id || null, quien: m.assignee || null, cuando: Math.floor((m.updated_at || m.created_at) / 1000) })) } : null,
      };
    }),
  };
}
