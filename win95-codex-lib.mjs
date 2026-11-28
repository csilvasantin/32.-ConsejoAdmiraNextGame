/**
 * Espejo Win95 ↔ Codex (Trinity · MacStudio) — Carlos t1419u, 28-11-2026.
 * «Que podamos ver, escribir y leer lo mismo desde win95», igual que el chat de ICQGram con los consejeros.
 *
 * Patrón (el de ICQGram, adaptado a una app de escritorio sin webhook):
 *   LEER     el puente launchd del MacStudio (fleet-control/codex-espejo.py) lee los ficheros de sesión
 *            de Codex (~/.codex/sessions/…/rollout-*.jsonl) y la lista de hilos (~/.codex/state_5.sqlite,
 *            solo lectura). Sin AX, sin foco, sin TCC. Sube una instantánea a POST /api/win95/codex
 *            (token de máquina, el mismo de /api/consumos/pulso) cada pocos segundos si cambia.
 *   VER      Win95 pide GET /api/win95/codex cada 5 s (cookie de la puerta o sesión de Google).
 *   ESCRIBIR Win95 → POST /api/win95/codex {accion:"enviar"} (solo sesión humana: puerta «persona» o
 *            Google; el kiosco es solo lectura). Queda en la bandeja de salida de KV. El puente la recoge
 *            y la entrega con el comando oficial `codex queue --thread <id> --message …`; la app la manda
 *            al hilo en cuanto el turno en curso acaba. El acuse vuelve con estado entregado/error.
 * Texto saneado aquí (tokens, IPs, correos, claves) antes de guardar y antes de servir.
 */
export const CODEX_URL = "/api/win95/codex";
export const CLAVE_SNAP = "win95:codex:v1:snap";
export const CLAVE_SALIDA = "win95:codex:v1:salida";
export const MAX_HILOS = 6;
export const MAX_TURNOS = 60;
export const MAX_TEXTO_TURNO = 6000;
export const MAX_TEXTO_ENVIO = 2000;
export const MAX_SALIDA = 40;
export const MAX_PENDIENTES = 8;
export const FRESCO_MS = 90 * 1000;
export const ROLES = new Set(["carlos", "codex", "nota", "latido", "win95"]);
const ESTADOS_SALIDA = new Set(["pendiente", "entregado", "error"]);

const RX_SECRETOS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:sk|pk|rk)-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /((?:token|secret|password|passwd|api[_-]?key|llave|clave|x-council-token)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /ssh-(?:ed25519|rsa) [A-Za-z0-9+/=]{20,}/g,
  /\b[A-Fa-f0-9]{40,}\b/g,
];

/** Quita secretos y datos internos. Conserva el resto del texto tal cual. */
export function sanear(s, max = MAX_TEXTO_TURNO) {
  let t = String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  for (const rx of RX_SECRETOS) {
    t = t.replace(rx, (m, pre) => (typeof pre === "string" && pre && m.startsWith(pre) ? pre + "«oculto»" : "«oculto»"));
  }
  if (t.length > max) t = t.slice(0, max - 1) + "…";
  return t;
}

export function contieneSecreto(s) {
  const t = String(s || "");
  return sanear(t, t.length + 10) !== t.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

const idOk = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));
export const idHiloValido = idOk;
const corto = (s, n) => { const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const ms = (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) return n < 1e12 ? Math.round(n * 1000) : Math.round(n); const p = Date.parse(v); return Number.isFinite(p) ? p : 0; };

/** Instantánea que sube el puente → forma canónica, saneada y acotada. */
export function normalizarSnap(body, ahora = Date.now()) {
  if (!body || typeof body !== "object") return { error: "cuerpo vacío" };
  const hilosIn = Array.isArray(body.hilos) ? body.hilos : null;
  if (!hilosIn) return { error: "faltan hilos" };
  const hilos = [];
  for (const h of hilosIn.slice(0, MAX_HILOS)) {
    if (!h || !idOk(h.id)) continue;
    const turnos = [];
    for (const t of (Array.isArray(h.turnos) ? h.turnos : []).slice(-MAX_TURNOS)) {
      if (!t) continue;
      const rol = ROLES.has(t.rol) ? t.rol : "nota";
      const texto = sanear(t.texto);
      if (!texto.trim()) continue;
      turnos.push({ id: corto(t.id || "", 80), ts: ms(t.ts) || 0, rol, fase: corto(t.fase || "", 20), texto });
    }
    hilos.push({
      id: h.id.toLowerCase(),
      titulo: sanear(corto(h.titulo || "Hilo de Codex", 90), 90),
      proyecto: sanear(corto(h.proyecto || "", 60), 60),
      estado: h.estado === "trabajando" ? "trabajando" : "en reposo",
      actualizado: ms(h.actualizado) || 0,
      enCola: Math.max(0, Math.min(99, Number(h.enCola) || 0)),
      turnos,
    });
  }
  return {
    snap: {
      maquina: corto(body.maquina || "MacStudio", 30),
      agente: corto(body.agente || "Trinity", 30),
      app: corto(body.app || "Codex", 30),
      version: corto(body.version || "", 40),
      recibido: ahora,
      generado: ms(body.generado) || ahora,
      hilos,
    },
  };
}

