/**
 * win95-bandeja-lib.mjs — Bandeja de entrada de Win95 Xperience.
 *
 * Carlos, 26-11-2026 y 27-11-2026 (t1411u): las 4 carpetas del Correo Admira
 * se llenan con misiones reales de la flota, nunca con mocks.
 * Bandeja de entrada: finalizaciones (done) de los DeepAgents. De = el agente que la cerró; Para = el consejero
 * que la encargó; CC = Carlos Silva siempre. Texto saneado: sin tokens, IPs,
 * MACs, correos ni claves. Fuente viva: bandeja pública de bot.yokup.com
 * (el campo «nota»/«respuesta» se usa solo si viene, y siempre pasa por sanear).
 */
import { fechaMadrid, horaMadrid } from "./win95-comunicaciones-lib.mjs";
import { sanear, titularCorto, normalizarEncargo, ESTADO_ES } from "./win95-misiones-lib.mjs";

export const BANDEJA_URL = "/api/win95/bandeja";
export const BANDEJA_LEIDOS_KEY = "admira-win95-bandeja-leidos";
export const BANDEJA_CADA_SEG = 45;
export const CC_CARLOS = "Carlos Silva";
export const PARA_DEFECTO = "Consejo de Silicio";
export const MAX_CORREOS = 30;
export const MAX_CUERPO = 2000;

export const DEEPAGENTS_BANDEJA = [
  { persona: "Neo", nombre: "Neo", aliases: ["neomacstudio", "neombp16", "neombp"] },
  { persona: "Trinity", nombre: "Trinity", aliases: ["subtrinity", "trinitymbp16"] },
  { persona: "Morfeo", nombre: "Morfeo" },
  { persona: "Oraculo", nombre: "Oráculo", aliases: ["oraculoadmiranext03", "oraculoadmiranext04", "oraculoadmiranext"] },
  { persona: "Smith", nombre: "Smith" },
  { persona: "Niobe", nombre: "Niobe" },
  { persona: "Arquitecto", nombre: "Arquitecto" },
];

const CONSEJEROS_PARA = [
  { re: /\b(steve\s+)?jobs\b|jobsgrokbot/i, nombre: "Steve Jobs" },
  { re: /\b(steve\s+)?wozniak\b|\bwoz\b/i, nombre: "Steve Wozniak" },
  { re: /\b(walt\s+)?disney\b/i, nombre: "Walt Disney" },
  { re: /\b(george\s+)?lucas\b/i, nombre: "George Lucas" },
  { re: /\b(elon\s+)?musk\b/i, nombre: "Elon Musk" },
  { re: /\b(jensen\s+)?huang\b|huanggrokbot/i, nombre: "Jensen Huang" },
  { re: /\b(john\s+)?lasseter\b/i, nombre: "John Lasseter" },
  { re: /\b(mira\s+)?murati\b/i, nombre: "Mira Murati" },
];

const plain = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function nombreDeepAgent(s) {
  const raw = String(s || "");
  if (!raw) return "";
  const k = plain(raw);
  const tokens = raw.split(/[^A-Za-zÁÉÍÓÚáéíóúñÑ0-9]+/)
    .flatMap((part) => [part, ...part.split(/(?=[A-ZÁÉÍÓÚÑ])/)])
    .map(plain)
    .filter((x) => x.length >= 3);
  for (const a of DEEPAGENTS_BANDEJA) {
    const names = [plain(a.persona), plain(a.nombre), ...(a.aliases || []).map(plain)].filter((x) => x.length >= 3);
    if (names.some((n) => k === n || k.startsWith(n) || tokens.includes(n) || tokens.some((tok) => tok.startsWith(n)))) {
      return a.nombre;
    }
  }
  return "";
}

export function paraDesdeRemitente(de) {
  const s = String(de || "");
  for (const c of CONSEJEROS_PARA) {
    if (c.re.test(s)) return c.nombre;
  }
  // «Mira / Trinity» no es un consejero único: no se inventa.
  if (/\bmira\b/i.test(s) && !/\btrinity\b/i.test(s) && !/\bneo\b/i.test(s)) return "Mira Murati";
  return PARA_DEFECTO;
}

