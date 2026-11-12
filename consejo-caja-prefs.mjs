/* Preferencias y reparto de las cajas de dedicación del consejo.
 * Ancho preferido 280 px (como la de Carlos Silva). Carlos no se desplaza:
 * las demás encogen o se desplazan un poco para no pisarse, sin soltar
 * la flecha de su consejero. */
export const CAJA_ANCHO_PREF = 280;
export const CAJA_ANCHO_MIN = 140;
export const CAJA_ALTO_MIN = 72;
export const CAJA_HUECO = 8;
export const CAJA_BORDE = 6;
export const CAJA_STORAGE_KEY = 'admira-live:consejo-cajas:v1';

export function claveCaja(persona) {
  return String(persona || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function parsePrefs(raw) {
  if (!raw) return {};
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch (e) { return {}; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out = {};
  Object.keys(data).forEach((k) => {
    const v = data[k];
    if (!v || typeof v !== 'object') return;
    const rec = {};
    if (v.closed === true) rec.closed = true;
    if (v.w >= CAJA_ANCHO_MIN && v.w <= 800) rec.w = Math.round(v.w);
    if (v.h >= CAJA_ALTO_MIN && v.h <= 800) rec.h = Math.round(v.h);
    out[k] = rec;
    const ck = claveCaja(k);
    if (ck && !out[ck]) out[ck] = rec;
  });
  return out;
}

export function prefDe(prefs, persona) {
  if (!prefs || !persona) return {};
  return prefs[persona] || prefs[claveCaja(persona)] || {};
}

export function serializarPrefs(prefs) {
  const out = {};
  Object.keys(prefs || {}).forEach((k) => {
    if (k === claveCaja(k) && Object.keys(prefs).some((o) => o !== k && claveCaja(o) === k)) return;
    const v = prefs[k];
    if (!v || typeof v !== 'object') return;
    const rec = {};
    if (v.closed === true) rec.closed = true;
    if (v.w) rec.w = v.w;
    if (v.h) rec.h = v.h;
    if (rec.closed || rec.w || rec.h) out[k] = rec;
  });
  return JSON.stringify(out);
}

export function fusionarPref(prefs, persona, patch) {
  const next = { ...prefs };
  const cur = { ...prefDe(prefs, persona), ...patch };
  if (patch && patch.closed === false) delete cur.closed;
  if (patch && patch.w == null && cur.w && patch.hasOwnProperty && Object.prototype.hasOwnProperty.call(patch, 'w')) delete cur.w;
  next[persona] = cur;
  next[claveCaja(persona)] = cur;
  return next;
}

/** Máximo ancho centrado en xPct que no se sale del escenario. */
export function anchoContraBordes(xPct, stageW, ancho, pad = CAJA_BORDE) {
  const w = Number(stageW) || 0;
  const x = (Number(xPct) / 100) * w;
  if (!(w > 0) || !Number.isFinite(x)) return 0;
  const max = 2 * Math.min(Math.max(0, x - pad), Math.max(0, w - x - pad));
  return Math.max(0, Math.min(Math.floor(ancho), Math.floor(max)));
}

/**
 * items: [{ id, xPct, preferred, fixed }]
 * Devuelve [{ id, xPct, width, shift }] con shift en px (positivo = a la derecha).
 * `fixed` (la caja de Carlos) no se desplaza: shift = 0.
 */
export function repartirAnchos(items, { stageW, pref = CAJA_ANCHO_PREF, min = CAJA_ANCHO_MIN, gap = CAJA_HUECO, pad = CAJA_BORDE } = {}) {
  const wStage = Number(stageW) || 0;
  const rows = (items || []).map((it) => {
    const preferred = Number(it.preferred) > 0 ? Number(it.preferred) : pref;
    const x = (Number(it.xPct) / 100) * wStage;
    const edge = anchoContraBordes(it.xPct, wStage, 10000, pad);
    let width = preferred;
    if (edge > 0) width = Math.min(width, edge);
    if (!it.fixed) width = Math.max(Math.min(min, edge || min), width);
    else if (edge > 0) width = Math.min(preferred, edge);
    return {
      id: it.id,
      xPct: Number(it.xPct),
      x,
      width: Math.floor(width),
      shift: 0,
      fixed: !!it.fixed,
    };
  }).filter((r) => Number.isFinite(r.x)).sort((a, b) => a.x - b.x);

  const leftEdge = (r) => r.x + r.shift - r.width / 2;
  const rightEdge = (r) => r.x + r.shift + r.width / 2;

  function clampShift(r) {
    if (r.fixed) { r.shift = 0; return; }
    const minShift = pad - (r.x - r.width / 2);
    const maxShift = (wStage - pad) - (r.x + r.width / 2);
    /* La flecha (x) debe seguir dentro de la caja. */
    const keepMin = -r.width / 2 + 8;
    const keepMax = r.width / 2 - 8;
    r.shift = Math.max(Math.min(r.shift, maxShift, keepMax), minShift, keepMin);
    if (!Number.isFinite(r.shift)) r.shift = 0;
  }

  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (let i = 0; i < rows.length; i++) clampShift(rows[i]);
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      const overlap = rightEdge(a) + gap - leftEdge(b);
      if (overlap <= 0.5) continue;
      if (!a.fixed && !b.fixed) {
        const push = overlap / 2;
        a.shift -= push;
        b.shift += push;
        clampShift(a); clampShift(b);
      } else if (a.fixed && !b.fixed) {
        b.shift += overlap;
        clampShift(b);
      } else if (!a.fixed && b.fixed) {
        a.shift -= overlap;
        clampShift(a);
      }
      const still = rightEdge(a) + gap - leftEdge(b);
      if (still <= 0.5) { changed = true; continue; }
      const shrinkA = a.fixed ? 0 : 1;
      const shrinkB = b.fixed ? 0 : 1;
      const n = shrinkA + shrinkB;
      if (!n) continue;
      const each = still / n;
      if (shrinkA) {
        const edge = anchoContraBordes(a.xPct, wStage, 10000, pad);
        const floor = Math.min(min, edge || min);
        const nw = Math.max(floor, Math.floor(a.width - each));
        if (nw < a.width) { a.width = nw; changed = true; }
      }
      if (shrinkB) {
        const edge = anchoContraBordes(b.xPct, wStage, 10000, pad);
        const floor = Math.min(min, edge || min);
        const nw = Math.max(floor, Math.floor(b.width - each));
        if (nw < b.width) { b.width = nw; changed = true; }
      }
    }
    if (!changed) break;
  }
  for (let i = 0; i < rows.length; i++) clampShift(rows[i]);
  return rows.map((r) => ({ id: r.id, xPct: r.xPct, width: Math.round(r.width), shift: Math.round(r.shift) }));
}

export function solapan(a, b, holgura = 0) {
  if (!a || !b) return false;
  return a.left < b.right - holgura && a.right > b.left + holgura && a.top < b.bottom - holgura && a.bottom > b.top + holgura;
}


const api = {
  CAJA_ANCHO_PREF, CAJA_ANCHO_MIN, CAJA_ALTO_MIN, CAJA_HUECO, CAJA_BORDE, CAJA_STORAGE_KEY,
  claveCaja, parsePrefs, prefDe, serializarPrefs, fusionarPref,
  anchoContraBordes, repartirAnchos, solapan,
};
export default api;
if (typeof globalThis !== 'undefined') globalThis.ConsejoCajaPrefs = api;
