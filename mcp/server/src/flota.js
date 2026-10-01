/*
 * flota.js — hablar con los agentes de la flota y con los consejeros DESDE el MCP
 * (FLT-2038, Carlos, 5-sep-2026: «el MCP de admira.live para que se puedan conectar
 * con los consejeros y los agentes de forma automática»).
 *
 * Hasta hoy el MCP servía para que un consejero de GrokBot leyera SU bandeja. Lo que
 * faltaba era el otro sentido: que cualquier cliente MCP (Claude Code, Codex, OpenCode,
 * GrokBot, un humano con Claude Desktop) pueda ver quién está vivo, encargar trabajo a
 * una persona concreta y recoger la respuesta sin mirar Telegram. El encargo entra por
 * el mismo bot-inbox que usa el grupo AgoraMatrix (worker admira-telegram):
 *   · a un agente de la flota lo recoge su vigilante (agent-inbox-watcher.sh) en la
 *     máquina donde late y se lo inyecta en su sesión tmux;
 *   · a un consejero de GrokBot (las sillas de sillas.js: Wozniak, Jobs, Lucas,
 *     Disney, Musk…) el worker lo despierta por el webhook de su rutina
 *     (despertarConsejero) y contesta en 1-3 minutos.
 * La respuesta queda en la nota del encargo y en hilo en Telegram; aquí se lee con
 * encargo_estado.
 */

import { SILLAS, CONSEJEROS_GROKBOT, sillaCanonica } from './sillas.js';
import { crearTelegram } from './telegram.js';
import { filasPresencia, cargaDe, ESTADOS_ABIERTOS } from './coordinacion.js';

export const AGENTES_FLOTA = ['Neo', 'Morfeo', 'Trinity', 'Oraculo', 'Smith', 'Cypher', 'Switch', 'Niobe', 'Link', 'Persefone', 'Seraph', 'Arquitecto', 'Merovingio'];
/** «el Merovingio» es el deepagent de Musk; el carné es Merovingio. */
const ALIAS_FLOTA = { elmerovingio: 'Merovingio' };
export const CONSEJEROS = CONSEJEROS_GROKBOT;
export const PERSONAS = [...AGENTES_FLOTA, ...CONSEJEROS];
const MAQUINA_CONSEJEROS = 'grokbot';
/** SILLA ↔ MacBook Air (Jobs/Carbono, 8-sep-2026, encargo #2882 · FLT-100131), más Musk
 *  (coetáneo CEO, sin Mac). La tabla vive en sillas.js. El consejero sigue
 *  despertándose en GrokBot: la silla física es su máquina canónica en el censo,
 *  no donde corre el LLM. «grokbot» es el equipo de despertar de todas las sillas,
 *  así que no resuelve a Musk aunque esa sea su máquina declarada. */
export { SILLAS };
/** «MacBookAirAzul», «mba azul», «admira-macbookairazul» → «Jobs». «Elon» → «Musk». */
export function consejeroDeMaquina(maquina) {
  const n = norm(maquina);
  if (!n || n === MAQUINA_CONSEJEROS) return null;
  for (const [persona, s] of Object.entries(SILLAS)) {
    const candidatos = [s.fleet_id, ...(s.alias || []), s.maquina].filter((a) => a && norm(a) !== MAQUINA_CONSEJEROS);
    if (candidatos.some((a) => norm(a) === n)) return persona;
  }
  return null;
}
const VIVO_SEG = 900;

const limpiar = (s) => String(s || '').replace(/\/+$/, '');
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** «Oráculo», «oraculo», «OraculoMacMini» → «Oraculo» (la persona del diccionario). */
export function personaCanonica(nombre) {
  const n = norm(nombre);
  if (!n) return null;
  if (ALIAS_FLOTA[n]) return ALIAS_FLOTA[n];
  return PERSONAS.find((p) => n === norm(p)) || PERSONAS.find((p) => n.startsWith(norm(p))) || null;
}
export const esConsejero = (persona) => CONSEJEROS.includes(personaCanonica(persona));