function recorta(s, max) {
  const t = String(s || "").replace(/\s+\n/g, "\n").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "") + "…";
}

/** Título corto del asunto: frases reales del encargo, sin inventar. */
export function titularBandeja(texto) {
  const t = sanear(texto);
  if (/uni[oó]n de los dos mundos/i.test(t)) return "Unión de los dos mundos";
  if (/gemelo digital taza/i.test(t)) return "Gemelo Digital Taza";
  if (/admira\s*tv/i.test(t) && /pantalla completa/i.test(t)) return "Player AdmiraTV a pantalla completa";
  if (/voz activada por defecto/i.test(t)) return "Voz activada por defecto en /chat";
  const tit = titularCorto(texto, "done");
  if (!tit) return "";
  return tit.charAt(0).toUpperCase() + tit.slice(1);
}

export function asuntoMision(encargo, texto) {
  const tit = titularBandeja(texto);
  const n = Number(encargo);
  const id = Number.isFinite(n) && n > 0 ? n : encargo;
  return "Misión finalizada · #" + id + (tit ? " " + tit : "");
}

export function fechaBandeja(ms) {
  if (!ms) return "";
  return fechaMadrid(ms) + " " + horaMadrid(ms);
}

export function whenBandeja(ms, ahora) {
  if (!ms) return "";
  const dia = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  if (dia(ms) === dia(ahora || Date.now())) return horaMadrid(ms);
  const f = fechaMadrid(ms);
  return f.slice(0, 5);
}

export function cuerpoMision(raw, n, { deEsRemitente } = {}) {
  const nota = sanear(raw && (raw.respuesta || raw.nota || raw.note || raw.reply) || "").trim();
  if (nota && !deEsRemitente) return recorta(nota, MAX_CUERPO);
  const texto = sanear((n && n.texto) || (raw && (raw.texto || raw.text)) || "").trim();
  if (deEsRemitente && texto) return recorta(texto, MAX_CUERPO);
  if (nota) return recorta(nota, MAX_CUERPO);
  if (texto) return recorta("Misión finalizada.\n\n" + texto, MAX_CUERPO);
  return "Misión finalizada.";
}

export function emailDesdeEncargo(raw, opts = {}) {
  const n = normalizarEncargo(raw);
  if (!n || n.estado !== "done") return null;
  const target = raw.target_persona || raw.persona || opts.bandejaPersona || "";
  const from = raw.from_name || raw.de || n.de || "";
  const agenteTarget = nombreDeepAgent(target);
  const agenteFrom = nombreDeepAgent(from);
  let de = "";
  let para = PARA_DEFECTO;
  let deEsRemitente = false;
  if (agenteTarget) {
    de = agenteTarget;
    para = paraDesdeRemitente(from);
  } else if (agenteFrom) {
    de = agenteFrom;
    deEsRemitente = true;
    const paraTarget = paraDesdeRemitente(target);
    para = paraTarget !== PARA_DEFECTO ? paraTarget : paraDesdeRemitente(from);
  } else {
    return null;
  }
  const ms = n.cierreMs || n.cuandoMs || 0;
  const ahora = opts.ahora || Date.now();
  const cuerpo = cuerpoMision(raw, n, { deEsRemitente });
  if (!cuerpo) return null;
  return {
    id: "mision-" + n.encargo,
    encargo: n.encargo,
    etiqueta: n.etiqueta,
    de,
    para,
    cc: CC_CARLOS,
    asunto: asuntoMision(n.encargo, n.texto),
    fecha: fechaBandeja(ms),
    when: whenBandeja(ms, ahora),
    cuandoMs: ms,
    cuerpo,
  };
}


export const SALIDA_ESTADOS = new Set(["in_progress", "ack", "pending"]);
export const ELIMINADOS_ESTADOS = new Set(["cancelled", "canceled", "failed", "blocked", "error", "expired", "discarded"]);

