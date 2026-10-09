/**
 * Líneas de código escritas por los agentes vs tokens, en el MISMO eje de tiempo (GrokBotBox, 09-10-2026 · r30).
 * Carlos: debajo de la gráfica de tok/min, una segunda con las líneas de código que escriben los agentes.
 * Fuentes:
 *  - commits (tools/lineas-commits.py en el box, cada 15 min → POST /api/consumos/lineas): líneas añadidas por
 *    commit en la rama principal de cada repo de la Galaxia, mismos filtros de ficheros que el HACKEO, con agente.
 *  - si aún no hay commits: las fotos de /api/control/lineas (00:00 y 12:00): Δ entre fotos, escalonado.
 *  - tokens: la serie del pulso (retención ~26 h); más atrás, null («sin datos»), nunca un cero inventado.
 * Funciones PURAS.
 */
import { seriePorMinuto } from "./consumos-pulso-lib.mjs";

const MIN = 60000;
export const RANGOS = {
  "1h": { n: 60, pasoMin: 1, etiqueta: "−60 min" },
  "24h": { n: 48, pasoMin: 30, etiqueta: "−24 h" },
  "7d": { n: 42, pasoMin: 240, etiqueta: "−7 d" },
};
export const rangoValido = (r) => (RANGOS[r] ? r : "1h");

/** Inicios de cubo (ms) alineados al paso; el último cubo contiene «ahora». */
export function cubos(rango, ahora) {
  const { n, pasoMin } = RANGOS[rangoValido(rango)];
  const paso = pasoMin * MIN, fin = Math.floor(ahora / paso) * paso;
  return Array.from({ length: n }, (_, i) => fin - (n - 1 - i) * paso);
}

/** Commits [{t (s), a, d, g, r}] → por cubo {ts, lineas, commits} + totales por agente y proyecto en el rango. */
export function lineasPorCubo(commits, rango, ahora) {
  const ini = cubos(rango, ahora), paso = RANGOS[rangoValido(rango)].pasoMin * MIN;
  const serie = ini.map((ts) => ({ ts, lineas: 0, commits: 0 }));
  const porAgente = {}, porProyecto = {};
  for (const c of commits || []) {
    const ms = Number(c.t) * 1000;
    if (!(ms >= ini[0] && ms < ini[ini.length - 1] + paso)) continue;
    const k = Math.floor((ms - ini[0]) / paso), a = Math.max(0, Number(c.a) || 0);
    serie[k].lineas += a; serie[k].commits += 1;
    const g = c.g || "sin atribuir";
    (porAgente[g] = porAgente[g] || { agente: g, lineas: 0, commits: 0 }).lineas += a; porAgente[g].commits += 1;
    const r = c.r || "?";
    porProyecto[r] = (porProyecto[r] || 0) + a;
  }
  return {
    serie, total: serie.reduce((s, x) => s + x.lineas, 0),
    porAgente: Object.values(porAgente).sort((x, y) => y.lineas - x.lineas),
    porProyecto: Object.entries(porProyecto).map(([proyecto, lineas]) => ({ proyecto, lineas })).sort((x, y) => y.lineas - x.lineas),
  };
}

/** Fotos del índice de /api/control/lineas → pseudo-commits: Δ total entre fotos consecutivas, en la hora de la foto. */
export function commitsDeFotos(indice) {
  const l = (Array.isArray(indice) ? indice : []).filter((e) => e && Number.isFinite(e.total) && e.ts);
  const out = [];
  for (let i = 1; i < l.length; i++) {
    const d = l[i].total - l[i - 1].total;
    if (d > 0) out.push({ t: Math.floor(Date.parse(l[i].ts) / 1000), a: d, d: 0, g: "foto (sin agente)", r: "Galaxia" });
  }
  return out;
}

/** Tokens por cubo desde las series del pulso; cubos anteriores a la primera muestra → null. */
export function tokensPorCubo(conSerie, rango, ahora) {
  const ini = cubos(rango, ahora), { pasoMin } = RANGOS[rangoValido(rango)];
  const minutos = ini.length * pasoMin;
  const porMin = seriePorMinuto(conSerie || [], ahora, minutos);
  let primera = Infinity;
  for (const a of conSerie || []) for (const p of a.serie || []) primera = Math.min(primera, p[0] * 1000);
  // seriePorMinuto acaba en el minuto de «ahora»; los cubos también: se agrupan de pasoMin en pasoMin desde el final.
  const out = ini.map((ts) => ({ ts, tok: 0 }));
  const desfase = porMin.length - minutos;
  for (let i = 0; i < porMin.length; i++) {
    const k = Math.floor((i - desfase) / pasoMin);
    if (k >= 0 && k < out.length) out[k].tok += porMin[i].tok;
  }
  // El cubo cuenta si alguna muestra lo cubre (la primera muestra no tiene incremento previo).
  return out.map((x) => (x.ts + pasoMin * MIN <= primera ? { ts: x.ts, tok: null } : x));
}

/** Medianoche de Madrid (ms) del día de «ahora». */
export function inicioDiaMadrid(ahora) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(ahora)).map((x) => [x.type, x.value]));
  const transcurrido = ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000;
  return Math.floor(ahora / 1000) * 1000 - transcurrido;
}

/** Líneas escritas hoy (Madrid) y por agente. */
export function lineasHoy(commits, ahora) {
  const ini = inicioDiaMadrid(ahora) / 1000, por = {};
  let total = 0;
  for (const c of commits || []) if (Number(c.t) >= ini) { const a = Math.max(0, Number(c.a) || 0); total += a; por[c.g || "sin atribuir"] = (por[c.g || "sin atribuir"] || 0) + a; }
  return { total, porAgente: Object.entries(por).map(([agente, lineas]) => ({ agente, lineas })).sort((x, y) => y.lineas - x.lineas) };
}

/** Tokens por línea (null si no tiene sentido: sin líneas o sin tokens). */
export function tokPorLinea(tokens, lineas) {
  const t = Number(tokens), l = Number(lineas);
  return t > 0 && l > 0 ? Math.round(t / l) : null;
}

/** Normaliza el POST del recolector. */
export function normalizarDoc(body, ahora) {
  if (!body || !Array.isArray(body.commits)) return { error: "falta commits[]" };
  const corte = Math.floor(ahora / 1000) - 9 * 86400;
  const commits = body.commits.filter((c) => c && Number.isFinite(Number(c.t)) && Number(c.t) >= corte)
    .map((c) => ({ s: String(c.s || "").slice(0, 12), t: Number(c.t), a: Math.max(0, Number(c.a) || 0), d: Math.max(0, Number(c.d) || 0),
      g: String(c.g || "sin atribuir").slice(0, 40), m: c.m ? String(c.m).slice(0, 40) : null, r: String(c.r || "?").slice(0, 40) }))
    .slice(-20000);
  return { doc: { ts: Number(body.ts) || Math.floor(ahora / 1000), metodo: String(body.metodo || "").slice(0, 200),
    repos: (Array.isArray(body.repos) ? body.repos : []).slice(0, 30).map((r) => ({ repo: String(r.repo || ""), proyecto: String(r.proyecto || ""), commits: Number(r.commits) || 0, error: r.error ? String(r.error).slice(0, 200) : undefined })),
    commits } };
}
