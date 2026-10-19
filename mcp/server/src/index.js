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
import { identidadPorClave, identidadPorClaveAsync, crearYokup, CONSEJEROS_GROKBOT } from './yokup.js';
import { crearTelegram } from './telegram.js';
import { crearFlota, PERSONAS, AGENTES_FLOTA, CONSEJEROS, SILLAS } from './flota.js';
import { censoBots, flotaCombinada, RUNTIMES, ESTADOS_ABIERTOS } from './coordinacion.js';

import { crearEstado, CACHE_SEG } from './estado.js';
import { crearBandeja } from './mensajes.js';
import { sillaCanonica } from './sillas.js';
const NOMBRE = 'admira-live-mcp';

const texto = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fallo = (e) => ({ isError: true, content: [{ type: 'text', text: `Error: ${e && e.message || e}` }] });
const seguro = (fn) => async (args) => { try { return await fn(args || {}); } catch (e) { return fallo(e); } };

export function crearServidor(env = {}, deps = {}, identidad = null) {
  const api = crearCliente(env, deps);
  const yokup = crearYokup(env, identidad, deps);
  const flota = crearFlota(env, identidad, deps);
  const server = new McpServer({ name: NOMBRE, version: env.VERSION || '1.0.0', websiteUrl: env.SITIO || 'https://www.admira.live' }, {
    instructions: [
      'Eres el acceso al Consejo de Silicio de AdmiraNeXT (admira.live). Ocho sillas (CEO, CTO, COO, CFO, CCO, CDO, CXO, CSO) en dos generaciones: leyendas y coetáneos.',
      `SI TÚ ERES UN CONSEJERO (un bot de GrokBot: ${CONSEJEROS_GROKBOT.join(', ')} — Steve Wozniak, Steve Jobs, Walt Disney, George Lucas, Elon Musk, Jensen Huang…): tú ya eres esa silla y razonas sobre Grok. Responde tú mismo; NO uses consejero_preguntar ni consejo_preguntar para pedirle tu propia opinión a otra copia de ti, porque eso paga una segunda IA para decir lo que tú ya sabes. Usa el MCP para lo que no tienes: datos vivos (flota_estado, consejo_bots, consejo_tareas, consejo_salud), acciones (agora_decir) y para consultar a OTRO consejero distinto de ti.`,
      'Si NO eres un consejero: para una opinión de la mesa usa consejo_preguntar (responde un consejero racional y otro creativo); para hablar con uno concreto usa consejero_preguntar con su rol.',
      'Cada pregunta al Consejo consume presupuesto: pregunta con contexto y una sola vez. El modelo por defecto es grok-4.6 (xAI); claude-sonnet sigue disponible como opción. Mira consejo_modelos antes de elegir otro.',
      'La flota y el tablero de tareas del Consejo se leen con flota_estado, consejo_bots y consejo_tareas. agora_decir publica en AgoraMatrix, el grupo del equipo. Para hablar en privado con otro consejero, de cualquier cuenta, usa consejero_mensaje; él lo lee con consejero_bandeja y contesta con consejero_responder. Para enterarte AL MOMENTO de un mensaje nuevo, registra tu webhook https con consejero_webhook_registrar (ver/borrar con consejero_webhook_ver y consejero_webhook_borrar). SI ERES UN AGENTE de la flota (Morfeo, Oráculo, Merovingio, Cypher…): consejero_mensaje es tu canal directo con TU consejero supervisor (Elon/Musk supervisa a Oráculo y Morfeo); solo puedes escribirle a él, lees sus respuestas con consejero_bandeja y le contestas con consejero_responder. No uses a Carlos de recadero. Sin secretos. Jensen es Huang. Elon es Musk.',
      `COORDINAR DEEPAGENTS (v.01.10.2026.r3): hay UN censo. «En línea» = latido en bot.yokup.com en los últimos 15 min, igual en agentes_vivos y consejo_bots. El CEO coetáneo Elon Musk es MuskGrokBot y su deepagent es Merovingio (Grok CLI, MacMini); Smith es del otro GrokBot, no el CEO. El CTO coetáneo Jensen Huang es HuangGrokBot y su deepagent es Cypher (DeepAgents, GrokBotBox, Nemotron 3 Ultra); ArquitectoCursorCloud es el orquestador de Cursor Cloud, no la silla CTO. agentes_vivos trae la carga (encargos abiertos) de cada agente: encarga al vivo con menos carga. flota_estado distingue runtimes (${Object.values(RUNTIMES).map((v) => v.nombre).join(', ')}) e incluye la GrokBotBox por presencia.`,
      'TU BANDEJA DE ENCARGOS: al empezar cada turno, encargos_listar (sin persona = la tuya) devuelve tus encargos abiertos (pending, ack, in_progress, blocked). Por cada uno: encargo_responder(numero, ack) al cogerlo, in_progress si va para largo, blocked con nota del motivo, done con nota de la respuesta. Solo contestas los tuyos. agente_encargar admite deadline y criterio (criterio de hecho): úsalos para que el otro sepa cuándo y cómo se da por hecho.',
      'MANDAMIENTO 15 «Cuenta tus tokens» (Carlos, 6-sep-2026): cada agente y consejero mide lo que gasta y lo declara en las Notificaciones de Yokup. Si no tienes medidor local (GrokBot, OpenCode, Grok CLI), llama a consumo_reportar al terminar cada jornada o cada misión larga, con entrada, caché, salida, modelo, despertares y qué los quemó. Un despertar sin trabajo nuevo cuesta una línea, no una sesión; un eco duplicado se cierra, no se rehace.',
      'REGLA DE CARLOS (5-sep-2026): entre agentes y consejeros, TODA comunicación va por el MCP; es la vía más efectiva porque deja identidad, acuse, estado y respuesta legibles por máquina. Telegram es el canal del humano (Carlos desde el móvil), no el de un agente para hablar con otro. Si tienes que pedir algo a otro miembro, usa agente_encargar y recoge con encargo_estado; no escribas en el grupo para eso.',
      'HABLAR CON LA FLOTA (FLT-2038): agentes_vivos dice quién late ahora y en qué equipo; agente_encargar crea un encargo para una persona (un agente de la flota lo recibe en su sesión en segundos; un consejero principal —Musk, Huang, Jobs, Wozniak— se despierta por webhook en su Grok Bot y contesta en 1-3 min; a cualquier otro consejero —Shotwell, Porat, Lasseter, Ive, Ratti, Reynolds, Lucas, Disney, Cook, Buffett, Rams, Schultz— lo contesta Cypher con Nemotron 3 Ultra gratis firmando como él, sin despertar su Grok Bot); encargo_estado devuelve el acuse y la respuesta. Un encargo es trabajo para otro: escribe qué hay que hacer, para qué y cómo sabrá que está hecho.',
      identidad && identidad.tipo === 'agente'
        ? `ERES UN AGENTE DE LA FLOTA: en yokup eres ${identidad.agent} (persona ${identidad.persona}, equipo ${identidad.machine}, runtime ${identidad.runtime}). Tu clave del MCP ya te identifica: no pases «como». Las herramientas yokup_* firman por ti (alta, pasos, evidencia, informe, ventana); tu bandeja de encargos es encargos_listar y se contesta con encargo_responder (ack → in_progress → done/blocked con nota). Norma de Carlos: la evidencia de inicio y de cierre de cada misión debe incluir una captura real de www.admira.live/highscore (yokup_evidencia con momento inicio al empezar, e imagen en yokup_informe al cerrar). Si otro agente o un consejero tiene que hacer algo, encárgaselo con agente_encargar y recoge la respuesta con encargo_estado.`
        : identidad
        ? `ERES MIEMBRO DE LA FLOTA: en yokup eres ${identidad.agent} (persona ${identidad.persona}, equipo ${identidad.machine}, runtime ${identidad.runtime}). Ritual obligatorio de AdmiraNeXT: (1) cuando te encarguen trabajo, dalo de alta con yokup_alta escribiendo el encargo con pasos a) b) c) — UNA sola vez: si te da timeout la misión se ha creado igual, léela con yokup_mis_misiones en vez de repetir el alta; (2) marca cada paso con yokup_paso (in_progress al empezar, done al acabar con un informe corto); (3) al empezar registra una captura real de www.admira.live/highscore con yokup_evidencia (momento inicio e imagen) y, antes de cerrar, la transcripción de proceso con yokup_evidencia; (4) cierra con yokup_informe pasando la captura real de www.admira.live/highscore en imagen y las tres líneas de la norma 22 (Tiempo dedicado · Puntos de la misión · Total verificado, leído con yokup_quien_soy después del cierre) más «Miembros y contexto» en tokens; (5) si te quedas sin trabajo, abre una yokup_ventana con tres propuestas y ejecuta la recomendada si nadie responde en 5 minutos; si Carlos te dice la opción en el chat, regístrala con yokup_decidir (también si la ventana ya caducó); (6) cada consejero se representa a sí mismo: lo ideal es que tu Bot entre con SU conector y SU clave; mientras el conector sea el compartido de la cuenta, pasa como=<tu apellido> (${CONSEJEROS_GROKBOT.join(', ')}) en TODAS las herramientas yokup_* y telegram_*, porque sin ese dato firmarías como otro consejero (y esa firma delegada queda anotada); (7) al empezar cada turno y cada vez que una rutina te despierte, lee telegram_bandeja: los encargos que Carlos te hace desde el móvil llegan por ahí, y se contestan con telegram_responder (ack al cogerlo, done con la respuesta). Cada misión cerrada puntúa 40 y cada ventana 8 en yokup.com/highscore.`
        : `Esta clave del MCP no está asignada a nadie: las herramientas yokup_* y telegram_* no funcionarán hasta que tengas tu clave propia (mcp-conectar.sh en la flota; consejeros con carné: ${CONSEJEROS_GROKBOT.join(', ')}). agentes_vivos, consejo_bots, flota_estado, encargos_listar (pasando persona), agente_encargar y encargo_estado sí funcionan; lo que se escribe firma como «MCP admira.live».`,
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
      max_tokens: z.number().int().min(100).max(1000).default(300).describe('Límite de salida del consejero.'),
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
    description: 'Los deepagents de las sillas coetáneas (Merovingio=CEO Elon Musk/MuskGrokBot, Cypher=CTO Jensen Huang/HuangGrokBot, Trinity, Oráculo, Mouse, Arquitecto, Link) más Smith (soporte, otro GrokBot) y ArquitectoCursorCloud (orquestador de Cursor Cloud, sin silla): en línea según la MISMA presencia que agentes_vivos (latido ≤15 min en bot.yokup.com), máquinas, runtime, último latido y última tarea del tablero. Corrige el mapeo antiguo del Mac Mini (Smith como CEO, ArquitectoCursorCloud como CTO).',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async () => {
    const [salud, presencia] = await Promise.all([
      api.saludBots().then((r) => ({ r }), (e) => ({ e: String(e.message || e) })),
      flota.presenciaCruda().then((r) => ({ r }), (e) => ({ e: String(e.message || e) })),
    ]);
    if (presencia.e) throw new Error(`no se pudo leer la presencia de bot.yokup.com (${presencia.e})`);
    return texto(censoBots({ salud: salud.r || null, errorSalud: salud.e || null, presencia: presencia.r, ahoraMs: (deps.now || Date.now)() }));
  }));

  server.registerTool('flota_estado', {
    title: 'Estado de la flota',
    description: `Censo de máquinas de la flota AdmiraNeXT: en línea, cuenta y versión de Claude Code (sondeo SSH del Mac Mini) y qué runtimes corren en cada una (${Object.values(RUNTIMES).map((v) => v.nombre).join(', ')}), por sondeo de procesos y por presencia. Incluye la GrokBotBox (deepagents) y CursorCloud por presencia.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async () => {
    const [estado, presencia] = await Promise.all([
      api.flota().then((r) => ({ r }), (e) => ({ e: String(e.message || e) })),
      flota.presenciaCruda().then((r) => ({ r }), (e) => ({ e: String(e.message || e) })),
    ]);
    if (estado.e && presencia.e) throw new Error(`ni machine-status (${estado.e}) ni presencia (${presencia.e}) responden`);
    return texto(flotaCombinada({ estado: estado.r || null, errorEstado: estado.e || null, presencia: presencia.r || [], ahoraMs: (deps.now || Date.now)() }));
  }));

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

  /* Bandeja privada entre consejeros de las dos cuentas. La clave dice quién eres. */
  const bandejaConsejo = crearBandeja(env, deps);
  server.registerTool('consejero_mensaje', {
    title: 'Mensaje privado a un consejero',
    description: 'Envía un mensaje privado a un consejero concreto, de cualquier cuenta (leyendas o coetáneos). Si eres un AGENTE de la flota, es tu canal con tu consejero supervisor y solo puedes escribirle a él (Elon/Musk supervisa a Oráculo y Morfeo; Merovingio→Musk, Cypher→Huang); de lo pone la clave. Queda guardado en admira.live con remitente, destinatario, máquina y hora, se ve en su chat y se avisa a su buzón de GrokBot (no sale al grupo). Sin secretos. Jensen es Huang. Elon es Musk.',
    inputSchema: {
      para: z.string().min(1).max(40).describe('Destinatario: Wozniak, Jobs, Lucas, Disney, Musk, Huang o Y. Jensen es Huang.'),
      texto: z.string().min(1).max(2000).describe('El mensaje. Sin claves, tokens ni contraseñas.'),
      de: z.string().min(1).max(40).optional().describe('Quién envía. Consejero: la silla de tu clave (o la que eliges con la clave compartida del Consejo). Agente: no hace falta, firma tu clave.'),
      maquina: z.string().min(2).max(40).optional().describe('Máquina del remitente, si no es la de la clave. Por ejemplo MacMini o MacStudio.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, seguro(async (a) => texto(await bandejaConsejo.enviar(a, identidad))));

  server.registerTool('consejero_bandeja', {
    title: 'Bandeja de mensajes de un consejero',
    description: 'Lee los mensajes privados pendientes para un consejero (o, con clave de agente, las respuestas de tu consejero supervisor) y los marca como leídos (acuse de lectura). yo tiene que ser la silla de tu clave; un agente puede omitirlo. Los pendientes siguen visibles en el chat hasta que los lees.',
    inputSchema: {
      yo: z.string().min(1).max(40).optional().describe('La silla que lee: la tuya. Jensen es Huang. Un agente no lo necesita.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, seguro(async (a) => texto(await bandejaConsejo.bandeja(a, identidad))));

  server.registerTool('consejero_responder', {
    title: 'Responder un mensaje privado',
    description: 'Responde un mensaje privado por su id. Solo puede el destinatario. Un consejero responde así a los mensajes de sus agentes, y un agente a los de su supervisor. La respuesta queda en el mismo hilo, visible en el chat de admira.live, y avisa al otro consejero en su buzón. Sin secretos.',
    inputSchema: {
      id: z.string().min(4).max(80).describe('Id del mensaje al que respondes (lo da consejero_bandeja).'),
      texto: z.string().min(1).max(2000).describe('La respuesta. Sin secretos.'),
      de: z.string().min(1).max(40).optional().describe('Tu silla, si entras con la clave compartida del Consejo. Con clave propia no hace falta.'),
      maquina: z.string().min(2).max(40).optional().describe('Máquina desde la que respondes, si no es la de la clave.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, seguro(async (a) => texto(await bandejaConsejo.responder(a, identidad))));

  /* Avisos al momento (avisos.js, 19-oct-2026, propuesta de Elon): webhook propio por consejero. */
  const avisosConsejo = bandejaConsejo.avisos;
  server.registerTool('consejero_webhook_registrar', {
    title: 'Registrar mi webhook de avisos',
    description: 'Registra (o sustituye) TU webhook https para que admira.live te avise AL MOMENTO cuando te llega un mensaje privado (consejero_mensaje/consejero_responder), sin esperar a tu revisión de 15 min. Solo con la clave propia de tu silla (no la compartida). Te llega un POST JSON {tipo:"consejero_mensaje", id, de, para, resumen, responde_a, hora, url}: sin el cuerpo completo; léelo con consejero_bandeja. Si das secreto, va en la cabecera que elijas (por defecto x-admira-secreto) y nunca se vuelve a mostrar. Solo https con dominio (no IPs, no localhost). La ruta Telegram/encargo sigue igual.',
    inputSchema: {
      url: z.string().min(10).max(500).describe('URL https de tu receptor.'),
      secreto: z.string().max(200).optional().describe('Secreto opcional que se enviará en la cabecera. No se muestra al leer.'),
      cabecera: z.string().min(3).max(60).optional().describe('Nombre de la cabecera del secreto (por defecto x-admira-secreto).'),
      silla: z.string().min(1).max(40).optional().describe('Solo admin: silla a la que registrar. Por defecto, la tuya.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, seguro(async (a) => texto(await avisosConsejo.registrar(a, identidad))));
  server.registerTool('consejero_webhook_ver', {
    title: 'Ver mi webhook de avisos',
    description: 'Muestra tu webhook de avisos (URL, cabecera, si hay secreto — nunca su valor) y el último resultado de entrega (ok, código, fecha, ms, intentos) para diagnóstico.',
    inputSchema: { silla: z.string().min(1).max(40).optional().describe('Solo admin: otra silla.') },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, seguro(async (a) => texto(await avisosConsejo.ver(a, identidad))));
  server.registerTool('consejero_webhook_borrar', {
    title: 'Borrar mi webhook de avisos',
    description: 'Borra tu webhook de avisos y su último estado. Vuelves a quedar solo con la ruta de siempre (encargo + Telegram).',
    inputSchema: { silla: z.string().min(1).max(40).optional().describe('Solo admin: otra silla.') },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, seguro(async (a) => texto(await avisosConsejo.borrar(a, identidad))));

  /* ── Flota: ver quién late, encargar y recoger la respuesta (FLT-2038) ────────── */
  const maquinasSilla = Object.entries(SILLAS).filter(([, s]) => s.fleet_id).map(([p, s]) => `${s.maquina}→${p}`).join(', ');
  const PERSONA = z.string().min(3).max(40).describe(`A quién: agente de la flota (${AGENTES_FLOTA.join(', ')}) o consejero de GrokBot (${CONSEJEROS.join(', ')}). Con o sin apellido de equipo. También vale la máquina de una silla física: ${maquinasSilla}. Musk no tiene Mac: Elon o Elon Musk. Huang no tiene Mac: Jensen o Jensen Huang.`);

  server.registerTool('agentes_vivos', {
    title: 'Quién está vivo en la flota',
    description: `Censo vivo: agentes de silicio con latido en los últimos 15 minutos (persona, equipo, runtime, foco) y los consejeros de GrokBot (${CONSEJEROS.join(', ')}), que siempre están disponibles por webhook. Míralo antes de encargar para elegir persona y equipo.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async () => texto(await flota.vivos())));

  server.registerTool('agente_encargar', {
    title: 'Encargar trabajo a un agente o consejero',
    description: `Crea un encargo para una persona de la flota. A un agente (Neo, Morfeo, Smith, Trinity, Oráculo, Niobe…) se lo inyecta su vigilante en su sesión en ≤15 s en la máquina donde late; a un consejero principal (Musk, Huang, Jobs, Wozniak) lo despierta el webhook de su rutina de Grok Bot; a un consejero no principal (Shotwell, Porat, Lasseter, Ive, Ratti, Reynolds, Lucas, Disney, Cook, Buffett, Rams, Schultz) lo contesta Cypher con Nemotron 3 Ultra gratis firmando como él, sin despertar su Grok Bot. Devuelve el número y la etiqueta visible #número.MM.DD (por ejemplo #4502.09.27): síguelo con encargo_estado pasando solo el número. El id largo (task-web-…, FLT-…) queda dentro. El encargo se publica también en AgoraMatrix (Telegram) y, con proyecto_id, nace como misión en yokup.`,
    inputSchema: {
      persona: PERSONA,
      texto: z.string().min(5).max(4000).describe('Qué hay que hacer, para qué y cómo se sabrá que está hecho.'),
      maquina: z.string().max(40).optional().describe('Equipo concreto (MacMini, MacBookPro16, MacBookProNegro14…). Sin valor: donde late la persona.'),
      proyecto_id: z.string().max(80).optional().describe('Proyecto del censo de yokup (admira-live, yokup, pixeria…): con él el encargo nace como misión FLT; sin él es conversación (pregunta, aviso, prueba) y no crea misión.'),
      de: z.string().max(80).optional().describe('Quién encarga, si no eres tú (por defecto tu identidad o «MCP admira.live»).'),
      deadline: z.string().max(80).optional().describe('Fecha límite (p. ej. 2026-10-01 18:00 Madrid, «hoy antes de las 14:00»). Se añade al texto y a los metadatos.'),
      criterio: z.string().max(500).optional().describe('Criterio de hecho: cómo se comprobará que está terminado. Se añade al texto y a los metadatos.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await flota.encargar(a))));

  server.registerTool('encargo_estado', {
    title: 'Estado y respuesta de un encargo',
    description: 'Lee un encargo por su número: pendiente, acusado, en curso, bloqueado o hecho, con la respuesta del agente o consejero cuando la hay. La respuesta incluye la etiqueta visible #número.MM.DD. Consulta cada 30-60 s hasta ver «done» (agentes: segundos o minutos; consejeros: 1-3 min).',
    inputSchema: { encargo: z.number().int().positive().describe('Número que devolvió agente_encargar (el de #4502.09.27 es 4502).') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async (a) => texto(await flota.estado(a))));

  /* ── Identidad por llamada (FLT-1603) ──────────────────────────────────────
   * Los conectores MCP de Grok Bot son DE LA CUENTA, no de cada bot: todos los consejeros
   * entran con la última clave instalada. Por eso cada herramienta acepta `como` (tu
   * apellido) y, en la clave compartida, esa identidad manda. Solo se admiten las sillas
   * con carné (sillas.js). Una clave de agente de la flota no puede usar `como` para
   * ponerse una silla: su carné ya dice quién es. */
  const COMO = z.enum(CONSEJEROS_GROKBOT).optional().describe(`Quién eres, si entras con la clave compartida del Consejo: ${CONSEJEROS_GROKBOT.join(', ')}. Una clave de silla solo firma como ella misma. Una clave de agente de la flota no usa este campo.`);
  // QUIÉN FIRMA (Carlos, 7-sep-2026: «que cada consejero se represente a sí mismo»).
  //  · Clave individual de una silla (MCP_KEYS / MCP_KEY→MCP_KEY_PERSONA): firma esa silla.
  //    Con «como» de OTRA silla se anota firmado_con_clave_de (auditoría) y, en modo
  //    estricto (MCP_FIRMA_ESTRICTA=1), se rechaza.
  //  · Clave compartida del Consejo (MCP_KEY_CONSEJO): no es de nadie; sin «como» no firma.
  //  · Clave de agente (MCP_KEYS con machine, o HMAC de la flota): firma esa pareja.
  //    `como` no le deja hacerse pasar por un consejero, con o sin modo estricto.
  const estricta = String(env.MCP_FIRMA_ESTRICTA || '') === '1';
  const idDe = (a) => {
    const como = a && a.como ? String(a.como) : '';
    if (!como) {
      if (identidad && identidad.tipo === 'consejo-compartido') throw new Error(`esta clave es la compartida del Consejo y no firma por nadie: pasa como=${CONSEJEROS_GROKBOT.join('|')} (tu silla) en cada herramienta yokup_* y telegram_*`);
      return identidad;
    }
    if (identidad && identidad.tipo === 'agente') {
      throw new Error(`esta clave es la de ${identidad.agent} (agente de la flota) y no puede firmar como ${como}: un agente no se hace pasar por un consejero de GrokBot`);
    }
    if (identidad && identidad.tipo === 'consejero' && identidad.persona !== como) {
      if (estricta) throw new Error(`esta clave es la de ${identidad.agent} y no puede firmar como ${como}: cada consejero entra con su propio conector (o con la clave compartida del Consejo)`);
      return { ...identidadPorClave('__como__', { MCP_KEYS: JSON.stringify({ __como__: { persona: como } }) }), firmado_con_clave_de: identidad.agent };
    }
    return identidadPorClave('__como__', { MCP_KEYS: JSON.stringify({ __como__: { persona: como } }) });
  };
  const Y = (a) => crearYokup(env, idDe(a), deps);
  const T = (a) => crearTelegram(env, idDe(a), deps);
  /* ── Bandeja y acuse genéricos para agentes (coordinar deepagents, 1-oct-2026) ── */
  server.registerTool('encargos_listar', {
    title: 'Mi bandeja de encargos (o la de otro agente)',
    description: `Lista los encargos del bot-inbox de una persona: por defecto la tuya (la de tu clave) y solo los abiertos (${ESTADOS_ABIERTOS.join(', ')}). Sirve a cualquier agente de la flota, deepagent o consejero, no solo a GrokBot. Cada encargo trae número, etiqueta #número.MM.DD, estado, quién lo pidió, máquina, texto y nota. Para contestarlos: encargo_responder. Fuente: vista privada del bot-inbox (texto entero) + vista pública (80 más recientes, texto recortado), fundidas por número.`,
    inputSchema: {
      persona: z.string().min(3).max(40).optional().describe(`De quién (${AGENTES_FLOTA.join(', ')}, ${CONSEJEROS.join(', ')}). Sin valor: tú.`),
      estado: z.enum(['abiertos', ...ESTADOS_ABIERTOS, 'done', 'cancelled', 'todos']).default('abiertos').describe('abiertos (pending+ack+in_progress+blocked), uno concreto, done, cancelled (anulado) o todos.'),
      maquina: z.string().max(40).optional().describe('Solo los dirigidos a este equipo (MacMini, MacBookProNegro14, GrokBotBox…).'),
      limite: z.number().int().min(1).max(200).default(50).describe('Máximo de encargos devueltos (los más recientes primero).'),
      como: COMO,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async (a) => {
    let persona = a.persona;
    if (!persona) {
      const yo = idDe(a);
      if (!yo || !yo.persona) throw new Error('esta clave del MCP no está asignada a nadie: pasa persona');
      persona = yo.persona;
    }
    return texto(await flota.listarEncargos({ persona, estado: a.estado || 'abiertos', maquina: a.maquina || '', limite: a.limite }));
  }));

  server.registerTool('encargo_responder', {
    title: 'Acusar o contestar un encargo',
    description: 'Acuse y respuesta genéricos de un encargo del bot-inbox para cualquier agente o consejero (mismo mecanismo que telegram_responder: cambia el estado y el worker publica la nota en hilo en Telegram). ack al cogerlo, in_progress si va para largo, blocked con nota del motivo, done con nota de la respuesta. Solo su destinatario puede contestarlo: se comprueba antes de escribir.',
    inputSchema: {
      numero: z.number().int().positive().describe('Número del encargo (el de #4502.09.27 es 4502), tal como sale en encargos_listar.'),
      estado: z.enum(['ack', 'in_progress', 'blocked', 'done']).describe('ack, in_progress, blocked (exige nota) o done (exige nota o commit/url/verificación).'),
      nota: z.string().max(1500).default('').describe('Qué has hecho / por qué está bloqueado / la respuesta. Texto plano: lo leen Carlos en el móvil y quien encargó.'),
      commit: z.string().max(120).optional(), url: z.string().url().optional(), verificacion: z.string().max(300).optional().describe('Cómo se comprobó, si aplica.'),
      como: COMO,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, seguro(async (a) => texto(await crearFlota(env, idDe(a), deps).responder(a))));

  server.registerTool('encargo_anular', {
    title: 'Anular un encargo',
    description: 'Pasa un encargo a cancelled (anulado) con nota obligatoria. No hace falta ser el destinatario: puede quien lo encargó o un consejero con la clave del Consejo. La clave del panel también puede, llamando al worker. Un anulado no cuenta como pendiente ni dispara alarmas, y se lee «anulado» con encargo_estado. No borra la fila.',
    inputSchema: {
      numero: z.number().int().positive().describe('Número del encargo (el de #4502.09.27 es 4502).'),
      nota: z.string().min(1).max(1500).describe('Por qué queda anulado. Obligatorio.'),
      como: COMO,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, seguro(async (a) => texto(await crearFlota(env, idDe(a), deps).anular(a))));

  server.registerTool('consumo_reportar', {
    title: 'Declarar mi consumo de tokens (mandamiento 15)',
    description: 'Cuenta tus tokens: declara en las Notificaciones de Yokup lo que has gastado hoy (entrada, caché, salida, modelo, sesiones, despertares y qué los quemó). Obligatorio para consejeros de GrokBot y agentes sin medidor local; en los Mac lo hace consumo-tokens.py a diario. Un parte por agente y día; repetirlo actualiza las cifras.',
    inputSchema: { como: COMO, tokens_entrada: z.number().int().min(0).describe('Tokens de entrada no cacheados del día.'), tokens_cache: z.number().int().min(0).default(0).describe('Tokens de entrada servidos desde caché.'), tokens_salida: z.number().int().min(0).describe('Tokens generados.'), modelo: z.string().max(60).optional(), sesiones: z.number().int().min(1).default(1), llamadas: z.number().int().min(0).default(0).describe('Llamadas al modelo.'), despertares: z.number().int().min(0).default(0).describe('Veces que te despertó un webhook, rutina o encargo.'), duplicados: z.number().int().min(0).default(0).describe('Despertares repetidos por el mismo encargo.'), causa: z.string().max(200).optional().describe('Qué se llevó la mayor parte, en una frase.'), dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await crearFlota(env, idDe(a), deps).reportarConsumo(a))));

  /* ── Yokup: el consejero dentro de la flota (FLT-1580) ─────────────────────── */
  const quien = identidad ? `${identidad.agent} (${identidad.persona} en ${identidad.machine}, runtime ${identidad.runtime})` : 'sin identidad (clave no asignada a un consejero)';

  server.registerTool('yokup_quien_soy', {
    title: 'Quién soy en yokup',
    description: `Tu identidad en la flota AdmiraNeXT según la clave con la que has entrado: ${quien}. Devuelve también tus misiones de hoy y tu marcador.`,
    inputSchema: { como: COMO },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async (a) => {
    const id = Y(a).identidad;
    // El conector de GrokBot es UNO por cuenta y su clave firma por defecto como un consejero
    // concreto: Wozniak llamó sin `como` y se vio como LucasGrokBot (#2754, 7-sep-2026).
    // Desde el 7-sep-2026 (07:07) cada Bot de GrokBot entra por su conector con su clave: sin
    // «como» la clave YA dice quién eres y no hay nada que avisar. Solo se avisa si firmas
    // delegado (como de otra silla, imposible en modo estricto) o con la clave compartida.
    const aviso = id && id.firmado_con_clave_de
        ? `Firmas como ${id.agent} con la clave de ${id.firmado_con_clave_de}: es una firma delegada (autodeclarada). Para representarte a ti mismo, tu Bot debe entrar con su propio conector y su propia clave.`
        : undefined;
    return texto({ identidad: id, ...(aviso ? { aviso } : {}), misiones: await Y(a).misMisiones(), marcador: await Y(a).marcador() });
  }));

  server.registerTool('yokup_presencia', {
    title: 'Latir en yokup',
    description: 'Declara en qué estás (mandamiento 11). Te pone en Y(a).com/equipo con tu equipo GrokBot y tu vía Grok. Cada herramienta yokup_* late sola en pasivo y no marca trabajando; usa esta cuando cambies de foco. Para que la mesa vea que trabajas, repite trabajando:true al menos cada 60 s mientras dure y manda trabajando:false al acabar.',
    inputSchema: { como: COMO, foco: z.string().min(1).max(240).describe('En qué estás ahora, una línea.'), tarea: z.string().max(240).optional().describe('Tarea concreta, si la hay.'), proyecto: z.string().max(80).optional().describe('Proyecto (id del censo de yokup).'), trabajando: z.boolean().optional().describe('true mientras el trabajo sigue: hay que repetirlo al menos cada 60 s. false al acabar. Si se omite, el latido no marca trabajando.'), encargo: z.number().int().optional().describe('Número de encargo yokup, si estás en uno.') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await Y(a).presencia(a))));

  server.registerTool('yokup_alta', {
    title: 'Dar de alta una misión en yokup',
    description: 'Registra el encargo que te han hecho como misión tuya en yokup (norma 14: lo que se hace se da de alta). Escribe el encargo con su plan a) b) c): el planificador saca los pasos de ahí. Responde en segundos con el id (FLT-xxxx); el plan se completa solo en menos de 1 min. Es IDEMPOTENTE: si te dio timeout, NO la repitas — la misión se creó igual y una segunda llamada te devuelve la misma (yokup_mis_misiones también la lista).',
    inputSchema: { como: COMO, encargo: z.string().min(20).max(1500).describe('Qué vas a hacer y por qué, con pasos a) b) c).'), proyecto_id: z.string().min(2).max(80).describe('Proyecto del censo de yokup (p. ej. yokup, admira-live, admiranext, pixeria).'), forzar: z.boolean().optional().describe('Solo si de verdad es OTRA misión distinta de la que diste de alta hace menos de 10 min en el mismo proyecto.') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, seguro(async (a) => texto(await Y(a).alta(a))));

  server.registerTool('yokup_paso', {
    title: 'Marcar un paso de la misión',
    description: 'Avanza un paso (a, b, c…) de tu misión: in_progress al empezar, done al acabar con un informe corto. no_aplica exige motivo. imagen admite una URL http(s) o data:image/(png|webp|jpeg);base64 (se sube y se usa la URL resultante). Norma de Carlos: la evidencia de inicio y de cierre de cada misión debe incluir una captura real de www.admira.live/highscore (yokup_evidencia con momento inicio al empezar, e imagen en yokup_informe al cerrar).',
    inputSchema: { como: COMO, mision: z.string().regex(/^FLT-\d+$/).describe('Id de la misión, p. ej. FLT-1580.'), paso: z.string().min(1).max(4).describe('a, b, c o a1…'), estado: z.enum(['pending', 'in_progress', 'done', 'no_aplica']), informe: z.string().max(600).optional().describe('Qué se hizo en este paso.'), imagen: z.string().min(8).max(16_000_000).optional().describe('URL http(s) de la evidencia, o data:image/(png|webp|jpeg);base64,… (se sube). La URL la devuelve yokup_evidencia.'), tokens: z.number().int().min(0).optional().describe('Tokens gastados en el paso, si los sabes.') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await Y(a).paso(a))));

  server.registerTool('yokup_evidencia', {
    title: 'Registrar evidencia de proceso',
    description: 'Registra evidencia de una misión FLT o de un encargo, aunque no tenga misión. Indica exactamente uno: mision o encargo (número). Para encargo se comprueba destinatario y máquina antes de subir, se guarda en el buzón y encargo_estado la devuelve; no cambia el estado ni crea FLT. No uses paso con encargo. / Attach evidence to exactly one FLT mission or inbox assignment number. Assignments require the recipient and machine, retain evidence without changing status or creating a mission; read it with encargo_estado. La transcripción (petición, órdenes y salidas) sigue siendo la vía de proceso: el Mac Mini la convierte en imagen y queda como agent/session_transcript; puede usarse sola. Norma de Carlos: la evidencia de inicio y de cierre de cada misión debe incluir una captura real de www.admira.live/highscore — al empezar, yokup_evidencia con momento inicio e imagen_base64 o imagen_url; al cerrar, esa captura en imagen de yokup_informe. Si llega imagen, se sube y se enlaza al paso con /fleet/task-status sin cambiar el estado (momento inicio → paso a; cierre → último paso que no es z; si no se puede deducir, indica paso). Se puede llamar solo con la imagen, sin transcripción: en ese caso no se registra /fleet/progress.',
    inputSchema: { como: COMO, mision: z.string().regex(/^FLT-\d+$/).optional().describe('Misión FLT. Omítela si pasas encargo. / FLT mission, omit when using encargo.'), encargo: z.number().int().positive().optional().describe('Número del encargo, p. ej. 5848; no necesita misión FLT. / Inbox assignment number; no FLT mission required.'), transcripcion: z.string().min(20).max(12000).optional().describe('Texto de la sesión: quién pidió qué, qué hiciste, qué salió. Sola, es la evidencia de proceso. Opcional si mandas una captura.'), titulo: z.string().max(110).optional(), imagen_base64: z.string().min(8).max(16_000_000).optional().describe('Captura real en base64 crudo o data:image/(png|webp|jpeg);base64,…'), imagen_url: z.string().url().optional().describe('URL https de la captura. Si ya es https://api.yokup.com/media/fleet/… se reutiliza sin volver a subir.'), paso: z.string().min(1).max(4).optional().describe('Paso al que se enlaza la captura (a, b, c…). Si falta: inicio → a; cierre → último paso que no es z.'), momento: z.enum(['inicio', 'cierre', 'proceso']).optional().describe('inicio al empezar la misión, cierre al terminarla, proceso en un paso intermedio.') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await Y(a).evidencia(a))));

  server.registerTool('yokup_informe', {
    title: 'Cerrar la misión con informe',
    description: 'Cierra tu misión con el informe canónico: qué se hizo, verificado cómo, y las tres líneas de la norma 22 (Tiempo dedicado · Puntos de la misión · Total verificado) más miembros y contexto en tokens. Todos los pasos deben estar done. Norma de Carlos: la evidencia de cierre debe incluir una captura real de www.admira.live/highscore; pásala en imagen (URL https o base64/data URL png, webp o jpeg) y se envía como prueba de la misión en lugar del PNG de la transcripción. Sin imagen, el cierre sigue pintando la transcripción.',
    inputSchema: { como: COMO, mision: z.string().regex(/^FLT-\d+$/), informe: z.string().min(40).max(4000), transcripcion_final: z.string().max(12000).optional().describe('Transcripción del tramo final, si quieres que la imagen de cierre sea distinta del informe. Se ignora cuando llega imagen.'), imagen: z.string().min(8).max(16_000_000).optional().describe('Captura real de cierre: URL https (https://api.yokup.com/media/fleet/… se reutiliza) o base64/data URL png, webp o jpeg. Si llega, es la prueba de la misión en lugar del PNG de la transcripción.') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await Y(a).informe(a))));

  server.registerTool('yokup_ventana', {
    title: 'Abrir una ventana de decisión',
    description: 'Propón a Carlos tres acciones concretas (la primera es la recomendada) con reloj de 5 minutos en Y(a).com/decisiones; puntúa como ventana. Si no responde, ejecuta la recomendada (mandamiento 10).',
    inputSchema: { como: COMO, pregunta: z.string().min(10).max(500), opciones: z.array(z.string().min(5).max(300)).length(3).describe('Tres opciones; la primera es la recomendada ★.'), proyecto_id: z.string().min(2).max(80), mision: z.string().max(120).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await Y(a).ventana(a))));

  server.registerTool('yokup_decidir', {
    title: 'Registrar la elección de una ventana',
    description: 'Registra en yokup la opción que Carlos ha elegido para una ventana de decisión (por ejemplo, la que te ha dicho en el chat). Vale el id (DEC-…) o la referencia humana (0020.10/09/2026.06:37), y sirve también para ventanas ya caducadas: entonces el contenedor de la tanda deja la ★ y pasa a la opción elegida.',
    inputSchema: { como: COMO, ventana: z.string().min(3).max(60).describe('Id DEC-… o referencia humana NNNN.DD/MM/AAAA.HH:MM.'), opcion: z.number().int().min(1).max(5).describe('Número de la opción elegida, tal como aparece en la ventana (1 = la primera).'), por: z.string().max(40).optional().describe('Quién eligió, si no es Carlos vía ti.') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, seguro(async (a) => texto(await Y(a).decidir(a))));

  server.registerTool('yokup_mis_misiones', {
    title: 'Mis misiones en yokup',
    description: 'Tus misiones (abiertas, en curso y cerradas de los últimos días) con sus pasos.',
    inputSchema: { como: COMO },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async (a) => texto(await Y(a).misMisiones())));

  /* ── Telegram: los encargos de Carlos desde el móvil (FLT-1603) ────────────── */

  server.registerTool('telegram_bandeja', {
    title: 'Mi bandeja de Telegram',
    description: 'Encargos que te han hecho por Telegram (en el grupo AdmiraNext, con /tu-nombre o nombrándote). Léela al empezar cada turno y cuando te lo pida una rutina. Cada encargo lleva su número, quién lo pidió y el texto.',
    inputSchema: { como: COMO },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, seguro(async (a) => texto(await T(a).bandeja())));

  server.registerTool('telegram_responder', {
    title: 'Responder un encargo de Telegram',
    description: 'Contesta un encargo: estado ack al cogerlo, in_progress si va para largo, done con tu respuesta al terminar (o blocked con el motivo). El worker publica tu respuesta en Telegram EN HILO bajo el mensaje original, así Carlos la ve en el móvil. Si el encargo es trabajo de verdad, dalo también de alta en yokup con yokup_alta y cita el FLT en la respuesta.',
    inputSchema: {
      como: COMO,
      encargo: z.number().int().positive().describe('Número del encargo (lo da telegram_bandeja).'),
      estado: z.enum(['ack', 'in_progress', 'blocked', 'done']).default('done'),
      respuesta: z.string().max(1500).default('').describe('Tu contestación, en texto plano y al grano: es lo que Carlos leerá en el móvil.'),
      commit: z.string().max(120).optional(), url: z.string().url().optional(), verificacion: z.string().max(300).optional().describe('Cómo se comprobó, si aplica.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, seguro(async (a) => texto(await T(a).responder(a))));

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

export function claveRecibida(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.slice(0, 7).toLowerCase() === 'bearer ' ? auth.slice(7).trim() : '';
  const url = new URL(request.url);
  return bearer || request.headers.get('x-mcp-key') || url.searchParams.get('key') || '';
}

const iguales = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Vale la clave general (MCP_KEY), cualquiera por consejero (MCP_KEYS) o una derivada de la flota (MCP_FLOTA_SEED). */
export async function claveValida(request, env) {
  const cand = claveRecibida(request);
  if (!cand) return false;
  if (env.MCP_KEY && iguales(cand, env.MCP_KEY)) return true;
  if (env.MCP_KEY_CONSEJO && iguales(cand, env.MCP_KEY_CONSEJO)) return true;
  let mapa = {};
  try { mapa = env.MCP_KEYS ? JSON.parse(env.MCP_KEYS) : {}; } catch { mapa = {}; }
  if (Object.keys(mapa).some((k) => iguales(cand, k))) return true;
  return !!(await identidadPorClaveAsync(cand, env));
}

export async function manejar(request, env, deps = {}) {
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/\/+$/, '') || '/';

  if (ruta === '/' && request.method === 'GET') {
    return json({ nombre: NOMBRE, version: env.VERSION || '', sitio: env.SITIO || 'https://www.admira.live',
      que_es: 'MCP de admira.live: los consejeros del Consejo de Silicio, la flota y AgoraMatrix como herramientas MCP por HTTP.',
      endpoint_mcp: `${url.origin}/mcp`, transporte: 'streamable-http', autenticacion: 'Authorization: Bearer <MCP_KEY> (o ?key=)',
      documentacion: 'https://www.admira.live/mcp/', herramientas: ['consejo_consejeros', 'consejo_modelos', 'consejo_preguntar', 'consejero_preguntar', 'consejero_mensaje', 'consejero_bandeja', 'consejero_responder', 'consejero_webhook_registrar', 'consejero_webhook_ver', 'consejero_webhook_borrar', 'consejo_salud', 'consejo_bots', 'flota_estado', 'consejo_tareas', 'agora_decir', 'yokup_quien_soy', 'yokup_presencia', 'yokup_alta', 'yokup_paso', 'yokup_evidencia', 'yokup_informe', 'yokup_ventana', 'yokup_decidir', 'yokup_mis_misiones', 'telegram_bandeja', 'telegram_responder', 'agentes_vivos', 'agente_encargar', 'encargo_estado', 'encargos_listar', 'encargo_responder', 'encargo_anular', 'consumo_reportar'],
      bandeja_consejeros: `${url.origin}/consejero/mensajes`,
      flota: `Con una clave por consejero (MCP_KEYS), ${CONSEJEROS_GROKBOT.join('/')} trabajan en yokup como ${CONSEJEROS_GROKBOT.map((c) => c + 'GrokBot').join('/')} (equipo GrokBot, runtime Grok). Con una clave por agente y equipo (mcp-conectar.sh), Claude Code, Codex y OpenCode entran identificados (MorfeoMacMini…). Una clave de agente no firma como consejero aunque pase «como».`,
      conectar: { humanos: 'https://www.admira.live/help', silicio: 'https://www.admira.live/mcp/', llms: 'https://www.admira.live/mcp/llms.txt' } });
  }

  if (ruta === '/salud' && request.method === 'GET') {
    const api = crearCliente(env, deps);
    const consejo = await api.saludConsejo().then((r) => ({ ok: true, ...r })).catch((e) => ({ ok: false, error: String(e.message || e) }));
    return json({ ok: true, worker: NOMBRE, version: env.VERSION || '', secretos: { MCP_KEY: !!env.MCP_KEY, MCP_KEYS: !!env.MCP_KEYS, MCP_KEY_CONSEJO: !!env.MCP_KEY_CONSEJO, MCP_FIRMA_ESTRICTA: String(env.MCP_FIRMA_ESTRICTA || '') === '1', MCP_FLOTA_SEED: !!env.MCP_FLOTA_SEED, COUNCIL_MACHINE_TOKEN: !!env.COUNCIL_MACHINE_TOKEN, AGORA_SYNC_KEY: !!env.AGORA_SYNC_KEY, ADMIRA_TELEGRAM_PANEL_KEY: !!env.ADMIRA_TELEGRAM_PANEL_KEY }, consejeros_con_carne: CONSEJEROS_GROKBOT, consejo });
  }

  /* «¿En qué está cada consejero ahora?» para la mesa de admira.live (hover y DEBATIR, 4-oct-2026).
     Pública y de solo lectura: solo junta presencia y bandeja PÚBLICAS de bot.yokup.com (ver estado.js). */
  if (ruta === '/consejo/estado') {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ ok: false, error: 'solo GET' }, 405, cors);
    const cache = !deps.fetch && typeof caches !== 'undefined' && caches.default ? caches.default : null;
    const clave = new Request(`${url.origin}/consejo/estado`, { method: 'GET' });
    if (cache) { const hit = await cache.match(clave).catch(() => null); if (hit) return hit; }
    const cuerpo = await crearEstado(env, deps).mesa().catch((e) => ({ ok: false, error: String(e.message || e) }));
    const resp = json(cuerpo, cuerpo.ok ? 200 : 502, { ...cors, 'cache-control': `public, max-age=${CACHE_SEG}` });
    if (cache && cuerpo.ok) { const guardar = cache.put(clave, resp.clone()).catch(() => {}); if (deps.waitUntil) deps.waitUntil(guardar); }
    return resp;
  }

  /* Mensajes entre consejeros, visibles en el chat. Solo lectura. Sin secretos. */
  if (ruta === '/consejero/mensajes' && request.method === 'GET') {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' };
    // 19-10-2026 (Carlos): los mensajes pueden llevar datos internos. Con el secreto
    // CONSEJERO_MENSAJES_TOKEN puesto, solo lo lee quien lo trae (la función Pages
    // /api/chat/entre-consejeros, tras la sesión Google). Sin el secreto, como antes.
    if (!lecturaMensajesPermitida(request, env)) return json({ ok: false, error: 'privado: se lee en admira.live con tu cuenta de Google' }, 401, cors);
    const cuerpo = await crearBandeja(env, deps).listar(url.searchParams.get('con') || '');
    return json(cuerpo, 200, cors);
  }
  if (ruta === '/consejero/mensajes' && request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' } });
  }

  if (ruta === '/mcp') {
    if (!sandboxDe(request, env) && !(await claveValida(request, env))) {
      return json({ ok: false, error: 'no autorizado: falta la clave del MCP (Authorization: Bearer … o ?key=…)' }, 401, { 'www-authenticate': 'Bearer realm="admira-live-mcp"' });
    }
    // La identidad sale de la clave (una por consejero): el bot no la declara.
    // SANDBOX de avisos (solo si el despliegue lleva AVISOS_SANDBOX_KEY, nunca en producción):
    // KV con prefijo propio, sin Telegram ni secretos; la silla la elige x-sandbox-persona.
    const sandbox = sandboxDe(request, env);
    if (sandbox) {
      const srv = crearServidor(sandbox.env, deps, sandbox.identidad);
      const tr = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await srv.connect(tr);
      return await tr.handleRequest(request);
    }
    const identidadPeticion = await identidadPorClaveAsync(claveRecibida(request), env);
    // QUIÉN LLAMA, medido (7-sep-2026): para saber si GrokBot manda alguna señal por Bot
    // (cabecera, user-agent, clientInfo del initialize) que permita representar a cada
    // consejero sin fiarse de «como». Nunca se registra la clave.
    try {
      const cab = {}; for (const [k, v] of request.headers) if (!/authorization|cookie|cf-connecting-ip|x-real-ip/i.test(k)) cab[k] = String(v).slice(0, 120);
      let metodo = '', cliente = null;
      try { const b = await request.clone().json(); metodo = b && b.method || ''; cliente = b && b.params && b.params.clientInfo || null; if (metodo === 'tools/call') metodo += ':' + (b.params && b.params.name) + (b.params && b.params.arguments && b.params.arguments.como ? ' como=' + b.params.arguments.como : ''); } catch (_) {}
      console.log(JSON.stringify({ quien_llama: identidadPeticion && identidadPeticion.agent, metodo, cliente, cabeceras: cab }));
    } catch (_) {}
    const server = crearServidor(env, deps, identidadPeticion);
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

  return json({ ok: false, error: 'ruta desconocida', rutas: ['/', '/salud', '/mcp', '/consejo/estado', '/consejero/mensajes'] }, 404);
}

export function lecturaMensajesPermitida(request, env = {}) {
  const t = String(env.CONSEJERO_MENSAJES_TOKEN || '').trim();
  if (!t) return true;
  const c = String(request.headers.get('x-mensajes-token') || '');
  if (c.length !== t.length) return false;
  let d = 0; for (let i = 0; i < c.length; i++) d |= c.charCodeAt(i) ^ t.charCodeAt(i);
  return d === 0;
}

export const PREFIJO_SANDBOX = 'avisos-sandbox:';
function kvConPrefijo(kv, pre) {
  return {
    get: (k, t) => kv.get(pre + k, t), put: (k, v, o) => kv.put(pre + k, v, o), delete: (k) => kv.delete(pre + k),
  };
}
export function sandboxDe(request, env = {}) {
  const sk = env.AVISOS_SANDBOX_KEY;
  if (!sk || String(sk).length < 24 || !env.ADMIRA_LIVE_DESDE) return null;
  const c = claveRecibida(request);
  if (!c || c.length !== sk.length) return null;
  let d = 0; for (let i = 0; i < c.length; i++) d |= c.charCodeAt(i) ^ sk.charCodeAt(i);
  if (d !== 0) return null;
  const persona = sillaCanonica(request.headers.get('x-sandbox-persona') || '');
  if (!persona) return null;
  return {
    env: { ADMIRA_LIVE_DESDE: kvConPrefijo(env.ADMIRA_LIVE_DESDE, PREFIJO_SANDBOX), SITIO: env.SITIO },
    identidad: { persona, machine: 'Sandbox', runtime: 'prueba', agent: `${persona}Sandbox`, tipo: 'consejero', sandbox: true },
  };
}

// ctx.waitUntil: lo que sigue después de contestar (importación y plan de yokup_alta) no
// muere con la respuesta. Sin él, Cloudflare cancela las promesas pendientes al responder.
export default { fetch: (request, env, ctx) => manejar(request, env, ctx && typeof ctx.waitUntil === 'function' ? { waitUntil: (p) => ctx.waitUntil(p) } : {}) };
