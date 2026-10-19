/*
 * bandeja-do.js — Durable Object de la bandeja de consejeros (19-10-2026).
 *
 * Por qué: el KV ADMIRA_LIVE_DESDE es eventualmente consistente. Con toda la bandeja
 * en una sola clave, dos escrituras seguidas leían una lista vieja y la segunda pisaba
 * a la primera (de 7 mensajes de Musk a Morfeo se perdieron 3), las bandejas salían
 * vacías unos segundos y el anti-bucle contaba sobre listas viejas.
 *
 * Un Durable Object es UNA instancia con almacenamiento propio y fuertemente
 * consistente. Aquí, además, cada operación pasa por una cola (enCola): lectura,
 * cambio y escritura de la lista van seguidas, sin ningún await externo en medio.
 * Los avisos (Telegram, webhook) los hace el Worker DESPUÉS, fuera del objeto.
 *
 * Vive en un Worker aparte (admira-live-bandeja; preview: admira-live-bandeja-preview)
 * para que admira-live-mcp no tenga que aplicar ninguna migración de Durable Objects:
 * así sus versiones se siguen subiendo sin tráfico y el rollback a versiones viejas
 * sigue permitido.
 *
 * Migración: la primera vez que se usa la instancia «consejo», copia la lista de la
 * clave antigua del KV (consejero-mensajes:v1). Durante MIGRACION_MS sigue uniendo por
 * id lo que haya en el KV (por si la primera lectura era vieja o una versión antigua
 * aún escribía). Nunca escribe ni borra en el KV: la clave antigua queda de copia.
 */

import { operar, recortar, enCola, CLAVE_KV } from './mensajes.js';

export const MIGRACION_MS = 30 * 60 * 1000;
const LISTA = 'lista';
const META = 'meta';

export class BandejaConsejo {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env || {};
    this.cola = {};
  }

  async unirKv(lista, meta, ahoraMs) {
    const kv = this.env.ADMIRA_LIVE_DESDE;
    if (!kv || typeof kv.get !== 'function') return 0;
    let viejos = null;
    try { viejos = await kv.get(CLAVE_KV, { type: 'json', cacheTtl: 60 }); } catch { return 0; }
    if (!Array.isArray(viejos)) return 0;
    const ids = new Set(lista.map((m) => m.id));
    const nuevos = viejos.filter((m) => m && m.id && !ids.has(m.id));
    if (!nuevos.length) return 0;
    lista.push(...nuevos);
    lista.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
    meta.importados = (meta.importados || 0) + nuevos.length;
    meta.ultima_union = new Date(ahoraMs).toISOString();
    return nuevos.length;
  }

  async cargar(nombre) {
    let lista = (await this.storage.get(LISTA)) || [];
    let meta = (await this.storage.get(META)) || null;
    let cambio = false;
    const ahoraMs = Date.now();
    if (!meta) {
      meta = { nombre, creado: new Date(ahoraMs).toISOString(), migra: nombre === 'consejo', importados: 0 };
      cambio = true;
    }
    if (meta.migra && ahoraMs - Date.parse(meta.creado) < MIGRACION_MS) {
      if (await this.unirKv(lista, meta, ahoraMs)) cambio = true;
    }
    return { lista, meta, cambio };
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method !== 'POST') return Response.json({ ok: false, error: 'solo POST' }, { status: 405 });
      const cuerpo = await request.json();
      const nombre = String(cuerpo.nombre || 'consejo');
      if (url.pathname === '/vaciar') {
        // Solo la instancia de sandbox se puede vaciar (limpieza de pruebas).
        if (!/^sandbox/.test(nombre)) return Response.json({ ok: false, error: 'solo se vacía la sandbox' }, { status: 403 });
        return await enCola(this.cola, async () => { await this.storage.deleteAll(); return Response.json({ ok: true, vaciado: nombre }); });
      }
      if (url.pathname === '/meta') {
        return await enCola(this.cola, async () => {
          const { lista, meta } = await this.cargar(nombre);
          return Response.json({ ok: true, r: { meta, total: lista.length } });
        });
      }
      return await enCola(this.cola, async () => {
        const { lista, meta, cambio } = await this.cargar(nombre);
        let out;
        try {
          out = operar(lista, cuerpo.op, cuerpo.args || {}, cuerpo.identidad || null, { limites: cuerpo.limites || {} });
        } catch (e) {
          if (cambio) await this.storage.put({ [LISTA]: recortar(lista), [META]: meta });
          return Response.json({ ok: false, error: String((e && e.message) || e) });
        }
        if (out.cambio || cambio) await this.storage.put({ [LISTA]: recortar(lista), [META]: meta });
        return Response.json({ ok: true, r: { res: out.res, nuevos: out.nuevos } });
      });
    } catch (e) {
      return Response.json({ ok: false, error: `bandeja: ${String((e && e.message) || e)}` }, { status: 500 });
    }
  }
}
