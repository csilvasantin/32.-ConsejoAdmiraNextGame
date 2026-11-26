/**
 * Censo de DeepAgents abiertos en app de escritorio, para el grupo ICQGram de admira.live/win95.
 *
 * Carlos (26-11-2026): «me gustaría saber cuántos están abiertos en desktop app en un momento
 * dado en todos los ordenadores de AdmiraNeXT»; el mismo deepagent puede estar abierto en más
 * de un equipo a la vez. Esto NO controla las apps: solo cuenta instancias y distinctos.
 *
 * Fuentes reales (ninguna se inventa):
 *  1. process_snapshot verificado de bot.yokup.com/api/presence con host «app» (o session_id
 *     desktop:*) y latido fresco. Es la misma regla que highscore-desktop-app.js.
 *  2. Superficies tipo «app» del pulso de cada Mac (fleet/pulso-tokens.py → /api/consumos/pulso,
 *     ya filtradas a < 3 min por superficiesDePulso). La atribución estática del MAPA a veces
 *     llega vacía (p. ej. el MBP16): entonces se completa con el snapshot del mismo equipo y app.
 *
 * No cuenta: ranuras de control_machines (son huecos, no procesos vivos), latidos «heartbeat»
 * sin verificar, Grok Bot.app (es la app de los consejeros, no de un deepagent) ni CLI/tmux.
 * Sin IPs, correos, tokens ni secretos.
 */

export const VENTANA_SNAPSHOT_S = 120;
export const CATALOGO = [
  { persona: "Neo", app: "Claude" },
  { persona: "Morfeo", app: "Claude" },
  { persona: "WhiteRabbit", app: "Claude" },
  { persona: "Trinity", app: "Codex" },
  { persona: "Oráculo", app: "Codex" },
  { persona: "Smith", app: "Grok" },
  { persona: "Merovingio", app: "Grok" },
  { persona: "Niobe", app: "OpenCode" },
  { persona: "Cypher", app: "DeepAgents" },
];
const CONSEJEROS = new Set(["Jobs", "Wozniak", "Lucas", "Disney", "Musk", "Huang", "Murati", "Lasseter", "Ive", "Y"]);
const DEEP_CANON = CATALOGO.map((c) => c.persona).concat(["Link", "Switch", "Mouse", "Arquitecto", "Persefone", "Seraph"]);
const ORDEN_MAQ = ["macstudio", "macmini", "macbookpro16", "macbookpronegro14", "macbookpro14", "macbookairrosa", "macbookairplata", "macbookaircrema", "macbookairluna", "macbookairazul", "macbookair16plata", "macbookairnines", "dgxspark", "pccocina", "grokbotbox"];
const NOMBRES_MAQ = {
  macstudio: "Mac Studio",
  macmini: "Mac Mini",
  macbookpro16: "MBP16",
  macbookpronegro14: "MBP14",
  macbookpro14: "MBP14",
  macbookairrosa: "Air Rosa",
  macbookairplata: "Air Plata",
  macbookaircrema: "Air Crema",
  macbookairluna: "Air Luna",
  macbookairazul: "Air Luna",
  macbookair16plata: "MBA16",
  macbookairnines: "Air Nines",
  dgxspark: "DGX Spark",
  pccocina: "PC-Cocina",
  grokbotbox: "GrokBotBox",
};
const APP_DE = {
  claude: "Claude",
  codex: "Codex",
  chatgpt: "Codex",
  opencode: "OpenCode",
  grok: "Grok",
  grokbotcli: "Grok",
  deepagents: "DeepAgents",
  cursor: "Cursor",
};

const sinTilde = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function claveMaquina(m) {
  return sinTilde(m).replace(/\.local$/, "").replace(/[^a-z0-9]/g, "");
}
export function nombreMaquina(m) {
  if (!m) return "";
  return NOMBRES_MAQ[claveMaquina(m)] || String(m).replace(/\(Carlos\)/i, "").trim();
}
export function appDe(runtime, app) {
  const a = sinTilde(app).replace(/[^a-z0-9]/g, "");
  if (a === "grokbot" || a === "grokbotapp") return null; // app de consejeros, no de DeepAgents
  if (APP_DE[a]) return APP_DE[a];
  const r = sinTilde(runtime).replace(/[^a-z0-9]/g, "");
  if (r === "grokbot" || r === "grokbotapp") return null;
  for (const [k, v] of Object.entries(APP_DE)) if (r === k || r.startsWith(k)) return v;
  if (app && String(app).trim()) return String(app).trim().slice(0, 24);
  if (runtime && String(runtime).trim()) return String(runtime).trim().slice(0, 24);
  return null;
}
/** «NeoMBP14», «Oraculo», «SmithMacMini» → persona canónica del catálogo; consejeros → "". */
export function canonicoDeep(persona) {
  const p = String(persona || "").trim();
  if (!p) return "";
  const base = sinTilde(p).split("·")[0].trim();
  if (/^grok\s*bot\b/.test(base) || /^(tokens\s+)?grok\s*bot/.test(base)) return "";
  for (const c of DEEP_CANON) {
    const k = sinTilde(c);
    if (base === k) return c;
    if (base.startsWith(k) && /^(mbp\d*|macbook.*|macmini|mini|macstudio|studio|grokbot|box|mba.*|air.*|\d+)$/.test(base.slice(k.length))) return c;
  }
  for (const c of CONSEJEROS) if (base === sinTilde(c) || base.endsWith(" " + sinTilde(c))) return "";
  return "";
}

