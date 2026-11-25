/**
 * Napster de la Win95 Xperience: catálogo real de canciones de admira.studio
 * (índice público de Stock: https://stock.admira.store/stock/index.json).
 * Sin secretos. La búsqueda ordena hashtag, luego título, luego artista.
 * «#80» y «80» son la misma consulta de hashtag.
 */
export const STOCK_INDEX = "https://stock.admira.store/stock/index.json";
export const MAX_RESULTS = 80;
export const CACHE_MS = 60_000;

const ARTISTA_VACIO = "";
const TAG_MUSICA = new Set([
  "musica", "music", "cancion", "canciones", "song", "songs", "videoclip",
  "suno", "hilomusical", "hilo-musical", "backgroundmusic", "80smusic",
  "90smusic", "musica80", "throwbacksongs", "pop 80s", "shorts-music-80",
  "lovesong",
]);
const TITULO_MUSICA = /\b(songs?|cancion(?:es)?|canción(?:es)?|música|musica|music|videoclip|official\s+video|hd audio|lovesong)\b/i;

let cache = null;

export function vaciarCache() {
  cache = null;
}

export function hostOk(hostname) {
  const h = String(hostname || "");
  return (
    h === "api.admira.store" ||
    h === "admira.store" ||
    h === "stock.admira.store" ||
    h === "admira.tv" ||
    h === "www.admira.tv" ||
    h === "admira.studio" ||
    h === "www.admira.studio" ||
    /\.admira\.(store|tv|studio)$/.test(h)
  );
}

export function urlPublica(u) {
  if (typeof u !== "string" || !u) return "";
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return "";
    if (!hostOk(x.hostname)) return "";
    return x.toString();
  } catch {
    return "";
  }
}

export function norm(s) {
  return String(s || "")
    .trim()
    .replace(/^#+/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function hashtagsDe(item) {
  const out = [];
  const visto = new Set();
  const add = (t) => {
    const n = norm(t);
    if (!n || visto.has(n)) return;
    visto.add(n);
    out.push(n);
  };
  for (const t of Array.isArray(item && item.tags) ? item.tags : []) add(t);
  const texto = `${(item && item.title) || ""} ${(item && item.comment) || ""}`;
  for (const m of texto.matchAll(/#([A-Za-z0-9_áéíóúüñÁÉÍÓÚÜÑ-]+)/g)) add(m[1]);
  return out;
}

function esTagMusica(t) {
  const n = norm(t);
  if (!n) return false;
  if (TAG_MUSICA.has(n)) return true;
  if (n.endsWith("music") || n.endsWith("musica")) return true;
  if (n.includes("cancion") || n.includes("videoclip") || n.includes("hilomusical")) return true;
  return false;
}

function esVideoMusical(item) {
  if (hashtagsDe(item).some(esTagMusica)) return true;
  return TITULO_MUSICA.test(String((item && item.title) || ""));
}

export function urlDe(item) {
  const cruda = item && item.url;
  if (cruda) return urlPublica(cruda);
  const id = String((item && item.id) || "");
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return "";
  const ext = String((item && item.ext) || "").replace(/[^a-z0-9]/gi, "");
  const mime = String((item && item.mime) || "").toLowerCase();
  if (ext && ext !== "bin") {
    return `https://stock.admira.store/stock/${encodeURIComponent(id)}/asset.${ext}`;
  }
  if (mime.startsWith("audio/") || mime.startsWith("video/")) {
    return `https://api.admira.store/stock/asset/${encodeURIComponent(id)}`;
  }
  return "";
}

export function esCancion(item) {
  if (!item || typeof item !== "object") return false;
  const typ = String(item.type || "").toLowerCase();
  if (typ === "locucion" || typ === "link" || typ === "image" || typ === "furni" || typ === "capsula") return false;
  if (!urlDe(item)) return false;
  if (typ === "audio" || typ === "music") return true;
  const mime = String(item.mime || "").toLowerCase();
  if (typ !== "video" && typ !== "locucion" && mime.startsWith("audio/")) return true;
  if (typ === "video") return esVideoMusical(item);
  return false;
}

export function partirTitulo(item) {
  const crudo = String((item && (item.title || item.comment)) || "").trim();
  let titulo = crudo || String((item && item.id) || "");
  let artista = String((item && item.artist) || "").trim();
  if (!artista && titulo.includes(" - ")) {
    const i = titulo.indexOf(" - ");
    const izq = titulo.slice(0, i).trim();
    const der = titulo.slice(i + 3).trim();
    if (izq && der && izq.length <= 60 && !/^(INST|EN|ES)\b/i.test(izq) && !izq.includes("·")) {
      artista = izq;
      titulo = der;
    }
  }
  return { titulo: titulo.slice(0, 200), artista: artista.slice(0, 120) };
}

export function pieza(item) {
  const url = urlDe(item);
  if (!url) return null;
  const { titulo, artista } = partirTitulo(item);
  const typ = String((item && item.type) || "").toLowerCase();
  const mime = String((item && item.mime) || "").toLowerCase();
  const size = Number(item && item.size) > 0 ? Number(item.size) : 0;
  let duracion = Number(item && item.duration) > 0 ? Number(item.duration) : 0;
  if (!duracion && size && (typ === "audio" || typ === "music" || mime.startsWith("audio/"))) {
    duracion = Math.round((size * 8) / 128000);
  }
  return {
    id: String((item && item.id) || "").slice(0, 80),
    titulo,
    artista,
    hashtags: hashtagsDe(item).slice(0, 30),
    duracion,
    url,
    thumb: urlPublica(item && item.thumbnail) || urlPublica(item && item.poster) || "",
    size,
    tipo: typ.slice(0, 40),
  };
}

export function catalogo(items) {
  const out = [];
  const visto = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!esCancion(item)) continue;
    const p = pieza(item);
    if (!p || !p.id || visto.has(p.id)) continue;
    visto.add(p.id);
    out.push(p);
  }
  return out;
}

export function coincideHashtag(hashtags, q) {
  const nq = norm(q);
  if (!nq) return false;
  for (const raw of hashtags || []) {
    const t = norm(raw);
    if (!t) continue;
    if (t === nq || t === nq + "s") return true;
    const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.includes(nq) || tokens.includes(nq + "s")) return true;
    if (t.startsWith(nq) && t.length > nq.length && /[a-z]/.test(t[nq.length])) return true;
    if (t.endsWith(nq) && t.length > nq.length && /[a-z]/.test(t[t.length - nq.length - 1])) return true;
    if (/^\d{2}$/.test(nq) && (tokens.includes("19" + nq) || tokens.includes("19" + nq + "s") || t === "19" + nq || t === "19" + nq + "s")) return true;
  }
  return false;
}

