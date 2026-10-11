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

/**
 * r42 (Carlos 11-10-2026, tras #5681): la ficha sigue a la máquina donde el agente trabaja DE VERDAD, no a la de la conf.
 * Fuentes (las mismas que agentes_vivos): presencia de bot.yokup.com (latido ≤ 15 min; una terminal = host «cli» con
 * session_id de tmux, no «desktop:…») y la bandeja (encargo in_progress con su target_machine).
 * Orden: 1) máquina del encargo in_progress más reciente, si el agente tiene allí terminal o panel · 2) terminal con la
 * declaración (latido con tarea) más reciente · 3) panel que lo enseña en misión · 4) host de la conf · 5) cualquier panel.
 * Si tiene sesiones en varias máquinas, la ficha lleva `otras` (todas) y un aviso. Una terminal que Yokup ve y que
 * ningún publicador manda al panel → aviso («terminal sin panel»).
 */
export const LATIDO_VIVO_S = 900;
export const normMaq = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const NOMBRES_MAQ = { macbookpro16: "MacBook Pro 16", macbookpronegro14: "MacBook Pro 14", macmini: "Mac mini", macbookair16plata: "MacBook Air 16", grokbotbox: "GrokBotBox", grokbot: "GrokBot" };
export const nombreMaq = (m) => NOMBRES_MAQ[normMaq(m)] || String(m || "");
export const personaDe = (titulo) => normMaq(String(titulo || "").split(" · ")[0]);

/** Terminales de un agente según la presencia: [{ maquina (norm), nombre, sesion, tarea, declarado, latido }]. */
export function terminalesDe(presencia, persona, sesion, ahoraS) {
  const vistas = new Map();
  for (const e of Array.isArray(presencia) ? presencia : []) {
    if (!e || normMaq(e.persona) !== persona || String(e.host || "") !== "cli") continue;
    const sid = String(e.session_id || "");
    if (sid.startsWith("desktop:") || (sid && idSesion(sid) !== sesion)) continue;
    const latido = Number(e.updated) || 0;
    if (ahoraS - latido >= LATIDO_VIVO_S) continue;
    const m = normMaq(e.machine);
    if (!m) continue;
    const t = { maquina: m, nombre: nombreMaq(e.machine), sesion: sid || sesion, tarea: limpio(e.task || e.focus || "", 160), declarado: Number(e.declared_updated) || 0, latido };
    const prev = vistas.get(m);
    if (!prev || t.declarado > prev.declarado || (t.declarado === prev.declarado && t.latido > prev.latido)) vistas.set(m, t);
  }
  return [...vistas.values()];
}

/** Encargo in_progress más reciente de un agente con máquina: { numero, maquina (norm) } | null. */
export function encargoEnCurso(encargos, persona) {
  const lista = (encargos && (encargos instanceof Map ? encargos.get(persona) : encargos[persona])) || [];
  const ok = lista.filter((x) => x && String(x.status) === "in_progress" && normMaq(x.target_machine) && normMaq(x.target_persona || persona) === persona)
    .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  return ok.length ? { numero: Number(ok[0].id) || null, maquina: normMaq(ok[0].target_machine) } : null;
}

/** ¿Dónde se pinta la ficha de c? → { maquina (norm), motivo, pubs:[{doc,a,vivo}], terms, encargo } */
export function ubicar(c, docs, ahora, { presencia = null, encargos = null } = {}) {
  const ahoraS = Math.floor(ahora / 1000);
  const persona = personaDe(c.titulo);
  const pubs = docs.filter((d) => d && d.agentes && d.agentes[c.sesion])
    .map((d) => ({ doc: d, a: d.agentes[c.sesion], m: normMaq(d.maquina), vivo: ahora - d.ts < 120000 }));
  const terms = presencia ? terminalesDe(presencia, persona, c.sesion, ahoraS) : [];
  const enc = encargos ? encargoEnCurso(encargos, persona) : null;
  const hay = new Set([...pubs.filter((p) => p.vivo && p.a.agente !== "nosesion").map((p) => p.m), ...terms.map((t) => t.maquina)]);
  let maquina = "", motivo = "";
  if (enc && hay.has(enc.maquina)) { maquina = enc.maquina; motivo = "encargo #" + enc.numero + " en curso"; }
  const conTarea = terms.filter((t) => t.declarado > 0); // un proceso sin tarea declarada no decide (late, pero no dice qué hace)
  if (!maquina && conTarea.length) {
    const t = [...conTarea].sort((x, y) => y.declarado - x.declarado || y.latido - x.latido)[0];
    maquina = t.maquina; motivo = "latido con tarea";
  }
  if (!maquina) {
    const p = pubs.filter((x) => x.vivo && x.a.agente === "vivo").sort((x, y) => y.doc.ts - x.doc.ts)[0];
    if (p) { maquina = p.m; motivo = "en misión en el panel"; }
  }
  if (!maquina && pubs.some((p) => p.m === normMaq(c.host))) { maquina = normMaq(c.host); motivo = "conf"; }
  if (!maquina && pubs.length) { const p = [...pubs].sort((x, y) => (x.a.agente === "nosesion") - (y.a.agente === "nosesion") || y.doc.ts - x.doc.ts)[0]; maquina = p.m; motivo = "único panel"; }
  if (!maquina) { maquina = normMaq(c.host); motivo = "conf"; }
  return { maquina, motivo, pubs, terms, encargo: enc };
}

