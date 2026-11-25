/**
 * «Vuelta al 95» · ajuste desde Admira Director (ainimation.studio) · DeepAgent Neo, 25-nov-2026.
 *
 * La Xperiencia /windows95 lleva su CONFIG dentro del HTML. Este módulo define QUÉ partes de ese
 * CONFIG puede tocar el Director (el esquema), cómo se sanea lo que llega (sanear) y cómo se funde
 * sobre el CONFIG de fábrica (fusionar). Es la única fuente de verdad: la API /api/win95/ajuste lo
 * usa para validar y para contar el esquema al Director; la página sólo funde lo que la API devuelve.
 *
 * Esquema: grupos → campos. Cada campo tiene `ruta` (clave de CONFIG, con puntos), `tipo` y límites.
 * Tipos: text · number · bool · select · image · tags · list (con `item`: campos de cada fila).
 */
export const VERSION = 1;
export const CLAVE_KV = "win95:ajuste";
export const ID = "vuelta-al-95";
export const ORIGENES_DIRECTOR = ["https://www.ainimation.studio", "https://ainimation.studio"];
export const MAX_CUERPO = 64 * 1024;

const t = (es, en) => ({ es, en });

export const ESQUEMA = Object.freeze({
  id: ID,
  version: VERSION,
  titulo: t("Vuelta al 95", "Back to 95"),
  url: "https://www.admira.live/windows95",
  grupos: [
    { id: "general", titulo: t("General", "General"), campos: [
      { ruta: "visitor", tipo: "text", max: 40, etiqueta: t("Nombre de la visita (Léeme)", "Visitor name (Readme)"), ayuda: t("Vacío: saludo genérico. También por URL ?visita=Nombre.", "Empty: generic greeting. Also via URL ?visita=Name.") },
      { ruta: "idleSeconds", tipo: "number", min: 10, max: 900, entero: true, etiqueta: t("Segundos sin tocar hasta volver a la demo", "Idle seconds before the demo returns") },
      { ruta: "wallpaperImage", tipo: "image", etiqueta: t("Fondo de escritorio (imagen)", "Desktop wallpaper (image)"), ayuda: t("Archivo de la carpeta windows95 o URL https de Admira. Vacío: el homenaje.", "File in the windows95 folder or an https Admira URL. Empty: the tribute art.") },
      { ruta: "bootImage", tipo: "image", etiqueta: t("Pantalla de carga (imagen)", "Boot screen (image)") },
      { ruta: "futureVideo", tipo: "image", video: true, etiqueta: t("Vídeo de la página de 2026 (Netscape)", "Video on the 2026 page (Netscape)") },
    ] },
    { id: "nombres", titulo: t("Nombres de los programas", "Program names"), campos: [
      { ruta: "names.player", tipo: "text", max: 40, etiqueta: t("Reproductor", "Player") },
      { ruta: "names.browser", tipo: "text", max: 40, etiqueta: t("Navegador", "Browser") },
      { ruta: "names.chat", tipo: "text", max: 40, etiqueta: t("Mensajería", "Messenger") },
      { ruta: "names.p2p", tipo: "text", max: 40, etiqueta: t("P2P", "P2P") },
      { ruta: "names.media", tipo: "text", max: 40, etiqueta: t("Reproductor de medios (canal admira.tv)", "Media player (admira.tv channel)") },
    ] },
    { id: "media", titulo: t("Windows Media Player · canal de admira.tv", "Windows Media Player · admira.tv channel"), campos: [
      { ruta: "mediaPlayer.tags", tipo: "tags", max: 6, etiqueta: t("Hashtags del Stock que emite (sin #)", "Stock hashtags it plays (without #)") },
      { ruta: "mediaPlayer.rotateSeconds", tipo: "number", min: 10, max: 3600, entero: true, etiqueta: t("Segundos por hashtag", "Seconds per hashtag") },
      { ruta: "mediaPlayer.inDemo", tipo: "bool", etiqueta: t("Sale en la demo automática", "Shown in the automatic demo") },
    ] },
    { id: "pistas", titulo: t("Winamp · pistas", "Winamp · tracks"), campos: [
      { ruta: "tracks", tipo: "list", min: 1, max: 12, etiqueta: t("Pistas", "Tracks"), item: [
        { ruta: "artist", tipo: "text", max: 40, etiqueta: t("Artista", "Artist") },
        { ruta: "title", tipo: "text", max: 60, etiqueta: t("Título", "Title") },
        { ruta: "style", tipo: "select", opciones: ["chill", "chip", "house", "trance"], etiqueta: t("Estilo (sintetizado)", "Style (synthesised)") },
        { ruta: "bpm", tipo: "number", min: 60, max: 200, entero: true, etiqueta: t("BPM", "BPM") },
        { ruta: "src", tipo: "image", audio: true, etiqueta: t("Archivo MP3 (opcional)", "MP3 file (optional)") },
      ] },
    ] },
    { id: "icq", titulo: t("ICQGram", "ICQGram"), campos: [
      { ruta: "icqgram.enabled", tipo: "bool", etiqueta: t("Mensajería en línea con los consejeros", "Live messaging with the advisors") },
      { ruta: "icqgram.quick", tipo: "tags", max: 6, maxItem: 60, etiqueta: t("Respuestas rápidas", "Quick replies") },
      { ruta: "contacts", tipo: "list", max: 12, etiqueta: t("Contactos de la demo", "Demo contacts"), item: [
        { ruta: "id", tipo: "text", max: 24, slug: true, etiqueta: t("Id", "Id") },
        { ruta: "name", tipo: "text", max: 40, etiqueta: t("Nombre", "Name") },
        { ruta: "status", tipo: "text", max: 60, etiqueta: t("Estado", "Status") },
        { ruta: "on", tipo: "bool", etiqueta: t("En línea", "Online") },
        { ruta: "auto", tipo: "text", max: 200, etiqueta: t("Respuesta automática", "Auto reply") },
      ] },
    ] },
  ],
});

