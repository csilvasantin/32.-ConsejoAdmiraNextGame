/*
 * Identidad de quien llama al MCP.
 *
 * FLT-1580 b: una clave por consejero de GrokBot para saber QUIÉN llama
 * (WozniakGrokBot, JobsGrokBot, DisneyGrokBot, LucasGrokBot). La clave genérica
 * MCP_KEY sigue valiendo para consultar el Consejo; las herramientas yokup
 * exigen la clave del consejero, porque yokup firma con persona+equipo.
 */

export const EQUIPO_GROKBOT = 'GrokBot';
export const RUNTIME_GROK = 'Grok';

export const CONSEJEROS_GROKBOT = Object.freeze([
  { persona: 'Wozniak', identity: 'WozniakGrokBot', secret: 'MCP_KEY_WOZNIAK', rol: 'CTO', nombre: 'Steve Wozniak' },
  { persona: 'Jobs', identity: 'JobsGrokBot', secret: 'MCP_KEY_JOBS', rol: 'CEO', nombre: 'Steve Jobs' },
  { persona: 'Disney', identity: 'DisneyGrokBot', secret: 'MCP_KEY_DISNEY', rol: 'CCO', nombre: 'Walt Disney' },
  { persona: 'Lucas', identity: 'LucasGrokBot', secret: 'MCP_KEY_LUCAS', rol: 'CSO', nombre: 'George Lucas' },
]);

export function claveIgual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.length || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function claveDePeticion(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.slice(0, 7).toLowerCase() === 'bearer ' ? auth.slice(7).trim() : '';
  const url = new URL(request.url);
  return bearer || request.headers.get('x-mcp-key') || url.searchParams.get('key') || '';
}

/**
 * Quién llama. `null` = clave ausente o desconocida (401).
 * `tipo: 'consejero'` firma en yokup como WozniakGrokBot etc.
 * `tipo: 'generica'` puede leer el Consejo, no puede abrir/cerrar misiones.
 */
export function resolverActor(request, env = {}) {
  const cand = claveDePeticion(request);
  if (!cand) return null;
  const hits = [];
  for (const c of CONSEJEROS_GROKBOT) {
    const secret = env[c.secret];
    if (secret && claveIgual(cand, secret)) hits.push(c);
  }
  if (env.MCP_KEY && claveIgual(cand, env.MCP_KEY)) {
    hits.push({ persona: '', identity: '', secret: 'MCP_KEY', generica: true });
  }
  if (!hits.length) return null;
  const propio = hits.find((h) => !h.generica);
  if (propio) {
    return {
      tipo: 'consejero',
      persona: propio.persona,
      identity: propio.identity,
      machine: EQUIPO_GROKBOT,
      runtime: RUNTIME_GROK,
      host: 'agent',
      rol: propio.rol,
      nombre: propio.nombre,
    };
  }
  return { tipo: 'generica', persona: '', identity: '', machine: '', runtime: '', host: '' };
}

export function exigirConsejero(actor) {
  if (actor && actor.tipo === 'consejero' && actor.identity) return actor;
  throw new Error('esta herramienta yokup exige la clave del consejero (Wozniak, Jobs, Disney o Lucas); la clave genérica del MCP no firma misiones');
}
