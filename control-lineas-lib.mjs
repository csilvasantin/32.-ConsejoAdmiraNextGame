/**
 * Histórico de LÍNEAS DE CÓDIGO de la Galaxia AdmiraNeXT (GrokBotBox, 09-10-2026).
 *
 * Fotos (snapshots) dos veces al día — 00:00 y 12:00 de Madrid, las mismas horas que las
 * lecturas de consumos — con, por proyecto, {id, repo, commit, ficheros, lineas, lineas_unicas}.
 * Mismo método que el Σ del HACKEO (tools/hackeo-corpus.py): líneas NO vacías de ficheros
 * fuente, sin node_modules/dist/vendor/minificados ni ficheros sensibles; «lineas_unicas» es
 * lo que el proyecto aporta al Σ sin duplicar (un fichero idéntico cuenta una vez).
 *
 * Funciones puras (sin KV ni red): se prueban en control-lineas.test.mjs.
 */
export const ZONA = "Europe/Madrid";
export const SLOTS = ["00", "12"];
export const MAX_PROYECTOS = 40;

const RE_ID = /^[a-z0-9][a-z0-9._-]{0,39}$/i;
const RE_REPO = /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/;
const RE_COMMIT = /^[0-9a-f]{4,40}$/i;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha (AAAA-MM-DD) y hora (0-23) de Madrid de un instante (ms). */
export function madrid(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}

/** Ranura de un instante: antes de las 12:00 de Madrid → «00» de ese día; después → «12». */
export function fechaSlot(ms) {
  const { fecha, hora } = madrid(ms);
  return { fecha, slot: hora < 12 ? "00" : "12" };
}

export const claveSnap = (fecha, slot) => `control:lineas:snap:${fecha}:${slot}`;
export const KEY_INDICE = "control:lineas:index:v1";

const entero = (v) => (Number.isInteger(v) && v >= 0 && v < 1e9 ? v : null);

/** Valida y normaliza el cuerpo del POST. → { snap } | { error } */
export function normalizarSnapshot(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { error: "cuerpo vacío" };
  const ts = Date.parse(body.ts);
  if (!Number.isFinite(ts)) return { error: "ts inválido (ISO 8601 con zona, p. ej. 2026-10-09T12:00:00+02:00)" };
  if (ts > ahora + 10 * 60 * 1000) return { error: "ts en el futuro" };
  let { fecha, slot } = fechaSlot(ts);
  if (body.slot != null) {
    const s = String(body.slot).padStart(2, "0");
    if (!SLOTS.includes(s)) return { error: "slot inválido (00 o 12)" };
    slot = s;
  }
  if (body.fecha != null) {
    if (!RE_FECHA.test(String(body.fecha))) return { error: "fecha inválida (AAAA-MM-DD)" };
    if (String(body.fecha) !== fecha) return { error: "la fecha no casa con ts (no se rellenan días pasados)" };
  }
  const ps = body.proyectos;
  if (!Array.isArray(ps) || !ps.length) return { error: "faltan proyectos" };
  if (ps.length > MAX_PROYECTOS) return { error: "demasiados proyectos" };
  const vistos = new Set(), proyectos = [];
  for (const p of ps) {
    if (!p || typeof p !== "object") return { error: "proyecto inválido" };
    const id = String(p.id || "");
    if (!RE_ID.test(id)) return { error: `id inválido: ${id.slice(0, 40)}` };
    if (vistos.has(id)) return { error: `id repetido: ${id}` };
    vistos.add(id);
    const repo = String(p.repo || "");
    if (!RE_REPO.test(repo)) return { error: `repo inválido en ${id}` };
    const commit = p.commit == null || p.commit === "" ? "" : String(p.commit);
    if (commit && !RE_COMMIT.test(commit)) return { error: `commit inválido en ${id}` };
    const ficheros = entero(p.ficheros), lineas = entero(p.lineas);
    if (ficheros == null || lineas == null) return { error: `ficheros/lineas inválidos en ${id}` };
    const out = { id, repo, commit: commit.slice(0, 12), ficheros, lineas };
    if (p.proyecto != null) out.proyecto = String(p.proyecto).slice(0, 60);
    if (p.lineas_unicas != null) {
      const u = entero(p.lineas_unicas);
      if (u == null || u > lineas) return { error: `lineas_unicas inválidas en ${id}` };
      out.lineas_unicas = u;
    }
    proyectos.push(out);
  }
  const conUnicas = proyectos.every((p) => p.lineas_unicas != null);
  const total = conUnicas ? proyectos.reduce((s, p) => s + p.lineas_unicas, 0) : proyectos.reduce((s, p) => s + p.lineas, 0);
  const bruto = proyectos.reduce((s, p) => s + p.lineas, 0);
  const metodo = typeof body.metodo === "string" ? body.metodo.slice(0, 200) : "hackeo-corpus";
  return { snap: { fecha, slot, ts: new Date(ts).toISOString(), proyectos, total, total_bruto: bruto, sin_duplicar: conUnicas, metodo } };
}