export function coincideTitulo(titulo, q) {
  const nq = norm(q);
  const t = norm(titulo);
  if (!nq || !t) return false;
  if (/^\d{1,4}$/.test(nq)) {
    return new RegExp("(?:^|[^0-9])(?:19)?" + nq + "s?(?:[^0-9]|$)").test(t);
  }
  return t.includes(nq);
}

export function coincideArtista(artista, q) {
  const a = norm(artista);
  const nq = norm(q);
  if (!a || !nq) return false;
  return a.includes(nq);
}

export function consultaDe({ q = "", artista = "", titulo = "" } = {}) {
  const Q = String(q || "").trim();
  const A = String(artista || "").trim();
  const T = String(titulo || "").trim();
  if (Q) return { q: Q, artista: "", titulo: "" };
  if (A && !T) return { q: A, artista: "", titulo: "" };
  if (T && !A) return { q: T, artista: "", titulo: "" };
  return { q: "", artista: A, titulo: T };
}

export function buscar(canciones, consulta = {}) {
  const lista = Array.isArray(canciones) ? canciones : [];
  const total = lista.length;
  const { q, artista, titulo } = consultaDe(consulta);
  if (!q && !artista && !titulo) return { total, results: [] };

  const hash = [];
  const titles = [];
  const artists = [];
  const needle = q || titulo;

  for (const c of lista) {
    if (artista && !coincideArtista(c.artista, artista)) continue;
    if (!needle) {
      artists.push(c);
      continue;
    }
    if (coincideHashtag(c.hashtags, needle)) hash.push(c);
    else if (coincideTitulo(c.titulo, needle)) titles.push(c);
    else if (coincideArtista(c.artista, needle)) artists.push(c);
  }
  return { total, results: [...hash, ...titles, ...artists].slice(0, MAX_RESULTS) };
}

