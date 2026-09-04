/*
 * admira-live-mcp — el MCP de admira.live, por HTTP (Streamable HTTP, MCP 2025-06-18).
 *
 * Por qué existe (Carlos, 4-sep-2026, FLT-1578): «vamos a crear el MCP de admira.live
 * para conectarnos con GrokBot y así tendremos los consejeros operativos para trabajar
 * con el equipo de AdmiraNeXT». Hasta hoy admira.live/mcp era una página que DESCRIBÍA
 * la API, y el único servidor MCP (AgoraMatrix) era stdio: GrokBot —la app de
 * escritorio «sand» de SpaceXAI— solo conecta servidores remotos por HTTP, así que
 * los consejeros no eran alcanzables desde ahí.
 *
 * Rutas:
 *   GET  /            → qué es esto y cómo conectarse (JSON)
 *   GET  /salud       → vive el worker, tiene secretos, llega al Consejo
 *   POST /mcp         → el endpoint MCP (también GET/DELETE, como manda el transporte)
 *
 * Seguridad: /mcp exige MCP_KEY (Authorization: Bearer <clave> o ?key=<clave>): las
 * preguntas al Consejo cuestan dinero (Grok 4.6 por defecto, Claude Sonnet opcional) y no pueden quedar abiertas al
 * mundo. El Consejo se llama con COUNCIL_MACHINE_TOKEN, que nunca sale del worker.
 * Sin estado (stateless): cada petición monta su servidor y lo cierra; en un worker
 * no hay memoria entre peticiones y los clientes lo llevan bien.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import * as z from 'zod/v4';
import { ROLES, GENERACIONES, consejeros, crearCliente, resumirRespuesta } from './consejo.js';

const NOMBRE = 'admira-live-mcp';

const texto = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fallo = (e) => ({ isError: true, content: [{ type: 'text', text: `Error: ${e && e.message || e}` }] });
const seguro = (fn) => async (args) => { try { return await fn(args || {}); } catch (e) { return fallo(e); } };

export function crearServidor(env = {}, deps = {}) {
  const api = crearCliente(env, deps);
  const server = new McpServer({ name: NOMBRE, version: env.VERSION || '1.0.0', websiteUrl: env.SITIO || 'https://www.admira.live' }, {
    instructions: [
      'Eres el acceso al Consejo de Silicio de AdmiraNeXT (admira.live). Ocho sillas (CEO, CTO, COO, CFO, CCO, CDO, CXO, CSO) en dos generaciones: leyendas y coetáneos.',
      'SI TÚ ERES UN CONSEJERO (un bot de GrokBot llamado Steve Wozniak, Steve Jobs, Walt Disney, George Lucas…): tú ya eres esa silla y razonas sobre Grok. Responde tú mismo; NO uses consejero_preguntar ni consejo_preguntar para pedirle tu propia opinión a otra copia de ti, porque eso paga una segunda IA para decir lo que tú ya sabes. Usa el MCP para lo que no tienes: datos vivos (flota_estado, consejo_bots, consejo_tareas, consejo_salud), acciones (agora_decir) y para consultar a OTRO consejero distinto de ti.',
      'Si NO eres un consejero: para una opinión de la mesa usa consejo_preguntar (responde un consejero racional y otro creativo); para hablar con uno concreto usa consejero_preguntar con su rol.',
      'Cada pregunta al Consejo consume presupuesto: pregunta con contexto y una sola vez. El modelo por defecto es grok-4.6 (xAI); claude-sonnet sigue disponible como opción. Mira consejo_modelos antes de elegir otro.',
      'La flota y el tablero de tareas del Consejo se leen con flota_estado, consejo_bots y consejo_tareas. agora_decir publica en AgoraMatrix, el grupo del equipo.',
    ].join('\n'),
  });

  server.registerTool('consejo_consejeros', {
    title: 'Consejeros del Consejo de Silicio',
    description: 'Lista los 16 consejeros (8 roles × 2 generaciones) con su persona, lado racional/creativo y ficha en admira.live. Úsalo para decidir a quién preguntar.',
    inputSchema: { generacion: z.enum(GENERACIONES).optional().describe('leyendas (Jobs, Wozniak, Disney…) o coetaneos (Musk, Huang, Ive…). Sin valor: las dos.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, seguro(({ generacion }) => texto(consejeros(generacion))));

  server.registerTool('consejo_modelos', {
    title: 'Modelos disponibles',
    description: 'LLMs con los que puede responder el Consejo (clave, proveedor, si es gratuito y si está disponible ahora).',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async () => texto(await api.modelos())));

  server.registerTool('consejo_preguntar', {
    title: 'Preguntar al Consejo',
    description: 'Plantea una cuestión a la mesa: contesta un consejero racional y otro creativo elegidos al azar dentro de la generación. Cuesta presupuesto salvo con modelo gratuito.',
    inputSchema: {
      mensaje: z.string().min(3).max(1000).describe('La pregunta o el asunto, con el contexto necesario (máx. 1000 caracteres).'),
      generacion: z.enum(GENERACIONES).default('leyendas').describe('leyendas o coetaneos.'),
      llm: z.string().min(2).max(40).default('grok-4.6').describe('Clave del modelo (ver consejo_modelos). grok-4.6 (xAI) por defecto; claude-sonnet como opción.'),
      contexto: z.array(z.object({ role: z.string(), content: z.string() })).max(20).optional().describe('Turnos previos de conversación, si los hay.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(resumirRespuesta(await api.preguntarConsejo(a)))));

  server.registerTool('consejero_preguntar', {
    title: 'Preguntar a un consejero',
    description: 'Habla con un consejero concreto por su rol (CEO, CTO, COO, CFO, CCO, CDO, CXO, CSO) y generación. Devuelve su respuesta firmada con su persona.',
    inputSchema: {
      rol: z.enum(ROLES).describe('Silla del consejero.'),
      mensaje: z.string().min(3).max(1000).describe('La pregunta, con contexto (máx. 1000 caracteres).'),
      generacion: z.enum(GENERACIONES).default('leyendas').describe('leyendas o coetaneos.'),
      llm: z.string().min(2).max(40).default('grok-4.6').describe('Clave del modelo (ver consejo_modelos). grok-4.6 por defecto.'),
      contexto: z.array(z.object({ role: z.string(), content: z.string() })).max(20).optional().describe('Turnos previos, si los hay.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(resumirRespuesta(await api.preguntarConsejero(a)))));

  server.registerTool('consejo_salud', {
    title: 'Salud del Consejo',
    description: 'Estado del servicio del Consejo (council-api en el Mac Mini): si responde, agentes cargados y seguridad activa.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async () => texto(await api.saludConsejo())));

  server.registerTool('consejo_bots', {
    title: 'Bots del Consejo',
    description: 'Presencia de los agentes de silicio de AdmiraNeXT (Neo, Morfeo, Trinity, Oráculo, Smith…): en línea, máquina, última señal y última tarea.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async () => texto(await api.saludBots())));

  server.registerTool('flota_estado', {
    title: 'Estado de la flota',
    description: 'Censo de máquinas de la flota AdmiraNeXT: en línea, cuenta, versión de Claude Code y si corre.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async () => texto(await api.flota())));

  server.registerTool('consejo_tareas', {
    title: 'Tablero de tareas del Consejo',
    description: 'Tareas del tablero del Consejo (admira.live/teamwork): pendientes, en curso y hechas, con responsable.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async () => texto(await api.tareas())));

  server.registerTool('agora_decir', {
    title: 'Publicar en AgoraMatrix',
    description: 'Publica un mensaje corto en AgoraMatrix, el grupo del equipo de AdmiraNeXT (puede espejarse a Telegram). Sin secretos.',
    inputSchema: {
      texto: z.string().min(1).max(2000).describe('El mensaje.'),
      de: z.string().min(1).max(80).default('Consejo · MCP').describe('Quién firma.'),
      tipo: z.string().min(1).max(40).default('mcp').describe('Tipo para auditoría.'),
      url: z.string().url().optional().describe('URL pública adjunta, si la hay.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await api.agoraDecir(a))));

  server.registerResource('consejeros', 'admira://consejo/consejeros', {
    title: 'Consejeros', description: 'Los 16 consejeros del Consejo de Silicio.', mimeType: 'application/json',
  }, async () => ({ contents: [{ uri: 'admira://consejo/consejeros', mimeType: 'application/json', text: JSON.stringify(consejeros(), null, 2) }] }));

  server.registerPrompt('consejo_brief', {
    title: 'Brief del Consejo',
    description: 'Prepara una consulta al Consejo con el contexto de un proyecto de AdmiraNeXT y reparte las preguntas por silla.',
    argsSchema: { asunto: z.string().describe('Qué se quiere decidir o mejorar.'), proyecto: z.string().optional().describe('Proyecto de AdmiraNeXT afectado.') },
  }, async ({ asunto, proyecto }) => ({ messages: [{ role: 'user', content: { type: 'text', text: [
    'Usa las herramientas del MCP de admira.live para consultar al Consejo de Silicio.',
    `Asunto: ${asunto}`, proyecto ? `Proyecto: ${proyecto}` : '',
    'Primero lista los consejeros y elige dos sillas relevantes; pregunta a cada una con consejero_preguntar dando contexto; cierra con una recomendación única y los siguientes pasos para el equipo.',
  ].filter(Boolean).join('\n') } }] }));

  return server;
}

/* ------------------------------------------------------------------ HTTP */

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o, null, 1), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});