/** Parámetros de síntesis por estilo: una pista editada en el Director sólo trae artista/título/estilo/bpm. */
export const PLANTILLAS_PISTA = Object.freeze({
  chill: { root: 50, scale: "minor", prog: [0, 5, 3, 4], bars: 32 },
  chip: { root: 52, scale: "minor", prog: [0, 3, 5, 4], bars: 48 },
  house: { root: 45, scale: "dorian", prog: [0, 3, 0, 4], bars: 40 },
  trance: { root: 54, scale: "minor", prog: [0, 5, 2, 6], bars: 48 },
});

export function campos(esquema = ESQUEMA) {
  return esquema.grupos.flatMap((g) => g.campos);
}

export function leerRuta(obj, ruta) {
  return String(ruta).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

export function escribirRuta(obj, ruta, valor) {
  const partes = String(ruta).split(".");
  let o = obj;
  for (const k of partes.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object" || Array.isArray(o[k])) o[k] = {};
    o = o[k];
  }
  o[partes[partes.length - 1]] = valor;
  return obj;
}

function hostAdmira(h) {
  return h === "www.admira.live" || h === "admira.live" || /(^|\.)admira\.(store|tv|studio|live)$/.test(h);
}

/** Imagen/medio: archivo de la carpeta windows95 (sin rutas), ruta absoluta del sitio o https de un host Admira. */
export function medioValido(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(png|jpe?g|gif|webp|mp4|webm|mp3|ogg|wav)$/i.test(s)) return s;
  if (/^\/[A-Za-z0-9._\/-]{1,200}\.(png|jpe?g|gif|webp|mp4|webm|mp3|ogg|wav)$/i.test(s) && !s.includes("..")) return s;
  try {
    const u = new URL(s);
    if (u.protocol === "https:" && hostAdmira(u.hostname) && s.length <= 400) return u.toString();
  } catch {}
  return null;
}

