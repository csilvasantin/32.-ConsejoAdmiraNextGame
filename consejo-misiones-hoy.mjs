/**
 * Recuento real de misiones de hoy (00:00 Europe/Madrid).
 * Une encargos done del inbox, misiones Yokup resueltas y PRs fusionados,
 * sin duplicar. No inventa atribuciones.
 *
 * Regla de autor de un PR (en este orden):
 *  1. Prefijo de rama: woz/, jobs/, disney|walt/, lucas/, musk|elon/,
 *     huang|jensen/, lasseter/, ive|jony/ → ese consejero.
 *  2. Atribución expresa de Carlos (t1212u) para PRs cuya rama no lleva
 *     prefijo: admira-next-web #396 y #398 son de Wozniak.
 *  3. Si no hay marca clara, el PR no se atribuye a nadie.
 */
export const RANKING_GRUPOS = Object.freeze({
  leyendas: Object.freeze([
    'Steve Jobs', 'Steve Wozniak', 'Warren Buffett', 'Walt Disney', 'Dieter Rams', 'George Lucas',
  ]),
  coetaneos: Object.freeze([
    'Elon Musk', 'Jensen Huang', 'Mira Murati', 'John Lasseter', 'Jony Ive', 'Ryan Reynolds',
  ]),
});

export const BOT_A_PERSONA = Object.freeze({
  Jobs: 'Steve Jobs',
  Wozniak: 'Steve Wozniak',
  Disney: 'Walt Disney',
  Lucas: 'George Lucas',
  Musk: 'Elon Musk',
  Huang: 'Jensen Huang',
  Lasseter: 'John Lasseter',
  Ive: 'Jony Ive',
});

export const PERSONA_A_BOT = Object.freeze(Object.fromEntries(
  Object.entries(BOT_A_PERSONA).map(([b, p]) => [p, b]),
));

/** PRs que Carlos atribuyó expresamente a Woz (t1212u) y cuya rama no es woz/. */
export const ATRIBUCION_EXPRESA = Object.freeze([
  { repo: 'csilvasantin/admira-next-web', number: 396, bot: 'Wozniak', nota: 'Carlos t1212u: cámara 2 Insta360 Link 2' },
  { repo: 'csilvasantin/admira-next-web', number: 398, bot: 'Wozniak', nota: 'Carlos t1212u: selector cam 1/2 y zoom' },
]);

const PREFIJO_RAMA = [
  [/^woz\b/i, 'Wozniak'],
  [/^jobs\b/i, 'Jobs'],
  [/^(disney|walt)\b/i, 'Disney'],
  [/^lucas\b/i, 'Lucas'],
  [/^(musk|elon)\b/i, 'Musk'],
  [/^(huang|jensen)\b/i, 'Huang'],
  [/^lasseter\b/i, 'Lasseter'],
  [/^(ive|jony)\b/i, 'Ive'],
];

export function grupoDe(persona) {
  for (const [gen, lista] of Object.entries(RANKING_GRUPOS)) {
    if (lista.includes(persona)) return gen;
  }
  return null;
}

export function enRankingGrupo(persona, gen) {
  const lista = RANKING_GRUPOS[gen];
  return !!(lista && lista.includes(persona));
}

