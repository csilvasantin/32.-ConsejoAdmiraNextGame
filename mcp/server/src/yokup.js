/*
 * yokup.js — los consejeros de GrokBot dentro de la flota (FLT-1580, Carlos, 4-sep-2026:
 * «es importantísimo aumentar el equipo de AdmiraNeXT con la conexión con el Consejo»).
 *
 * Yokup solo puntúa a quien tiene carné (persona + equipo del diccionario) y solo cierra
 * con evidencia de proceso. Un bot de GrokBot no tiene pantalla ni sesión que consultar,
 * así que aquí se resuelven las tres cosas que le faltan:
 *
 *  1) QUIÉN LLAMA. Una clave del MCP por consejero (secreto MCP_KEYS). La identidad no
 *     la declara el bot: sale de la clave. Es el sustituto honesto de la norma 15 para
 *     un agente sin sesión local, y así nadie firma por otro.
 *  2) EL RITUAL DE YOKUP, tal como lo hacen los guiones de admira-vault: encargo al
 *     bot-inbox → /fleet/sync → proyecto → /fleet/plan (alta); /fleet/task-status (pasos);
 *     /fleet/progress con evidence_kind=process (evidencia); /fleet/informe (cierre);
 *     /decisions (ventana); /api/presence (latido).
 *  3) LA EVIDENCIA SIN PANTALLA: «agent / session_transcript». El bot manda su
 *     transcripción, el Mac Mini la pinta (POST /api/council/render-transcript, PIL),
 *     y el MCP la sube a /fleet/media y la registra.
 */

export const EQUIPO = 'GrokBot';
export const RUNTIME = 'Grok';
export const MODELO = 'Grok Heavy';
export const CONSEJEROS_GROKBOT = ['Wozniak', 'Jobs', 'Disney', 'Lucas'];

const limpiar = (s) => String(s || '').replace(/\/+$/, '');
const slug = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export const PERSONAS_FLOTA = ['Morfeo', 'Neo', 'Smith', 'Trinity', 'Oraculo', 'Niobe', 'Link', 'Cypher', 'Switch', 'Persefone', 'Seraph'];
export const MAQUINAS_FLOTA = ['MacMini', 'MacBookPro14', 'MacBookPro16', 'MacBookAirAzul', 'MacBookAirRosa', 'MacBookAirCrema', 'MacBookAirPlata'];
const RUNTIME_POR_DEFECTO = { Oraculo: 'Codex', Trinity: 'Codex', Niobe: 'OpenCode', Persefone: 'OpenCode', Seraph: 'OpenCode' };
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Clave de un agente de la flota (FLT-2038). Un secreto de Cloudflare no pasa de 5 KB y
 * la flota son 11 personas × 7 equipos: en vez de un mapa clave→identidad, la clave de
 * cada pareja se DERIVA de una semilla (MCP_FLOTA_SEED) con HMAC-SHA256 sobre
 * «Persona|Equipo». El worker la recalcula al recibirla; la flota la lee de la bóveda
 * (MCP_KEY_<PERSONA>_<EQUIPO>) o la deriva con tools/clave-flota.mjs y la misma semilla.
 */
