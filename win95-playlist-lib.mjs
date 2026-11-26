// Overlay local de playlists Win95 (orden, altas y bajas).
// No toca el servidor: la copia de admira.studio sigue ahí.
// Persistencia: localStorage admira-win95-playlists (el page script usa las mismas reglas).

export const PL_STORE = "admira-win95-playlists";
export const PL_DEFAULT = "win95";

export const PL_NOMBRES = {
  win95: "Win95",
  genero95: "genero95",
  WindowsMediaPlayer: "#WindowsMediaPlayer",
  AdmiraMediaPlayer: "#AdmiraMediaPlayer",
};

export function plNormTag(t) {
  return String(t || "").replace(/^#/, "").toLowerCase();
}

export function plClave(p) {
  return p ? String(p.id || p.stockId || p.url || "") : "";
}

export function plNombre(id) {
  return PL_NOMBRES[id] || id;
}

export function plEmptyState() {
  return { v: 1, selected: PL_DEFAULT, overlays: {} };
}

export function plNormalizeState(raw) {
  const st = raw && typeof raw === "object" ? raw : {};
  return {
    v: 1,
    selected: st.selected || PL_DEFAULT,
    overlays: st.overlays && typeof st.overlays === "object" ? st.overlays : {},
  };
}

export function plOverlay(st, tag) {
  const ov = (st.overlays && st.overlays[tag]) || {};
  return {
    order: Array.isArray(ov.order) ? ov.order.slice() : [],
    removed: Array.isArray(ov.removed) ? ov.removed.slice() : [],
    added: Array.isArray(ov.added) ? ov.added.slice() : [],
  };
}

export function plOficiales(tagsCache, tag) {
  const want = plNormTag(tag);
  const out = [];
  const seen = Object.create(null);
  const cache = Array.isArray(tagsCache) ? tagsCache : [];
  for (const t of cache) {
    if (!t || plNormTag(t.tag) !== want || !Array.isArray(t.piezas)) continue;
    for (const p of t.piezas) {
      if (!p) continue;
      const k = plClave(p);
      if (!k || seen[k]) continue;
      seen[k] = 1;
      out.push({
        id: p.id,
        titulo: p.titulo,
        tipo: p.tipo,
        duracion: p.duracion,
        url: p.url,
        tag: t.tag || tag,
        official: true,
      });
    }
  }
  return out;
}

export function plResolve(tagsCache, st, tag) {
  const id = tag || (st && st.selected) || PL_DEFAULT;
  const ov = plOverlay(st, id);
  const removed = Object.create(null);
  for (const r of ov.removed) removed[r] = 1;
  const seen = Object.create(null);
  const out = [];
  function push(p) {
    const k = plClave(p);
    if (!k || seen[k] || removed[k]) return;
    seen[k] = 1;
    out.push(p);
  }
  plOficiales(tagsCache, id).forEach(push);
  ov.added.forEach(push);
  if (ov.order.length) {
    const idx = Object.create(null);
    ov.order.forEach((k, i) => {
      if (idx[k] == null) idx[k] = i;
    });
    out.sort((a, b) => {
      const ia = idx[plClave(a)];
      const ib = idx[plClave(b)];
      if (ia == null && ib == null) return 0;
      if (ia == null) return 1;
      if (ib == null) return -1;
      return ia - ib;
    });
  }
  return out;
}

export function plAnadirItem(tagsCache, st, tag, rec) {
  const next = plNormalizeState(st);
  const id = tag || next.selected || PL_DEFAULT;
  const ov = plOverlay(next, id);
  const k = plClave(rec);
  if (!k) return next;
  ov.removed = ov.removed.filter((x) => x !== k);
  const already = plResolve(tagsCache, { ...next, overlays: { ...next.overlays, [id]: ov } }, id)
    .some((p) => plClave(p) === k);
  if (!already) {
    ov.added.push({
      id: rec.id || rec.stockId,
      stockId: rec.stockId,
      titulo: rec.titulo || rec.name || rec.id,
      tipo: rec.tipo || rec.type,
      duracion: rec.duracion || 0,
      url: rec.url,
      tag: id,
      fromLib: true,
    });
  }
  next.overlays = { ...next.overlays, [id]: ov };
  ov.order = plResolve(tagsCache, next, id).map(plClave);
  next.overlays[id] = ov;
  return next;
}

export function plQuitarItem(tagsCache, st, tag, recOrKey) {
  const next = plNormalizeState(st);
  const id = tag || next.selected || PL_DEFAULT;
  const ov = plOverlay(next, id);
  const k = typeof recOrKey === "string" ? recOrKey : plClave(recOrKey);
  if (!k) return next;
  ov.added = ov.added.filter((p) => plClave(p) !== k);
  if (plOficiales(tagsCache, id).some((p) => plClave(p) === k)) {
    if (!ov.removed.includes(k)) ov.removed.push(k);
  }
  ov.order = ov.order.filter((x) => x !== k);
  next.overlays = { ...next.overlays, [id]: ov };
  return next;
}

export function plReordenarLista(st, tag, keysFrom, fromIdx, toIdx) {
  const next = plNormalizeState(st);
  const id = tag || next.selected || PL_DEFAULT;
  const list = keysFrom.slice();
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length || fromIdx === toIdx) {
    return next;
  }
  const item = list.splice(fromIdx, 1)[0];
  list.splice(toIdx, 0, item);
  const ov = plOverlay(next, id);
  ov.order = list;
  next.overlays = { ...next.overlays, [id]: ov };
  return next;
}

export function clampWinLeft(left, width, deskW = 640) {
  const w = Math.max(0, Number(width) || 0);
  const max = Math.max(0, deskW - w);
  const l = Number(left);
  if (!isFinite(l)) return 0;
  if (l < 0) return 0;
  if (l > max) return max;
  return l;
}