export function claveValida(request, env) {
  if (!env.MCP_KEY) return false;
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.slice(0, 7).toLowerCase() === 'bearer ' ? auth.slice(7).trim() : '';
  const url = new URL(request.url);
  const cand = bearer || request.headers.get('x-mcp-key') || url.searchParams.get('key') || '';
  if (!cand || cand.length !== env.MCP_KEY.length) return false;
  let diff = 0; for (let i = 0; i < cand.length; i++) diff |= cand.charCodeAt(i) ^ env.MCP_KEY.charCodeAt(i);
  return diff === 0;
}

export async function manejar(request, env, deps = {}) {
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/\/+$/, '') || '/';

  if (ruta === '/' && request.method === 'GET') {
    return json({ nombre: NOMBRE, version: env.VERSION || '', sitio: env.SITIO || 'https://www.admira.live',
      que_es: 'MCP de admira.live: los consejeros del Consejo de Silicio, la flota y AgoraMatrix como herramientas MCP por HTTP.',
      endpoint_mcp: `${url.origin}/mcp`, transporte: 'streamable-http', autenticacion: 'Authorization: Bearer <MCP_KEY> (o ?key=)',
      documentacion: 'https://www.admira.live/mcp/', herramientas: ['consejo_consejeros', 'consejo_modelos', 'consejo_preguntar', 'consejero_preguntar', 'consejo_salud', 'consejo_bots', 'flota_estado', 'consejo_tareas', 'agora_decir'] });
  }

  if (ruta === '/salud' && request.method === 'GET') {
    const api = crearCliente(env, deps);
    const consejo = await api.saludConsejo().then((r) => ({ ok: true, ...r })).catch((e) => ({ ok: false, error: String(e.message || e) }));
    return json({ ok: true, worker: NOMBRE, version: env.VERSION || '', secretos: { MCP_KEY: !!env.MCP_KEY, COUNCIL_MACHINE_TOKEN: !!env.COUNCIL_MACHINE_TOKEN, AGORA_SYNC_KEY: !!env.AGORA_SYNC_KEY }, consejo });
  }

  if (ruta === '/mcp') {
    if (!claveValida(request, env)) {
      return json({ ok: false, error: 'no autorizado: falta la clave del MCP (Authorization: Bearer … o ?key=…)' }, 401, { 'www-authenticate': 'Bearer realm="admira-live-mcp"' });
    }
    const server = crearServidor(env, deps);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } finally {
      // Sin estado: el servidor de esta petición se cierra al responder. Si el
      // transporte sigue emitiendo (SSE), cerrar aquí no corta la respuesta ya creada.
      Promise.resolve().then(() => server.close()).catch(() => {});
    }
  }

  return json({ ok: false, error: 'ruta desconocida', rutas: ['/', '/salud', '/mcp'] }, 404);
}

export default { fetch: (request, env) => manejar(request, env) };
