/*
 * avisos.js — avisos AL MOMENTO entre consejeros (webhook propio por consejero).
 *
 * Propuesta de Elon Musk, aprobada por Carlos el 19-oct-2026 (solo preview).
 * Hoy un mensaje de consejero_mensaje/consejero_responder avisa por encargo + Telegram
 * y el destinatario lo ve en su revisión de cada 15 min. Si el destinatario registra un
 * webhook (consejero_webhook_registrar), además se le hace un POST en el instante:
 *   { tipo:'consejero_mensaje', id, de, para, resumen, responde_a, hora, url }
 * Nunca el cuerpo completo: solo un resumen corto + id; se lee con consejero_bandeja.
 *
 * - Registro en KV (ADMIRA_LIVE_DESDE) con prefijo propio `consejero-webhook:v1:<Silla>`.
 * - El secreto opcional se guarda y se manda en una cabecera; al leer nunca se devuelve.
 * - Solo el propio consejero con SU clave registra/ve/borra su webhook (no la compartida
 *   del Consejo ni un agente). Admin opcional: env.AVISOS_ADMIN = "Jobs,Musk" (sillas).
 * - Anti-SSRF básico: solo https, sin credenciales en la URL, sin IPs literales privadas,
 *   localhost, .local/.internal, ni puertos raros; redirect: 'manual'.
 * - Anti-bucle: no se avisa si de === para, ni a mensajes de tipo agente→agente, y la
 *   petición lleva x-admira-aviso para que el receptor no reenvíe en cadena.
 * - Envío fuera de la respuesta (waitUntil), timeout 5 s, 1 reintento; nunca rompe el
 *   guardado. Último resultado (ok/código/fecha/ms) en `consejero-webhook-estado:v1:<Silla>`.
 */

import { sillaCanonica } from './sillas.js';
import { personaCanonica, AGENTES_FLOTA } from './flota.js';

const agenteDe = (n) => { const a = personaCanonica(n); return a && AGENTES_FLOTA.includes(a) ? a : null; };

export const PREFIJO = 'consejero-webhook:v1:';
export const PREFIJO_ESTADO = 'consejero-webhook-estado:v1:';
export const TIMEOUT_MS = 5000;
const CABECERA_DEF = 'x-admira-secreto';

function ipv4Privada(h) {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m; // cualquier IP literal v4 se rechaza (privada o pública): exige dominio
}

export function validarUrl(cruda) {
  let u;
  try { u = new URL(String(cruda || '').trim()); } catch { throw new Error('la URL del webhook no es válida'); }
  if (u.protocol !== 'https:') throw new Error('el webhook tiene que ser https');
  if (u.username || u.password) throw new Error('la URL no puede llevar usuario ni contraseña: usa el secreto');
  if (u.port && !['443', '8443'].includes(u.port)) throw new Error('puerto no permitido (solo 443 u 8443)');
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) throw new Error('host no permitido');
  if (h.startsWith('[') || h.includes(':')) throw new Error('no se admiten IPs literales: usa un dominio');
  if (ipv4Privada(h) || /^\d+$/.test(h) || /^0x/i.test(h)) throw new Error('no se admiten IPs literales: usa un dominio');
  if (!h.includes('.')) throw new Error('host no permitido');
  if (u.href.length > 500) throw new Error('la URL pasa de 500 caracteres');
  return u.href;
}

function validarCabecera(c) {
  const n = String(c || CABECERA_DEF).trim().toLowerCase();
  if (!/^[a-z0-9-]{3,60}$/.test(n)) throw new Error('nombre de cabecera no válido');
  if (['host', 'content-length', 'content-type', 'cookie', 'transfer-encoding', 'connection'].includes(n)) throw new Error('esa cabecera no se puede usar');
  return n;
}

/* Quién puede tocar el webhook de `silla`: el propio consejero con su clave, o un admin. */
export function exigirDueno(identidad, declarado, env = {}) {
  if (!identidad) throw new Error('sin identidad: hace falta la clave propia del consejero');
  if (identidad.tipo === 'agente') {
    // 19-10-2026: un agente registra SU webhook (solo el suyo) con su propia clave.
    const yoA = agenteDe(identidad.persona);
    if (!yoA) throw new Error('agente desconocido');
    if (declarado && agenteDe(declarado) !== yoA) throw new Error(`esta clave es la de ${yoA} y solo gestiona su propio webhook`);
    return yoA;
  }
  if (identidad.tipo === 'consejo-compartido') throw new Error('con la clave compartida del Consejo no: usa la clave propia de tu silla');
  const yo = sillaCanonica(identidad.persona);
  if (!yo || identidad.tipo !== 'consejero') throw new Error('esta clave no es de un consejero');
  const silla = declarado ? sillaCanonica(declarado) : yo;
  if (!silla) throw new Error('silla desconocida');
  const admins = String(env.AVISOS_ADMIN || '').split(',').map((s) => sillaCanonica(s.trim())).filter(Boolean);
  if (silla !== yo && !admins.includes(yo)) throw new Error(`esta clave es la de ${yo} y no gestiona el webhook de ${silla}`);
  return silla;
}

