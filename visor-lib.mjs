/**
 * visor-lib.mjs — visor de los 4 deepagents de pago (r27 · Carlos 11-10-2026 12:16 · r31 estado único 13:13).
 * «Lo mismo que pasa en el MBP16 (cuadratura) en el Samsung Fold»: cada Mac que aloja sesiones tmux publica
 * cada 3 s la pantalla (capture-pane con colores) de los agentes de ~/.config/admiranext/cuadratura.conf
 * → POST /api/visor/pane (token de máquina). El visor /visor/ la lee con una llave de visor (revocable).
 * Una sola lista: cuadratura.conf (Título|host|sesión|skin). El publicador la manda y el visor la pinta en ese orden.
 */
export const CONF_DEFECTO = [
  { titulo: "Neo · Claude", host: "macbook-pro-16", sesion: "neo", skin: "Homebrew" },
  { titulo: "Morfeo · Claude", host: "macbook-pro-16", sesion: "morfeo", skin: "Red Sands" },
  { titulo: "Trinity · Codex", host: "macbook-pro-16", sesion: "trinity", skin: "Ocean" },
  { titulo: "Oráculo · Codex", host: "macmini", sesion: "oraculo", skin: "Grass" },
];
/** r33 (Carlos 13:30 «/interface 6»): los 2 de Grok, para la rejilla 3x2 (/visor/?g=6). Smith publica desde el MBP16
 *  (visor-grok.conf) y Merovingio desde la caja de GrokBot (box-visor-keep.sh). Misma forma que la conf de la cuadratura. */
export const CONF_GROK = [
  { titulo: "Smith · Grok", host: "macbook-pro-16", sesion: "smith", skin: "Smith" },
  { titulo: "Merovingio · Grok", host: "grokbotbox", sesion: "merovingio", skin: "Merovingio" },
];
export const MAX_LINEAS = 80;
export const MAX_CHARS_LINEA = 1200;
export const MAX_AGENTES = 8;
export const KEY_MAQ = "visor:v1:m:";
export const KEY_INDICE = "visor:v1:_maquinas";
export const KEY_LLAVES = "visor:v1:llaves";
export const KV_CADA_MS = 20000; // KV como respaldo entre colos: como mucho 1 escritura / 20 s / máquina

const limpio = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "").slice(0, n);
export const idMaquina = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 60);
export const idSesion = (s) => String(s || "").trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40);

/** Tapa secretos (también en el servidor, por si un publicador viejo no lo hiciera). */
const PATRONES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(sk-(?:ant-|proj-)?[A-Za-z0-9_\-]{16,})/g,
  /\b(xai-[A-Za-z0-9]{20,})/g,
  /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
  /\b(glpat-[A-Za-z0-9_\-]{16,})/g,
  /\b(xox[abprs]-[A-Za-z0-9-]{10,})/g,
  /\b(AKIA[0-9A-Z]{16})\b/g,
  /\b(AIza[0-9A-Za-z_\-]{30,})/g,
  /\b(\d{8,10}:AA[A-Za-z0-9_\-]{30,})/g,
  /\b(eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,})/g,
];
// r31: enlaces de login (OAuth) nunca al visor; la URL de Claude se parte en varias líneas → se tapa la línea entera
const RX_OAUTH_TROZO = /code_challenge|redirect_uri=|client_id=|response_type=|[?&]state=|%3A%2F|%3A[a-z_]+\+|scope=[a-z%]/i;
const RX_TROZO_LARGO = /^\s*[A-Za-z0-9_\-=%&.+]{40,}\s*$/;
const RX_OAUTH_URL = /https?:\/\/\S*(?:oauth|authorize|\/login|signin|sign-in|device)\S*/gi;
export function tapar(s) {
  let t = String(s == null ? "" : s);
  if (RX_OAUTH_TROZO.test(t) || RX_TROZO_LARGO.test(t.replace(/\u001b\[[0-9;]*m/g, ""))) return "[enlace de login oculto]";
  t = t.replace(RX_OAUTH_URL, "[enlace de login oculto]");
  for (const rx of PATRONES) t = t.replace(rx, "[oculto]");
  t = t.replace(/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+\/=\-]{12,}/gi, "$1 [oculto]");
  t = t.replace(/((?:pass(?:word|wd)?|pwd|contrase(?:ñ|n)a|clave|secret|api[_-]?key|access[_-]?key|token)[A-Za-z_\-]*["']?\s*[:=]\s*["']?)([^\s"'\u001b]{4,})/gi, "$1[oculto]");
  return t;
}

function normalizarConf(c) {
  if (!Array.isArray(c)) return null;
  const out = c.slice(0, MAX_AGENTES).map((x) => ({ titulo: limpio(x && x.titulo, 60), host: idMaquina(x && x.host), sesion: idSesion(x && x.sesion), skin: limpio(x && x.skin, 30) }))
    .filter((x) => x.titulo && x.host && x.sesion);
  return out.length ? out : null;
}

/** Estados del agente (r31): los decide estado-agente.py en el Mac, la MISMA pieza que la cuadrícula (panel-agente.sh). */
export const ESTADOS_AGENTE = ["vivo", "idle", "pendiente", "login", "nosesion"];
export const ETIQUETAS = { vivo: "en misión", idle: "Idle", pendiente: "Pendiente sin trabajar", login: "Login pendiente", nosesion: "Sin sesión" };

