/**
 * win95-misiones-lib.mjs — subcarpetas de control en Miscelánea (Win95 Xperience).
 *
 * Carlos, 26-11-2026: una subcarpeta por DeepAgent (Neo, Trinity, Morfeo, Oráculo)
 * con la misión principal de hoy, y la carpeta SteveJobs con la dedicación de Jobs.
 * Fuente: bandeja pública de bot.yokup.com (encargos reales). Texto saneado: sin
 * tokens, claves, contraseñas, IPs, MACs, correos ni claves SSH. Nunca se incluye
 * el campo «nota» (puede traer IPs o rutas). El latido de máquina, si no viene
 * en la bandeja, se marca «sin verificar».
 */
import { redactar, fechaMadrid, horaMadrid } from "./win95-comunicaciones-lib.mjs";

export const MISIONES_URL = "/api/win95/misiones";
export const DEEPAGENTS = [
  { id: "neo", persona: "Neo", nombre: "Neo", folderId: "fld-deep-neo", clave: "neo" },
  { id: "trinity", persona: "Trinity", nombre: "Trinity", folderId: "fld-deep-trinity", clave: "trinity" },
  { id: "morfeo", persona: "Morfeo", nombre: "Morfeo", folderId: "fld-deep-morfeo", clave: "morfeo" },
  { id: "oraculo", persona: "Oraculo", nombre: "Oráculo", folderId: "fld-deep-oraculo", clave: "oraculo" },
];
export const STEVEJOBS = {
  id: "jobs",
  persona: "Jobs",
  nombre: "SteveJobs",
  folderId: "fld-stevejobs",
  docId: "doc-mision-stevejobs",
};
export const ABIERTOS = new Set(["pending", "ack", "in_progress", "blocked"]);
export const ESTADO_ES = {
  pending: "pendiente",
  ack: "acusado",
  in_progress: "en curso",
  blocked: "bloqueado",
  done: "hecho",
  cancelled: "anulado",
};

/** Redacción extra: claves SSH y correos, además de IPs/tokens de redactar(). */
export function sanear(texto) {
  let t = redactar(String(texto == null ? "" : texto));
  t = t.replace(/\bssh-(?:ed25519|rsa|dss|ecdsa)(?:-sk)?\s+\S+/gi, "[clave oculta]");
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[correo oculto]");
  return t;
}

function acorta(s, max = 52) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "") + "…";
}

function despuesDeGuion(s) {
  const parts = String(s || "").split(/\s+[—–]\s+/);
  if (parts.length > 1 && parts[parts.length - 1].trim().length >= 12) return parts[parts.length - 1].trim();
  return String(s || "").trim();
}

/**
 * Título corto a partir del texto real del encargo (Titular, comillas, paréntesis
 * de una retoma, o una frase de proyecto reconocible). Nunca inventa datos.
 */