export function seg(ts) {
  if (ts == null || ts === '') return 0;
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return ts > 4102444800 ? Math.floor(ts / 1000) : ts;
  }
  const s = String(ts).trim();
  if (!s) return 0;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0 && !/[^0-9.]/.test(s)) {
    return n > 4102444800 ? Math.floor(n / 1000) : n;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function normalizarRepo(repo) {
  return String(repo || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/^\/+/, '');
}

export function atribuirPr(pr) {
  const repo = normalizarRepo(pr.repo || pr.repository || '');
  const number = Number(pr.number);
  const rama = String(pr.rama || pr.head || pr.ref || '').replace(/^refs\/heads\//, '');
  const cabeza = rama.split('/')[0] || '';
  for (const [rx, bot] of PREFIJO_RAMA) {
    if (rx.test(cabeza)) {
      return { bot, regla: 'rama:' + cabeza, rama, repo, number };
    }
  }
  const expresa = ATRIBUCION_EXPRESA.find((a) => a.repo === repo && a.number === number);
  if (expresa) return { bot: expresa.bot, regla: 'carlos-t1212u', rama, repo, number, nota: expresa.nota };
  return { bot: null, regla: 'sin-marca', rama, repo, number };
}

export function claveMision(item) {
  if (!item) return '';
  if (item.fuente === 'pr' && item.repo && item.numero) return 'pr:' + normalizarRepo(item.repo) + '#' + item.numero;
  if (item.fuente === 'inbox' && item.numero) return 'inbox:' + item.numero;
  if (item.fuente === 'yokup' && item.id) return 'yokup:' + item.id;
  return item.clave || '';
}

function tituloDe(texto, max = 80) {
  const lineas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^soy [^.\n]{1,60}\.?$/i.test(l));
  let t = (lineas[0] || '').replace(/^[^\p{L}\p{N}«"(¿¡#[]+/u, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length > max) t = t.slice(0, max - 1).replace(/[\s·,;:.\-–—]+$/u, '') + '…';
  return t;
}

function refsCruzadas(texto) {
  const t = String(texto || '');
  const out = { prs: [], encargos: [], flts: [] };
  for (const m of t.matchAll(/\b(?:csilvasantin\/)?(32\.-ConsejoAdmiraNextGame|admira-next-web)\s*#(\d{1,5})\b/gi)) {
    const repo = /admira-next-web/i.test(m[1]) ? 'csilvasantin/admira-next-web' : 'csilvasantin/32.-ConsejoAdmiraNextGame';
    out.prs.push(repo + '#' + m[2]);
  }
  for (const m of t.matchAll(/\bPR\s*#(\d{1,5})\b/gi)) out.prs.push('#' + m[1]);
  for (const m of t.matchAll(/\bFLT-(\d+)\b/gi)) out.flts.push('FLT-' + m[1]);
  for (const m of t.matchAll(/#(\d{3,5})\b/g)) out.encargos.push(Number(m[1]));
  return out;
}

export function misionesInboxHoy(items, { desdeS, hastaS } = {}) {
  if (items == null) return { ok: false, lista: [] };
  const lista = [];
  for (const x of (Array.isArray(items) ? items : [])) {
    if (String(x && x.status) !== 'done') continue;
    const t = seg(x.done_at) || seg(x.closed_at) || 0;
    if (!t || (desdeS && t < desdeS) || (hastaS && t > hastaS)) continue;
    const numero = Number(x.id) || null;
    lista.push({
      fuente: 'inbox',
      cuando: t,
      titulo: tituloDe(x.text) || ('encargo' + (numero ? ' #' + numero : '')),
      ref: numero ? '#' + numero : (x.etiqueta || null),
      url: null,
      numero,
      id: numero ? String(numero) : null,
    });
  }
  return { ok: true, lista };
}

const YOKUP_OK = new Set(['resolved', 'done', 'completed', 'closed']);

/**
 * Filtro ?agent= de api.yokup.com/fleet/missions. El listado global
 * ?status=resolved&limit=120 es una ventana única y a menudo no incluye
 * al consejero (yokup_ok=true pero su recuento sale 0). Se consulta por
 * el alias corto que el API acepta; no se inventan agentes.
 */
export const YOKUP_AGENT_QUERY = Object.freeze({
  Wozniak: Object.freeze(['woz']),
  Jobs: Object.freeze(['jobs']),
  Disney: Object.freeze(['disney']),
  Lucas: Object.freeze(['lucas']),
  Musk: Object.freeze(['musk']),
  Huang: Object.freeze(['huang']),
  Lasseter: Object.freeze(['lasseter']),
  Ive: Object.freeze(['ive']),
});

export const YOKUP_HOSTS = Object.freeze(['https://api.yokup.com', 'https://rtc.yokup.com']);

export function urlsYokupPorAgente(host = YOKUP_HOSTS[0], limit = 80) {
  const n = Number(limit) || 80;
  return Object.entries(YOKUP_AGENT_QUERY).map(([bot, aliases]) => ({
    bot,
    agent: aliases[0],
    url: host + '/fleet/missions?status=resolved&limit=' + n + '&agent=' + encodeURIComponent(aliases[0]),
  }));
}

export function yokupIdentidades(x) {
  if (!x || typeof x !== 'object') return [];
  const dup = x.duplicate || {};
  return [x.persona, x.assignee, x.agent, x.agent_key, dup.agent_key, x.owner].filter(Boolean);
}

export function personaYokupEs(persona, bot, raw) {
  const s = String(raw || '').replace(/GrokBot/gi, '').replace(/[^a-z]/gi, '').toLowerCase();
  if (!s) return false;
  const botK = String(bot || '').toLowerCase();
  const perK = String(persona || '').replace(/[^a-z]/gi, '').toLowerCase();
  if (botK && s === botK) return true;
  if (botK && s.startsWith(botK) && s.length <= botK.length + 4) return true;
  if (perK && (s === perK || perK.endsWith(s) || s.endsWith(perK))) return true;
  return false;
}

export function misionYokupDePersona(x, { persona, bot } = {}) {
  return yokupIdentidades(x).some((who) => personaYokupEs(persona, bot, who));
}

export function misionesYokupHoy(items, { persona, bot, desdeS, hastaS } = {}) {
  if (items == null) return { ok: false, lista: [] };
  const lista = [];
  for (const x of (Array.isArray(items) ? items : [])) {
    const st = String(x && x.status || '').toLowerCase();
    if (!YOKUP_OK.has(st)) continue;
    if (!misionYokupDePersona(x, { persona, bot })) continue;
    const t = seg(x.updated_at) || seg(x.finished_at) || seg(x.closed_at) || seg(x.done_at) || 0;
    const dia = x.display_day || null;
    const enDia = dia ? true : (t && (!desdeS || t >= desdeS) && (!hastaS || t <= hastaS));
    // Si trae display_day, tiene que ser el día de Madrid de desdeS…hastaS.
    // Lo comprueba el caller pasando solo las de hoy, o filtramos por t.
    if (!enDia) continue;
    if (dia) {
      // si hay timestamp, confirma el rango; si no, confiamos en display_day que ya filtró el caller
      if (t && desdeS && t < desdeS) continue;
      if (t && hastaS && t > hastaS) continue;
    }
    const id = x.id || null;
    lista.push({
      fuente: 'yokup',
      cuando: t || desdeS || 0,
      titulo: tituloDe(x.subject || x.title) || (id || 'misión Yokup'),
      ref: id || (x.display_ref || null),
      url: id ? 'https://www.admira.live/misiones?q=' + encodeURIComponent(id) : null,
      id,
      numero: null,
    });
  }
  return { ok: true, lista };
}

export function misionesPrHoy(prs, { bot, desdeS, hastaS } = {}) {
  if (prs == null) return { ok: false, lista: [] };
  const lista = [];
  for (const pr of (Array.isArray(prs) ? prs : [])) {
    const merged = seg(pr.merged_at || pr.mergedAt);
    if (!merged || (desdeS && merged < desdeS) || (hastaS && merged > hastaS)) continue;
    const atr = atribuirPr(pr);
    if (!atr.bot) continue;
    if (bot !== undefined && atr.bot !== bot) continue;
    const repo = normalizarRepo(pr.repo || pr.repository || atr.repo);
    const number = Number(pr.number || atr.number);
    const titulo = tituloDe(pr.title) || ('PR #' + number);
    lista.push({
      fuente: 'pr',
      cuando: merged,
      titulo,
      ref: (repo.split('/')[1] || repo) + ' #' + number,
      url: repo && number ? 'https://github.com/' + repo + '/pull/' + number : null,
      repo,
      numero: number,
      regla: atr.regla,
    });
  }
  return { ok: true, lista };
}

function esDuplicado(candidato, aceptadas) {
  const clave = claveMision(candidato);
  if (clave && aceptadas.some((a) => claveMision(a) === clave)) return true;
  const refs = refsCruzadas((candidato.titulo || '') + ' ' + (candidato.ref || ''));
  for (const a of aceptadas) {
    if (candidato.fuente === 'yokup' && a.fuente === 'pr') {
      const short = a.repo ? a.repo.split('/')[1] + '#' + a.numero : null;
      if (short && refs.prs.includes(short)) return true;
      if (a.numero && refs.prs.includes('#' + a.numero)) return true;
    }
    if (candidato.fuente === 'yokup' && a.fuente === 'inbox' && a.numero && refs.encargos.includes(a.numero)) return true;
    if (((candidato.fuente === 'inbox' && a.fuente === 'pr') || (candidato.fuente === 'pr' && a.fuente === 'inbox')) && a.numero && candidato.numero) {
      if (a.numero === candidato.numero) return true;
    }
    if (candidato.fuente === 'inbox' && a.fuente === 'pr' && a.numero && (
      refs.prs.includes('#' + a.numero) ||
      (a.repo && refs.prs.includes(a.repo + '#' + a.numero)) ||
      refs.encargos.includes(a.numero)
    )) return true;
    if (candidato.fuente === 'pr' && a.fuente === 'yokup' && candidato.numero) {
      const r = refsCruzadas((a.titulo || '') + ' ' + (a.ref || ''));
      if (r.prs.includes('#' + candidato.numero) || (candidato.repo && r.prs.includes(candidato.repo + '#' + candidato.numero))) return true;
    }
  }
  return false;
}

/**
 * Unión sin duplicar. n es null solo si ninguna fuente pudo leerse.
 * Un inbox vacío (ok) cuenta 0, no «—».
 */
export function unirMisionesHoy({ persona, bot, inbox, yokup, prs, desdeS, hastaS, dia }) {
  const fuentes = {
    inbox: misionesInboxHoy(inbox, { desdeS, hastaS }),
    yokup: misionesYokupHoy(yokup, { persona, bot, desdeS, hastaS }),
    pr: misionesPrHoy(prs, { bot, desdeS, hastaS }),
  };
  // Filtrar yokup por display_day si el caller no lo hizo.
  if (fuentes.yokup.ok && dia) {
    // ya filtrado por timestamp en misionesYokupHoy cuando hay t;
    // display_day distinto se deja si no hay t — el caller debería pasar solo hoy.
  }
  const leidas = Object.values(fuentes).filter((f) => f.ok).length;
  const porFuente = { inbox: 0, yokup: 0, pr: 0 };
  if (!leidas) return { n: null, ultimo: 0, misiones: [], por_fuente: porFuente, fuentes_ok: fuentes };

  // Orden de dedup: primero PRs e inbox (más atribuibles), luego yokup.
  const orden = [...fuentes.pr.lista, ...fuentes.inbox.lista, ...fuentes.yokup.lista];
  const aceptadas = [];
  for (const item of orden) {
    if (esDuplicado(item, aceptadas)) continue;
    aceptadas.push(item);
    porFuente[item.fuente] = (porFuente[item.fuente] || 0) + 1;
  }
  aceptadas.sort((a, b) => b.cuando - a.cuando);
  const ultimo = aceptadas.reduce((m, x) => Math.max(m, x.cuando || 0), 0);
  return { n: aceptadas.length, ultimo, misiones: aceptadas, por_fuente: porFuente, fuentes_ok: fuentes };
}

export function etiquetaHoy(n) {
  if (n == null) return '—';
  return String(n);
}