function esApp(e) {
  const host = String((e && e.host) || "").toLowerCase();
  const sid = String((e && e.session_id) || "");
  return host === "app" || /^desktop:/i.test(sid);
}
function edadS(ts, ahoraMs) {
  if (ts == null || ts === "") return null;
  const n = Number(ts);
  const ms = Number.isFinite(n) && n < 1e12 ? n * 1000 : n;
  const t = Number.isFinite(ms) && ms > 0 ? ms : Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((ahoraMs - t) / 1000));
}
export function textoEdad(s) {
  if (s == null || !Number.isFinite(s)) return null;
  if (s < 60) return "hace " + Math.round(s) + " s";
  if (s < 3600) return "hace " + Math.round(s / 60) + " min";
  return "hace " + Math.round(s / 3600) + " h";
}
function modeloDe(x) {
  const m = String((x && (x.modelo || x.model)) || "").trim();
  if (!m || /@/.test(m)) return null;
  return m.slice(0, 48);
}
function claveInstancia(persona, maquina, app) {
  return sinTilde(persona) + "|" + claveMaquina(maquina) + "|" + sinTilde(app);
}

function anotar(map, { persona, maquina, app, modelo, haceS, fuente }) {
  const p = canonicoDeep(persona);
  const a = appDe(null, app) || app;
  if (!p || !maquina || !a) return;
  const k = claveInstancia(p, maquina, a);
  const prev = map.get(k);
  if (!prev || (haceS != null && (prev.haceS == null || haceS < prev.haceS))) {
    map.set(k, { persona: p, maquina: nombreMaquina(maquina), maquinaClave: claveMaquina(maquina), app: a, modelo: modelo || null, haceS: haceS ?? null, fuente });
  }
}

/** Completa un pulso sin agente con el snapshot verificado del mismo equipo y la misma app. */
export function atribuirPulso(superficie, snapshots) {
  if (superficie && superficie.agente && canonicoDeep(superficie.agente)) return canonicoDeep(superficie.agente);
  const app = appDe(superficie && superficie.runtime, superficie && superficie.app);
  const mk = claveMaquina(superficie && superficie.maquina);
  if (!app || !mk) return "";
  const hits = (snapshots || []).filter((s) => s.app === app && s.maquinaClave === mk);
  return hits.length === 1 ? hits[0].persona : "";
}

function snapshotsVivos(presence, ahoraMs) {
  const out = [];
  const lim = VENTANA_SNAPSHOT_S;
  for (const e of presence || []) {
    if (!e || !esApp(e)) continue;
    if (e.source !== "process_snapshot") continue;
    if (!(e.verified === true || e.verified === 1)) continue;
    const hace = edadS(e.declared_updated || e.updated, ahoraMs);
    if (hace == null || hace > lim) continue;
    const persona = canonicoDeep(e.persona);
    const app = appDe(e.runtime, e.app);
    const maquina = e.machine || e.maquina;
    if (!persona || !app || !maquina) continue;
    out.push({ persona, app, maquina, maquinaClave: claveMaquina(maquina), modelo: modeloDe(e), haceS: hace, fuente: "process_snapshot" });
  }
  return out;
}

function agrupar(instancias) {
  const por = new Map();
  for (const x of instancias) {
    const k = x.persona;
    const g = por.get(k) || (por.set(k, { persona: x.persona, app: x.app, modelo: x.modelo || null, maquinas: [], haceS: x.haceS, fuente: x.fuente }), por.get(k));
    if (x.app && !g.app) g.app = x.app;
    if (x.modelo && !g.modelo) g.modelo = x.modelo;
    if (x.haceS != null && (g.haceS == null || x.haceS < g.haceS)) g.haceS = x.haceS;
    if (!g.maquinas.some((m) => m.clave === x.maquinaClave)) g.maquinas.push({ nombre: x.maquina, clave: x.maquinaClave });
  }
  for (const g of por.values()) {
    g.maquinas.sort((a, b) => {
      const ia = ORDEN_MAQ.indexOf(a.clave), ib = ORDEN_MAQ.indexOf(b.clave);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a.nombre).localeCompare(String(b.nombre), "es");
    });
    g.maquinas = g.maquinas.map((m) => m.nombre);
  }
  const ordenCat = new Map(CATALOGO.map((c, i) => [c.persona, i]));
  return [...por.values()].sort((a, b) => {
    const ia = ordenCat.has(a.persona) ? ordenCat.get(a.persona) : 100, ib = ordenCat.has(b.persona) ? ordenCat.get(b.persona) : 100;
    return ia - ib || a.persona.localeCompare(b.persona, "es");
  });
}

