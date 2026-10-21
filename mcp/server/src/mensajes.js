/*
 * mensajes.js — bandeja privada entre consejeros (las dos cuentas).
 *
 * Un mensaje lleva remitente, destinatario, máquina y hora. Se guarda en el
 * Durable Object BandejaConsejo (bandeja-do.js, fuertemente consistente: una sola
 * instancia serializa TODAS las escrituras) y se lee en el chat de admira.live.
 * Sin binding BANDEJA (tests, local) cae al KV con un cerrojo en memoria.
 * 19-10-2026: con el KV (eventualmente consistente) se perdían mensajes en ráfaga
 * (lectura-modificación-escritura sobre una lista vieja) y el anti-bucle no saltaba.
 * No admite secretos.
 * Jensen es la silla Huang. Elon es la silla Musk.
 *
 * Canal agente → consejero: un agente de la flota solo puede escribir a su
 * consejero supervisor (supervisores.js), leer lo que le llega y responder.
 */

import { sillaCanonica } from './sillas.js';
import { supervisorDe, agenteCanonico } from './supervisores.js';
import { norm, AGENTES_FLOTA, CASA_AGENTE, personaCanonica } from './flota.js';
import { crearAvisos, resumen as resumenCorto } from './avisos.js';

export const CLAVE_KV = 'consejero-mensajes:v1';
export const TOPE = 500;

const SECRETO = /bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9]{10,}|api[_-]?key\s*[:=]\s*\S+|mcp[_-]?key\s*[:=]|password\s*[:=]\s*\S+|token\s*[:=]\s*[a-z0-9._-]{12,}/i;

export function pareceSecreto(texto) {
  return SECRETO.test(String(texto || ''));
}

export function exigirConsejero(identidad, declarado) {
  const silla = sillaCanonica(declarado);
  if (!silla) throw new Error('de o yo tiene que ser un consejero: Wozniak, Jobs, Lucas, Disney, Musk, Huang o Y. Jensen es Huang. Elon es Musk.');
  if (!identidad) throw new Error('sin identidad: esta clave no es de un consejero');
  if (identidad.tipo === 'agente') throw new Error(`esta clave es la de ${identidad.agent} (agente de la flota) y no escribe en la bandeja de los consejeros`);
  if (identidad.tipo === 'consejo-compartido') {
    return { persona: silla, machine: identidad.machine || 'GrokBot', agent: `${silla}GrokBot`, tipo: 'consejero' };
  }
  const yo = sillaCanonica(identidad.persona);
  if (!yo || identidad.tipo !== 'consejero') throw new Error('esta clave no es de un consejero');
  if (yo !== silla) throw new Error(`esta clave es la de ${yo} y no puede firmar como ${silla}`);
  return { persona: yo, machine: identidad.machine || 'GrokBot', agent: identidad.agent || `${yo}GrokBot`, tipo: 'consejero' };
}

/* Un agente solo habla con su supervisor. Devuelve su remitente o lanza el error. */
/* Un agente de la flota como destinatario («Oráculo» → «Oraculo»), o null. */
export function agenteDestino(nombre) {
  const a = personaCanonica(nombre);
  return a && AGENTES_FLOTA.includes(a) ? a : null;
}