/** Mensaje que Carlos escribe en Win95 → elemento de la bandeja de salida. */
export function normalizarEnvio(body, { autor = "", autorNombre = "Carlos", ahora = Date.now(), hilos = [] } = {}) {
  if (!body || typeof body !== "object") return { error: "cuerpo vacío" };
  const hilo = String(body.hilo || "").toLowerCase();
  if (!idOk(hilo)) return { error: "hilo inválido" };
  if (hilos.length && !hilos.some((h) => h.id === hilo)) return { error: "ese hilo no está en el espejo ahora mismo" };
  const texto = String(body.texto == null ? "" : body.texto).replace(/\r\n?/g, "\n").trim();
  if (!texto) return { error: "texto vacío" };
  if (texto.length > MAX_TEXTO_ENVIO) return { error: `texto demasiado largo (máx. ${MAX_TEXTO_ENVIO})` };
  const msgId = String(body.msg_id || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 64);
  if (msgId.length < 6) return { error: "falta msg_id" };
  return { item: { id: msgId, hilo, texto, autor: corto(autor, 80), autorNombre: corto(autorNombre, 30), ts: ahora, estado: "pendiente", nota: "" } };
}

/** Añade a la bandeja de salida (idempotente por id) y la recorta. */
export function anadirSalida(lista, item) {
  const l = Array.isArray(lista) ? lista.slice() : [];
  const ya = l.find((x) => x && x.id === item.id);
  if (ya) return { lista: l, duplicado: true, item: ya };
  const pend = l.filter((x) => x && x.estado === "pendiente").length;
  if (pend >= MAX_PENDIENTES) return { lista: l, error: "demasiados mensajes pendientes de entregar; espera al acuse" };
  l.push(item);
  return { lista: l.slice(-MAX_SALIDA), duplicado: false, item };
}

/** Acuses del puente: [{id, estado, nota}]. */
export function aplicarAcuses(lista, acuses, ahora = Date.now()) {
  const l = Array.isArray(lista) ? lista.map((x) => ({ ...x })) : [];
  let n = 0;
  for (const a of Array.isArray(acuses) ? acuses : []) {
    if (!a || !ESTADOS_SALIDA.has(a.estado) || a.estado === "pendiente") continue;
    const it = l.find((x) => x.id === String(a.id || ""));
    if (!it || it.estado !== "pendiente") continue;
    it.estado = a.estado;
    it.nota = sanear(corto(a.nota || "", 200), 200);
    it.entregado = ahora;
    n += 1;
  }
  return { lista: l, aplicados: n };
}

/** Lo que Win95 recibe (sin el correo del autor). */
export function vistaPublica(snap, salida, { ahora = Date.now(), puedeEscribir = false, lector = "" } = {}) {
  const s = snap && Array.isArray(snap.hilos) ? snap : null;
  const fresco = !!(s && ahora - (s.recibido || 0) < FRESCO_MS);
  return {
    ok: true,
    hay: !!s,
    fresco,
    haceS: s ? Math.max(0, Math.round((ahora - (s.recibido || 0)) / 1000)) : null,
    maquina: s ? s.maquina : "MacStudio",
    agente: s ? s.agente : "Trinity",
    app: s ? s.app : "Codex",
    puente: s ? s.version : "",
    hilos: s ? s.hilos : [],
    salida: (Array.isArray(salida) ? salida : []).slice(-20).map((x) => ({ id: x.id, hilo: x.hilo, texto: x.texto, autorNombre: x.autorNombre || "Carlos", ts: x.ts, estado: x.estado, nota: x.nota || "", entregado: x.entregado || null })),
    puedeEscribir: !!puedeEscribir,
    lector,
    aviso: !s ? "El puente del MacStudio aún no ha enviado la sesión de Codex." : (!fresco ? "El puente del MacStudio no responde desde hace " + Math.round((ahora - (s.recibido || 0)) / 60000) + " min." : ""),
  };
}

/** Texto que llega a Codex: cabecera ICQGram para que Trinity sepa de dónde viene. */
export function textoParaCodex(item, horaMadrid) {
  return `[WIN95 · ICQGRAM → CODEX · ${String(item.autorNombre || "Carlos").toUpperCase()} · ${horaMadrid}]\n${item.texto}`;
}
