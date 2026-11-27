/**
 * win95-deepagents-cli-lib.mjs — registro de comunicaciones Consejo ↔ DeepAgents y panel
 * «CLI DeepAgents» de admira.live/windows95 (Carlos t1457u, 27-11-2026 10:58 Madrid):
 * «quiero ver todas las comunicaciones con los DeepAgents registradas en win95 de admira.live
 *  y cuando estén trabajando los deepagents por instrucciones de los consejeros debajo con el
 *  cli viendo qué hacen».
 *
 * Fuentes reales (solo lectura): bandeja pública de bot.yokup.com por DeepAgent (encargos en
 * cualquier estado), mensajes consejero_mensaje con de_tipo/para_tipo «agente» y latidos de
 * bot.yokup.com/api/presence. Nunca se fabrican líneas de terminal: si el agente no emite
 * stdout en vivo, streamEnVivo=false y una nota honesta. Texto saneado: sin tokens, claves,
 * contraseñas, IPs, MACs ni correos (sanear de win95-misiones-lib.mjs).
 */
import { sanear } from "./win95-misiones-lib.mjs";
import { fechaMadrid, horaMadrid } from "./win95-comunicaciones-lib.mjs";

export const DA_COM_URL = "/api/win95/deepagents-comunicaciones";
export const DA_CLI_CADA_SEG = 15;
export const MAX_COMUNICACIONES = 240;
export const MAX_POR_AGENTE = 40;
export const MAX_TEXTO_DA = 4000;
export const LATIDO_VIVO_MS = 15 * 60 * 1000;
export const NOTA_STREAM = "Sin stream de terminal en vivo todavía; mostrando eventos reales del encargo y latido";

/** DeepAgents de la flota. Los cuatro primeros ya tienen subcarpeta fija en «Misiones». */
export const DEEPAGENTS_COM = [
  { persona: "Neo", nombre: "Neo", id: "neo" },
  { persona: "Trinity", nombre: "Trinity", id: "trinity" },
  { persona: "Morfeo", nombre: "Morfeo", id: "morfeo" },
  { persona: "Oraculo", nombre: "Oráculo", id: "oraculo" },
  { persona: "Smith", nombre: "Smith", id: "smith" },
  { persona: "Merovingio", nombre: "Merovingio", id: "merovingio" },
  { persona: "Niobe", nombre: "Niobe", id: "niobe" },
  { persona: "Cypher", nombre: "Cypher", id: "cypher" },
  { persona: "Arquitecto", nombre: "Arquitecto", id: "arquitecto" },
  { persona: "Switch", nombre: "Switch", id: "switch" },
  { persona: "Link", nombre: "Link", id: "link" },
  { persona: "Persefone", nombre: "Perséfone", id: "persefone" },
  { persona: "Seraph", nombre: "Seraph", id: "seraph" },
];
export const ESTADOS_ES = {
  pending: "pendiente", ack: "acusado", in_progress: "en curso", blocked: "bloqueado",
  done: "hecho", cancelled: "anulado", failed: "fallido",
};
export const TRABAJANDO = new Set(["ack", "in_progress"]);

const plain = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** «Oraculo», «oráculo», «OraculoAdmiraNeXT03» → ficha del DeepAgent (o null). */
export function agenteDe(s) {
  const k = plain(s);
  if (!k) return null;
  for (const a of DEEPAGENTS_COM) {
    const p = plain(a.persona);
    if (k === p || k.startsWith(p)) return a;
  }
  return null;
}

export function asMs(v) {
  if (v == null || v === "" || v === "None" || v === "null") return 0;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v).trim())) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  }
  const p = Date.parse(v);
  return Number.isFinite(p) ? p : 0;
}