export function resumen(texto, max = 140) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function crearAvisos(env = {}, deps = {}) {
  const kv = env.ADMIRA_LIVE_DESDE;
  const ahora = deps.now || (() => new Date());
  const fetcher = deps.fetchWebhook || deps.fetch || ((u, i) => globalThis.fetch(u, i));
  const sitio = String(env.SITIO || 'https://www.admira.live').replace(/\/$/, '');
  const timeout = deps.timeoutMs || TIMEOUT_MS;
  const hayKv = () => kv && typeof kv.get === 'function';

  async function leerRegistro(silla) {
    if (!hayKv()) return null;
    const d = await kv.get(PREFIJO + silla, 'json').catch(() => null);
    return d && d.url ? d : null;
  }
  async function leerEstado(silla) {
    if (!hayKv()) return null;
    return kv.get(PREFIJO_ESTADO + silla, 'json').catch(() => null);
  }
  const publico = (silla, r, estado) => (r ? {
    silla, url: r.url, cabecera: r.cabecera, secreto: r.secreto ? 'definido (no se muestra)' : 'no', registrado: r.registrado, por: r.por,
    ultimo: estado || null,
  } : { silla, url: null, ultimo: estado || null });

  async function registrar({ url, secreto, cabecera, silla }, identidad) {
    const s = exigirDueno(identidad, silla, env);
    if (!kv || typeof kv.put !== 'function') throw new Error('sin KV: los avisos no están configurados');
    const sec = secreto == null ? '' : String(secreto);
    if (sec.length > 200) throw new Error('el secreto pasa de 200 caracteres');
    if (/[\r\n]/.test(sec)) throw new Error('el secreto no puede llevar saltos de línea');
    const r = { url: validarUrl(url), cabecera: validarCabecera(cabecera), secreto: sec, registrado: ahora().toISOString(), por: sillaCanonica(identidad.persona) };
    await kv.put(PREFIJO + s, JSON.stringify(r));
    return { ok: true, webhook: publico(s, r, null) };
  }
  async function ver({ silla } = {}, identidad) {
    const s = exigirDueno(identidad, silla, env);
    return { ok: true, webhook: publico(s, await leerRegistro(s), await leerEstado(s)) };
  }
  async function borrar({ silla } = {}, identidad) {
    const s = exigirDueno(identidad, silla, env);
    if (!kv || typeof kv.delete !== 'function') throw new Error('sin KV');
    const habia = !!(await leerRegistro(s));
    await kv.delete(PREFIJO + s);
    await kv.delete(PREFIJO_ESTADO + s);
    return { ok: true, silla: s, borrado: habia };
  }

  async function intentar(reg, carga) {
    const t0 = Date.now();
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const temporizador = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    try {
      const headers = { 'content-type': 'application/json', 'user-agent': 'admira-live-avisos/1.0', 'x-admira-aviso': 'consejero_mensaje' };
      if (reg.secreto) headers[reg.cabecera || CABECERA_DEF] = reg.secreto;
      const r = await fetcher(reg.url, { method: 'POST', headers, body: JSON.stringify(carga), redirect: 'manual', signal: ctl ? ctl.signal : undefined });
      return { ok: r.status >= 200 && r.status < 300, codigo: r.status, ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, codigo: null, error: e && e.name === 'AbortError' ? 'timeout' : 'error de red', ms: Date.now() - t0 };
    } finally { if (temporizador) clearTimeout(temporizador); }
  }

  /* Avisa al destinatario del mensaje si tiene webhook. Nunca lanza. */
  async function avisar(m) {
    try {
      if (!m || !m.para) return { ok: false, omitido: 'sin destinatario' };
      if (m.de === m.para) return { ok: false, omitido: 'anti-bucle: mensaje a sí mismo' };
      const silla = m.para_tipo === 'agente' ? agenteDe(m.para) : sillaCanonica(m.para);
      if (!silla) return { ok: false, omitido: 'destinatario desconocido' };
      const reg = await leerRegistro(silla);
      if (!reg) return { ok: false, omitido: 'sin webhook' };
      let url;
      try { url = validarUrl(reg.url); } catch (e) { return { ok: false, omitido: e.message }; }
      const carga = {
        tipo: 'consejero_mensaje', id: m.id, de: m.de, de_tipo: m.de_tipo || 'consejero', para: silla, para_tipo: m.para_tipo || 'consejero',
        resumen: resumen(m.texto), responde_a: m.responde_a || null, hora: m.hora,
        url: `${sitio}/consejero.html?con=${encodeURIComponent(silla)}#${encodeURIComponent(m.id)}`,
        leer: 'consejero_bandeja (MCP admira-live) con tu clave',
      };
      let res = await intentar({ ...reg, url }, carga);
      let intentos = 1;
      if (!res.ok && !(res.codigo >= 400 && res.codigo < 500 && res.codigo !== 408 && res.codigo !== 429)) {
        res = await intentar({ ...reg, url }, carga); intentos = 2;
      }
      const estado = { ok: res.ok, codigo: res.codigo, error: res.error || null, ms: res.ms, intentos, mensaje: m.id, fecha: ahora().toISOString() };
      if (kv && typeof kv.put === 'function') await kv.put(PREFIJO_ESTADO + silla, JSON.stringify(estado)).catch(() => {});
      return estado;
    } catch {
      return { ok: false, error: 'fallo interno del aviso' };
    }
  }

  /* Programa el aviso sin bloquear la respuesta (waitUntil si hay). */
  function programar(m) {
    const p = avisar(m).catch(() => null);
    if (typeof deps.waitUntil === 'function') { deps.waitUntil(p); return { programado: true }; }
    return { programado: true, promesa: p };
  }

  return { registrar, ver, borrar, avisar, programar };
}