export function titularCorto(texto, estado) {
  const t = sanear(texto);
  if (t && /webhook de Huang/i.test(t) && /#7536/.test(t)) return "Webhook Huang y espejo #7536";
  const tit = t.match(/Titular:\s*([^\n]+)/i);
  if (tit) return acorta(despuesDeGuion(tit[1]));
  const comillas = t.match(/[«“"]([^»”"]{6,70})[»”"]/);
  if (comillas) {
    let s = comillas[1].trim();
    if (/Vuelta al 95/i.test(s) && /parte(?:r| siempre) de main/i.test(t)) s = "Vuelta al 95, partir de main";
    return acorta(s);
  }
  const paren = t.match(/^(?:Retoma|Reenv[ií]o|Seguimiento)[^\n]{0,90}\(([^)]{8,70})\)/i);
  if (paren && !/^bloqueado$/i.test(paren[1].trim())) return acorta(paren[1]);
  if (/\bOjos Remotos\b/i.test(t)) return estado === "blocked" ? "Ojos Remotos (bloqueado)" : "Ojos Remotos";
  if (/Vuelta al 95/i.test(t) && /parte(?:r| siempre) de main/i.test(t)) return "Vuelta al 95, partir de main";
  if (/Vuelta al 95/i.test(t)) return "Vuelta al 95";
  if (/webhook de Huang/i.test(t) && /#7536/.test(t)) return "Webhook Huang y espejo #7536";
  if (/Screen sync/i.test(t)) return "Screen sync AdmiraNeXT01–05";
  if (/\bStreamDeck\b/i.test(t)) return "StreamDeck";
  const first = (t.split(/\n/).map((s) => s.trim()).find((s) => s && !/^(⏰|✅|Alcance|Normas|Evidencia|Fecha límite)/.test(s)) || "");
  return acorta(first) || "misión en curso";
}

export function esHoyMadrid(ms, ahora) {
  if (!ms) return false;
  const dia = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  return dia(ms) === dia(ahora || Date.now());
}

/** Encargo principal de hoy: los de hoy primero; si no, in_progress/ack/pending; si no, blocked; el más reciente. */
export function principalDe(encargos, ahora) {
  const abiertos = (encargos || []).filter((e) => e && ABIERTOS.has(e.estado));
  if (!abiertos.length) return null;
  const hoy = abiertos.filter((e) => esHoyMadrid(e.cuandoMs, ahora));
  const pool = hoy.length ? hoy : abiertos;
  const peso = { in_progress: 3, ack: 2, pending: 1, blocked: 0 };
  return pool.slice().sort((a, b) => (peso[b.estado] || 0) - (peso[a.estado] || 0) || (b.cuandoMs || 0) - (a.cuandoMs || 0) || (b.encargo || 0) - (a.encargo || 0))[0];
}

function maquinaLimpia(v) {
  const s = String(v || "").trim();
  if (!s || /[0-9]{1,3}(\.[0-9]{1,3}){3}/.test(s) || /:/.test(s)) return "";
  return s.replace(/[^\w.\-áéíóúñ ]/gi, "").trim().slice(0, 40);
}

export function normalizarEncargo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.encargo || raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const estado = String(raw.estado || raw.status || "").toLowerCase().replace(/-/g, "_");
  const cuando = raw.cuando || raw.ts || raw.created_at || raw.createdAt || raw.cuando_ms;
  let ms = Date.parse(cuando);
  if (!Number.isFinite(ms) && Number(cuando) > 0) {
    const n = Number(cuando);
    ms = n < 1e12 ? n * 1000 : n;
  }
  return {
    encargo: id,
    etiqueta: String(raw.etiqueta || ("#" + id)).slice(0, 24),
    estado: ESTADO_ES[estado] ? estado : "pending",
    de: sanear(String(raw.de || raw.from_name || "")).slice(0, 80),
    cuandoMs: Number.isFinite(ms) ? ms : 0,
    maquina: maquinaLimpia(raw.maquina || raw.machine || raw.target_machine),
    texto: String(raw.texto || raw.text || raw.title || ""),
  };
}

export function nombreCarpeta(agente, principal) {
  if (!principal) return agente.nombre + " - sin misión abierta";
  const tit = titularCorto(principal.texto, principal.estado);
  return acorta(agente.nombre + " - #" + principal.encargo + (tit ? " " + tit : ""), 80);
}

function resumenCorto(texto) {
  const t = sanear(texto).replace(/\s+/g, " ").trim();
  if (!t) return "sin resumen";
  return t.length > 180 ? t.slice(0, 179).trimEnd() + "…" : t;
}

export function textoMisionDia(agente, principal, ahora) {
  const t = ahora || Date.now();
  const lineas = [
    "MISIÓN DEL DÍA — " + agente.nombre,
    fechaMadrid(t) + " " + horaMadrid(t) + " hora de Madrid",
    "",
  ];
  if (!principal) {
    lineas.push("No hay encargos abiertos en admira.live.", "Último latido: sin verificar.");
  } else {
    lineas.push(
      "Encargo: #" + principal.encargo + (principal.etiqueta && principal.etiqueta !== ("#" + principal.encargo) ? " (" + principal.etiqueta + ")" : ""),
      "Título: " + titularCorto(principal.texto, principal.estado),
      "Estado: " + (ESTADO_ES[principal.estado] || principal.estado),
      "Máquina: " + (principal.maquina || "sin verificar"),
      "Último latido: sin verificar",
      "",
      "Resumen:",
      resumenCorto(principal.texto),
    );
  }
  lineas.push("", "Documento de solo lectura, hidratado desde admira.live. Sin secretos.");
  return lineas.join("\n");
}

export function textoEncargos(agente, encargos, ahora) {
  const t = ahora || Date.now();
  const abiertos = (encargos || []).filter((e) => e && ABIERTOS.has(e.estado));
  const lineas = [
    "ENCARGOS ABIERTOS — " + agente.nombre,
    fechaMadrid(t) + " " + horaMadrid(t) + " hora de Madrid",
    "",
  ];
  if (!abiertos.length) lineas.push("Ningún encargo abierto.");
  else {
    abiertos
      .slice()
      .sort((a, b) => (b.cuandoMs || 0) - (a.cuandoMs || 0) || (b.encargo || 0) - (a.encargo || 0))
      .forEach((e) => {
        lineas.push(
          "• #" + e.encargo + " · " + (ESTADO_ES[e.estado] || e.estado) + " · " + titularCorto(e.texto, e.estado),
          "  Máquina: " + (e.maquina || "sin verificar") + (e.cuandoMs ? " · " + fechaMadrid(e.cuandoMs) + " " + horaMadrid(e.cuandoMs) : ""),
        );
      });
  }
  lineas.push("", "Último latido de cada máquina: sin verificar en este visor.", "Solo lectura. Sin secretos, IPs ni claves.");
  return lineas.join("\n");
}

export function notaSteveJobs(ahora) {
  const t = ahora || Date.now();
  return [
    "MISIÓN DE STEVE JOBS",
    fechaMadrid(t) + " " + horaMadrid(t) + " hora de Madrid",
    "",
    "Steve Jobs está dedicado hoy a:",
    "«Win95 Xperience y control de DeepAgents en admira.live».",
    "",
    "Foco de hoy (26-11-2026):",
    "— Arranque por defecto de la Xperience (distribución de iconos e ICQGram).",
    "— Subcarpetas (crear, abrir y subir un nivel) en Miscelánea y en Misiones.",
    "— Control de los DeepAgents (Neo, Trinity, Morfeo y Oráculo) en la carpeta Misiones del escritorio.",
    "— Frescura de cupos en ICQGram.",
    "",
    "Nota de solo lectura. Sin secretos.",
  ].join("\n");
}

function carpetaAgente(agente, encargos, ahora) {
  const lista = (encargos || []).map(normalizarEncargo).filter(Boolean);
  const principal = principalDe(lista, ahora);
  const mtime = principal && principal.cuandoMs ? principal.cuandoMs : ahora;
  return {
    id: agente.folderId,
    padre: "misiones",
    persona: agente.persona,
    nombre: nombreCarpeta(agente, principal),
    principal: principal ? {
      encargo: principal.encargo,
      estado: principal.estado,
      estado_es: ESTADO_ES[principal.estado],
      titulo: titularCorto(principal.texto, principal.estado),
      maquina: principal.maquina || "",
    } : null,
    ficheros: [
      { id: "doc-mision-" + agente.id, nombre: "Misión del día.txt", texto: textoMisionDia(agente, principal, ahora), mtime },
      { id: "doc-encargos-" + agente.id, nombre: "Encargos abiertos.txt", texto: textoEncargos(agente, lista, ahora), mtime },
    ],
  };
}

function carpetaJobs(ahora) {
  const texto = notaSteveJobs(ahora);
  return {
    id: STEVEJOBS.folderId,
    padre: "miscelanea",
    persona: STEVEJOBS.persona,
    nombre: STEVEJOBS.nombre,
    principal: { encargo: null, estado: "in_progress", estado_es: "en curso", titulo: "Win95 Xperience y control de DeepAgents en admira.live", maquina: "GrokBotBox" },
    ficheros: [
      { id: STEVEJOBS.docId, nombre: "Misión del día.txt", texto, mtime: ahora },
    ],
  };
}

export function construirMisiones({ bandejas, ahora, aviso } = {}) {
  const t = ahora || Date.now();
  const carpetas = DEEPAGENTS.map((a) => carpetaAgente(a, (bandejas && (bandejas[a.persona] || bandejas[a.clave])) || [], t));
  carpetas.push(carpetaJobs(t));
  return {
    ok: true,
    generado: t,
    generado_madrid: fechaMadrid(t) + " " + horaMadrid(t),
    aviso: aviso ? String(aviso) : "",
    fuente: "admira.live",
    carpetas,
  };
}

/** Nombres de carpeta en Miscelánea que corresponden a un consejero (sin espacios). */
export const CARPETAS_CONSEJERO = [
  "SteveJobs", "SteveWozniak", "WaltDisney", "GeorgeLucas",
  "ElonMusk", "JensenHuang", "MiraMurati", "JohnLasseter",
];

export function clavesCarpetaConsejero(c) {
  const name = String((c && c.name) || "");
  const keys = [];
  const parts = name.replace(/[^A-Za-záéíóúñÁÉÍÓÚÑ ]+/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length) {
    keys.push(parts.join(""));
    keys.push(parts.join(" "));
  }
  if (c && c.persona) {
    const p = String(c.persona);
    keys.push(p, p.charAt(0).toUpperCase() + p.slice(1));
  }
  return keys;
}

const plainKey = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function coincideCarpetaConsejero(folderName, c) {
  const base = String(folderName || "").split(/\s+[-–—]\s+/)[0];
  const b = plainKey(base);
  if (!b) return false;
  return clavesCarpetaConsejero(c).some((k) => plainKey(k) === b);
}

/** Misión declarada dentro del .txt (comillas, Título, o «dedicado hoy a»). Vacío si no hay. */
export function misionDeclaradaEnTexto(texto) {
  const t = String(texto || "");
  const q = t.match(/[«“"]([^»”"]{6,120})[»”"]/);
  if (q) return q[1].trim();
  const tit = t.match(/^Título:\s*(.+)$/m);
  if (tit) return tit[1].trim();
  const d = t.match(/dedicado hoy a:\s*\n?\s*[«"]?([^\n»"]+)/i);
  if (d) return d[1].trim();
  return "";
}

/** Versión corta para ICQGram: sin «en admira.live» y «control de DeepAgents» → «control DeepAgents». */
export function misionCompacta(s) {
  return String(s || "")
    .replace(/\s+en admira\.live\s*$/i, "")
    .replace(/\s+de\s+(DeepAgents)/i, " $1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lee la misión de una subcarpeta de Miscelánea. Si no hay declaración (ni en el
 * .txt ni en el sufijo «Nombre - misión»), devuelve null: nunca se inventa.
 */
export function misionDesdeCarpeta(carpeta) {
  if (!carpeta) return null;
  const docs = (carpeta.ficheros || carpeta.docs || []).filter((d) => d);
  const pref = docs.filter((d) => /misi[oó]n del d[ií]a/i.test(d.nombre || d.name || d.label || ""));
  let largo = "";
  for (const d of pref.concat(docs)) {
    largo = misionDeclaradaEnTexto(d.texto || d.text || "");
    if (largo) break;
  }
  if (!largo) {
    const rest = String(carpeta.nombre || carpeta.name || carpeta.label || "").split(/\s+[-–—]\s+/).slice(1).join(" - ").trim();
    largo = rest;
  }
  const corto = misionCompacta(largo);
  if (!corto) return null;
  return { corto, largo, carpeta: carpeta.nombre || carpeta.name || "" };
}

export function misionDeConsejeroEnCarpetas(c, carpetas) {
  const found = (carpetas || []).find((x) => coincideCarpetaConsejero(x.nombre || x.name || x.label, c));
  return found ? misionDesdeCarpeta(found) : null;
}

/** Instantánea real del 26-11-2026 (encargos abiertos leídos en admira.live a las 10:25 hora de Madrid). Sin notas ni secretos. */
export const BANDEJAS_26NOV = {
  Neo: [
    { encargo: 7687, etiqueta: "#7687.11.24", estado: "pending", de: "status-web · Elon (por orden de Carlos)", cuando: "2026-11-24T10:13:00Z", maquina: "macstudio", texto: "Reenvío del #7686. Diagnóstico del envío de contenidos admira.studio a los players vía StreamDeck, con Carlos delante del AdmiraNeXT01." },
    { encargo: 7632, etiqueta: "#7632.11.20", estado: "blocked", de: "status-web · Jobs", cuando: "2026-11-20T10:56:00Z", maquina: "macstudio", texto: "Modo Demo del player en las ultrawide (AdmiraNeXT01, 03 y 05)." },
    { encargo: 7621, etiqueta: "#7621.11.19", estado: "in_progress", de: "status-web · JobsGrokBot", cuando: "2026-11-19T07:30:00Z", maquina: "macstudio", texto: "Retoma de #7612 (Screen sync AdmiraNeXT01–05), sesión nueva. Los cinco PCs están listos; falta que Carlos pulse SINCRO en admiranext.com/demo." },
  ],
  Trinity: [
    { encargo: 7736, etiqueta: "#7736.11.26", estado: "pending", de: "status-web · Jobs", cuando: "2026-11-26T08:00:00Z", maquina: "macbookairrosa", texto: "Titular: Retoma control mañana 26-nov — Reparar el 401 del webhook de Huang y cerrar el espejo #7536" },
    { encargo: 7693, etiqueta: "#7693.11.25", estado: "blocked", de: "status-web · Elon Musk", cuando: "2026-11-25T09:14:00Z", maquina: "macbookpronegro14", texto: "Titular: Prueba viva de los 6 webhooks principales y cruce Elon↔Jobs con acuse" },
    { encargo: 7692, etiqueta: "#7692.11.25", estado: "pending", de: "status-web · Elon Musk", cuando: "2026-11-25T09:13:00Z", maquina: "macbookairrosa", texto: "Titular: Reparar el 401 del webhook de Huang y cerrar el espejo a Grok Bot (#7536)" },
  ],
  Morfeo: [
    { encargo: 7706, etiqueta: "#7706.11.25", estado: "pending", de: "status-web · HuangGrokBot", cuando: "2026-11-25T17:03:00Z", maquina: "win95", texto: "«Vuelta al 95» (admira.live/windows95). Parte siempre de main y no subas tu HTML antiguo." },
    { encargo: 7704, etiqueta: "#7704.11.25", estado: "pending", de: "status-web · HuangGrokBot", cuando: "2026-11-25T13:52:00Z", maquina: "win95", texto: "«Vuelta al 95» ya está publicada. Confirma que has visto la URL." },
    { encargo: 7701, etiqueta: "#7701.11.25", estado: "pending", de: "status-web · Huang", cuando: "2026-11-25T13:05:00Z", maquina: "win95", texto: "Publicar «Vuelta al 95» en admira.live/windows95. Encargo anterior, duplicado." },
    { encargo: 7695, etiqueta: "#7695.11.25", estado: "pending", de: "status-web · Elon Musk", cuando: "2026-11-25T09:14:00Z", maquina: "macmini", texto: "Titular: Demo /sala-voz Jobs↔Elon en las dos pantallas" },
  ],
  Oraculo: [
    { encargo: 7677, etiqueta: "#7677.11.23", estado: "blocked", de: "status-web · HuangGrokBot", cuando: "2026-11-23T08:47:00Z", maquina: "admiranext04", texto: "Seguimiento de Ojos Remotos en AdmiraNeXT04: hace falta acceso de lectura a admira-vault. Los equipos 01, 02, 03 y 05 siguen sin fuente." },
    { encargo: 7676, etiqueta: "#7676.11.23", estado: "blocked", de: "status-web · HuangGrokBot", cuando: "2026-11-23T08:37:00Z", maquina: "admiranext04", texto: "Instala y deja funcionando Ojos Remotos en AdmiraNeXT04. Duplicado de #7677." },
    { encargo: 7624, etiqueta: "#7624.11.19", estado: "blocked", de: "status-web · HuangGrokBot", cuando: "2026-11-19T11:31:00Z", maquina: "admiranext03", texto: "En AdmiraNeXT03, la pantalla de detrás de la pared de ladrillo está en negro." },
    { encargo: 7606, etiqueta: "#7606.11.16", estado: "blocked", de: "status-web · ArquitectoCursorCloud", cuando: "2026-11-16T11:08:00Z", maquina: "admiranext03", texto: "Dejar sshd en marcha en AdmiraNeXT03 y AdmiraNeXT04. Falta acceso elevado." },
    { encargo: 7605, etiqueta: "#7605.11.16", estado: "blocked", de: "status-web · ArquitectoCursorCloud", cuando: "2026-11-16T11:03:00Z", maquina: "admiranext04", texto: "Captura y relanzar el player del show en AdmiraNeXT03 y AdmiraNeXT04. Duplicado." },
  ],
};

const AHORA_FALLBACK = Date.parse("2026-11-26T09:25:00Z"); // 10:25 hora de Madrid
export const MISIONES_FALLBACK = construirMisiones({ bandejas: BANDEJAS_26NOV, ahora: AHORA_FALLBACK });