export function estadoCanonico(s) {
  const e = String(s || "").toLowerCase().replace(/-/g, "_");
  return e === "canceled" ? "cancelled" : e;
}

export function carpetaDeEstado(estado) {
  const e = estadoCanonico(estado);
  if (e === "done") return "entrada";
  if (SALIDA_ESTADOS.has(e)) return "salida";
  if (ELIMINADOS_ESTADOS.has(e)) return "eliminados";
  return "";
}

function camposOrigen(raw) {
  return [raw && raw.creado_por, raw && raw.consejero, raw && raw.solicitante, raw && raw.origen, raw && raw.from_name, raw && raw.de, raw && raw.from]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

/** Consejero u origen fiel; no se inventa un nombre si el campo no encaja. */
export function nombreConsejeroFiel(raw) {
  for (const f of camposOrigen(raw || {})) {
    const p = paraDesdeRemitente(f);
    if (p !== PARA_DEFECTO) return p;
  }
  for (const f of camposOrigen(raw || {})) {
    if (nombreDeepAgent(f)) continue;
    const cleaned = sanear(f).replace(/^status-web\s*[·•\-–]\s*/i, "").trim();
    if (cleaned) return cleaned.slice(0, 80);
  }
  return "";
}

export function asuntoCarpeta(carpeta, encargo, texto, estado) {
  const tit = titularBandeja(texto);
  const n = Number(encargo);
  const id = Number.isFinite(n) && n > 0 ? n : encargo;
  const cola = tit ? " " + tit : "";
  if (carpeta === "entrada") return "Misión finalizada · #" + id + cola;
  if (carpeta === "salida") {
    const es = ESTADO_ES[estadoCanonico(estado)] || estadoCanonico(estado) || "en curso";
    return es.charAt(0).toUpperCase() + es.slice(1) + " · #" + id + cola;
  }
  if (carpeta === "enviados") return "Encargo · #" + id + cola;
  if (carpeta === "eliminados") {
    const es = ESTADO_ES[estadoCanonico(estado)] || "no acabada";
    return "No acabada · #" + id + " · " + es + cola;
  }
  return "#" + id + cola;
}

function recortaCuerpo(s, max) {
  const t = String(s || "").replace(/\s+\n/g, "\n").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "") + "…";
}

export function cuerpoCarpeta(carpeta, raw, n) {
  const texto = sanear((n && n.texto) || (raw && (raw.texto || raw.text)) || "").trim();
  const nota = sanear(raw && (raw.respuesta || raw.nota || raw.note || raw.reply) || "").trim();
  const estado = estadoCanonico((n && n.estado) || (raw && (raw.estado || raw.status)) || "");
  const estadoEs = ESTADO_ES[estado] || estado;
  if (carpeta === "entrada") return cuerpoMision(raw, n);
  if (carpeta === "salida") {
    const bits = ["Estado: " + estadoEs + "."];
    if (texto) bits.push(texto);
    if (nota) bits.push(nota);
    return recortaCuerpo(bits.join("\n\n"), MAX_CUERPO);
  }
  if (carpeta === "enviados") {
    const bits = [];
    if (texto) bits.push(texto);
    else bits.push("Encargo #" + ((n && n.encargo) || "") + " enviado al DeepAgent.");
    if (estado && estado !== "pending") bits.push("Estado actual: " + estadoEs + ".");
    return recortaCuerpo(bits.join("\n\n"), MAX_CUERPO);
  }
  if (carpeta === "eliminados") {
    const bits = ["Estado: " + estadoEs + " (misión no acabada)."];
    if (texto) bits.push(texto);
    if (nota) bits.push(nota);
    return recortaCuerpo(bits.join("\n\n"), MAX_CUERPO);
  }
  return recortaCuerpo(texto || nota, MAX_CUERPO);
}

