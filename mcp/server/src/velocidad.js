/*
 * consumos_velocidad (Carlos, 2-nov-2026): la velocidad de los agentes en tokens/hora, compartida por MCP
 * con el resto de proyectos (PortAventuraNeXT.com la primera). Solo lectura y SOLO AGREGADOS:
 * se lee /api/consumos/velocidad (admira.live) y se publica un resumen saneado — sin emails, cuentas,
 * planes, límites, apps ni superficies. Funciones puras + un lector con deps.fetch para los tests.
 */
export const FUENTE_VELOCIDAD = 'https://www.admira.live/api/consumos/velocidad';
export const ESQUEMA = 'admira.consumos.velocidad/v1';
export const CACHE_S = 10;
const H = 3600 * 1000;

const num = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Math.round(Number(x)) : null);
const txt = (x, n = 60) => String(x == null ? '' : x).slice(0, n);

/** Horas decimales transcurridas hoy en Europe/Madrid. */
export function horasHoyMadrid(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Number(p.hour) + Number(p.minute) / 60 + Number(p.second) / 3600;
}

/** Respuesta cruda de /api/consumos/velocidad → resumen público v1. */
export function resumirVelocidad(d, ahora = Date.now(), fuente = FUENTE_VELOCIDAD) {
  const generado = d && d.generado ? Date.parse(d.generado) : NaN;
  const pulso = d && d.ultimoPulso ? Date.parse(d.ultimoPulso) : NaN;
  const ref = Number.isFinite(pulso) ? pulso : generado;
  const edadS = Number.isFinite(ref) ? Math.max(0, Math.round((ahora - ref) / 1000)) : null;
  const base = { esquema: ESQUEMA, unidad: 'tokens/hora', zona: 'Europe/Madrid', fuente, consultado: new Date(ahora).toISOString() };
  if (!d || d.ok === false || d.sinDatos || !Number.isFinite(Number(d.tokHora))) {
    return { ok: false, sinDatos: true, ...base, tokHoraAhora: null, mediaHoyTokHora: null, tokHoy: null, porAgente: [], porProyecto: [],
      generado: Number.isFinite(generado) ? new Date(generado).toISOString() : null, frescura: { edadS, estado: 'sin-datos' } };
  }
  const tokHoy = num(d.tokHoy);
  const horas = Math.max(horasHoyMadrid(ahora), 0.25);
  const estado = edadS === null ? 'desconocida' : edadS <= 180 ? 'fresco' : edadS <= 1800 ? 'retrasado' : 'viejo';
  return {
    ok: true, ...base,
    tokHoraAhora: num(d.tokHora), ventanaMin: num(d.ventanaMin) || 15, metodo: txt(d.metodo, 40) || null,
    mediaHoyTokHora: tokHoy === null ? null : Math.round(tokHoy / horas),
    tokHoy, pico24hTokHora: num(d.pico24h), escalaMax: num(d.escalaMax),
    porAgente: (Array.isArray(d.porAgente) ? d.porAgente : []).slice(0, 40).map((a) => ({
      agente: txt(a.agente), maquina: txt(a.maquina) || null, tokHora: num(a.tokHora) || 0, tokHoy: num(a.tokHoy) || 0, parado: !!a.stale,
    })),
    porProyecto: (Array.isArray(d.porProyecto) ? d.porProyecto : []).slice(0, 40).map((p) => ({
      proyecto: txt(p.proyecto), tokHora: num(p.tokHora) || 0, tokHoy: num(p.tokHoy) || 0,
    })),
    proyectoAhora: d.proyectoAhora ? txt(d.proyectoAhora) : null,
    generado: Number.isFinite(generado) ? new Date(generado).toISOString() : null,
    frescura: { edadS, estado, ultimoPulso: Number.isFinite(pulso) ? new Date(pulso).toISOString() : null },
  };
}

/** Lee la fuente y devuelve el resumen (nunca lanza: sin fuente → sinDatos). */
export async function leerVelocidad(env = {}, deps = {}) {
  const url = env.CONSUMOS_VELOCIDAD_URL || FUENTE_VELOCIDAD;
  const f = deps.fetch || globalThis.fetch;
  const ahora = (deps.now || Date.now)();
  try {
    const r = await f(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return resumirVelocidad(null, ahora, url);
    return resumirVelocidad(await r.json(), ahora, url);
  } catch (e) { return resumirVelocidad(null, ahora, url); }
}

export const _H = H;
