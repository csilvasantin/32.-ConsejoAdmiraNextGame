/**
 * Inventario de las playlists del player virtual-win95 (admira.tv).
 * Admira Media Player — hashtags de fábrica (sin #, mayúsculas indiferentes en admira.tv):
 * #win95, #genero95 (traducción ya existente), #WindowsMediaPlayer y #AdmiraMediaPlayer.
 * AdmirAmp (Winamp) — #winamp, por el mismo camino directo.
 */
export const SCREEN = "virtual-win95";
export const TAGS = ["win95", "genero95", "WindowsMediaPlayer", "AdmiraMediaPlayer"];

/**
 * Playlist de AdmirAmp (Winamp): hashtag #winamp del Stock, servido por la
 * misma emisión de virtual-win95 (encargo #7751). Nada de raspar el Stock
 * en el cliente: el player virtual ya la expone como playlist alternativa.
 */
export const TAGS_WINAMP = ["winamp"];

/** Listas que sirve /api/win95/emision: ?lista=media (por defecto) o ?lista=winamp. Lista cerrada: no es un proxy abierto. */
export const LISTAS = { media: TAGS, winamp: TAGS_WINAMP };

/** Hashtags de una lista, o null si la lista no existe (→ 400 en el endpoint). */
export function tagsDeLista(lista) {
  const k = String(lista == null || lista === "" ? "media" : lista).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LISTAS, k) ? LISTAS[k] : null;
}

export function piezaClave(p) {
  if (!p || typeof p !== "object") return "";
  return String(p.id || p.stockId || p.url || "").slice(0, 120);
}

/** Une las piezas de varios hashtags, sin repetir id/url, en el orden de `tags`. */
export function playlistUnica(tags) {
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    const piezas = t && Array.isArray(t.piezas) ? t.piezas : [];
    const tag = t && t.tag ? String(t.tag) : "";
    for (const p of piezas) {
      if (!p || typeof p !== "object") continue;
      const k = piezaClave(p);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ ...p, tag });
    }
  }
  return out;
}
