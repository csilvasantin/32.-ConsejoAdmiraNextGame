/*
 * mensajes.js — bandeja privada entre consejeros (las dos cuentas).
 *
 * Un mensaje lleva remitente, destinatario, máquina y hora. Se guarda en el KV
 * del worker y se lee en el chat de admira.live. No admite secretos.
 * Jensen es la silla Huang. Elon es la silla Musk.
 *
 * Canal agente → consejero: un agente de la flota solo puede escribir a su
 * consejero supervisor (supervisores.js), leer lo que le llega y responder.
 */

import { sillaCanonica } from './sillas.js';
import { supervisorDe, agenteCanonico } from './supervisores.js';
import { norm } from './flota.js';
import { crearAvisos } from './avisos.js';

export const CLAVE_KV = 'consejero-mensajes:v1';
export const TOPE = 200;

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
export function exigirAgente(identidad, para) {
  const agente = agenteCanonico(identidad && identidad.persona);
  const jefe = supervisorDe(agente);
  if (!jefe) throw new Error(`${agente || 'este agente'} no tiene consejero supervisor en supervisores.js: pide a Carlos que lo añada`);
  if (para !== undefined && sillaCanonica(para) !== jefe) throw new Error(`${agente} solo puede escribir a su consejero supervisor, ${jefe}`);
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
  };
}