export function publico(c) {
  return {
    id: c.id || "",
    titulo: c.titulo || "",
    artista: c.artista || ARTISTA_VACIO,
    hashtags: Array.isArray(c.hashtags) ? c.hashtags : [],
    duracion: Number(c.duracion) > 0 ? Number(c.duracion) : 0,
    url: c.url || "",
    thumb: c.thumb || "",
    size: Number(c.size) > 0 ? Number(c.size) : 0,
    tipo: String(c.tipo || "").slice(0, 40),
  };
}

export function contarTipos(lista) {
  let canciones = 0, videos = 0;
  for (const p of Array.isArray(lista) ? lista : []) {
    if (esVideoPieza(p)) videos += 1;
    else if (esAudioPieza(p)) canciones += 1;
  }
  return { canciones, videos };
}

export function responder(leido, consulta) {
  const lista = leido && leido.canciones;
  const { total, results } = buscar(lista, consulta);
  const tipos = contarTipos(lista);
  return {
    ok: true,
    total,
    canciones: tipos.canciones,
    videos: tipos.videos,
    results: results.map(publico),
    fuente: "stock.admira.store",
    at: new Date((leido && leido.at) || Date.now()).toISOString(),
  };
}

export async function leerCatalogo(fetchImpl, { ahora = Date.now(), forzar = false } = {}) {
  if (!forzar && cache && cache.canciones && ahora - cache.at < CACHE_MS) {
    return { ok: true, total: cache.total, canciones: cache.canciones, at: cache.at, cached: true };
  }
  const f = fetchImpl || fetch;
  let r;
  try {
    r = await f(STOCK_INDEX, {
      headers: { accept: "application/json", "user-agent": "admira.live-win95" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    const err = new Error("admira.studio no contesta (" + ((e && e.name) || "error") + ")");
    err.code = "upstream";
    throw err;
  }
  if (!r.ok) {
    const err = new Error("admira.studio no contesta (HTTP " + r.status + ")");
    err.code = "upstream";
    throw err;
  }
  let data;
  try {
    data = await r.json();
  } catch {
    const err = new Error("admira.studio no contesta (catálogo irreconocible)");
    err.code = "upstream";
    throw err;
  }
  const items = data && Array.isArray(data.items) ? data.items : null;
  if (!items) {
    const err = new Error("admira.studio no contesta (catálogo irreconocible)");
    err.code = "upstream";
    throw err;
  }
  const canciones = catalogo(items);
  const at = ahora || Date.now();
  cache = { at, total: canciones.length, canciones };
  return { ok: true, total: canciones.length, canciones, at, cached: false };
}

export const TAG_WINAMP = "winamp";
export const TAG_MEDIA = "AdmiraMediaPlayer";

export function esVideoPieza(p) {
  const typ = String((p && (p.tipo || p.type)) || "").toLowerCase();
  const mime = String((p && p.mime) || "").toLowerCase();
  const url = String((p && p.url) || "");
  if (typ === "video") return true;
  if (mime.startsWith("video/")) return true;
  if (/\.(mp4|webm|mkv|mov)(\?|$)/i.test(url)) return true;
  return false;
}

export function esAudioPieza(p) {
  const typ = String((p && (p.tipo || p.type)) || "").toLowerCase();
  const mime = String((p && p.mime) || "").toLowerCase();
  if (typ === "audio" || typ === "music") return true;
  if (typ === "video") return false;
  if (mime.startsWith("audio/")) return true;
  if (mime.startsWith("video/")) return false;
  return !esVideoPieza(p);
}

export function tagDescarga(p) {
  return esVideoPieza(p) ? TAG_MEDIA : TAG_WINAMP;
}

export function extDescarga(p) {
  if (esVideoPieza(p)) {
    const m = String((p && p.url) || "").match(/\.(mp4|webm|mkv|mov)(\?|$)/i);
    return (m && m[1] ? m[1].toLowerCase() : "mp4");
  }
  return "mp3";
}

export function nombreArchivo(p) {
  const artista = String((p && (p.artista || p.artist)) || "").trim();
  const titulo = String((p && (p.titulo || p.title || p.id)) || "archivo").trim() || "archivo";
  const base = (artista ? artista + " - " + titulo : titulo).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return base + "." + extDescarga(p);
}

export function tieneHashtag(tags, nombre) {
  const n = norm(nombre);
  if (!n) return false;
  for (const t of Array.isArray(tags) ? tags : []) {
    if (norm(t) === n) return true;
  }
  return false;
}
