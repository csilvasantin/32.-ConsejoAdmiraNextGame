/**
 * Histórico de LÍNEAS DE CÓDIGO de la Galaxia AdmiraNeXT (GrokBotBox, 09-10-2026).
 *
 * Fotos (snapshots) dos veces al día — 00:00 y 12:00 de Madrid, las mismas horas que las
 * lecturas de consumos — con, por proyecto, {id, repo, commit, ficheros, lineas, lineas_unicas}.
 * Mismo método que el Σ del HACKEO (tools/hackeo-corpus.py): líneas NO vacías de ficheros
 * fuente, sin node_modules/dist/vendor/minificados ni ficheros sensibles; «lineas_unicas» es
 * lo que el proyecto aporta al Σ sin duplicar (un fichero idéntico cuenta una vez).
 *
 * Funciones puras (sin KV ni red): se prueban en control-lineas.test.mjs.
 */
export const ZONA = "Europe/Madrid";
export const SLOTS = ["00", "12"];
export const MAX_PROYECTOS = 40;

const RE_ID = /^[a-z0-9][a-z0-9._-]{0,39}$/i;
const RE_REPO = /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/;
const RE_COMMIT = /^[0-9a-f]{4,40}$/i;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha (AAAA-MM-DD) y hora (0-23) de Madrid de un instante (ms). */
export function madrid(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}

/** Ranura de un instante: antes de las 12:00 de Madrid → «00» de ese día; después → «12». */
export function fechaSlot(ms) {
  const { fecha, hora } = madrid(ms);
  return { fecha, slot: hora < 12 ? "00" : "12" };
}

export const claveSnap = (fecha, slot) => `control:lineas:snap:${fecha}:${slot}`;
export const KEY_INDICE = "control:lineas:index:v1";

const entero = (v) => (Number.isInteger(v) && v >= 0 && v < 1e9 ? v : null);

/** Valida y normaliza el cuerpo del POST. → { snap } | { error } */
export function normalizarSnapshot(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { error: "cuerpo vacío" };
  const ts = Date.parse(body.ts);
  if (!Number.isFinite(ts)) return { error: "ts inválido (ISO 8601 con zona, p. ej. 2026-10-09T12:00:00+02:00)" };
  if (ts > ahora + 10 * 60 * 1000) return { error: "ts en el futuro" };
  let { fecha, slot } = fechaSlot(ts);
  if (body.slot != null) {
    const s = String(body.slot).padStart(2, "0");
    if (!SLOTS.includes(s)) return { error: "slot inválido (00 o 12)" };
    slot = s;
  }
  if (body.fecha != null) {
    if (!RE_FECHA.test(String(body.fecha))) return { error: "fecha inválida (AAAA-MM-DD)" };
    if (String(body.fecha) !== fecha) return { error: "la fecha no casa con ts (no se rellenan días pasados)" };
  }
  const ps = body.proyectos;
  if (!Array.isArray(ps) || !ps.length) return { error: "faltan proyectos" };
  if (ps.length > MAX_PROYECTOS) return { error: "demasiados proyectos" };
  const vistos = new Set(), proyectos = [];
  for (const p of ps) {
    if (!p || typeof p !== "object") return { error: "proyecto inválido" };
    const id = String(p.id || "");
    if (!RE_ID.test(id)) return { error: `id inválido: ${id.slice(0, 40)}` };
    if (vistos.has(id)) return { error: `id repetido: ${id}` };
    vistos.add(id);
    const repo = String(p.repo || "");
    if (!RE_REPO.test(repo)) return { error: `repo inválido en ${id}` };
    const commit = p.commit == null || p.commit === "" ? "" : String(p.commit);
    if (commit && !RE_COMMIT.test(commit)) return { error: `commit inválido en ${id}` };
    const ficheros = entero(p.ficheros), lineas = entero(p.lineas);
    if (ficheros == null || lineas == null) return { error: `ficheros/lineas inválidos en ${id}` };
    const out = { id, repo, commit: commit.slice(0, 12), ficheros, lineas };
    if (p.proyecto != null) out.proyecto = String(p.proyecto).slice(0, 60);
    if (p.lineas_unicas != null) {
      const u = entero(p.lineas_unicas);
      if (u == null || u > lineas) return { error: `lineas_unicas inválidas en ${id}` };
      out.lineas_unicas = u;
    }
    proyectos.push(out);
  }
  const conUnicas = proyectos.every((p) => p.lineas_unicas != null);
  const total = conUnicas ? proyectos.reduce((s, p) => s + p.lineas_unicas, 0) : proyectos.reduce((s, p) => s + p.lineas, 0);
  const bruto = proyectos.reduce((s, p) => s + p.lineas, 0);
  const metodo = typeof body.metodo === "string" ? body.metodo.slice(0, 200) : "hackeo-corpus";
  return { snap: { fecha, slot, ts: new Date(ts).toISOString(), proyectos, total, total_bruto: bruto, sin_duplicar: conUnicas, metodo } };
}

