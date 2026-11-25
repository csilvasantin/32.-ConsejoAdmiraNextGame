/**
 * Inventario de la playlist del Admira Media Player (player virtual-win95).
 * Hashtags de fábrica (sin #, mayúsculas indiferentes en admira.tv):
 * #win95, #genero95 (traducción ya existente), #WindowsMediaPlayer y #AdmiraMediaPlayer.
 */
export const SCREEN = "virtual-win95";
export const TAGS = ["win95", "genero95", "WindowsMediaPlayer", "AdmiraMediaPlayer"];

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