export function crearBandeja(env = {}, deps = {}) {
  const kv = env.ADMIRA_LIVE_DESDE;
  const ahora = deps.now || (() => new Date());
  const aleatorio = deps.aleatorio || (() => Math.random().toString(36).slice(2, 6));
  const avisos = crearAvisos(env, deps);
  // Webhook propio del destinatario (avisos.js): DESPUÉS de guardar, fuera de la respuesta.
  const alMomento = (m) => { try { avisos.programar(m); } catch { /* nunca rompe el guardado */ } };

  async function leer() {
    if (!kv || typeof kv.get !== 'function') return [];
    const d = await kv.get(CLAVE_KV, 'json');
    return Array.isArray(d) ? d : [];
  }
  async function guardar(lista) {
    if (!kv || typeof kv.put !== 'function') throw new Error('sin KV: la bandeja de consejeros no está configurada');
    await kv.put(CLAVE_KV, JSON.stringify(lista.slice(-TOPE)));
  }
  function idNuevo() {
    return `cm${ahora().getTime().toString(36)}${aleatorio()}`;
  }

  /* El mensaje ya está guardado. El aviso despierta al destinatario en su buzón
   * de GrokBot. La marca [chat-coetaneos] no sale al grupo ni abre misión. */
  async function avisar(mensaje) {
    if (!env.ADMIRA_TELEGRAM_PANEL_KEY) return { ok: false, error: 'sin clave de aviso' };
    const base = String(env.ADMIRA_TELEGRAM_URL || 'https://bot.yokup.com').replace(/\/$/, '');
    const via = env.TELEGRAM && typeof env.TELEGRAM.fetch === 'function'
      ? (u, i) => env.TELEGRAM.fetch(u, i)
      : (deps.fetch || globalThis.fetch);
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
      const r = await via(`${base}/api/bot-inbox`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${env.ADMIRA_TELEGRAM_PANEL_KEY}`,
          'user-agent': 'admira-live-mcp/1.0',
        },
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
      return { ok: true, encargo: Number(d.id), para: mensaje.para };
    } catch {
      return { ok: false, error: 'no se pudo avisar al destinatario' };
    }
  }

  async function enviar({ de, para, texto, maquina }, identidad) {
    if (esAgente(identidad)) {
      const ag = exigirAgente(identidad, para);
      const mensaje = {
        id: idNuevo(), de: ag.persona, de_tipo: 'agente', para: ag.supervisor, para_tipo: 'consejero',
        texto: limpio(texto), maquina: maquinaDe(ag, maquina), hora: ahora().toISOString(), leido: false, responde_a: null,
      };
      const lista = await leer();
      lista.push(mensaje);
      mensaje.aviso = await avisar(mensaje);
      await guardar(lista);
      alMomento(mensaje);
      return { ok: true, mensaje: vista(mensaje), aviso: mensaje.aviso };
    }
    const remite = exigirConsejero(identidad, de || (identidad && identidad.persona) || '');
    const destino = sillaCanonica(para);
    if (!destino) throw new Error('para tiene que ser un consejero: Wozniak, Jobs, Lucas, Disney, Musk, Huang o Y');
    if (destino === remite.persona) throw new Error('un consejero no se escribe a sí mismo');
    const mensaje = {
      id: idNuevo(),
      de: remite.persona,
      para: destino,
      texto: limpio(texto),
      maquina: maquinaDe(remite, maquina),
      hora: ahora().toISOString(),
      leido: false,
      responde_a: null,
    };
    const lista = await leer();
    lista.push(mensaje);
    mensaje.aviso = await avisar(mensaje);
    await guardar(lista);
    alMomento(mensaje);
    return { ok: true, mensaje: vista(mensaje), aviso: mensaje.aviso };
  }

  async function bandeja({ yo }, identidad) {
    if (esAgente(identidad)) {
      const ag = exigirAgente(identidad);
      const lista = await leer();
      const mios = (m) => m.para_tipo === 'agente' && mismo(m.para, ag.persona) && !m.leido;
      const pendientes = lista.filter(mios);
      const hora = ahora().toISOString();
      for (const m of pendientes) { m.leido = true; m.leido_en = hora; }
      if (pendientes.length) await guardar(lista);
      return { ok: true, yo: ag.persona, supervisor: ag.supervisor, pendientes: pendientes.map(vista), marcados: pendientes.length };
    }
    const quien = exigirConsejero(identidad, yo || (identidad && identidad.persona) || '');
    const lista = await leer();
    const paraMi = (m) => m.para === quien.persona && m.para_tipo !== 'agente' && !m.leido;
    const pendientes = lista.filter(paraMi);
    const hora = ahora().toISOString();
    for (const m of lista) if (paraMi(m)) { m.leido = true; m.leido_en = hora; }
    if (pendientes.length) await guardar(lista);
    return { ok: true, yo: quien.persona, pendientes: pendientes.map(vista), marcados: pendientes.length };
  }

  async function responder({ id, texto, de, maquina }, identidad) {
    if (esAgente(identidad)) {
      const ag = exigirAgente(identidad);
      const lista = await leer();
      const original = lista.find((m) => m.id === id);
      if (!original) throw new Error(`no hay un mensaje con id ${id}`);
      if (original.para_tipo !== 'agente' || !mismo(original.para, ag.persona)) throw new Error(`el mensaje ${id} no es para ${ag.persona}`);
      if (original.de !== ag.supervisor) throw new Error(`${ag.persona} solo puede responder a su consejero supervisor, ${ag.supervisor}`);
      const respuesta = {
        id: idNuevo(), de: ag.persona, de_tipo: 'agente', para: ag.supervisor, para_tipo: 'consejero',
        texto: limpio(texto), maquina: maquinaDe(ag, maquina), hora: ahora().toISOString(), leido: false, responde_a: original.id,
      };
      if (!original.leido) { original.leido = true; original.leido_en = respuesta.hora; }
      lista.push(respuesta);
      respuesta.aviso = await avisar(respuesta);
      await guardar(lista);
      alMomento(respuesta);
      return { ok: true, mensaje: vista(respuesta), responde_a: original.id, aviso: respuesta.aviso };
    }
    const declarado = de || (identidad && identidad.persona) || '';
    const quien = exigirConsejero(identidad, declarado);
    const lista = await leer();
    const original = lista.find((m) => m.id === id);
    if (!original) throw new Error(`no hay un mensaje con id ${id}`);
    if (original.para !== quien.persona || original.para_tipo === 'agente') throw new Error(`el mensaje ${id} es para ${original.para}, no para ${quien.persona}`);
    const respuesta = {
      id: idNuevo(),
      de: quien.persona,
      para: original.de,
      para_tipo: original.de_tipo === 'agente' ? 'agente' : 'consejero',
      maquina_para: original.de_tipo === 'agente' ? original.maquina : undefined,
      de_tipo: 'consejero',
      texto: limpio(texto),
      maquina: maquinaDe(quien, maquina),
      hora: ahora().toISOString(),
      leido: false,
      responde_a: original.id,
    };
    if (!original.leido) { original.leido = true; original.leido_en = respuesta.hora; }
    lista.push(respuesta);
    respuesta.aviso = await avisar(respuesta);
    await guardar(lista);
    alMomento(respuesta);
    return { ok: true, mensaje: vista(respuesta), responde_a: original.id, aviso: respuesta.aviso };
  }

  async function listar(con) {
    const lista = await leer();
    const silla = con ? (sillaCanonica(con) || agenteCanonico(con)) : null;
    if (con && !silla) return { ok: true, mensajes: [] };
    const mensajes = lista.filter((m) => !silla || mismo(m.de, silla) || mismo(m.para, silla)).slice(-50).map(vista);
    const pendientes = silla ? mensajes.filter((m) => m.para === silla && !m.leido).length : mensajes.filter((m) => !m.leido).length;
    return { ok: true, mensajes, pendientes };
  }

  return { enviar, bandeja, responder, listar, avisos };
}