export async function claveFlota(env, persona, machine) {
  if (!env.MCP_FLOTA_SEED) return null;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.MCP_FLOTA_SEED), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${persona}|${machine}`)));
  return b64url(sig).slice(0, 40);
}
const igualesStr = (a, b) => { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/**
 * Identidad a partir de la clave que ha entrado por /mcp. MCP_KEYS es un JSON
 * {"<clave>": {"persona": "Wozniak"}, …} (los consejeros de GrokBot). MCP_KEY (la primera
 * clave, la que Carlos dio a Wozniak) se sigue aceptando y se mapea a MCP_KEY_PERSONA.
 * Los AGENTES DE LA FLOTA entran con su clave derivada (claveFlota): el agente en yokup es
 * persona+equipo (MorfeoMacMini), igual que firma su sesión local, sin declarar nada.
 */
export function identidadPorClave(clave, env = {}) {
  if (!clave) return null;
  let mapa = {};
  try { mapa = env.MCP_KEYS ? JSON.parse(env.MCP_KEYS) : {}; } catch { mapa = {}; }
  let persona = null, entrada = null;
  if (mapa[clave] && mapa[clave].persona) { entrada = mapa[clave]; persona = String(entrada.persona); }
  else if (env.MCP_KEY && clave === env.MCP_KEY) persona = String(env.MCP_KEY_PERSONA || 'Wozniak');
  // Clave COMPARTIDA del Consejo (MCP_KEY_CONSEJO): la usa el conector único de la cuenta de
  // GrokBot cuando no se puede dar una clave por silla. No firma por nadie: exige «como».
  if (!persona && env.MCP_KEY_CONSEJO && clave === env.MCP_KEY_CONSEJO) return { persona: null, machine: EQUIPO, runtime: RUNTIME, model: MODELO, agent: null, tipo: 'consejo-compartido' };
  if (!persona) return null;
  // «Steve Wozniak» firma como Wozniak: el apellido corto es la persona del diccionario de yokup.
  const conocido = CONSEJEROS_GROKBOT.find((c) => persona.toLowerCase().includes(c.toLowerCase()));
  if (conocido) return { persona: conocido, machine: EQUIPO, runtime: RUNTIME, model: MODELO, agent: `${conocido}${EQUIPO}`, tipo: 'consejero' };
  return identidadAgente(persona, entrada && entrada.machine, entrada && entrada.runtime, entrada && entrada.model);
}
export function identidadAgente(persona, machine, runtime, model) {
  const p = String(persona).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const m = String(machine || '').replace(/\s+/g, '') || 'Flota';
  return { persona: p, machine: m, runtime: String(runtime || RUNTIME_POR_DEFECTO[p] || 'Claude Code'), model: String(model || ''), agent: `${p}${m}`, tipo: 'agente' };
}
/** Como identidadPorClave, pero además reconoce las claves derivadas de la flota. */
export async function identidadPorClaveAsync(clave, env = {}) {
  const directa = identidadPorClave(clave, env);
  if (directa || !clave || !env.MCP_FLOTA_SEED) return directa;
  for (const p of PERSONAS_FLOTA) for (const m of MAQUINAS_FLOTA) {
    if (igualesStr(await claveFlota(env, p, m), clave)) return identidadAgente(p, m);
  }
  return null;
}

export function crearYokup(env = {}, identidad, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const api = limpiar(env.YOKUP_API || 'https://api.yokup.com');
  // dominio propio: LaLiga bloquea workers.dev en horas de fútbol, FLT-1633
  const telegram = limpiar(env.ADMIRA_TELEGRAM_URL || 'https://bot.yokup.com');
  const consejo = limpiar(env.COUNCIL_BASE || 'https://macmini.tail48b61c.ts.net/council');
  const ahora = deps.now || (() => Date.now());

  function exigir() {
    if (!identidad) throw new Error('sin identidad: esta clave del MCP no está asignada a nadie (MCP_KEYS)');
    return identidad;
  }

  async function llamar(url, init = {}, { timeoutMs = 45_000, binario = false, via } = {}) {
    const enviar = via && typeof via.fetch === 'function' ? (u, i) => via.fetch(u, i) : doFetch;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    let r;
    try { r = await enviar(url, { ...init, signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'admira-live-mcp/1.0', ...(init.headers || {}) } }); }
    catch (e) { throw new Error(`no se pudo llegar a ${url}: ${e && e.message || e}`); }
    finally { clearTimeout(t); }
    if (binario) {
      if (!r.ok) throw new Error(`${r.status} en ${url}: ${(await r.text()).slice(0, 200)}`);
      return new Uint8Array(await r.arrayBuffer());
    }
    const text = await r.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!r.ok) {
      const d = body && (body.error || body.detail || body.raw) || r.statusText;
      const err = new Error(`${r.status} en ${url}: ${typeof d === 'string' ? d : JSON.stringify(d)}`); err.status = r.status; err.body = body; throw err;
    }
    return body;
  }
  const json = (o) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
  // admira-telegram es un worker de la misma cuenta: por URL workers.dev Cloudflare responde
  // 1042 (pasó en la primera alta real, 4-sep-2026 07:20). Con el binding va por dentro.
  const viaTelegram = env.TELEGRAM && typeof env.TELEGRAM.fetch === 'function' ? { via: env.TELEGRAM } : {};
  const panel = () => {
    if (!env.ADMIRA_TELEGRAM_PANEL_KEY) throw new Error('falta ADMIRA_TELEGRAM_PANEL_KEY en el worker: sin ella no hay encargo ni presencia');
    return { authorization: `Bearer ${env.ADMIRA_TELEGRAM_PANEL_KEY}` };
  };

  /** Latido de presencia: es lo que pone al consejero en yokup.com/equipo y da la «vía». */
  async function presencia({ foco = '', tarea = '', proyecto = '' } = {}) {
    const id = exigir();
    // La presencia se indexa por persona BASE + máquina (yokup.com/mcp). Latir con
    // apellido (WozniakGrokBot) crea una fila que no lee nadie; el carné completo
    // va en owner de misiones, no aquí.
    const body = { persona: id.persona, machine: id.machine, runtime: id.runtime, focus: foco, host: 'app', model: id.model };
    if (tarea) body.task = tarea;
    if (proyecto) body.project = proyecto;
    return llamar(`${telegram}/api/presence`, { ...json(body), headers: { 'content-type': 'application/json', ...panel() } }, viaTelegram);
  }
  /** Latido silencioso en cada acción: si falla no rompe la acción. */
  async function latir(foco) { try { return await presencia({ foco }); } catch (e) { return { ok: false, error: String(e.message || e) }; } }

  async function proyectoDelCenso(projectId) {
    const censo = await llamar(`${api}/projects`);
    const items = censo.projects || censo.items || (Array.isArray(censo) ? censo : []);
    const p = items.find((x) => String(x.id) === String(projectId) || String(x.name) === String(projectId));
    if (!p) throw new Error(`«${projectId}» no está en el censo de proyectos de yokup`);
    return { id: p.id, name: p.name, slug: slug(p.name) };
  }

  /** Misiones del titular, filtradas en el servidor (agent=WozniakGrokBot…): una llamada, no 120 filas. */
  async function misionesDelTitular(id, limit = 12) {
    const d = await llamar(`${api}/fleet/missions?agent=${encodeURIComponent(id.agent)}&limit=${limit}`);
    return d && Array.isArray(d.missions) ? d.missions : [];
  }
  const MISMO_ASUNTO = 40;
  const mismoAsunto = (m, encargo) => String(m.subject || '').slice(0, MISMO_ASUNTO) === String(encargo).slice(0, MISMO_ASUNTO);
  const viva = (m) => !['cancelled', 'resolved', 'closed'].includes(String(m.status || '').toLowerCase());
  const resumen = (m) => ({ mision: m.id, display_ref: m.display_ref, estado: m.status, proyecto: m.project_id || null, asunto: String(m.subject || '').slice(0, 120), pasos: (m.tasks || []).map((t) => `${t.code}: ${t.title}`) });

  /** Lo que sigue tras la importación: colgar del proyecto y planificar (a/b/c). Tarda hasta 60 s: nunca en el camino de la respuesta. */
  async function planificar(mision, p, encargo) {
    await llamar(`${api}/projects/mission`, json({ mission: mision.id, project: p.id })).catch(() => null);
    const plan = await llamar(`${api}/fleet/plan?mission=${encodeURIComponent(mision.id)}`, { method: 'POST' }, { timeoutMs: 60_000 }).catch((e) => ({ ok: false, error: String(e.message || e) }));
    await latir(`misión ${mision.id}: ${String(encargo).slice(0, 80)}`);
    return plan;
  }
  /** Trabajo que sigue después de contestar al cliente (ctx.waitUntil en Cloudflare; en pruebas, la lista de deps). */
  function enSegundoPlano(fn) {
    const pr = Promise.resolve().then(fn).catch(() => null);
    if (typeof deps.waitUntil === 'function') deps.waitUntil(pr);
    return pr;
  }

  /**
   * Alta de misión: el mismo ritual que alta-mision.sh, con la identidad del consejero.
   *
   * RÁPIDA E IDEMPOTENTE (Carlos, 7-sep-2026): la versión anterior esperaba en bucle a que
   * yokup importase el encargo (hasta 8 × sync de 6 s) y luego al planificador (60 s). El
   * cliente MCP de GrokBot corta antes: Wozniak vio «timeout», la misión SÍ se había creado,
   * y al reintentar Jobs dejó tres misiones iguales en tres minutos (FLT-100036/37/39).
   * Ahora: (1) si ya hay una misión viva del titular con el mismo asunto —o abierta hace
   * menos de 10 min en el mismo proyecto— se devuelve ESA, no se crea otra; (2) una sola
   * pasada de importación (≈10 s); (3) el plan se lanza en segundo plano y la respuesta
   * sale con el FLT; (4) si yokup aún no la importó se contesta con el número de encargo y
   * estado «importando», y la importación y el plan siguen en segundo plano.
   */
  const DIEZ_MIN = 10 * 60_000;
  async function alta({ encargo, proyecto_id, forzar = false }) {
    const id = exigir();
    const p = await proyectoDelCenso(proyecto_id);
    const t0 = ahora();
    const previas = await misionesDelTitular(id).catch(() => []);
    const repetida = previas.find((m) => viva(m) && mismoAsunto(m, encargo)) || null;
    if (repetida) {
      return { ...resumen(repetida), ya_existia: true, nota: 'Ya tenías esta misión dada de alta (mismo asunto): no se crea otra. Si el alta anterior te dio timeout, la misión se creó igual.', siguiente: `marca cada paso con yokup_paso (${repetida.id}, a/b/c, in_progress → done) y registra evidencia con yokup_evidencia antes de cerrar` };
    }
    const reciente = !forzar ? previas.find((m) => viva(m) && String(m.project_id || '') === String(p.id) && t0 - Number(m.created_at || 0) < DIEZ_MIN) || null : null;
    if (reciente) {
      return { ...resumen(reciente), ya_existia: true, posible_duplicado: true, nota: `Hace menos de 10 min diste de alta ${reciente.id} en «${p.id}» y sigue viva: te devuelvo esa por si el alta anterior te dio timeout (la misión se crea aunque el cliente corte). Si de verdad es OTRA misión, repite yokup_alta con forzar:true.`, siguiente: `yokup_paso (${reciente.id}, a/b/c) o yokup_alta con forzar:true` };
    }
    await llamar(`${api}/projects/principal`, json({ agent: id.agent, machine: id.machine, project_id: p.id, project: p.name, project_slug: p.slug, by: id.agent }));
    const desde = t0 - 60_000;
    const r = await llamar(`${telegram}/api/bot-inbox`, { ...json({ text: encargo, target_persona: id.persona, target_machine: id.machine, project_id: p.id }), headers: { 'content-type': 'application/json', ...panel() } }, viaTelegram);
    const numEncargo = r && r.id != null ? Number(r.id) : null;
    const buscar = async () => {
      await llamar(`${api}/fleet/sync`, { method: 'POST' }, { timeoutMs: 8_000 }).catch(() => null);
      const lista = await misionesDelTitular(id).catch(() => []);
      return lista.find((m) => Number(m.created_at || 0) >= desde && mismoAsunto(m, encargo)) || null;
    };
    // Presupuesto del cliente GrokBot: ~15 s (-32001). Un sync real ronda 3.5 s;
    // dos intentos cortos caben; el planificador (60 s) NUNCA va en este camino.
    const espera = deps.esperaImportacion ?? 400;
    const intentos = deps.intentosImportacion ?? 2;
    let mision = null;
    for (let i = 0; i < intentos && !mision; i++) {
      await dormir(espera);
      mision = await buscar();
    }
    if (!mision) {
      enSegundoPlano(async () => {
        for (let i = 0; i < 6; i++) {
          await dormir(deps.esperaImportacionFondo ?? (deps.esperaImportacion === 0 ? 0 : 5000));
          const m = await buscar();
          if (m) { await planificar(m, p, encargo); return; }
        }
      });
      await latir(`alta en curso: ${String(encargo).slice(0, 80)}`);
      return { ok: true, mision: null, encargo: numEncargo, proyecto: p.id, estado: 'importando', nota: 'El encargo ya está en el bot-inbox y yokup lo importa en menos de un minuto; el plan a/b/c se hace solo. NO repitas yokup_alta: crearía un duplicado.', siguiente: 'yokup_mis_misiones en 1 min → te da el FLT y sus pasos; luego yokup_paso' };
    }
    enSegundoPlano(() => planificar(mision, p, encargo));
    await latir(`misión ${mision.id}: ${String(encargo).slice(0, 80)}`);
    return { mision: mision.id, display_ref: mision.display_ref, proyecto: p.id, encargo: numEncargo, plan: 'en curso: el planificador saca los pasos a/b/c de tu encargo en menos de 1 min (yokup_mis_misiones los lista)', siguiente: `marca cada paso con yokup_paso (${mision.id}, a/b/c, in_progress → done) y registra evidencia con yokup_evidencia antes de cerrar` };
  }

  async function paso({ mision, paso: code, estado, informe = '', imagen = '', tokens }) {
    const id = exigir();
    const body = { mission: mision, code, status: estado, owner: id.agent };
    if (informe) body.report = informe;
    if (imagen && /^https?:/.test(imagen)) body.image = imagen;
    if (Number.isInteger(tokens)) body.tokens = tokens;
    const r = await llamar(`${api}/fleet/task-status`, json(body));
    await latir(`misión ${mision} · paso ${code} ${estado}`);
    return r;
  }

  async function renderYSubir({ titulo, texto, pie }) {
    const id = exigir();
    if (!env.COUNCIL_MACHINE_TOKEN) throw new Error('falta COUNCIL_MACHINE_TOKEN: sin él el Mac Mini no pinta la transcripción');
    const png = await llamar(`${consejo}/api/council/render-transcript`, { ...json({ title: titulo, text: texto, footer: pie || `${id.agent} · ${id.runtime} · ${id.model}` }), headers: { 'content-type': 'application/json', 'x-council-token': env.COUNCIL_MACHINE_TOKEN } }, { binario: true, timeoutMs: 60_000 });
    const media = await llamar(`${api}/fleet/media`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png }, { timeoutMs: 60_000 });
    if (!media || !media.url) throw new Error('yokup no devolvió URL para la imagen');
    return media.url;
  }

  /** Evidencia de proceso «agent/session_transcript»: transcripción → PNG → /fleet/progress. */
  async function evidencia({ mision, transcripcion, titulo = '' }) {
    const id = exigir();
    const url = await renderYSubir({ titulo: titulo || `${id.agent} · ${mision} · transcripción de sesión`, texto: transcripcion });
    const r = await llamar(`${api}/fleet/progress`, json({ mission: mision, owner: id.agent, image: url, captured_at: ahora(), evidence_kind: 'process', capture_surface: 'agent', capture_context: 'session_transcript', degraded: false }));
    await latir(`misión ${mision} · evidencia registrada`);
    return { ...r, imagen: url };
  }

  /** Cierre con informe: imagen final (transcripción del cierre) + /fleet/informe. */
  async function informe({ mision, informe: texto, transcripcion_final = '' }) {
    const id = exigir();
    const url = await renderYSubir({ titulo: `${id.agent} · ${mision} · cierre`, texto: transcripcion_final || texto });
    const r = await llamar(`${api}/fleet/informe`, json({ mission: mision, owner: id.agent, image: url, report: texto, host: 'app', runtime: id.runtime }), { timeoutMs: 60_000 });
    await latir(`misión ${mision} cerrada`);
    return { ...r, imagen: url };
  }

  async function ventana({ pregunta, opciones, proyecto_id, mision = '' }) {
    const id = exigir();
    const p = await proyectoDelCenso(proyecto_id);
    const ops = [...opciones.slice(0, 3), 'Volver atras', 'Custom'];
    const body = { agent: id.agent, machine: id.machine, surface: 'grokbot', minutes: 5, project_id: p.id, project: p.name, project_slug: p.slug, mission: mision || 'Ventana de GrokBot', question: pregunta, url: 'https://www.admira.live/', recommended: 0, options: ops, user_override: true };
    const r = await llamar(`${api}/decisions`, json(body));
    await latir(`ventana de decisión abierta: ${String(pregunta).slice(0, 60)}`);
    return r;
  }

  async function misMisiones() {
    const id = exigir();
    // Filtro en el servidor por agente: antes se pedían 120 misiones de toda la flota y se
    // cribaban aquí; con 200+ misiones al día el consejero se quedaba sin las suyas.
    const missions = await misionesDelTitular(id, 40);
    return missions.map((m) => ({ id: m.id, ref: m.display_ref, estado: m.status, progreso: m.progress ? `${m.progress.done || 0}/${m.progress.total || 0}` : '', asunto: String(m.subject || '').slice(0, 120), tareas: (m.tasks || []).map((t) => `${t.code} ${t.status}: ${String(t.title || '').slice(0, 60)}`) }));
  }

  async function marcador() {
    const id = exigir();
    const d = await llamar(`${api}/highscore/daily`);
    const key = id.persona.toLowerCase();
    const fila = (d.scores || []).find((r) => String(r.agent || '').toLowerCase().startsWith(key));
    const hora = ((d.hourly || {}).scores || []).find((r) => String(r.agent || '').toLowerCase().startsWith(key));
    return { dia: d.day, agente: id.agent, hoy: fila || null, hora: hora ? hora.metrics : null, baremo: d.weights, marcador: 'https://www.yokup.com/highscore' };
  }

  return { identidad, presencia, alta, paso, evidencia, informe, ventana, misMisiones, marcador };
}
