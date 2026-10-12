/**
 * diario-lib.mjs — histórico de partes horarios (#5796 · modo experto /diario). Puro: lo prueba diario.test.mjs.
 * Un doc por día (fecha de Madrid): { fecha, partes:[{ agente, hora, texto, ts }] }, orden cronológico por hora.
 */
import { tapar } from "./visor-lib.mjs";
export const AGENTES_DIARIO = ["Neo", "Morfeo", "Trinity", "Oráculo", "Smith", "Merovingio"];
export const MAX_PARTES_DIA = 400;
export const KEY_DIARIO = "diario:v1:";
const sinTilde = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Fecha (YYYY-MM-DD) de un instante en Madrid. */
export function fechaMadrid(ms) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
/** "" | "hoy" | "ayer" | "DD.MM.AA" | "YYYY-MM-DD" → { ok, fecha } | { ok:false, error } */
export function parseFecha(arg, ahora = Date.now()) {
  const s = String(arg || "").trim().toLowerCase();
  if (!s || s === "hoy") return { ok: true, fecha: fechaMadrid(ahora) };
  if (s === "ayer") return { ok: true, fecha: fechaMadrid(ahora - 86400000) };
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/), y, mo, d;
  if (m) { d = +m[1]; mo = +m[2]; y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else return { ok: false, error: "fecha: usa hoy, ayer o DD.MM.AA (p. ej. 12.10.26)" };
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return { ok: false, error: "fecha inexistente: " + s };
  return { ok: true, fecha: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}
/** POST { agente, texto, hora? "HH:MM", fecha? } → { ok, parte, fecha } */
export function normalizarParte(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { ok: false, error: "cuerpo vacío" };
  const ag = AGENTES_DIARIO.find((a) => sinTilde(a) === sinTilde(body.agente));
  if (!ag) return { ok: false, error: "agente: uno de " + AGENTES_DIARIO.join(", ") };
  const texto = tapar(String(body.texto == null ? "" : body.texto).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim()).slice(0, 4000);
  if (!texto) return { ok: false, error: "falta texto" };
  const f = parseFecha(body.fecha, ahora);
  if (!f.ok) return f;
  let hora = String(body.hora || "").trim();
  if (!hora) hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ahora));
  const hm = hora.match(/^(\d{1,2}):(\d{2})$/);
  if (!hm || +hm[1] > 23 || +hm[2] > 59) return { ok: false, error: "hora: HH:MM" };
  hora = String(+hm[1]).padStart(2, "0") + ":" + hm[2];
  return { ok: true, fecha: f.fecha, parte: { agente: ag, hora, texto, ts: ahora } };
}
/** Añade/reemplaza (mismo agente y hora = el último gana) y ordena cronológicamente. */
export function anadirParte(doc, fecha, parte) {
  const partes = ((doc && doc.partes) || []).filter((p) => !(p.agente === parte.agente && p.hora === parte.hora));
  partes.push(parte);
  partes.sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : AGENTES_DIARIO.indexOf(a.agente) - AGENTES_DIARIO.indexOf(b.agente)));
  return { fecha, partes: partes.slice(-MAX_PARTES_DIA), actualizado: parte.ts };
}
/** Texto para el CLI del modo experto. */
export function formatear(doc, fecha) {
  const p = (doc && doc.partes) || [];
  if (!p.length) return [`📓 Diario ${fecha}: sin partes guardados todavía.`];
  const [y, m, d] = fecha.split("-");
  return [`📓 Diario ${d}.${m}.${y.slice(2)} · ${p.length} partes`].concat(p.map((x) => `${x.hora} · ${x.agente} — ${x.texto}`));
}