function rolesDe(raw, opts) {
  const target = (raw && (raw.target_persona || raw.persona)) || (opts && opts.bandejaPersona) || "";
  const from = (raw && (raw.from_name || raw.de)) || "";
  const agenteTarget = nombreDeepAgent(target);
  const agenteFrom = nombreDeepAgent(from);
  const agenteBag = nombreDeepAgent((opts && opts.bandejaPersona) || "");
  const agente = agenteTarget || agenteFrom || agenteBag;
  let consejero = nombreConsejeroFiel(raw);
  if (!consejero) {
    const consTarget = paraDesdeRemitente(target);
    const consFrom = paraDesdeRemitente(from);
    if (!agenteTarget && consTarget !== PARA_DEFECTO) consejero = consTarget;
    else if (consFrom !== PARA_DEFECTO) consejero = consFrom;
    else if (consTarget !== PARA_DEFECTO) consejero = consTarget;
  }
  return { agente, consejero };
}

/** Correo de una carpeta a partir de un encargo real. No inventa remitentes ni cuerpos. */
export function mailDeEncargo(raw, opts = {}) {
  const n = normalizarEncargo(raw);
  if (!n) return null;
  const carpeta = opts.carpeta;
  if (!carpeta) return null;
  const { agente, consejero } = rolesDe(raw, opts);
  if (!agente) return null;
  let de = "";
  let para = PARA_DEFECTO;
  if (carpeta === "enviados") {
    de = consejero || PARA_DEFECTO;
    para = agente;
  } else {
    de = agente;
    para = consejero || PARA_DEFECTO;
  }
  const estado = estadoCanonico(n.estado);
  const ms = (carpeta === "entrada" ? (n.cierreMs || n.cuandoMs) : (n.cuandoMs || n.cierreMs)) || 0;
  const ahora = opts.ahora || Date.now();
  const cuerpo = cuerpoCarpeta(carpeta, raw, n);
  if (!cuerpo) return null;
  const pref = carpeta === "entrada" ? "mision" : (carpeta === "salida" ? "salida" : (carpeta === "enviados" ? "enviado" : "elim"));
  return {
    id: pref + "-" + n.encargo,
    encargo: n.encargo,
    etiqueta: n.etiqueta,
    de,
    para,
    cc: CC_CARLOS,
    asunto: (carpeta === "entrada" ? asuntoMision(n.encargo, n.texto) : asuntoCarpeta(carpeta, n.encargo, n.texto, estado)),
    fecha: fechaBandeja(ms),
    when: whenBandeja(ms, ahora),
    cuandoMs: ms,
    cuerpo,
    estado,
    estadoEs: ESTADO_ES[estado] || estado,
    carpeta,
  };
}

function ordena(emails) {
  return emails.sort((a, b) => (b.cuandoMs || 0) - (a.cuandoMs || 0) || (b.encargo || 0) - (a.encargo || 0));
}

export function construirBandeja({ bandejas, ahora, aviso } = {}) {
  const t = ahora || Date.now();
  const bags = bandejas && typeof bandejas === "object" ? bandejas : {};
  const seen = { entrada: new Set(), salida: new Set(), enviados: new Set(), eliminados: new Set() };
  const carpetas = { entrada: [], salida: [], enviados: [], eliminados: [] };
  for (const [persona, items] of Object.entries(bags)) {
    const lista = Array.isArray(items) ? items : [];
    for (const raw of lista) {
      const n = normalizarEncargo(raw);
      if (!n) continue;
      const estadoCarpeta = carpetaDeEstado(n.estado);
      const opts = { bandejaPersona: persona, ahora: t };
      if (estadoCarpeta === "entrada") {
        const mail = emailDesdeEncargo(raw, opts);
        if (mail && !seen.entrada.has(mail.encargo)) {
          seen.entrada.add(mail.encargo);
          carpetas.entrada.push({ ...mail, estado: "done", estadoEs: ESTADO_ES.done, carpeta: "entrada" });
        }
      } else if (estadoCarpeta === "salida" || estadoCarpeta === "eliminados") {
        const mail = mailDeEncargo(raw, { ...opts, carpeta: estadoCarpeta });
        if (mail && !seen[estadoCarpeta].has(mail.encargo)) {
          seen[estadoCarpeta].add(mail.encargo);
          carpetas[estadoCarpeta].push(mail);
        }
      }
      const enviado = mailDeEncargo(raw, { ...opts, carpeta: "enviados" });
      if (enviado && !seen.enviados.has(enviado.encargo)) {
        seen.enviados.add(enviado.encargo);
        carpetas.enviados.push(enviado);
      }
    }
  }
  for (const k of Object.keys(carpetas)) ordena(carpetas[k]);
  const recorta = (arr) => arr.slice(0, MAX_CORREOS);
  const entrada = recorta(carpetas.entrada);
  const salida = recorta(carpetas.salida);
  const enviados = recorta(carpetas.enviados);
  const eliminados = recorta(carpetas.eliminados);
  return {
    ok: true,
    generado: t,
    generado_madrid: fechaMadrid(t) + " " + horaMadrid(t),
    aviso: aviso ? String(aviso) : "",
    fuente: "admira.live",
    emails: entrada,
    carpetas: {
      entrada,
      salida,
      enviados,
      eliminados,
      conteo: { entrada: entrada.length, salida: salida.length, enviados: enviados.length, eliminados: eliminados.length },
    },
  };
}

