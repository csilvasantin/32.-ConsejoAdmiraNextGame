/*
 * consejo.js — lo que el MCP sabe del Consejo de Silicio y cómo le habla.
 *
 * Todo lo que toca red pasa por `deps.fetch` para que los tests lo sustituyan sin
 * levantar nada. Las funciones devuelven datos; el envoltorio MCP (index.js) los
 * convierte en texto para el cliente.
 */

export const ROLES = ['CEO', 'CTO', 'COO', 'CFO', 'CCO', 'CDO', 'CXO', 'CSO'];
export const GENERACIONES = ['leyendas', 'coetaneos'];

// Los 16 consejeros, tal y como los define admiranext/agents (council-api los importa
// de ahí). Se escriben aquí para que un cliente pueda elegir a quién preguntar SIN
// una llamada previa, y para que el MCP siga listándolos aunque el Mac Mini duerma.
export const CONSEJEROS = [
  { rol: 'CEO', cargo: 'Chief Executive Officer', lado: 'racional', leyendas: 'Steve Jobs', coetaneos: 'Elon Musk' },
  { rol: 'CTO', cargo: 'Chief Technology Officer', lado: 'racional', leyendas: 'Steve Wozniak', coetaneos: 'Jensen Huang' },
  { rol: 'COO', cargo: 'Chief Operations Officer', lado: 'racional', leyendas: 'Tim Cook', coetaneos: 'Gwynne Shotwell' },
  { rol: 'CFO', cargo: 'Chief Financial Officer', lado: 'racional', leyendas: 'Warren Buffett', coetaneos: 'Ruth Porat' },
  { rol: 'CCO', cargo: 'Chief Creative Officer', lado: 'creativo', leyendas: 'Walt Disney', coetaneos: 'John Lasseter' },
  { rol: 'CDO', cargo: 'Chief Design Officer', lado: 'creativo', leyendas: 'Dieter Rams', coetaneos: 'Jony Ive' },
  { rol: 'CXO', cargo: 'Chief Experience Officer', lado: 'creativo', leyendas: 'Howard Schultz', coetaneos: 'Carlo Ratti' },
  { rol: 'CSO', cargo: 'Chief Storytelling Officer', lado: 'creativo', leyendas: 'George Lucas', coetaneos: 'Ryan Reynolds' },
];

export function consejeros(generacion) {
  const gens = generacion ? [generacion] : GENERACIONES;
  const out = [];
  for (const g of gens) {
    for (const c of CONSEJEROS) {
      out.push({ rol: c.rol, cargo: c.cargo, lado: c.lado, generacion: g, persona: c[g],
        ficha: `https://www.admira.live/consejero.html?p=${c[g].toLowerCase().replace(/\s+/g, '-')}` });
    }
  }
  return out;
}

const limpiar = (s) => String(s || '').replace(/\/+$/, '');

export function crearCliente(env = {}, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const councilBase = limpiar(env.COUNCIL_BASE || 'https://macmini.tail48b61c.ts.net/council');
  const fleetBase = limpiar(env.FLEET_BASE || 'https://macmini.tail48b61c.ts.net/api');
  const agoraBase = limpiar(env.AGORA_WORKER || 'https://pixer-eleven.csilvasantin.workers.dev');

  async function llamar(url, init = {}, { timeoutMs = 90_000, via } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    // `via` es un service binding de Cloudflare (tiene .fetch): la petición va por dentro.
    const enviar = via && typeof via.fetch === 'function' ? (u, i) => via.fetch(u, i) : doFetch;
    let response;
    try {
      response = await enviar(url, { ...init, signal: ctl.signal,
        headers: { accept: 'application/json', 'user-agent': 'admira-live-mcp/1.0', ...(init.headers || {}) } });
    } catch (e) {
      throw new Error(`no se pudo llegar a ${url}: ${e && e.message || e}`);
    } finally { clearTimeout(t); }
    const text = await response.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!response.ok) {
      const detalle = body && (body.detail || body.error || body.raw) || response.statusText;
      const err = new Error(`${response.status} en ${url}: ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`);
      err.status = response.status; throw err;
    }
    return body;
  }

  function cabecerasConsejo() {
    if (!env.COUNCIL_MACHINE_TOKEN) {
      throw new Error('falta COUNCIL_MACHINE_TOKEN en el worker: sin token de máquina el Consejo no responde (401)');
    }
    return { 'content-type': 'application/json', 'x-council-token': env.COUNCIL_MACHINE_TOKEN };
  }

  return {
    bases: { consejo: councilBase, flota: fleetBase, agora: agoraBase },

    modelos: () => llamar(`${councilBase}/api/council/models`),

    saludConsejo: () => llamar(`${councilBase}/api/council/health`),

    preguntarConsejo: ({ mensaje, generacion = 'leyendas', llm = 'claude-sonnet', contexto }) =>
      llamar(`${councilBase}/api/council/ask`, { method: 'POST', headers: cabecerasConsejo(),
        body: JSON.stringify({ message: mensaje, generation: generacion, llm, context: contexto || null }) }),

    preguntarConsejero: ({ rol, mensaje, generacion = 'leyendas', llm = 'claude-sonnet', contexto }) =>
      llamar(`${councilBase}/api/council/ask-one`, { method: 'POST', headers: cabecerasConsejo(),
        body: JSON.stringify({ message: mensaje, agent_name: rol, generation: generacion, llm, context: contexto || null }) }),

    saludBots: () => llamar(`${fleetBase}/council/health`),
    flota: () => llamar(`${fleetBase}/council/machine-status`),
    tareas: () => llamar(`${fleetBase}/council/tasks`),

    agoraDecir: ({ texto, de = 'Consejo · MCP', tipo = 'mcp', url }) => {
      const key = env.AGORA_SYNC_KEY;
      if (!key) throw new Error('falta AGORA_SYNC_KEY en el worker: no se puede escribir en AgoraMatrix');
      // pixer-eleven es otro worker de la misma cuenta: por URL workers.dev Cloudflare
      // responde 1042. Con el service binding (env.AGORA) la llamada es interna.
      const init = { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, from: de, text: texto, kind: tipo, url }) };
      if (env.AGORA && typeof env.AGORA.fetch === 'function') return llamar(`${agoraBase}/agora/feed`, init, { via: env.AGORA });
      return llamar(`${agoraBase}/agora/feed`, init);
    },
  };
}

/** Resume una respuesta del Consejo para que quepa en un chat sin perder quién habló. */
export function resumirRespuesta(r) {
  const filas = [];
  const uno = (x) => filas.push(`${x.icon || ''} ${x.name} · ${x.persona} (${x.side}):\n${x.content}`.trim());
  if (r && Array.isArray(r.racional)) { r.racional.forEach(uno); (r.creativo || []).forEach(uno); }
  else if (r && r.name) uno(r);
  else return JSON.stringify(r, null, 2);
  return filas.join('\n\n');
}