/* Límites (19-10-2026): agentes automáticos pueden responderse en bucle. */
export const VENTANA_MS = 10 * 60 * 1000;
export const MAX_POR_REMITENTE = 20;
export const MAX_POR_PAR_CON_AGENTE = 8;
export function comprobarFrecuencia(lista, m, ahoraMs, limites = {}) {
  const maxRem = Number(limites.remitente) > 0 ? Number(limites.remitente) : MAX_POR_REMITENTE;
  const maxPar = Number(limites.par) > 0 ? Number(limites.par) : MAX_POR_PAR_CON_AGENTE;
  const desde = ahoraMs - VENTANA_MS;
  const recientes = lista.filter((x) => Date.parse(x.hora) >= desde);
  if (recientes.filter((x) => norm(x.de) === norm(m.de)).length >= maxRem) throw new Error(`límite: ${m.de} ya ha enviado ${maxRem} mensajes en 10 min`);
  if (m.de_tipo === 'agente' || m.para_tipo === 'agente') {
    const par = (x) => (norm(x.de) === norm(m.de) && norm(x.para) === norm(m.para)) || (norm(x.de) === norm(m.para) && norm(x.para) === norm(m.de));
    if (recientes.filter(par).length >= maxPar) throw new Error(`anti-bucle: ${m.de} y ${m.para} ya llevan ${maxPar} mensajes en 10 min; esperad o que intervenga Carlos`);
  }
}

export function exigirAgente(identidad, para) {
  const agente = agenteCanonico(identidad && identidad.persona);
  const jefe = supervisorDe(agente);
  if (!agente) throw new Error('este agente no tiene nombre reconocible');
  // 19-10-2026 (Carlos): un agente puede escribir a CUALQUIER consejero; sin para va a su supervisor.
  if (para !== undefined && para !== null && para !== '' && !sillaCanonica(para)) {
    if (agenteDestino(para)) throw new Error('agente → agente todavía no: propuesto (pasa por un consejero o usa agente_encargar)');
    throw new Error('para tiene que ser un consejero: Wozniak, Jobs, Lucas, Disney, Musk, Huang o Y');
  }
  if ((para === undefined || para === null || para === '') && !jefe) throw new Error(`${agente} no tiene consejero supervisor: indica para (un consejero)`);
  return { persona: agente, machine: identidad.machine || 'flota', agent: identidad.agent || agente, tipo: 'agente', supervisor: jefe };
}

const esAgente = (identidad) => !!identidad && identidad.tipo === 'agente';
const mismo = (a, b) => norm(a) === norm(b);

function maquinaDe(identidad, pedida) {
  const cruda = String(pedida || identidad.machine || 'GrokBot').trim();
  if (!/^[A-Za-z0-9 ._-]{2,40}$/.test(cruda)) throw new Error('la máquina no es un nombre válido');
  return cruda;
}