/** Vista para el visor: una ficha por línea de la conf, en la máquina donde trabaja ese agente (r42). */
export function vista(docs, ahora = Date.now(), opciones = {}) {
  const conDoc = docs.filter(Boolean);
  const conf = conDoc.filter((d) => d.conf).sort((a, b) => b.ts - a.ts)[0];
  let lista = (conf && conf.conf) || CONF_DEFECTO;
  if (opciones.grupo === 6) { // r33: + los 2 de Grok (la lista más reciente que haya publicado algún Mac, o la de serie)
    const g = conDoc.filter((d) => d.grok).sort((a, b) => b.ts - a.ts)[0];
    const extra = ((g && g.grok) || CONF_GROK).filter((x) => !lista.some((c) => c.sesion === x.sesion && c.host === x.host));
    lista = [...lista, ...extra].slice(0, MAX_AGENTES);
  }
  const avisos = [];
  const fichas = lista.map((c) => {
    const u = ubicar(c, conDoc, ahora, opciones);
    const nombre = String(c.titulo || c.sesion).split(" · ")[0];
    // lo que se enseña: el panel de la máquina elegida; si esa no publica, el mejor panel que haya (con aviso)
    const elegido = u.pubs.find((p) => p.m === u.maquina) || [...u.pubs].sort((x, y) => (x.a.agente === "nosesion") - (y.a.agente === "nosesion") || (y.a.agente === "vivo") - (x.a.agente === "vivo") || y.doc.ts - x.doc.ts)[0] || null;
    const d = elegido && elegido.doc, a = elegido && elegido.a;
    const haceS = d ? Math.round((ahora - d.ts) / 1000) : null;
    let estado = "esperando";
    if (a && haceS < 120) estado = "vivo"; else if (a) estado = "congelado";
    const extra = a && a.agente ? { agente: a.agente, etiqueta: ETIQUETAS[a.agente], mision: a.mision, linea: a.linea, viejo: a.viejo, modelo: a.modelo, mac: a.mac, arte: a.arte, desde: a.desde } : {};
    const enseña = d ? normMaq(d.maquina) : u.maquina;
    // todas las máquinas donde tiene sesión (panel o terminal según Yokup)
    const maqs = new Map();
    for (const p of u.pubs) if (p.a.agente !== "nosesion" || p === elegido) maqs.set(p.m, { maquina: p.m, nombre: nombreMaq(p.doc.maquina), panel: true, terminal: false, agente: p.a.agente || "", panelVivo: p.vivo });
    for (const t of u.terms) { const x = maqs.get(t.maquina) || { maquina: t.maquina, nombre: t.nombre, panel: false, agente: "", panelVivo: false }; maqs.set(t.maquina, { ...x, terminal: true, tarea: t.tarea }); }
    const otras = [...maqs.values()].filter((x) => x.maquina !== enseña);
    const avisosF = [];
    for (const x of maqs.values()) if (x.terminal && !(x.panel && x.panelVivo)) avisosF.push(nombre + " tiene terminal en " + x.nombre + " que no publica en el panel");
    if (enseña !== u.maquina) avisosF.unshift(nombre + " trabaja en " + nombreMaq(u.maquina) + " (" + u.motivo + "), pero esa máquina no publica: se enseña " + nombreMaq(enseña));
    const conPanel = otras.filter((x) => x.panel && x.panelVivo); // las que no publican ya llevan su aviso arriba
    if (enseña === u.maquina && conPanel.length) avisosF.push(nombre + " también tiene sesión en " + conPanel.map((x) => x.nombre).join(", "));
    avisos.push(...avisosF.filter((t) => !avisos.includes(t)));
    const base = { ...c, host: d ? d.maquina : (conDoc.find((x) => normMaq(x.maquina) === u.maquina) || {}).maquina || (normMaq(c.host) === u.maquina ? c.host : u.maquina), hostConf: c.host };
    const donde = { maquinaReal: u.maquina, maquinaNombre: nombreMaq(base.host), motivoMaquina: u.motivo, otras, avisos: avisosF, ...(u.encargo ? { encargo: u.encargo.numero } : {}) };
    if (a && a.agente) extra.mac = nombreMaq(base.host); // el Mac de la ficha es donde está la sesión que se enseña, no el de la conf
    return { ...base, estado, maquinaHaceS: haceS, ...donde, ...(a ? { lineas: a.lineas, ancho: a.ancho, alto: a.alto, cmd: a.cmd, sub: a.sub, rotulo: a.rotulo, cambio: a.cambio, ...extra } : {}) };
  });
  return { fichas, avisos, fuenteConf: conf ? conf.maquina : "defecto", ubicacion: opciones.presencia ? "presencia" + (opciones.encargos ? "+encargos" : "") : "solo paneles" };
}

/** #5707 (/interface 2 claude · /interface 2 Neo Trinity): ?a=Neo,Trinity → solo esas fichas (de la lista de 6), en el
 *  orden pedido. El nombre es lo que va antes de « · » en el título; sin tildes ni mayúsculas. Nombres que no estén
 *  en la lista se ignoran: el visor nunca inventa una ficha. */
export function filtrarAgentes(v, nombres) {
  const k = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const pedidos = [...new Set((nombres || []).map(k).filter(Boolean))].slice(0, 2);
  if (!pedidos.length) return v;
  const fichas = pedidos.map((n) => v.fichas.find((f) => k(String(f.titulo || f.sesion).split(" · ")[0]) === n)).filter(Boolean);
  return { ...v, fichas };
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