/** Entrada compacta del índice (una lectura de KV basta para pintar la historia). */
export function entradaIndice(snap) {
  const p = {};
  for (const x of snap.proyectos) p[x.id] = [x.lineas, x.lineas_unicas == null ? null : x.lineas_unicas, x.ficheros, x.commit, x.repo, x.proyecto || x.id];
  return { fecha: snap.fecha, slot: snap.slot, ts: snap.ts, total: snap.total, total_bruto: snap.total_bruto, p };
}

/** Añade (o sustituye la misma fecha+ranura) y ordena cronológicamente. Tope: ~1 año. */
export function anadirIndice(indice, entrada, max = 800) {
  const lista = (Array.isArray(indice) ? indice : []).filter((e) => !(e.fecha === entrada.fecha && e.slot === entrada.slot));
  lista.push(entrada);
  lista.sort((a, b) => (a.fecha + a.slot < b.fecha + b.slot ? -1 : a.fecha + a.slot > b.fecha + b.slot ? 1 : 0));
  return lista.slice(-max);
}

/** AAAA-MM-DD menos n días (calendario, sin zona). */
export function restarDias(fecha, n) {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Última foto de un día dado (o null). */
function ultimaDelDia(indice, fecha) {
  let r = null;
  for (const e of indice) if (e.fecha === fecha) r = e;
  return r;
}

const valor = (e, id) => (e && e.p && e.p[id] ? e.p[id][0] : null);
const resta = (a, b) => (a == null || b == null ? null : a - b);

/**
 * Resumen para la vista: por proyecto hoy/ayer/Δ día/Δ semana (+ serie) y el total (Σ sin duplicar).
 * «Ayer» y «hace una semana» solo si HAY foto de ese día: nunca se inventa un día pasado.
 */
export function resumir(indice) {
  const lista = Array.isArray(indice) ? indice : [];
  if (!lista.length) return { fotos: 0, ultima: null, proyectos: [], total: null, dias: 0, nota: "aún no hay ninguna foto" };
  const ult = lista[lista.length - 1];
  const ayer = ultimaDelDia(lista, restarDias(ult.fecha, 1));
  const semana = ultimaDelDia(lista, restarDias(ult.fecha, 7));
  const ids = [];
  for (const e of lista) for (const id of Object.keys(e.p || {})) if (!ids.includes(id)) ids.push(id);
  const proyectos = ids.map((id) => {
    const info = (ult.p && ult.p[id]) || lista.slice().reverse().find((e) => e.p && e.p[id]).p[id];
    const hoy = valor(ult, id), a = valor(ayer, id), s = valor(semana, id);
    return {
      id, proyecto: info[5] || id, repo: info[4], commit: info[3], ficheros: info[2], unicas: info[1],
      hoy, ayer: a, deltaDia: resta(hoy, a), deltaSemana: resta(hoy, s),
      serie: lista.map((e) => valor(e, id)),
    };
  }).sort((x, y) => (y.hoy || 0) - (x.hoy || 0));
  const dias = new Set(lista.map((e) => e.fecha)).size;
  return {
    fotos: lista.length, dias, ultima: { fecha: ult.fecha, slot: ult.slot, ts: ult.ts },
    etiquetas: lista.map((e) => `${e.fecha} ${e.slot}:00`),
    proyectos,
    total: {
      hoy: ult.total, bruto: ult.total_bruto, ayer: ayer ? ayer.total : null,
      deltaDia: resta(ult.total, ayer ? ayer.total : null), deltaSemana: resta(ult.total, semana ? semana.total : null),
      serie: lista.map((e) => e.total),
    },
    nota: dias <= 1 ? "el histórico empieza hoy" : null,
  };
}

/* ═══════════ HACKEO EN VIVO (Woz · MBP14, 13-10-2026, orden de Carlos) ═══════════
 * 1) Qué proyectos tienen a un agente interviniendo AHORA: latidos y terminales reales de
 *    bot.yokup.com/api/presence y commits recientes de la rama por defecto (feed Atom de GitHub).
 *    Sin datos fijos: si no hay señal fresca, no destella.
 * 2) Líneas nuevas desde el corpus del despliegue: diff público de GitHub (corpus…HEAD), contado
 *    con el MISMO criterio que tools/hackeo-corpus.py (líneas NO vacías de ficheros fuente).
 */
export const VENTANA_FILA_S = 120;        // fila de presencia viva (el vigilante la refresca cada pocos s)
export const VENTANA_DECLARADA_S = 300;   // el agente declaró ese proyecto hace < 5 min → interviene
export const VENTANA_TURNO_S = 900;       // turno activo / CPU propia: basta declaración de < 15 min
export const VENTANA_COMMIT_S = 900;      // commit en la rama por defecto hace < 15 min
export const CPU_PROCESO_MIN = 5;
const PROYECTO_VACIO = new Set(["", "otros", "otro", "none", "null", "training", "ninguno", "varios", "general"]);

const EXT_FUENTE = new Set(["html", "htm", "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "scss", "py", "sh", "swift", "kt",
  "java", "go", "rs", "php", "rb", "sql", "vue", "svelte"]);
const DIR_FUERA = /(^|\/)(node_modules|vendor|vendors|third_party|dist|build|\.git|\.wrangler|\.next|\.cache|coverage|__pycache__|\.runtime)(\/|$)/i;
const NOMBRE_SENSIBLE = /(^|\/)(\.env[^/]*|\.dev\.vars|id_rsa[^/]*|id_ed25519[^/]*|wrangler\.toml|[^/]*\.(pem|key|p12|pfx|keystore|jks|crt)|[^/]*(secret|credential|token|password|passwd)[^/]*)$/i;
const MINIFICADO = /\.min\.[a-z]+$|[-.]bundle\.js$|\.map$/i;

/** ¿Este fichero cuenta en el Σ? Mismos filtros que tools/hackeo-corpus.py (EXT, DIR_FUERA, NOMBRE_SENSIBLE, MINIFICADO). */
export function fuenteContable(ruta) {
  const r = String(ruta || "");
  const m = /\.([a-z0-9]+)$/i.exec(r);
  if (!m || !EXT_FUENTE.has(m[1].toLowerCase())) return false;
  return !DIR_FUERA.test(r) && !NOMBRE_SENSIBLE.test(r) && !MINIFICADO.test(r);
}

/** Cuenta un diff unificado: líneas NO vacías añadidas y quitadas en ficheros fuente. → { anadidas, quitadas, ficheros } */
export function contarDiff(texto) {
  let anadidas = 0, quitadas = 0, ficheros = 0, cuenta = false;
  for (const l of String(texto || "").split("\n")) {
    if (l.startsWith("diff --git ")) {
      const m = / b\/(.+)$/.exec(l);
      cuenta = !!(m && fuenteContable(m[1]));
      if (cuenta) ficheros++;
      continue;
    }
    if (!cuenta || l.startsWith("+++") || l.startsWith("---")) continue;
    if (l[0] === "+" && l.slice(1).trim()) anadidas++;
    else if (l[0] === "-" && l.slice(1).trim()) quitadas++;
  }
  return { anadidas, quitadas, ficheros };
}

/** Feed Atom de commits de GitHub → [{ sha, ts (ms), autor, titulo }] (más reciente primero). */
export function leerAtom(xml) {
  const out = [];
  const des = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
  for (const e of String(xml || "").split("<entry>").slice(1)) {
    const sha = (/Commit\/([0-9a-f]{7,40})</.exec(e) || [])[1];
    const ts = Date.parse((/<updated>([^<]+)<\/updated>/.exec(e) || [])[1] || "");
    if (!sha || !Number.isFinite(ts)) continue;
    out.push({ sha, ts, autor: des((/<author>\s*<name>([^<]*)<\/name>/.exec(e) || [])[1]).slice(0, 60),
      titulo: des((/<title>([\s\S]*?)<\/title>/.exec(e) || [])[1]).replace(/\s+/g, " ").slice(0, 120) });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

const normNombre = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\s/?#]/)[0].replace(/[^a-z0-9]/g, "");

/**
 * Alias → claves de proyecto del corpus. Dominio («admira.tv»→admiratv), nombre del repo («admira-live»,
 * «clearchannel-tv»; un repo compartido apunta a todos sus proyectos) y el nombre sin TLD solo si no es
 * ambiguo y tiene ≥ 5 letras («pixeria», «yokup»; «admira» no, que es de cinco proyectos).
 */
export function mapaAlias(projects) {
  const m = new Map(), add = (a, k) => { if (a.length < 5) return; if (!m.has(a)) m.set(a, new Set()); m.get(a).add(k); };
  const raices = new Map();
  for (const p of projects || []) {
    const raiz = normNombre(String(p.project || "").split(".")[0]);
    raices.set(raiz, (raices.get(raiz) || 0) + 1);
  }
  for (const p of projects || []) {
    if (!p || !p.key) continue;
    add(normNombre(p.project), p.key);
    add(normNombre(p.domain), p.key);
    add(normNombre(String(p.repo || "").split("/").pop()), p.key);
    const raiz = normNombre(String(p.project || "").split(".")[0]);
    if (raices.get(raiz) === 1) add(raiz, p.key);
  }
  return m;
}

/** Proyecto declarado (texto libre) → claves del corpus, o [] si no se reconoce (nunca se adivina). */
export function clavesDe(declarado, alias) {
  const n = normNombre(declarado);
  if (!n || PROYECTO_VACIO.has(n)) return [];
  return [...(alias.get(n) || [])];
}

function turnoActivo(e) {
  let t = e && e.app_turn;
  if (typeof t === "string") { try { t = JSON.parse(t); } catch (x) { t = null; } }
  return !!(t && typeof t === "object" && String(t.state || "").toLowerCase() === "active");
}

/**
 * ¿Esta fila de presencia muestra a un agente interviniendo AHORA en su proyecto? → motivo | null.
 *  · la fila tiene que estar viva (< 2 min);
 *  · process_snapshot (vigilante del Mac): declaró ese proyecto hace < 5 min, o hace < 15 min con turno de app
 *    activo o CPU del propio proceso > 5 (la CPU de la máquina no vale: es de todos);
 *  · heartbeat: solo con señal explícita de trabajo (trabajando/working o modo «trabajando»); un bucle que late
 *    en pasivo o autónomo NO destella.
 */
export function motivoPresencia(e, ahoraS) {
  if (!e || !e.persona) return null;
  const upd = Number(e.updated) || 0;
  if (!(ahoraS - upd < VENTANA_FILA_S) || upd > ahoraS + 60) return null;
  const modo = String(e.mode || "").toLowerCase();
  // Mismo criterio que flota-trabajando-lib (r40): solo «trabajando» cuenta; «autónomo»/«pasivo» es un bucle que late
  // aunque no esté tocando código → no destella.
  const explicito = e.trabajando === true || e.working === true || modo === "trabajando";
  if (e.source === "process_snapshot") {
    const decl = Number(e.declared_updated) || 0, edad = ahoraS - decl;
    if (!decl || edad < -60) return null;
    if (edad < VENTANA_DECLARADA_S) return `declaró el proyecto hace ${Math.max(0, Math.round(edad))} s`;
    if (edad < VENTANA_TURNO_S) {
      if (turnoActivo(e)) return "turno activo en la app";
      const cpu = e.proc_cpu != null ? Number(e.proc_cpu) : e.cpu_scope === "process" ? Number(e.cpu) : NaN;
      if (cpu > CPU_PROCESO_MIN) return `CPU del proceso ${Math.round(cpu)} %`;
      if (explicito) return "latido «trabajando»";
    }
    return null;
  }
  return explicito ? `latido «trabajando» de hace ${Math.max(0, Math.round(ahoraS - upd))} s` : null;
}

/**
 * Actividad por proyecto. → { [key]: { motivos:[{tipo:'agente'|'commit', ...}] } } solo con los que tienen señal.
 * commits: { [repo]: [{sha, ts, autor, titulo}] } (rama por defecto). Un repo compartido enciende sus proyectos.
 */
export function actividadProyectos({ projects = [], presencia = [], commits = {}, ahoraMs = Date.now() } = {}) {
  const ahoraS = Math.floor(ahoraMs / 1000), alias = mapaAlias(projects), out = {};
  // Nº de proyecto: el «num» fijo del corpus (#01…#14, PR #198); aquí no se numera nada, solo se reenvía.
  const num = new Map(projects.map((p) => [p.key, Number.isInteger(p.num) ? p.num : null]));
  const marca = (k, m) => { (out[k] || (out[k] = { num: num.get(k) ?? null, motivos: [] })).motivos.push(m); };
  const vistos = new Set();
  for (const e of presencia || []) {
    const motivo = motivoPresencia(e, ahoraS);
    if (!motivo) continue;
    for (const k of clavesDe(e.project, alias)) {
      const id = k + "|" + e.persona + "|" + (e.machine || "") + "|" + (e.session_id || "");
      if (vistos.has(id)) continue;
      vistos.add(id);
      marca(k, { tipo: "agente", agente: String(e.persona).slice(0, 40), maquina: String(e.machine || "").slice(0, 40),
        runtime: String(e.runtime || "").slice(0, 30), motivo });
    }
  }
  for (const p of projects) {
    const cs = commits[p.repo] || [];
    const c = cs.find((x) => ahoraMs - x.ts < VENTANA_COMMIT_S * 1000 && x.ts <= ahoraMs + 120000);
    if (c) marca(p.key, { tipo: "commit", sha: c.sha.slice(0, 7), autor: c.autor, titulo: c.titulo,
      haceS: Math.max(0, Math.round((ahoraMs - c.ts) / 1000)) });
  }
  return out;
}

/**
 * Líneas vivas: Σ por REPO (un repo compartido cuenta una vez, como en el Σ del corpus).
 * deltas: { [repo]: { anadidas, quitadas } | null } (null = no se pudo leer: no se inventa, se omite).
 * → { neto, anadidas, quitadas, porRepo, completos } (completos=false si faltó algún repo).
 */
export function sumarLineasVivas(deltas) {
  let neto = 0, anadidas = 0, quitadas = 0, completos = true;
  const porRepo = {};
  for (const [repo, d] of Object.entries(deltas || {})) {
    if (!d) { completos = false; porRepo[repo] = null; continue; }
    porRepo[repo] = { anadidas: d.anadidas, quitadas: d.quitadas, neto: d.anadidas - d.quitadas, base: d.base || null, head: d.head || null };
    anadidas += d.anadidas; quitadas += d.quitadas; neto += d.anadidas - d.quitadas;
  }
  return { neto, anadidas, quitadas, porRepo, completos };
}