export function crearFlota(env = {}, identidad, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const base = limpiar(env.ADMIRA_TELEGRAM_URL || 'https://bot.yokup.com');
  const via = env.TELEGRAM && typeof env.TELEGRAM.fetch === 'function' ? (u, i) => env.TELEGRAM.fetch(u, i) : doFetch;
  const ahora = deps.now || (() => Date.now());

  async function llamar(url, init = {}, { auth = true, directo = false } = {}) {
    if (auth && !env.ADMIRA_TELEGRAM_PANEL_KEY) throw new Error('falta ADMIRA_TELEGRAM_PANEL_KEY en el worker');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30_000);
    let r;
    // `via` es el service binding del worker admira-telegram: solo vale para bot.yokup.com. Una URL
    // de otro servicio (api.yokup.com) va por fetch normal; si no, el worker de Telegram contesta 404
    // (Jobs, #2456, 6-sep-2026: consumo_reportar 404 mientras Wozniak sí publicaba).
    const enviar = directo ? doFetch : via;
    try {
      r = await enviar(url, { ...init, signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'admira-live-mcp/1.0', ...(auth ? { authorization: `Bearer ${env.ADMIRA_TELEGRAM_PANEL_KEY}` } : {}), ...(init.headers || {}) } });
    } catch (e) { throw new Error(`no se pudo llegar a ${url}: ${e && e.message || e}`); }
    finally { clearTimeout(t); }
    const text = await r.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!r.ok) { const d = body && (body.error || body.raw) || r.statusText; throw new Error(`${r.status} en ${url}: ${typeof d === 'string' ? d : JSON.stringify(d)}`); }
    return body;
  }

  const seg = (ts) => (Number(ts) > 4102444800 ? Math.floor(Number(ts) / 1000) : Number(ts) || 0);
  // #4502.09.27. El número largo (task-web-…, FLT-…) no sale en esta etiqueta.
  function etiquetaEncargo(id, ts, dada) {
    if (dada) return String(dada);
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return "";
    let ms = Number(ts || 0);
    if (!ms) return "";
    if (ms < 4102444800) ms *= 1000;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
    const mm = (parts.find((p) => p.type === "month") || {}).value;
    const dd = (parts.find((p) => p.type === "day") || {}).value;
    return mm && dd ? `#${n}.${mm}.${dd}` : "";
  }
  const cuando = (ts) => (seg(ts) ? new Date(seg(ts) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '');
  const hace = (ts) => { const s = Math.max(0, Math.floor(ahora() / 1000) - seg(ts)); return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`; };

  /** Todas las filas de presencia, sin filtrar (la lista es pública). Una sola lectura por llamada MCP. */
  let presenciaCache = null;
  function presenciaCruda() {
    if (!presenciaCache) presenciaCache = llamar(`${base}/api/presence`, {}, { auth: false }).then(filasPresencia).catch((e) => { presenciaCache = null; throw e; });
    return presenciaCache;
  }
  /** Filas de presencia con latido en los últimos 15 min de agentes de la flota (no consejeros). */
  async function presenciaViva() {
    const filas = await presenciaCruda();
    const corte = Math.floor(ahora() / 1000) - VIVO_SEG;
    return filas.filter((r) => seg(r.updated) >= corte && personaCanonica(r.persona) && !esConsejero(r.persona));
  }

  /* ── Bandeja de encargos (bot.yokup.com) ──────────────────────────────────────
   * Lo que hay hoy en el worker admira-telegram:
   *   GET /api/public/inbox?persona=&machine=   pública; los 80 más recientes; texto recortado a 140
   *   GET /api/bot-inbox?persona=&machine=      privada (panel key); la vista de la bandeja de un agente
   *   GET /api/bot-inbox/:id                    privada; un encargo entero
   *   POST /api/bot-inbox/:id/status            privada; ack|in_progress|blocked|done + respuesta
   * No hay filtro de estado ni paginación en el servidor: se piden las dos vistas, se
   * funden por id (manda la privada, que trae el texto entero) y se filtra aquí. */
  const destinatario = (x) => personaCanonica(x && x.target_persona) || sillaCanonica(x && x.target_persona);
  async function vistaPublica(persona, machine = '') {
    const q = new URLSearchParams({ persona }); if (machine) q.set('machine', machine);
    const d = await llamar(`${base}/api/public/inbox?${q}`, {}, { auth: false });
    return { items: (d && d.items) || [], count: Number(d && d.count) || 0 };
  }
  async function vistaPrivada(persona, machine = '') {
    const q = new URLSearchParams({ persona }); if (machine) q.set('machine', machine);
    const d = await llamar(`${base}/api/bot-inbox?${q}`);
    return { items: (d && d.items) || [] };
  }
  const TOPE_PUBLICO = 80;

  /** Encargos de una persona: abiertos por defecto (pending/ack/in_progress/blocked). */
  async function listarEncargos({ persona, estado = 'abiertos', maquina = '', limite = 50 } = {}) {
    const p = personaCanonica(persona) || sillaCanonica(persona) || consejeroDeMaquina(persona);
    if (!p) throw new Error(`persona desconocida «${persona}»: vale ${PERSONAS.join(', ')}`);
    const m = maquina ? norm(maquina) : '';
    const [priv, pub] = await Promise.all([
      env.ADMIRA_TELEGRAM_PANEL_KEY ? vistaPrivada(p, m).then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, error: String(e.message || e), items: [] })) : Promise.resolve({ ok: false, error: 'sin ADMIRA_TELEGRAM_PANEL_KEY', items: [] }),
      vistaPublica(p, m).then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, error: String(e.message || e), items: [], count: 0 })),
    ]);
    if (!priv.ok && !pub.ok) throw new Error(`no se pudo leer la bandeja de ${p}: privada (${priv.error}); pública (${pub.error})`);
    const porId = new Map();
    for (const x of pub.items) porId.set(Number(x.id), { ...x, _fuente: 'publica' });
    for (const x of priv.items) porId.set(Number(x.id), { ...(porId.get(Number(x.id)) || {}), ...x, _fuente: 'privada' });
    const estados = estado === 'abiertos' ? ESTADOS_ABIERTOS : estado === 'todos' ? null : [estado];
    const mias = [...porId.values()].filter((x) => destinatario(x) === p && (!m || norm(x.target_machine) === m));
    const filtradas = mias.filter((x) => !estados || estados.includes(String(x.status || 'pending'))).sort((a, b) => Number(b.id) - Number(a.id));
    const encargos = filtradas.slice(0, Math.max(1, Math.min(200, Number(limite) || 50))).map((x) => ({
      encargo: Number(x.id), etiqueta: etiquetaEncargo(x.id, x.ts, x.etiqueta) || null, estado: String(x.status || 'pending'), de: x.from_name || '',
      cuando: cuando(x.ts), maquina: x.target_machine || null, texto: String(x.text || ''), ...(x._fuente === 'publica' && String(x.text || '').length >= 140 ? { texto_recortado: true } : {}),
      nota: x.note || '', acuse: x.ack_at ? cuando(x.ack_at) : null, proyecto_id: x.project_id || null, task_id: x.task_id || null,
    }));
    return {
      persona: p, maquina: m || null, estado, total: filtradas.length, mostrados: encargos.length, carga: cargaDe(mias),
      encargos,
      fuentes: { privada: priv.ok ? `ok (${priv.items.length})` : priv.error, publica: pub.ok ? `ok (${pub.items.length}${pub.count >= TOPE_PUBLICO ? ', tope de 80: puede haber más antiguos' : ''})` : pub.error },
      siguiente: encargos.length ? 'encargo_estado(numero) para el texto entero; encargo_responder(numero, estado, nota): ack al cogerlo, in_progress, blocked con motivo, done con la respuesta' : 'nada en esa bandeja',
    };
  }

  /** Carga (encargos abiertos) por persona, desde la vista pública: una lectura por persona. */
  async function cargaPorPersona(personas) {
    const unicas = [...new Set(personas)];
    const filas = await Promise.all(unicas.map((p) => vistaPublica(p).then(
      (r) => [p, { ...cargaDe(r.items.filter((x) => destinatario(x) === p)), ...(r.count >= TOPE_PUBLICO ? { parcial: true } : {}) }],
      () => [p, null])));
    return new Map(filas);
  }

  /** Quién está vivo ahora: agentes por persona y máquina; los consejeros, siempre. */
  async function vivos() {
    const filas = await presenciaViva();
    const porPersona = new Map();
    for (const r of filas) {
      const p = personaCanonica(r.persona);
      if (!porPersona.has(p)) porPersona.set(p, []);
      const lista = porPersona.get(p);
      if (lista.some((x) => norm(x.maquina) === norm(r.machine))) continue;
      lista.push({ maquina: String(r.machine || ''), runtime: r.runtime || '', foco: r.focus || r.task || '', ultimo_latido: hace(r.updated) });
    }
    const sinSenal = AGENTES_FLOTA.filter((p) => !porPersona.has(p));
    // Carga: encargos abiertos (pending/ack/in_progress/blocked) de cada persona. Si la bandeja no
    // responde, el censo sale igual, sin carga.
    let carga = new Map();
    try { carga = await cargaPorPersona([...porPersona.keys(), ...CONSEJEROS, ...sinSenal]); } catch { carga = new Map(); }
    const resumenCarga = (c) => (c ? { abiertos: c.abiertos, pending: c.pending, ack: c.ack, in_progress: c.in_progress, blocked: c.blocked, ...(c.parcial ? { parcial: true } : {}) } : null);
    const agentes = [...porPersona.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([persona, maquinas]) => {
      const c = carga.get(persona);
      return { persona, carga: resumenCarga(c), maquinas: maquinas.map((x) => ({ ...x, abiertos: c ? (c.por_maquina[norm(x.maquina)] || 0) : null })) };
    });
    return {
      consejeros: CONSEJEROS.map((persona) => {
        const s = SILLAS[persona];
        const fila = { persona, equipo: 'GrokBot', silla: s.rol, lado: s.lado, maquina: s.maquina, disponibilidad: 'siempre: se le despierta por webhook, contesta en 1-3 min', carga: resumenCarga(carga.get(persona)) };
        if (s.deepagent) { fila.deepagent = s.deepagent; fila.deepagent_maquina = s.deepagent_maquina; fila.deepagent_runtime = s.deepagent_runtime; fila.deepagent_vivo = porPersona.has(s.deepagent); }
        return fila;
      }),
      agentes,
      sin_senal: sinSenal,
      cola_sin_senal: Object.fromEntries(sinSenal.map((p) => [p, carga.get(p) ? carga.get(p).abiertos : null]).filter(([, n]) => n)),
      carga_fuente: carga.size ? 'bot.yokup.com/api/public/inbox por persona (los 80 encargos más recientes; «parcial» si llega al tope)' : 'sin datos de carga: la bandeja pública no respondió',
      como_encargar: 'agente_encargar con persona (y máquina si hay varias); luego encargo_estado con el número devuelto. Elige al agente vivo con menos carga. Un agente sin señal recibe el encargo en cola y lo coge al despertar; a los 30 min sin acuse se reasigna al agente vivo con menos carga.',
    };
  }

  /** Máquina donde late la persona (una sola, o la de latido más reciente). */
  async function maquinaDe(persona) {
    const filas = (await presenciaViva()).filter((r) => personaCanonica(r.persona) === persona).sort((a, b) => seg(b.updated) - seg(a.updated));
    return filas[0] ? norm(filas[0].machine) : '';
  }

  /** Crear un encargo para una persona (agente de la flota o consejero). */
  async function encargar({ persona, maquina = '', texto, proyecto_id = '', de = '', deadline = '', criterio = '' }) {
    // Silla por máquina: agente_encargar(persona:'', maquina:'MacBookAirAzul') o persona = la máquina → Jobs.
    let p = personaCanonica(persona);
    if (!p && consejeroDeMaquina(persona)) p = consejeroDeMaquina(persona);
    if (!p && maquina && consejeroDeMaquina(maquina)) p = consejeroDeMaquina(maquina);
    const maquinasSilla = Object.values(SILLAS).filter((x) => x.fleet_id).map((x) => x.maquina);
    if (!p) throw new Error(`persona desconocida «${persona}»: vale ${PERSONAS.join(', ')} (o la máquina de una silla: ${maquinasSilla.join(', ')}, o Elon / Elon Musk → Musk)`);
    if (esConsejero(p) && maquina && consejeroDeMaquina(maquina) && consejeroDeMaquina(maquina) !== p) throw new Error(`${maquina} es la silla de ${consejeroDeMaquina(maquina)}, no de ${p}`);
    let cuerpo = String(texto || '').trim();
    if (cuerpo.length < 5) throw new Error('el encargo necesita texto (qué hay que hacer y para qué)');
    // Fecha límite y criterio de hecho: viajan en el texto (lo que el agente lee en su sesión) y
    // como metadatos para quien los sepa leer.
    const limite = String(deadline || '').trim(); const hecho = String(criterio || '').trim();
    if (limite || hecho) cuerpo += `${limite ? `\n⏰ Fecha límite: ${limite}` : ''}${hecho ? `\n✅ Criterio de hecho: ${hecho}` : ''}`;
    let destino = maquina ? norm(maquina) : '';
    let nota = '';
    if (esConsejero(p)) { destino = MAQUINA_CONSEJEROS; nota = `consejero de GrokBot (silla ${SILLAS[p].rol} · ${SILLAS[p].maquina}): el worker lo despierta por su webhook; suele contestar en 1-3 min`; }
    else if (!destino) {
      destino = await maquinaDe(p);
      nota = destino ? `en cola para ${p} en ${destino} (la máquina donde late ahora); su vigilante lo inyecta en su sesión en ≤15 s` : `${p} no late en ningún equipo desde hace 15 min: el encargo queda en cola y lo cogerá al despertar; a los 30 min sin acuse se reasigna`;
    } else nota = `en cola para ${p} en ${destino}; si allí no late, a los 30 min se reasigna`;
    const firma = de || (identidad ? identidad.agent : 'MCP admira.live');
    // Contrato del bot-inbox: con proyecto el encargo nace como misión FLT en yokup; sin proyecto
    // es conversación (materialize_mission:false) y no ensucia el tablero de misiones.
    const body = { text: cuerpo, target_persona: p, target_machine: destino, from: firma };
    if (proyecto_id) { body.project_id = proyecto_id; body.materialize_mission = true; } else body.materialize_mission = false;
    if (limite) body.deadline = limite;
    if (hecho) body.done_criteria = hecho;
    const r = await llamar(`${base}/api/bot-inbox`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r || !r.ok) throw new Error(`el bot-inbox no aceptó el encargo: ${JSON.stringify(r)}`);
    const etiqueta = etiquetaEncargo(r.id, r.ts, r.etiqueta);
    return { ok: true, encargo: Number(r.id), etiqueta: etiqueta || null, task_id: r.task_id || null, persona: p, maquina: destino || null, de: firma, proyecto_id: r.project_id || proyecto_id || null, mision_en_yokup: !!proyecto_id,
      ...(limite ? { deadline: limite } : {}), ...(hecho ? { criterio: hecho } : {}),
      nota, siguiente: `encargo_estado con encargo=${r.id} para leer el acuse y la respuesta. La etiqueta visible es ${etiqueta || ("#" + r.id)} (se publica también en hilo en Telegram y en admira.live/telegram).` };
  }

  /** Estado y respuesta de un encargo por su número. */
  async function estado({ encargo }) {
    const d = await llamar(`${base}/api/bot-inbox/${Number(encargo)}`);
    const x = d && d.item; if (!x) throw new Error(`encargo #${encargo} no encontrado`);
    const st = String(x.status || 'pending');
    const lectura = { pending: 'pendiente: nadie lo ha cogido aún', ack: 'acusado: lo ha cogido y está en ello', in_progress: 'en curso', blocked: 'bloqueado: mira la nota', done: 'hecho: la respuesta está en «respuesta»' }[st] || st;
    const etiqueta = etiquetaEncargo(x.id, x.ts, x.etiqueta);
    return { encargo: Number(x.id), etiqueta: etiqueta || null, estado: st, lectura, persona: x.target_persona || null, maquina: x.target_machine || null, de: x.from_name || '', cuando: cuando(x.ts),
      acuse: x.ack_at ? cuando(x.ack_at) : null, cierre: x.done_at ? cuando(x.done_at) : null, texto: String(x.text || ''), respuesta: x.note || '', proyecto_id: x.project_id || null, task_id: x.task_id || null };
  }

  /** Mandamiento 15 «Cuenta tus tokens» (Carlos, 6-sep-2026): declarar el consumo propio en las
   *  Notificaciones de Yokup. Para quien no tiene medidor local (consejeros de GrokBot, OpenCode, Grok CLI). */
  async function reportarConsumo({ tokens_entrada = 0, tokens_cache = 0, tokens_salida = 0, modelo = '', sesiones = 1, llamadas = 0, despertares = 0, duplicados = 0, causa = '', dia = '' } = {}) {
    if (!identidad) throw new Error('sin identidad: la clave del MCP no dice quién eres, y el consumo se declara con nombre');
    const total = Number(tokens_entrada) + Number(tokens_cache) + Number(tokens_salida);
    const d = dia || new Date(ahora()).toISOString().slice(0, 10);
    const pc = Math.round(100 * Number(tokens_cache) / Math.max(1, Number(tokens_entrada) + Number(tokens_cache)));
    const f = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n));
    const titulo = `📟 Consumo ${d} · ${identidad.agent} · ${identidad.runtime}${modelo ? ' ' + modelo : ''} · ${f(total)} tokens (${pc} % caché, salida ${f(Number(tokens_salida))}) · ${sesiones} sesiones · ${llamadas} llamadas · ${despertares} despertares${duplicados ? ` (${duplicados} dup.)` : ''}${causa ? ' · causa: ' + causa : ''}`.slice(0, 300);
    const body = { machine: identidad.machine, owner: identidad.agent, kind: 'consumo', dia: d, titulo,
      datos: { persona: identidad.persona, equipo: identidad.machine, runtime: identidad.runtime, origen: 'mcp consumo_reportar', total, entrada: Number(tokens_entrada), cache: Number(tokens_cache), salida: Number(tokens_salida), sesiones, llamadas, modelos: modelo ? { [modelo]: sesiones } : {}, despertares, duplicados, causa } };
    const yokup = limpiar(env.YOKUP_API || 'https://api.yokup.com');
    const r = await llamar(`${yokup}/fleet/notificacion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, { auth: false, directo: true });
    return { ok: !!(r && r.ok), notificacion: r && r.id, nueva: r && r.nueva, titulo, ver: 'https://www.yokup.com/notificaciones' };
  }

  /** Acuse/respuesta genérica de un encargo (ack, in_progress, blocked, done) para CUALQUIER agente o
   *  consejero, por el mismo mecanismo que telegram_responder (POST /api/bot-inbox/:id/status). Solo
   *  el destinatario contesta: se lee el encargo antes y se rechaza si es de otra persona. */
  async function responder({ numero, estado: st = 'ack', nota = '', commit = '', url = '', verificacion = '' }) {
    if (!identidad || !identidad.persona) throw new Error('sin identidad: la clave del MCP no dice quién eres y un acuse se firma con nombre (consejero con clave compartida: pasa como)');
    const n = Number(numero);
    const d = await llamar(`${base}/api/bot-inbox/${n}`);
    const x = d && d.item; if (!x) throw new Error(`encargo #${n} no encontrado`);
    const para = destinatario(x);
    const yo = personaCanonica(identidad.persona) || sillaCanonica(identidad.persona) || identidad.persona;
    if (para && para !== yo) throw new Error(`el encargo #${n} es de ${para}, no de ${yo}: solo su destinatario lo acusa o lo cierra (si debe pasar a otro, encárgaselo con agente_encargar citando #${n})`);
    if (!para && x.target_machine && identidad.machine && norm(x.target_machine) !== norm(identidad.machine)) throw new Error(`el encargo #${n} es para la máquina ${x.target_machine}, no para ${identidad.machine}`);
    const texto = String(nota || '').trim();
    if (st === 'blocked' && !texto) throw new Error('blocked necesita nota con el motivo (qué falta y quién lo desbloquea)');
    if (st === 'done' && !texto && !commit && !url && !verificacion) throw new Error('para cerrar hace falta nota con la respuesta (o commit/url/verificación)');
    const antes = String(x.status || 'pending');
    const r = await crearTelegram(env, identidad, deps).responder({ encargo: n, estado: st, respuesta: texto, commit, url, verificacion });
    return { ...r, etiqueta: etiquetaEncargo(x.id, x.ts, x.etiqueta) || null, antes, destinatario: para || null,
      siguiente: st === 'done' ? 'cerrado: la respuesta queda en la nota del encargo (encargo_estado) y en hilo en Telegram' : 'cuando avances, encargo_responder con in_progress / blocked (motivo) / done (respuesta)' };
  }

  return { vivos, encargar, estado, maquinaDe, reportarConsumo, presenciaCruda, listarEncargos, cargaPorPersona, responder };
}