/** POST { maquina, ts, completo, conf?, agentes:{ <sesion>: { lineas:[…], ancho, alto, cmd, rotulo:[…], sub, cambio,
 *        estado, mision, modelo, mac, arte:[…], desde } }, vivas:[sesiones] }   (estado… desde r31; sin estado = publicador viejo) */
export function normalizarPane(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { ok: false, error: "cuerpo vacío" };
  const maquina = idMaquina(body.maquina);
  if (!maquina) return { ok: false, error: "falta maquina" };
  const agentes = {};
  const src = body.agentes && typeof body.agentes === "object" ? body.agentes : {};
  for (const [k, a] of Object.entries(src).slice(0, MAX_AGENTES)) {
    const ses = idSesion(k);
    if (!ses || !a || typeof a !== "object") continue;
    const lineas = (Array.isArray(a.lineas) ? a.lineas : []).slice(-MAX_LINEAS).map((l) => tapar(limpio(l, MAX_CHARS_LINEA)));
    agentes[ses] = {
      lineas, ancho: Math.max(20, Math.min(400, Number(a.ancho) || 120)), alto: Math.max(5, Math.min(200, Number(a.alto) || 30)),
      cmd: limpio(a.cmd, 40), sub: tapar(limpio(a.sub, 160)),
      rotulo: (Array.isArray(a.rotulo) ? a.rotulo : []).slice(0, 8).map((l) => limpio(l, 80)),
      cambio: Number.isFinite(Number(a.cambio)) ? Math.min(Number(a.cambio), ahora) : ahora,
    };
    if (ESTADOS_AGENTE.includes(a.estado)) {
      const ag = agentes[ses];
      ag.agente = a.estado;
      ag.mision = tapar(limpio(a.mision, 240));
      ag.linea = tapar(limpio(a.linea, 260)); ag.viejo = tapar(limpio(a.viejo, 120)); // r33b: línea de misión y «abierto desde»
      ag.modelo = limpio(a.modelo, 40); ag.mac = limpio(a.mac, 40);
      ag.arte = (Array.isArray(a.arte) ? a.arte : []).slice(0, 10).map((l) => limpio(l, 120));
      ag.desde = Number.isFinite(Number(a.desde)) ? Math.min(Number(a.desde), ahora) : ahora;
      if (a.estado !== "vivo") ag.lineas = []; // en Idle / Login / Sin sesión el visor no enseña la terminal (ni el enlace de login)
    }
  }
  const vivas = (Array.isArray(body.vivas) ? body.vivas : Object.keys(agentes)).map(idSesion).filter(Boolean).slice(0, 20);
  return { ok: true, pane: { maquina, completo: body.completo !== false, conf: normalizarConf(body.conf), grok: normalizarConf(body.grok), agentes, vivas, ts: ahora } };
}

/** Funde un envío (solo lo que cambió) sobre el último estado de esa máquina. */
export function fundir(prev, pane) {
  const base = pane.completo || !prev ? {} : { ...(prev.agentes || {}) };
  const agentes = { ...base, ...pane.agentes };
  for (const s of Object.keys(agentes)) if (!pane.vivas.includes(s)) delete agentes[s];
  return { maquina: pane.maquina, ts: pane.ts, conf: pane.conf || (prev && prev.conf) || null, grok: pane.grok || (prev && prev.grok) || null, agentes, vivas: pane.vivas, kvTs: (prev && prev.kvTs) || 0 };
}

/** Vista para el visor: una ficha por línea de la conf (la más reciente que haya llegado). */
export function vista(docs, ahora = Date.now(), opciones = {}) {
  const conDoc = docs.filter(Boolean);
  const conf = conDoc.filter((d) => d.conf).sort((a, b) => b.ts - a.ts)[0];
  let lista = (conf && conf.conf) || CONF_DEFECTO;
  if (opciones.grupo === 6) { // r33: + los 2 de Grok (la lista más reciente que haya publicado algún Mac, o la de serie)
    const g = conDoc.filter((d) => d.grok).sort((a, b) => b.ts - a.ts)[0];
    const extra = ((g && g.grok) || CONF_GROK).filter((x) => !lista.some((c) => c.sesion === x.sesion && c.host === x.host));
    lista = [...lista, ...extra].slice(0, MAX_AGENTES);
  }
  const porMaq = Object.fromEntries(conDoc.map((d) => [d.maquina, d]));
  const fichas = lista.map((c) => {
    const d = porMaq[c.host];
    const a = d && d.agentes && d.agentes[c.sesion];
    const haceS = d ? Math.round((ahora - d.ts) / 1000) : null;
    const publicadorVivo = haceS != null && haceS < 120;
    let estado = "esperando";
    if (a && publicadorVivo) estado = "vivo"; else if (a) estado = "congelado";
    const extra = a && a.agente ? { agente: a.agente, etiqueta: ETIQUETAS[a.agente], mision: a.mision, linea: a.linea, viejo: a.viejo, modelo: a.modelo, mac: a.mac, arte: a.arte, desde: a.desde } : {};
    return { ...c, estado, maquinaHaceS: haceS, ...(a ? { lineas: a.lineas, ancho: a.ancho, alto: a.alto, cmd: a.cmd, sub: a.sub, rotulo: a.rotulo, cambio: a.cambio, ...extra } : {}) };
  });
  return { fichas, fuenteConf: conf ? conf.maquina : "defecto" };
}

/** SHA-256 hex (WebCrypto, igual en Workers y en Node ≥ 20). */
export async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function llaveNueva() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function iguales(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