/** Entrada compacta del índice (una lectura de KV basta para pintar la historia). */
export function entradaIndice(snap) {
  const p = {};
  for (const x of snap.proyectos) p[x.id] = [x.lineas, x.lineas_unicas == null ? null : x.lineas_unicas, x.ficheros, x.commit, x.repo, x.proyecto || x.id];
  return { fecha: snap.fecha, slot: snap.slot, ts: snap.ts, total: snap.total, total_bruto: snap.total_bruto, p };
}

/** Añade (o sustituye la misma fecha+ranura) y ordena cronológicamente. Tope: ~1 año. */
export function anadirIndice(indice, entrada, max = 800) {
  const lista = (Array.isArray(indice) ? indice : []).filter((e) => !(e.fecha === entrada.fecha && e.slot === entrada.slot));
  lista.push(entrada);
  lista.sort((a, b) => (a.fecha + a.slot < b.fecha + b.slot ? -1 : a.fecha + a.slot > b.fecha + b.slot ? 1 : 0));
  return lista.slice(-max);
}

/** AAAA-MM-DD menos n días (calendario, sin zona). */
export function restarDias(fecha, n) {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Última foto de un día dado (o null). */
function ultimaDelDia(indice, fecha) {
  let r = null;
  for (const e of indice) if (e.fecha === fecha) r = e;
  return r;
}

const valor = (e, id) => (e && e.p && e.p[id] ? e.p[id][0] : null);
const resta = (a, b) => (a == null || b == null ? null : a - b);

/**
 * Resumen para la vista: por proyecto hoy/ayer/Δ día/Δ semana (+ serie) y el total (Σ sin duplicar).
 * «Ayer» y «hace una semana» solo si HAY foto de ese día: nunca se inventa un día pasado.
 */
export function resumir(indice) {
  const lista = Array.isArray(indice) ? indice : [];
  if (!lista.length) return { fotos: 0, ultima: null, proyectos: [], total: null, dias: 0, nota: "aún no hay ninguna foto" };
  const ult = lista[lista.length - 1];
  const ayer = ultimaDelDia(lista, restarDias(ult.fecha, 1));
  const semana = ultimaDelDia(lista, restarDias(ult.fecha, 7));
  const ids = [];
  for (const e of lista) for (const id of Object.keys(e.p || {})) if (!ids.includes(id)) ids.push(id);
  const proyectos = ids.map((id) => {
    const info = (ult.p && ult.p[id]) || lista.slice().reverse().find((e) => e.p && e.p[id]).p[id];
    const hoy = valor(ult, id), a = valor(ayer, id), s = valor(semana, id);
    return {
      id, proyecto: info[5] || id, repo: info[4], commit: info[3], ficheros: info[2], unicas: info[1],
      hoy, ayer: a, deltaDia: resta(hoy, a), deltaSemana: resta(hoy, s),
      serie: lista.map((e) => valor(e, id)),
    };
  }).sort((x, y) => (y.hoy || 0) - (x.hoy || 0));
  const dias = new Set(lista.map((e) => e.fecha)).size;
  return {
    fotos: lista.length, dias, ultima: { fecha: ult.fecha, slot: ult.slot, ts: ult.ts },
    etiquetas: lista.map((e) => `${e.fecha} ${e.slot}:00`),
    proyectos,
    total: {
      hoy: ult.total, bruto: ult.total_bruto, ayer: ayer ? ayer.total : null,
      deltaDia: resta(ult.total, ayer ? ayer.total : null), deltaSemana: resta(ult.total, semana ? semana.total : null),
      serie: lista.map((e) => e.total),
    },
    nota: dias <= 1 ? "el histórico empieza hoy" : null,
  };
}