/** «status-web · Jensen Huang (por orden de Carlos Silva,» → «Jensen Huang»; «JobsGrokBot» → «Jobs». */
export function consejeroDe(from) {
  let s = sanear(String(from || "")).replace(/^\s*[\w-]+\s*·\s*/, "");
  s = s.replace(/\(.*$/, "").replace(/GrokBot\b/gi, "").replace(/\s+/g, " ").trim();
  if (!s) return "Consejo de Silicio";
  return s.slice(0, 60);
}

/** Máquina legible, sin IPs ni direcciones. */
export function maquinaDe(v) {
  const s = String(v || "").trim();
  if (!s || /\d{1,3}(\.\d{1,3}){3}/.test(s) || /:/.test(s) || /@/.test(s)) return "";
  return s.replace(/[^\w.\-áéíóúñ ]/gi, "").trim().slice(0, 40);
}

function recorta(t, max) {
  const s = String(t || "").replace(/\u0000/g, "").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function fechaHora(ms) {
  return ms ? fechaMadrid(ms) + " " + horaMadrid(ms) : "";
}

/** Encargo de la bandeja pública → comunicación (con su línea de eventos reales). */
export function desdeEncargoDA(raw, personaBandeja) {
  if (!raw || typeof raw !== "object") return null;
  const n = Number(raw.id || raw.encargo);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ag = agenteDe(raw.target_persona || personaBandeja);
  if (!ag) return null;
  const estado = String(raw.status || raw.estado || "pending").toLowerCase().replace(/-/g, "_");
  const est = ESTADOS_ES[estado] ? estado : "pending";
  const cuandoMs = asMs(raw.ts || raw.cuando);
  const acuseMs = asMs(raw.ack_at || raw.acuse);
  const cierreMs = asMs(raw.done_at || raw.cierre);
  const de = consejeroDe(raw.from_name || raw.de);
  const maquina = maquinaDe(raw.target_machine || raw.maquina);
  const proyecto = sanear(String(raw.project_id || raw.proyecto_id || "")).replace(/[^\w.\-]/g, "").slice(0, 40);
  const texto = recorta(sanear(String(raw.text || raw.texto || "")), MAX_TEXTO_DA);
  const respuesta = recorta(sanear(String(raw.respuesta || raw.reply || "")), 1200);
  const etiqueta = String(raw.etiqueta || ("#" + n)).replace(/[^#\w.]/g, "").slice(0, 24);
  const eventos = [];
  if (cuandoMs) eventos.push({ ms: cuandoMs, tipo: "orden", texto: `${de} → ${ag.nombre}: orden ${etiqueta}${maquina ? " en " + maquina : ""}${proyecto ? " · " + proyecto : ""}` });
  if (acuseMs) eventos.push({ ms: acuseMs, tipo: "acuse", texto: `${ag.nombre} acusa recibo de ${etiqueta}` });
  if (cierreMs) eventos.push({ ms: cierreMs, tipo: est === "cancelled" ? "anulado" : "cierre", texto: `${etiqueta} ${est === "cancelled" ? "anulado" : "cerrado"} (${ESTADOS_ES[est]})` });
  if (respuesta) eventos.push({ ms: cierreMs || acuseMs || cuandoMs, tipo: "respuesta", texto: `Respuesta de ${ag.nombre}: ${recorta(respuesta, 300)}` });
  return {
    id: "da-enc-" + n,
    tipo: "encargo",
    encargo: n,
    etiqueta,
    estado: est,
    estadoEs: ESTADOS_ES[est],
    de,
    para: ag.nombre,
    persona: ag.persona,
    agenteId: ag.id,
    proyecto,
    maquina,
    cuandoMs,
    acuseMs,
    cierreMs,
    fecha: fechaHora(cuandoMs),
    texto,
    respuesta,
    eventos,
  };
}

/** Mensaje privado consejero ↔ DeepAgent (consejero_mensaje con tipo «agente»). */
export function desdeMensajeDA(m) {
  if (!m || typeof m !== "object" || m.id == null) return null;
  const agDe = m.de_tipo === "agente" ? agenteDe(m.de) : null;
  const agPara = m.para_tipo === "agente" ? agenteDe(m.para) : null;
  const ag = agPara || agDe;
  if (!ag) return null;
  const ms = asMs(m.hora);
  const texto = recorta(sanear(String(m.texto || "")), MAX_TEXTO_DA);
  if (!ms || !texto) return null;
  const de = agDe ? agDe.nombre : consejeroDe(m.de);
  const para = agPara ? agPara.nombre : consejeroDe(m.para);
  return {
    id: "da-msg-" + String(m.id).replace(/[^\w.-]/g, "").slice(0, 40),
    tipo: "mensaje",
    encargo: 0,
    etiqueta: "",
    estado: m.leido ? "leido" : "sin_leer",
    estadoEs: m.leido ? "leído" : "sin leer",
    de, para,
    persona: ag.persona,
    agenteId: ag.id,
    proyecto: "",
    maquina: "",
    cuandoMs: ms, acuseMs: 0, cierreMs: 0,
    fecha: fechaHora(ms),
    texto,
    respuesta: "",
    eventos: [{ ms, tipo: "mensaje", texto: `${de} → ${para}: ${recorta(texto, 200)}` }],
  };
}

/** Último latido por DeepAgent desde /api/presence (sin foco crudo, sin cuentas). */
export function latidosDe(presence, ahora) {
  const out = {};
  for (const p of Array.isArray(presence) ? presence : []) {
    const ag = agenteDe(p && p.persona);
    if (!ag) continue;
    const ms = asMs(p.updated);
    if (!ms) continue;
    const prev = out[ag.persona];
    if (prev && prev.ms >= ms) continue;
    out[ag.persona] = {
      ms,
      haceS: Math.max(0, Math.round((ahora - ms) / 1000)),
      vivo: ahora - ms < LATIDO_VIVO_MS,
      maquina: maquinaDe(p.machine),
      runtime: sanear(String(p.runtime || "")).slice(0, 24),
      tarea: recorta(sanear(String(p.task || "")).replace(/\s+/g, " "), 160),
      terminalVisible: p.terminal_visible === true || p.terminal_visible === "True",
    };
  }
  return out;
}

export function haceTexto(s) {
  if (s == null) return "sin latido";
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
}

/** Bolita según la regla de Carlos (8-nov): rojo trabajando, verde libre, amarillo sin señal. */
export function bolitaDe(trabajando, latido) {
  if (trabajando) return "rojo";
  if (latido && latido.vivo) return "verde";
  return "amarillo";
}

const ETQ = { orden: "ORDEN ", acuse: "ACUSE ", cierre: "CIERRE", anulado: "ANULA ", respuesta: "RESP  ", mensaje: "MSG   ", latido: "LATIDO", estado: "ESTADO", tarea: "TAREA ", stream: "STREAM" };

/** Líneas de log del panel CLI: solo eventos reales, en orden temporal. */
export function horaCli(ms, ahora) {
  if (!ms) return "--:--";
  return fechaMadrid(ms) === fechaMadrid(ahora) ? horaMadrid(ms) : fechaMadrid(ms).slice(0, 5) + " " + horaMadrid(ms);
}

export function lineasCli(com, latido, ahora) {
  const ev = (com && com.eventos ? com.eventos.slice() : []).sort((a, b) => a.ms - b.ms);
  const lines = ev.map((e) => ({ ms: e.ms, hora: horaCli(e.ms, ahora), tipo: e.tipo, txt: `${ETQ[e.tipo] || "EVENTO"} ${e.texto}` }));
  if (com) lines.push({ ms: ahora, hora: horaMadrid(ahora), tipo: "estado", txt: `${ETQ.estado} ${com.etiqueta || ""} ${com.estadoEs || ""}`.replace(/\s+/g, " ").trim() });
  if (latido) {
    lines.push({ ms: latido.ms, hora: horaCli(latido.ms, ahora), tipo: "latido", txt: `${ETQ.latido} ${latido.maquina || "máquina sin verificar"}${latido.runtime ? " · " + latido.runtime : ""} · ${haceTexto(latido.haceS)}${latido.vivo ? "" : " (sin señal)"}` });
    if (latido.tarea) lines.push({ ms: latido.ms, hora: horaCli(latido.ms, ahora), tipo: "tarea", txt: `${ETQ.tarea} declarada: ${latido.tarea}` });
  } else {
    lines.push({ ms: ahora, hora: horaMadrid(ahora), tipo: "latido", txt: `${ETQ.latido} sin latido en los últimos 15 min` });
  }
  lines.push({ ms: ahora, hora: horaMadrid(ahora), tipo: "stream", txt: `${ETQ.stream} ${NOTA_STREAM}` });
  return lines;
}

export function nombreFicheroCom(c) {
  const d = c.cuandoMs ? fechaMadrid(c.cuandoMs).slice(0, 5) + " " + horaMadrid(c.cuandoMs).replace(":", "h") : "sin fecha";
  const ref = c.encargo ? "#" + c.encargo : "Mensaje";
  return recorta(`${ref} · ${d} · ${c.de} → ${c.para} (${c.estadoEs}).txt`.replace(/[\\/:*?"<>|]/g, "-"), 96);
}

export function textoFicheroCom(c) {
  const L = [];
  L.push(c.tipo === "encargo" ? `Encargo ${c.etiqueta} · ${c.estadoEs}` : `Mensaje privado · ${c.estadoEs}`);
  L.push("".padEnd(60, "="));
  L.push(`De:        ${c.de}`);
  L.push(`Para:      ${c.para}`);
  if (c.proyecto) L.push(`Proyecto:  ${c.proyecto}`);
  if (c.maquina) L.push(`Máquina:   ${c.maquina}`);
  L.push(`Fecha:     ${c.fecha || "sin fecha"} (hora de Madrid)`);
  if (c.acuseMs) L.push(`Acuse:     ${fechaHora(c.acuseMs)}`);
  else if (c.tipo === "encargo") L.push("Acuse:     sin acuse todavía (recepción en sesión real sin verificar)");
  if (c.cierreMs) L.push(`Cierre:    ${fechaHora(c.cierreMs)}`);
  L.push("");
  L.push(c.texto || "(sin texto)");
  if (c.respuesta) { L.push(""); L.push("Respuesta:"); L.push(c.respuesta); }
  L.push("");
  L.push("Eventos registrados:");
  for (const e of (c.eventos || []).slice().sort((a, b) => a.ms - b.ms)) L.push(`  ${e.ms ? fechaHora(e.ms) : "--"}  ${e.texto}`);
  L.push("");
  L.push("Fuente: bandeja de encargos de la flota (solo lectura, sin secretos).");
  return L.join("\n");
}

/**
 * Todo junto: comunicaciones (recientes primero), activos (DeepAgents trabajando por orden de un
 * consejero), enCola (pendientes) y carpetas para «Misiones» con un .txt por comunicación.
 */
export function construirComunicacionesDA({ bandejas = {}, mensajes = [], presence = [], ahora = Date.now(), aviso = "" } = {}) {
  const vistos = new Set();
  const coms = [];
  for (const persona of Object.keys(bandejas || {})) {
    for (const raw of bandejas[persona] || []) {
      const c = desdeEncargoDA(raw, persona);
      if (!c || vistos.has(c.id)) continue;
      vistos.add(c.id); coms.push(c);
    }
  }
  for (const m of Array.isArray(mensajes) ? mensajes : []) {
    const c = desdeMensajeDA(m);
    if (!c || vistos.has(c.id)) continue;
    vistos.add(c.id); coms.push(c);
  }
  coms.sort((a, b) => b.cuandoMs - a.cuandoMs || b.encargo - a.encargo);
  const comunicaciones = coms.slice(0, MAX_COMUNICACIONES).map((c) => ({
    ...c,
    asunto: (c.tipo === "encargo" ? `${c.etiqueta} · ${c.estadoEs} · ` : "Mensaje · ") + recorta(String(c.texto || "").split("\n")[0], 80),
    when: c.cuandoMs ? (fechaMadrid(c.cuandoMs) === fechaMadrid(ahora) ? horaMadrid(c.cuandoMs) : fechaMadrid(c.cuandoMs).slice(0, 5)) : "",
    nombreFichero: nombreFicheroCom(c),
    textoFichero: textoFicheroCom(c),
  }));
  const latidos = latidosDe(presence, ahora);

  const activos = [];
  const enCola = [];
  const agentes = [];
  for (const ag of DEEPAGENTS_COM) {
    const mias = comunicaciones.filter((c) => c.persona === ag.persona);
    const lat = latidos[ag.persona] || null;
    const trabajo = mias.filter((c) => c.tipo === "encargo" && TRABAJANDO.has(c.estado))
      .sort((a, b) => (b.acuseMs || b.cuandoMs) - (a.acuseMs || a.cuandoMs));
    const cola = mias.filter((c) => c.tipo === "encargo" && c.estado === "pending");
    const bolita = bolitaDe(trabajo.length > 0, lat);
    if (mias.length || lat) agentes.push({ persona: ag.persona, nombre: ag.nombre, id: ag.id, bolita, comunicaciones: mias.length, trabajando: trabajo.length, enCola: cola.length, latido: lat });
    const ficha = (c, trabajando) => ({
      persona: ag.persona, nombre: ag.nombre, id: ag.id, bolita, trabajando,
      encargo: c.encargo, etiqueta: c.etiqueta, estado: c.estado, estadoEs: c.estadoEs,
      consejero: c.de, maquina: c.maquina || (lat && lat.maquina) || "", proyecto: c.proyecto,
      cabecera: `${c.etiqueta} · ${c.de} → ${ag.nombre} · ${c.maquina || (lat && lat.maquina) || "máquina sin verificar"} · ${c.proyecto || "sin proyecto"}`,
      ultimoLatido: lat ? { maquina: lat.maquina, runtime: lat.runtime, haceS: lat.haceS, vivo: lat.vivo, texto: haceTexto(lat.haceS) } : null,
      streamEnVivo: false,
      notaStream: NOTA_STREAM,
      titulo: recorta(c.texto.split("\n")[0], 140),
      log: lineasCli(c, lat, ahora),
    });
    if (trabajo.length) activos.push(ficha(trabajo[0], true));
    for (const c of cola.slice(0, 3)) enCola.push(ficha(c, false));
  }

  const carpetas = DEEPAGENTS_COM.map((ag) => {
    const mias = comunicaciones.filter((c) => c.persona === ag.persona).slice(0, MAX_POR_AGENTE);
    if (!mias.length) return null;
    return {
      id: "fld-deep-" + ag.id,
      persona: ag.persona,
      nombreSiNueva: `${ag.nombre} - comunicaciones`,
      subId: "fld-dacom-" + ag.id,
      subNombre: `Comunicaciones de ${ag.nombre} (${mias.length})`,
      ficheros: mias.map((c) => ({ id: "doc-dacom-" + c.id, comId: c.id, mtime: c.cuandoMs || ahora, estado: c.estado })),
    };
  }).filter(Boolean);

  return {
    ok: true,
    generado: ahora,
    generado_madrid: fechaHora(ahora),
    aviso,
    total: comunicaciones.length,
    comunicaciones,
    activos,
    enCola,
    agentes,
    carpetas,
    streamEnVivo: false,
    notaStream: NOTA_STREAM,
  };
}

export function contieneSecretoDA(s) {
  return /192\.168\.|\b10\.\d+\.\d+\.\d+|\b100\.\d+\.\d+\.\d+|ssh-ed25519|BEGIN [A-Z ]*PRIVATE|ghp_|github_pat_|Bearer [A-Za-z0-9._-]{8,}|(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/.test(String(s || ""));
}
