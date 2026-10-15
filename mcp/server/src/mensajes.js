/*
 * mensajes.js — bandeja privada entre consejeros (las dos cuentas).
 *
 * Un mensaje lleva remitente, destinatario, máquina y hora. Se guarda en el KV
 * del worker y se lee en el chat de admira.live. No admite secretos.
 * Jensen es la silla Huang. Elon es la silla Musk.
 */

import { sillaCanonica } from './sillas.js';

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

function vista(m) {
  return {
    id: m.id, de: m.de, para: m.para, texto: m.texto, maquina: m.maquina, hora: m.hora,
    leido: !!m.leido, responde_a: m.responde_a || null,
  };
}

export function crearBandeja(env = {}, deps = {}) {
  const kv = env.ADMIRA_LIVE_DESDE;
  const ahora = deps.now || (() => new Date());
  const aleatorio = deps.aleatorio || (() => Math.random().toString(36).slice(2, 6));

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

  async function enviar({ de, para, texto, maquina }, identidad) {
    const remite = exigirConsejero(identidad, de);
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
    await guardar(lista);
    return { ok: true, mensaje: vista(mensaje) };
  }

  async function bandeja({ yo }, identidad) {
    const quien = exigirConsejero(identidad, yo);
    const lista = await leer();
    const pendientes = lista.filter((m) => m.para === quien.persona && !m.leido);
    const hora = ahora().toISOString();
    for (const m of lista) if (m.para === quien.persona && !m.leido) { m.leido = true; m.leido_en = hora; }
    if (pendientes.length) await guardar(lista);
    return { ok: true, yo: quien.persona, pendientes: pendientes.map(vista), marcados: pendientes.length };
  }

  async function responder({ id, texto, de, maquina }, identidad) {
    const declarado = de || (identidad && identidad.persona) || '';
    const quien = exigirConsejero(identidad, declarado);
    const lista = await leer();
    const original = lista.find((m) => m.id === id);
    if (!original) throw new Error(`no hay un mensaje con id ${id}`);
    if (original.para !== quien.persona) throw new Error(`el mensaje ${id} es para ${original.para}, no para ${quien.persona}`);
    const respuesta = {
      id: idNuevo(),
      de: quien.persona,
      para: original.de,
      texto: limpio(texto),
      maquina: maquinaDe(quien, maquina),
      hora: ahora().toISOString(),
      leido: false,
      responde_a: original.id,
    };
    if (!original.leido) { original.leido = true; original.leido_en = respuesta.hora; }
    lista.push(respuesta);
    await guardar(lista);
    return { ok: true, mensaje: vista(respuesta), responde_a: original.id };
  }

  async function listar(con) {
    const lista = await leer();
    const silla = con ? sillaCanonica(con) : null;
    if (con && !silla) return { ok: true, mensajes: [] };
    const mensajes = lista.filter((m) => !silla || m.de === silla || m.para === silla).slice(-50).map(vista);
    return { ok: true, mensajes };
  }

  return { enviar, bandeja, responder, listar };
}