/**
 * Censo puro. `{ superficies, presence, ahoraMs, pulsoOk, presenciaOk, pulsoHaceS }`.
 * Si no hay ninguna fuente (no llegó pulso ni presencia): ok=false, sinFuente=true, motivo.
 * Si hay fuente y cero apps abiertas: ok=true, abiertos=0 (NO es «sin dato»).
 */
export function censoDesktop({ superficies = [], presence = [], ahoraMs, pulsoOk = null, presenciaOk = null, pulsoHaceS = null } = {}) {
  const ahora = ahoraMs || Date.now();
  const snaps = snapshotsVivos(presence, ahora);
  const map = new Map();
  for (const s of snaps) anotar(map, s);

  let pulsoApps = 0;
  const pulsoMaq = new Set();
  for (const s of superficies || []) {
    if (!s || s.tipo !== "app") continue;
    const app = appDe(s.runtime, s.app);
    if (!app) continue;
    pulsoApps += 1;
    if (s.maquina) pulsoMaq.add(nombreMaquina(s.maquina));
    const persona = atribuirPulso(s, snaps);
    if (!persona) continue;
    anotar(map, { persona, maquina: s.maquina, app, modelo: modeloDe(s), haceS: pulsoHaceS, fuente: "pulso" });
  }

  const hayPulso = pulsoOk !== false && (pulsoOk === true || (superficies && superficies.length) || pulsoHaceS != null);
  const hayPres = presenciaOk !== false && (presenciaOk === true || Array.isArray(presence));
  const inst = [...map.values()];
  const agentes = agrupar(inst);
  const abiertos = inst.length;
  const distintos = agentes.length;
  const edades = inst.map((x) => x.haceS).filter((n) => n != null);
  const haceS = edades.length ? Math.min(...edades) : pulsoHaceS;
  const snapMaq = [...new Set(snaps.map((s) => s.maquina ? nombreMaquina(s.maquina) : "").filter(Boolean))];
  const fuentesMaq = [...new Set([...pulsoMaq, ...snapMaq])];

  if (!hayPulso && !hayPres) {
    return {
      ok: false, sinFuente: true, motivo: "no ha llegado el pulso de las máquinas ni la presencia de process_snapshot",
      abiertos: 0, distintos: 0, agentes: [], catalogo: CATALOGO, haceS: null, edadTexto: null,
      generado: new Date(ahora).toISOString(), fuentes: { pulso: false, presencia: false, maquinas: [] },
    };
  }

  const trozos = [];
  if (pulsoMaq.size) trozos.push("pulso de " + [...pulsoMaq].join(", "));
  else if (hayPulso) trozos.push("pulso de tokens (sin apps de escritorio frescas)");
  if (snapMaq.length) trozos.push("process_snapshot de " + snapMaq.join(", "));
  else if (hayPres) trozos.push("presencia (sin process_snapshot fresco de apps)");
  const fuente = trozos.join(" · ") || "censo de apps de escritorio";
  const motivoCero = abiertos === 0
    ? ("ninguna app de escritorio de un DeepAgent está abierta ahora" + (fuentesMaq.length ? " en " + fuentesMaq.join(", ") : "") + ". El resto de equipos no ha mandado pulso de apps ni process_snapshot.")
    : null;

  return {
    ok: true,
    sinFuente: false,
    motivo: motivoCero,
    abiertos,
    distintos,
    agentes,
    catalogo: CATALOGO,
    haceS: haceS ?? null,
    edadTexto: textoEdad(haceS),
    generado: new Date(ahora).toISOString(),
    fuente,
    fuentes: { pulso: hayPulso, presencia: hayPres, maquinas: fuentesMaq, pulsoApps, snapshots: snaps.length },
  };
}

/** Cabecera del grupo ICQGram: «(N abiertos · M distintos)» o «(sin dato)» solo si no hay fuente. */
export function etiquetaCenso(c) {
  if (!c || c.sinFuente || c.ok === false) {
    const motivo = (c && c.motivo) || "no ha llegado el censo de apps de escritorio";
    return { txt: "(sin dato)", title: "DeepAgents · sin dato: " + motivo };
  }
  let txt = "(" + c.abiertos + " abiertos · " + c.distintos + " distintos)";
  if (c.edadTexto) txt = txt.replace(/\)$/, " · " + c.edadTexto + ")");
  let title = "DeepAgents en app de escritorio · " + c.abiertos + " instancias · " + c.distintos + " distintos";
  if (c.edadTexto) title += " · " + c.edadTexto;
  if (c.fuente) title += " · " + c.fuente;
  if (c.motivo) title += " · " + c.motivo;
  return { txt, title };
}

/** Línea de un deepagent abierto: «Morfeo · Claude — Mac Mini, Air Rosa». */
export function lineaAgente(a) {
  if (!a || !a.persona) return "";
  const app = a.app || "";
  const modelo = a.modelo ? " " + a.modelo : "";
  const maqs = (a.maquinas || []).join(", ");
  if (app && maqs) return a.persona + " · " + app + (modelo ? " ·" + modelo : "") + " — " + maqs;
  if (app) return a.persona + " · " + app;
  return a.persona;
}