export function tooltipBandeja(n) {
  const k = Number(n) || 0;
  if (k <= 0) return "Bandeja de entrada";
  if (k === 1) return "Bandeja de entrada: 1 misión finalizada sin leer";
  return "Bandeja de entrada: " + k + " misiones finalizadas sin leer";
}

export function aplicarLeidos(emails, leidos) {
  const set = new Set(Array.isArray(leidos) ? leidos : []);
  return (emails || []).map((e) => ({ ...e, unread: !set.has(e.id) }));
}

export function contieneSecreto(s) {
  return /192\.168\.|10\.\d+\.|100\.\d+\.\d+\.\d+|ssh-ed25519|BEGIN [A-Z ]*PRIVATE|ghp_|Bearer [A-Za-z0-9._-]{8,}/.test(String(s || ""));
}

/** Instantánea real leída el 26-11-2026 vía MCP Jobs (encargo_estado / encargos_listar). Sin secretos. */
export const HECHAS_26NOV = [
  {
    encargo: 7722,
    etiqueta: "#7722.11.25",
    estado: "done",
    de: "status-web · NeoMacStudio",
    from_name: "status-web · NeoMacStudio",
    target_persona: "JobsGrokBot",
    cuando: "2026-11-25T19:47:00Z",
    done_at: "2026-11-25T19:48:00Z",
    cierre: "2026-11-25T19:48:00Z",
    texto: "Jobs: cierre del encargo de Carlos «unión de los dos mundos» (DeepAgent Neo, Mac Studio, 25-nov-2026).\n\nQué: la Xperiencia «Vuelta al 95» (el Windows 95 de admira.live/windows95) se ajusta desde Admira Director (ainimation.studio/studio.html → ventana Xperiencia). El Director abre el 95 en su ventana, recibe su esquema y pinta el formulario; Aplicar reinicia el 95 con el borrador, Guardar lo persiste en admira.live con la sesión de la persona, Valores de fábrica lo borra. Sólo viaja lo que difiere de fábrica. Seguridad: ventana y no iframe, orígenes cruzados comprobados en ambos lados, el Director no ve credenciales ni toca la API.\n\nURL/PR: ainimation #186, #187 y #188 (publicados en www.ainimation.studio); 32.-ConsejoAdmiraNextGame #488 (desplegado en www.admira.live). Contrato: ainimation/docs/xperiencia-director-v1.md; ayuda ES/EN en /help/#xperiencia.\n\nPruebas: unitarias 7/7 (admira.live) y 5/5 (Director); prueba de punta a punta con el código real en Chromium headless. Destapó y corrigió un fallo (listas sin tocar que viajaban).\n\nEstado: hecho. Pendiente sólo el clic humano de apertura en producción.",
  },
  {
    encargo: 7694,
    etiqueta: "#7694.11.25",
    estado: "done",
    de: "status-web · Elon Musk (Carlos 25-nov)",
    from_name: "status-web · Elon Musk (Carlos 25-nov)",
    target_persona: "Trinity",
    cuando: "2026-11-25T09:14:00Z",
    done_at: "2026-11-25T09:59:00Z",
    cierre: "2026-11-25T09:59:00Z",
    texto: "Titular: Voz activada por defecto en /chat/<consejero>\n\nCarlos aprobó el 25-nov-2026 (t1194u) esta mejora de front, en el repo 32.-ConsejoAdmiraNextGame. Deja la voz activada por defecto en /chat/<consejero> para las 6 sillas con línea directa (jobs, wozniak, disney, lucas, musk, huang), con opción de silenciar voz. Cambios solo detrás de login; nada público.",
    respuesta: "Informe aceptado en Yokup: misión resuelta con todos los pasos hechos y prueba. PR https://github.com/csilvasantin/32.-ConsejoAdmiraNextGame/pull/475 · retorno/7694-voz-default-20261125.",
  },
  {
    encargo: 7658,
    etiqueta: "#7658.11.22",
    estado: "done",
    de: "status-web · Mira / Trinity (por encargo de Carlos)",
    from_name: "status-web · Mira / Trinity (por encargo de Carlos)",
    target_persona: "Morfeo",
    cuando: "2026-11-22T09:19:00Z",
    done_at: "2026-11-22T09:47:00Z",
    cierre: "2026-11-22T09:47:00Z",
    texto: "MISIÓN: Gemelo Digital Taza. Inicio de la misión: 22-nov-2026 10:19 (hora de Madrid).\n\nObjetivo: que https://www.ainimation.studio/taza/ llegue al mismo nivel que el gemelo del teclado Corsair: taza 3D que se puede girar, con el player de Admira entero y legible en su pantalla, y los 3 puntos de interacción simulables.",
    respuesta: "Actualización 22-nov: los 3 puntos de interacción del gemelo de la taza ya siguen la documentación oficial de PixelMug. 1 barra táctil oculta: toque o flechas cambian de función (contenido, reloj, tiempo, temperatura, minijuego, Wi-Fi) y mantener entra o sale de la función. 2 botón inferior: pulsar apaga o enciende la pantalla; mantener 3 s apaga o enciende la taza. 3 base de carga: levantar / posar. Publicado en https://www.ainimation.studio/taza/, comprobado en producción a 1440 y 390 sin errores. PR https://github.com/csilvasantin/admira-tv/pull/240.",
  },
  {
    encargo: 7626,
    etiqueta: "#7626.11.19",
    estado: "done",
    de: "status-web · HuangGrokBot",
    from_name: "status-web · HuangGrokBot",
    target_persona: "Oraculo",
    cuando: "2026-11-19T11:44:00Z",
    done_at: "2026-11-19T11:45:00Z",
    cierre: "2026-11-19T11:45:00Z",
    texto: "Carlos (vía Jensen): si el player de AdmiraTV en este PC no está ya en marcha, déjalo a pantalla completa en la pantalla principal. Si la escena de Vecna ya se reproduce a pantalla completa, basta con confirmarlo. Informa de qué se está reproduciendo.",
    respuesta: "Oráculo: confirmé que AdmiraTV ya estaba reproduciendo la escena de Vecna (vecna-truenos) en el canal de esta pantalla, a pantalla completa en el ultrawide. Verifiqué que el vídeo avanzaba entre dos comprobaciones, sin abrir ventanas ni cambiar el foco.\n\nEstado: hecho.",
  },
];

const AHORA_FALLBACK = Date.parse("2026-11-26T10:35:00Z"); // 11:35 hora de Madrid
export const BANDEJA_FALLBACK = construirBandeja({
  bandejas: { Jobs: HECHAS_26NOV.filter((e) => e.encargo === 7722), Trinity: HECHAS_26NOV.filter((e) => e.encargo === 7694), Morfeo: HECHAS_26NOV.filter((e) => e.encargo === 7658), Oraculo: HECHAS_26NOV.filter((e) => e.encargo === 7626) },
  ahora: AHORA_FALLBACK,
});