function limpio(texto) {
  const t = String(texto || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (!t) throw new Error('el texto está vacío');
  if (t.length > 2000) throw new Error('el texto pasa de 2000 caracteres');
  if (pareceSecreto(t)) throw new Error('el mensaje parece llevar un secreto: no se guarda');
  return t;
}

const NOMBRE = { Huang: 'Jensen Huang', Musk: 'Elon Musk', Lucas: 'George Lucas', Jobs: 'Steve Jobs', Wozniak: 'Steve Wozniak', Disney: 'Walt Disney', Y: 'Y' };

function vista(m) {
  return {
    id: m.id, de: m.de, para: m.para, texto: m.texto, maquina: m.maquina, hora: m.hora,
    leido: !!m.leido, leido_en: m.leido_en || null, responde_a: m.responde_a || null,
    aviso: m.aviso || null, de_tipo: m.de_tipo || 'consejero', para_tipo: m.para_tipo || 'consejero',
    maquina_para: m.maquina_para || null,
  };
}

/* Recorta a TOPE quitando primero los mensajes ya leídos más antiguos: un mensaje
 * sin leer no se cae por la cola. */
export function recortar(lista, tope = TOPE) {
  if (lista.length <= tope) return lista;
  let sobra = lista.length - tope;
  const fuera = new Set();
  for (const m of lista) { if (!sobra) break; if (m.leido) { fuera.add(m); sobra--; } }
  let r = lista.filter((m) => !fuera.has(m));
  if (r.length > tope) r = r.slice(-tope);
  return r;
}

/*
 * Núcleo SÍNCRONO: recibe la lista, la cambia en sitio y dice si hay que guardarla.
 * Al no tener ningún await, ejecutado dentro del cerrojo (Durable Object o KV local)
 * es atómico: nadie lee ni escribe en medio. Los avisos van FUERA, después de guardar.
 */
export function operar(lista, op, a = {}, identidad, ctx = {}) {
  const ahora = ctx.now || (() => new Date());
  const aleatorio = ctx.aleatorio || (() => Math.random().toString(36).slice(2, 8));
  const limites = ctx.limites || {};
  const ids = new Set(lista.map((m) => m.id));
  const idNuevo = () => { let id; do { id = `cm${ahora().getTime().toString(36)}${aleatorio()}`; } while (ids.has(id)); ids.add(id); return id; };
  const publicar = (m) => { comprobarFrecuencia(lista, m, ahora().getTime(), limites); m.aviso = null; lista.push(m); return m; };
  const r = (res, cambio, nuevos = []) => ({ res, cambio, nuevos });

  if (op === 'enviar') {
    const { de, para, texto, maquina, maquina_agente } = a;
    if (esAgente(identidad)) {
      const ag = exigirAgente(identidad, para);
      const destino = (para && sillaCanonica(para)) || ag.supervisor;
      const mensaje = publicar({
        id: idNuevo(), de: ag.persona, de_tipo: 'agente', para: destino, para_tipo: 'consejero',
        texto: limpio(texto), maquina: maquinaDe(ag, maquina), hora: ahora().toISOString(), leido: false, responde_a: null,
      });
      return r({ ok: true, mensaje: vista(mensaje) }, true, [mensaje]);
    }
    const remite = exigirConsejero(identidad, de || (identidad && identidad.persona) || '');
    const silla = sillaCanonica(para);
    const agente = silla ? null : agenteDestino(para);
    if (!silla && !agente) throw new Error(`para tiene que ser un consejero (Wozniak, Jobs, Lucas, Disney, Musk, Huang, Y) o un agente de la flota (${AGENTES_FLOTA.join(', ')})`);
    if (silla === remite.persona) throw new Error('un consejero no se escribe a sí mismo');
    const mensaje = {
      id: idNuevo(), de: remite.persona, de_tipo: 'consejero', para: silla || agente, para_tipo: agente ? 'agente' : 'consejero',
      texto: limpio(texto), maquina: maquinaDe(remite, maquina), hora: ahora().toISOString(), leido: false, responde_a: null,
    };
    if (agente) mensaje.maquina_para = maquinaDe({ machine: CASA_AGENTE[agente] || 'flota' }, maquina_agente);
    publicar(mensaje);
    return r({ ok: true, mensaje: vista(mensaje) }, true, [mensaje]);
  }

  if (op === 'bandeja') {
    const hora = ahora().toISOString();
    if (esAgente(identidad)) {
      const ag = exigirAgente(identidad);
      const pendientes = lista.filter((m) => m.para_tipo === 'agente' && mismo(m.para, ag.persona) && !m.leido);
      for (const m of pendientes) { m.leido = true; m.leido_en = hora; }
      return r({ ok: true, yo: ag.persona, supervisor: ag.supervisor, pendientes: pendientes.map(vista), marcados: pendientes.length }, pendientes.length > 0);
    }
    const quien = exigirConsejero(identidad, a.yo || (identidad && identidad.persona) || '');
    const pendientes = lista.filter((m) => m.para === quien.persona && m.para_tipo !== 'agente' && !m.leido);
    for (const m of pendientes) { m.leido = true; m.leido_en = hora; }
    return r({ ok: true, yo: quien.persona, pendientes: pendientes.map(vista), marcados: pendientes.length }, pendientes.length > 0);
  }

  if (op === 'responder') {
    const { id, texto, de, maquina } = a;
    const original = lista.find((m) => m.id === id);
    if (esAgente(identidad)) {
      const ag = exigirAgente(identidad);
      if (!original) throw new Error(`no hay un mensaje con id ${id}`);
      if (original.para_tipo !== 'agente' || !mismo(original.para, ag.persona)) throw new Error(`el mensaje ${id} no es para ${ag.persona}`);
      if (original.de_tipo === 'agente' || !sillaCanonica(original.de)) throw new Error('agente → agente todavía no: propuesto');
      const respuesta = {
        id: idNuevo(), de: ag.persona, de_tipo: 'agente', para: sillaCanonica(original.de), para_tipo: 'consejero',
        texto: limpio(texto), maquina: maquinaDe(ag, maquina), hora: ahora().toISOString(), leido: false, responde_a: original.id,
      };
      publicar(respuesta);
      if (!original.leido) { original.leido = true; original.leido_en = respuesta.hora; }
      return r({ ok: true, mensaje: vista(respuesta), responde_a: original.id }, true, [respuesta]);
    }
    const quien = exigirConsejero(identidad, de || (identidad && identidad.persona) || '');
    if (!original) throw new Error(`no hay un mensaje con id ${id}`);
    if (original.para !== quien.persona || original.para_tipo === 'agente') throw new Error(`el mensaje ${id} es para ${original.para}, no para ${quien.persona}`);
    const respuesta = {
      id: idNuevo(), de: quien.persona, para: original.de, para_tipo: original.de_tipo === 'agente' ? 'agente' : 'consejero',
      de_tipo: 'consejero', texto: limpio(texto), maquina: maquinaDe(quien, maquina), hora: ahora().toISOString(), leido: false, responde_a: original.id,
    };
    if (original.de_tipo === 'agente') respuesta.maquina_para = original.maquina;
    publicar(respuesta);
    if (!original.leido) { original.leido = true; original.leido_en = respuesta.hora; }
    return r({ ok: true, mensaje: vista(respuesta), responde_a: original.id }, true, [respuesta]);
  }

  if (op === 'listar') {
    const con = a.con;
    const silla = con ? (sillaCanonica(con) || agenteCanonico(con)) : null;
    if (con && !silla) return r({ ok: true, mensajes: [] }, false);
    const max = Math.min(Math.max(Number(a.max) || 50, 1), TOPE);
    const mensajes = lista.filter((m) => !silla || mismo(m.de, silla) || mismo(m.para, silla)).slice(-max).map(vista);
    const pendientes = silla ? mensajes.filter((m) => m.para === silla && !m.leido).length : mensajes.filter((m) => !m.leido).length;
    return r({ ok: true, mensajes, pendientes, total: lista.length }, false);
  }

  if (op === 'aviso') {
    const m = lista.find((x) => x.id === a.id);
    if (!m) return r({ ok: false }, false);
    m.aviso = a.aviso || null;
    return r({ ok: true }, true);
  }

  throw new Error(`operación desconocida: ${op}`);
}

/* Cerrojo en memoria por objeto KV (solo para el modo sin Durable Object). */
const cerrojos = new WeakMap();
export function enCola(llave, fn) {
  const previo = cerrojos.get(llave) || Promise.resolve();
  const p = previo.then(fn, fn);
  cerrojos.set(llave, p.catch(() => {}));
  return p;
}

export function crearBandeja(env = {}, deps = {}) {
  const kv = env.ADMIRA_LIVE_DESDE;
  const avisos = crearAvisos(env, deps);
  const alMomento = (m) => { try { avisos.programar(m); } catch { /* nunca rompe el guardado */ } };
  const ctx = { now: deps.now, aleatorio: deps.aleatorio, limites: env.BANDEJA_LIMITES || {} };
  const nombreDo = env.BANDEJA_NOMBRE || 'consejo';

  /* Con Durable Object: TODA la operación corre dentro de la instancia única. */
  async function remoto(op, a, identidad) {
    const ns = env.BANDEJA;
    const stub = ns.get(ns.idFromName(nombreDo));
    const resp = await stub.fetch('https://bandeja.interna/op', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, args: a || {}, identidad: identidad || null, limites: ctx.limites, nombre: nombreDo }),
    });
    const d = await resp.json().catch(() => null);
    if (!d) throw new Error(`la bandeja no responde (${resp.status})`);
    if (!d.ok) throw new Error(d.error || 'error en la bandeja');
    return d.r;
  }
  async function local(op, a, identidad) {
    if (!kv || typeof kv.get !== 'function') {
      if (op === 'listar') return { res: { ok: true, mensajes: [], pendientes: 0 }, nuevos: [] };
      if (op === 'enviar' || op === 'responder' || op === 'aviso') throw new Error('sin KV: la bandeja de consejeros no está configurada');
    }
    return enCola(kv || cerrojos, async () => {
      const d = kv ? await kv.get(CLAVE_KV, 'json') : null;
      const lista = Array.isArray(d) ? d : [];
      const out = operar(lista, op, a, identidad, ctx);
      if (out.cambio) {
        if (!kv || typeof kv.put !== 'function') throw new Error('sin KV: la bandeja de consejeros no está configurada');
        await kv.put(CLAVE_KV, JSON.stringify(recortar(lista)));
      }
      return { res: out.res, nuevos: out.nuevos };
    });
  }
  const ejecutar = (op, a, identidad) => (env.BANDEJA && typeof env.BANDEJA.idFromName === 'function' ? remoto(op, a, identidad) : local(op, a, identidad));

  /* El mensaje ya está guardado (con hora e id: se ve en consejero.html?con=<silla>).
   * #6975 (21-10-2026, Carlos vía Musk): la comunicación entre consejeros es DIRECTA
   * pero REGISTRADA. Ya no se crea un encargo-aviso numerado en la cola (#6962, #6967…):
   *   1) si el destinatario registró su webhook aquí (consejero_webhook_registrar), POST directo;
   *   2) si no, el worker admira-telegram despierta su rutina de Grok Bot con evento «mensaje»
   *      (POST /api/consejero-mensaje/despertar): sin fila en el bot-inbox ni Telegram;
   *   3) solo si las dos fallan, el aviso de siempre por bot-inbox, para que nada se pierda.
   * Los agentes de la flota siguen por bot-inbox: su vigilante lee ahí. */
  const baseTelegram = () => String(env.ADMIRA_TELEGRAM_URL || 'https://bot.yokup.com').replace(/\/$/, '');
  const viaTelegram = () => (env.TELEGRAM && typeof env.TELEGRAM.fetch === 'function'
    ? (u, i) => env.TELEGRAM.fetch(u, i)
    : (deps.fetch || globalThis.fetch));
  const cabecerasPanel = () => ({
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${env.ADMIRA_TELEGRAM_PANEL_KEY}`,
    'user-agent': 'admira-live-mcp/1.0',
  });
  const sitio = String(env.SITIO || 'https://www.admira.live').replace(/\/$/, '');

  async function despertarDirecto(mensaje) {
    if (!env.ADMIRA_TELEGRAM_PANEL_KEY) return { ok: false, error: 'sin clave de aviso' };
    const para = sillaCanonica(mensaje.para);
    if (!para) return { ok: false, error: 'destinatario desconocido' };
    const carga = {
      persona: para,
      mensaje: {
        id: mensaje.id, de: mensaje.de, de_tipo: mensaje.de_tipo || 'consejero', para, para_tipo: 'consejero',
        maquina: mensaje.maquina || null, hora: mensaje.hora, responde_a: mensaje.responde_a || null,
        resumen: resumenCorto(mensaje.texto),
        url: `${sitio}/consejero.html?con=${encodeURIComponent(para)}#${encodeURIComponent(mensaje.id)}`,
      },
    };
    try {
      const r = await viaTelegram()(`${baseTelegram()}/api/consejero-mensaje/despertar`, {
        method: 'POST', headers: cabecerasPanel(), body: JSON.stringify(carga),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.ok && d.despertado === true) return { ok: true, directo: true, via: 'grokbot-webhook', para };
      return { ok: false, error: (d && (d.resultado || d.error)) || `despertar no aceptado (${r.status || 'sin estado'})` };
    } catch {
      return { ok: false, error: 'no se pudo despertar al destinatario' };
    }
  }

  async function avisarPorEncargo(mensaje) {
    if (!env.ADMIRA_TELEGRAM_PANEL_KEY) return { ok: false, error: 'sin clave de aviso' };
    const cuerpo = [
      `[chat-coetaneos] ${NOMBRE[mensaje.de] || mensaje.de} → ${NOMBRE[mensaje.para] || mensaje.para}`,
      mensaje.de_tipo === 'agente' || mensaje.para_tipo === 'agente'
        ? 'Canal agente ↔ consejero supervisor de admira.live. Léelo con consejero_bandeja y contesta con consejero_responder. No es un encargo y no sale al grupo.'
        : 'Canal entre consejeros de admira.live. Léelo con consejero_bandeja y contesta con consejero_responder. No es un encargo y no sale al grupo.',
      '',
      `De: ${mensaje.de}`,
      `Para: ${mensaje.para}`,
      `Máquina: ${mensaje.maquina}`,
      `Id: ${mensaje.id}`,
      `Hora: ${mensaje.hora}`,
      '',
      mensaje.texto,
    ].join('\n').slice(0, 3900);
    try {
      const r = await viaTelegram()(`${baseTelegram()}/api/bot-inbox`, {
        method: 'POST',
        headers: cabecerasPanel(),
        body: JSON.stringify({
          text: cuerpo,
          target_persona: mensaje.para,
          target_machine: mensaje.para_tipo === 'agente' ? (mensaje.maquina_para || 'flota') : 'grokbot',
          from: mensaje.de_tipo === 'agente' ? `${mensaje.de}${mensaje.maquina}` : `${mensaje.de}GrokBot`,
          materialize_mission: false,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !d.ok || !(Number(d.id) > 0)) return { ok: false, error: `aviso no aceptado (${r.status || 'sin estado'})` };
      return { ok: true, encargo: Number(d.id), para: mensaje.para, via: 'bot-inbox' };
    } catch {
      return { ok: false, error: 'no se pudo avisar al destinatario' };
    }
  }

  async function avisar(mensaje) {
    if (mensaje.para_tipo === 'agente') {
      const a = await avisarPorEncargo(mensaje);
      alMomento(mensaje);
      return a;
    }
    let propio = null;
    try { propio = await avisos.avisar(mensaje); } catch { propio = null; }
    if (propio && propio.ok) return { ok: true, directo: true, via: 'webhook-propio', para: mensaje.para };
    const directo = await despertarDirecto(mensaje);
    if (directo.ok) return directo;
    const encargo = await avisarPorEncargo(mensaje);
    return { ...encargo, respaldo: true, motivo: directo.error || 'sin despertar directo' };
  }

  /* Guardar primero (atómico) y avisar después: un Telegram lento ya no abre una
   * ventana en la que otra escritura pise la lista. */
  async function conAviso(op, a, identidad) {
    const { res, nuevos } = await ejecutar(op, a, identidad);
    for (const m of nuevos || []) {
      const aviso = await avisar(m);
      m.aviso = aviso;
      try { await ejecutar('aviso', { id: m.id, aviso }, null); } catch { /* el mensaje ya está guardado */ }
      if (res.mensaje && res.mensaje.id === m.id) { res.mensaje.aviso = aviso; res.aviso = aviso; }
    }
    return res;
  }

  return {
    enviar: (a, identidad) => conAviso('enviar', a, identidad),
    bandeja: async (a, identidad) => (await ejecutar('bandeja', a || {}, identidad)).res,
    responder: (a, identidad) => conAviso('responder', a, identidad),
    listar: async (con, max) => (await ejecutar('listar', { con: con || '', max }, null)).res,
    avisos,
  };
}