function saneaCampo(c, v, errores, ruta) {
  const mal = (motivo) => { errores.push({ ruta, motivo }); return undefined; };
  switch (c.tipo) {
    case "text": {
      if (v == null) return "";
      if (typeof v !== "string") return mal("texto");
      let s = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
      if (c.slug) s = s.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, c.max || 24);
      if (s.length > (c.max || 200)) return mal("demasiado largo (" + (c.max || 200) + ")");
      return s;
    }
    case "number": {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isFinite(n)) return mal("número");
      const x = c.entero ? Math.round(n) : n;
      if (x < c.min || x > c.max) return mal("fuera de " + c.min + "–" + c.max);
      return x;
    }
    case "bool":
      return v === true || v === "true" || v === 1 || v === "1";
    case "select":
      return c.opciones.includes(v) ? v : mal("opción");
    case "image": {
      const m = medioValido(v);
      return m === null ? mal("archivo o URL https de Admira") : m;
    }
    case "tags": {
      const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : null;
      if (!arr) return mal("lista");
      const lim = c.maxItem || 30;
      const out = [];
      for (const x of arr) {
        const s = String(x == null ? "" : x).trim().replace(/^#/, "");
        if (!s) continue;
        if (s.length > lim) return mal("elemento demasiado largo (" + lim + ")");
        if (!c.maxItem && !/^[\p{L}\p{N}_-]+$/u.test(s)) return mal("hashtag inválido: " + s.slice(0, 20));
        if (!out.includes(s)) out.push(s);
      }
      if (out.length > (c.max || 12)) return mal("máximo " + (c.max || 12));
      return out;
    }
    case "list": {
      if (!Array.isArray(v)) return mal("lista");
      if (v.length > (c.max || 12)) return mal("máximo " + (c.max || 12));
      if (v.length < (c.min || 0)) return mal("mínimo " + c.min);
      const out = [];
      v.forEach((fila, i) => {
        if (!fila || typeof fila !== "object") { errores.push({ ruta: ruta + "." + i, motivo: "fila" }); return; }
        const o = {};
        let ok = true;
        for (const ci of c.item) {
          const antes = errores.length;
          const val = saneaCampo(ci, fila[ci.ruta], errores, ruta + "." + i + "." + ci.ruta);
          if (errores.length > antes) { ok = false; break; }
          if (val !== undefined) o[ci.ruta] = val;
        }
        if (ok) out.push(o);
      });
      return out;
    }
    default:
      return mal("tipo");
  }
}

/**
 * Sanea un ajuste parcial: sólo las rutas del esquema; lo inválido se descarta y se cuenta en errores.
 * Devuelve { ajuste, errores }. Las pistas completan sus parámetros de síntesis.
 */
export function sanear(entrada, esquema = ESQUEMA) {
  const errores = [];
  const ajuste = {};
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return { ajuste, errores: [{ ruta: "", motivo: "objeto" }] };
  for (const c of campos(esquema)) {
    const v = leerRuta(entrada, c.ruta);
    if (v === undefined) continue;
    const val = saneaCampo(c, v, errores, c.ruta);
    if (val !== undefined) escribirRuta(ajuste, c.ruta, val);
  }
  if (Array.isArray(ajuste.tracks)) {
    ajuste.tracks = ajuste.tracks.map((p) => {
      const base = PLANTILLAS_PISTA[p.style] || PLANTILLAS_PISTA.chill;
      const out = { artist: p.artist || "admira.tv", title: p.title || "Sin título", style: p.style || "chill", bpm: p.bpm || 120, ...base };
      if (p.src) out.src = p.src;
      return out;
    });
    if (!ajuste.tracks.length) { delete ajuste.tracks; errores.push({ ruta: "tracks", motivo: "mínimo 1" }); }
  }
  if (Array.isArray(ajuste.contacts)) {
    const vistos = new Set();
    ajuste.contacts = ajuste.contacts.filter((c) => {
      if (!c.id || vistos.has(c.id)) return false;
      vistos.add(c.id);
      if (!c.name) c.name = c.id;
      if (!c.auto) delete c.auto;
      return true;
    });
  }
  return { ajuste, errores };
}

/** Funde un ajuste saneado sobre un CONFIG (lo muta y lo devuelve): objetos por clave, listas enteras. */
export function fusionar(config, ajuste) {
  if (!ajuste || typeof ajuste !== "object") return config;
  for (const [k, v] of Object.entries(ajuste)) {
    if (v && typeof v === "object" && !Array.isArray(v) && config[k] && typeof config[k] === "object" && !Array.isArray(config[k])) fusionar(config[k], v);
    else config[k] = Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? { ...x } : x)) : v;
  }
  return config;
}

/** Valores actuales de CONFIG para las rutas del esquema (lo que el Director enseña como «de fábrica»). */
export function extraer(config, esquema = ESQUEMA) {
  const out = {};
  for (const c of campos(esquema)) {
    const v = leerRuta(config, c.ruta);
    if (v !== undefined) escribirRuta(out, c.ruta, Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? { ...x } : x)) : v);
  }
  return out;
}
