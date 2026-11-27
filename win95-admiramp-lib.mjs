// Lógica pura del Winamp virtual (AdmirAmp) de admira.live/windows95:
// imán/acoplamiento de los 3 bloques, escalado del interior y ecualizador.
// El page script de windows95/index.html sigue las mismas reglas.

export const MAGNET_THRESHOLD = 16;
export const AMP_IDS = ["amp", "eqw", "plw"];
export const AMP_DESIGN = {
  amp: { w: 275, h: 116 },
  eqw: { w: 275, h: 116 },
  plw: { w: 275, h: 150 },
};

export const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
export const EQ_LABELS = ["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"];
export const EQ_Q = 1.4;
export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;

/** Presets clásicos (10 bandas, dB). */
export const EQ_PRESETS = [
  ["PLANO", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ["ROCK", [8, 5, -5, -8, -3, 4, 9, 11, 11, 11]],
  ["POP", [-2, 5, 7, 8, 5, 0, -2, -2, -2, -2]],
  ["CLUB", [0, 0, 4, 6, 6, 6, 4, 0, 0, 0]],
  ["GRAVES", [10, 10, 10, 5, 1, -4, -8, -10, -11, -11]],
  ["AGUDOS", [-10, -10, -8, -4, 0, 5, 9, 11, 12, 12]],
  ["TECHNO", [8, 6, 0, -6, -5, 0, 8, 10, 10, 9]],
  ["SUAVE", [-2, 0, 2, 3, 4, 5, 4, 2, 1, 0]],
];

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

export function clampDb(db) {
  return clamp(Number(db) || 0, EQ_MIN_DB, EQ_MAX_DB);
}

/** Slider vertical 0 (arriba, +12 dB) … 1 (abajo, -12 dB). */
export function sliderToDb(v) {
  return clampDb(12 - 24 * clamp(Number(v) || 0, 0, 1));
}

export function dbToSlider(db) {
  return clamp((12 - clampDb(db)) / 24, 0, 1);
}

export function preGainFromDb(db, on) {
  if (!on) return 1;
  return Math.pow(10, clampDb(db) / 20);
}

export function bandGains(values, on) {
  const src = Array.isArray(values) ? values : [];
  const out = [];
  for (let i = 0; i < 10; i++) out.push(on ? clampDb(src[i]) : 0);
  return out;
}

export function eqCurveValues(values, on) {
  return bandGains(values, on);
}

export function nextPresetIndex(i, len = EQ_PRESETS.length) {
  const n = Math.max(1, len | 0);
  return ((Number(i) || 0) + 1 + n) % n;
}

export function presetByName(name) {
  const n = String(name || "").trim().toUpperCase();
  return EQ_PRESETS.find((p) => p[0] === n) || null;
}

export function box(id, l, t, w, h) {
  const left = Number(l) || 0;
  const top = Number(t) || 0;
  const width = Math.max(1, Number(w) || 0);
  const height = Math.max(1, Number(h) || 0);
  return { id, l: left, t: top, w: width, h: height, r: left + width, b: top + height };
}

export function placeAgainst(parent, child, side, align = 0) {
  const p = parent;
  const pr = p.r != null ? p.r : p.l + p.w;
  const pb = p.b != null ? p.b : p.t + p.h;
  if (side === "bottom") return { l: p.l + align, t: pb };
  if (side === "top") return { l: p.l + align, t: p.t - child.h };
  if (side === "right") return { l: pr, t: p.t + align };
  if (side === "left") return { l: p.l - child.w, t: p.t + align };
  return { l: child.l, t: child.t };
}

export function snapWindow(moving, others, threshold = MAGNET_THRESHOLD) {
  const orig = box(moving.id, moving.l, moving.t, moving.w, moving.h);
  const list = Array.isArray(others) ? others : [];
  let bestDock = null;
  let bestDist = threshold + 0.0001;
  let snappedL = orig.l;
  let snappedT = orig.t;

  for (const raw of list) {
    if (!raw || raw.id === orig.id) continue;
    const o = box(raw.id, raw.l, raw.t, raw.w, raw.h);
    const overlapX = Math.min(orig.r, o.r) - Math.max(orig.l, o.l);
    const overlapY = Math.min(orig.b, o.b) - Math.max(orig.t, o.t);
    const candidates = [];
    if (overlapX > -threshold) {
      candidates.push({ side: "bottom", dist: orig.t - o.b, l: orig.l, t: o.b });
      candidates.push({ side: "top", dist: orig.b - o.t, l: orig.l, t: o.t - orig.h });
    }
    if (overlapY > -threshold) {
      candidates.push({ side: "right", dist: orig.l - o.r, l: o.r, t: orig.t });
      candidates.push({ side: "left", dist: orig.r - o.l, l: o.l - orig.w, t: orig.t });
    }
    for (const c of candidates) {
      const d = Math.abs(c.dist);
      if (d <= threshold && d < bestDist) {
        bestDist = d;
        bestDock = { parentId: o.id, side: c.side, align: 0 };
        snappedL = c.l;
        snappedT = c.t;
      }
    }
  }

  if (bestDock) {
    const o = box(
      bestDock.parentId,
      list.find((x) => x && x.id === bestDock.parentId).l,
      list.find((x) => x && x.id === bestDock.parentId).t,
      list.find((x) => x && x.id === bestDock.parentId).w,
      list.find((x) => x && x.id === bestDock.parentId).h,
    );
    if (bestDock.side === "bottom" || bestDock.side === "top") {
      if (Math.abs(snappedL - o.l) <= threshold) snappedL = o.l;
      else if (Math.abs(snappedL + orig.w - o.r) <= threshold) snappedL = o.r - orig.w;
      bestDock.align = snappedL - o.l;
    } else {
      if (Math.abs(snappedT - o.t) <= threshold) snappedT = o.t;
      else if (Math.abs(snappedT + orig.h - o.b) <= threshold) snappedT = o.b - orig.h;
      bestDock.align = snappedT - o.t;
    }
  }

  return { l: snappedL, t: snappedT, dock: bestDock };
}

export function descendants(docks, rootId) {
  const out = [];
  const seen = new Set([rootId]);
  function walk(parent) {
    for (const [child, d] of Object.entries(docks || {})) {
      if (d && d.parentId === parent && !seen.has(child)) {
        seen.add(child);
        out.push(child);
        walk(child);
      }
    }
  }
  walk(rootId);
  return out;
}

export function connectedCluster(docks, id) {
  const graph = {};
  function add(a, b) {
    if (!a || !b) return;
    (graph[a] ||= new Set()).add(b);
    (graph[b] ||= new Set()).add(a);
  }
  for (const [child, d] of Object.entries(docks || {})) {
    if (d && d.parentId) add(child, d.parentId);
  }
  const out = [];
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const n = stack.pop();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    for (const m of graph[n] || []) stack.push(m);
  }
  return out;
}

function wouldCycle(docks, id) {
  const seen = new Set();
  let cur = id;
  while (docks[cur] && docks[cur].parentId) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = docks[cur].parentId;
    if (cur === id) return true;
  }
  return false;
}

export function undock(docks, id) {
  const next = { ...(docks || {}) };
  delete next[id];
  return next;
}

export function setDock(docks, id, dock) {
  const next = { ...(docks || {}) };
  if (!id) return next;
  if (!dock || !dock.parentId || dock.parentId === id) {
    delete next[id];
    return next;
  }
  next[id] = { parentId: dock.parentId, side: dock.side, align: Number(dock.align) || 0 };
  if (wouldCycle(next, id)) delete next[id];
  return next;
}

export function moveGroup(positions, id, l, t, docks, mode = "cluster") {
  const cur = positions[id];
  if (!cur) return positions;
  const dx = l - cur.l;
  const dy = t - cur.t;
  const ids = mode === "cluster" ? connectedCluster(docks, id) : [id, ...descendants(docks, id)];
  const next = { ...positions };
  for (const k of ids) {
    const p = next[k];
    if (!p) continue;
    const nl = k === id ? l : p.l + dx;
    const nt = k === id ? t : p.t + dy;
    next[k] = box(k, nl, nt, p.w, p.h);
  }
  return next;
}

export function reflowDocks(positions, docks) {
  const next = { ...positions };
  const placed = new Set(Object.keys(positions).filter((id) => !docks || !docks[id]));
  let guard = 0;
  while (placed.size < Object.keys(next).length && guard++ < 20) {
    let progress = false;
    for (const [child, d] of Object.entries(docks || {})) {
      if (placed.has(child) || !next[child] || !d || !next[d.parentId]) continue;
      if (!placed.has(d.parentId) && docks[d.parentId]) continue;
      const p = next[d.parentId];
      const c = next[child];
      const pos = placeAgainst(p, c, d.side, d.align || 0);
      next[child] = box(child, pos.l, pos.t, c.w, c.h);
      placed.add(child);
      progress = true;
    }
    if (!progress) break;
  }
  return next;
}

export function initialAmpLayout(originL = 182, originT = 16, sizes = AMP_DESIGN) {
  const amp = box("amp", originL, originT, sizes.amp.w, sizes.amp.h);
  const eqw = box("eqw", originL, amp.b, sizes.eqw.w, sizes.eqw.h);
  const plw = box("plw", originL, eqw.b, sizes.plw.w, sizes.plw.h);
  return {
    positions: { amp, eqw, plw },
    docks: {
      eqw: { parentId: "amp", side: "bottom", align: 0 },
      plw: { parentId: "eqw", side: "bottom", align: 0 },
    },
  };
}

export function detectDocks(positions, threshold = MAGNET_THRESHOLD, ids = AMP_IDS) {
  let docks = {};
  const boxes = ids.map((id) => positions[id]).filter(Boolean);
  for (const id of ids) {
    if (id === "amp" || !positions[id]) continue;
    const others = boxes.filter((b) => b.id !== id);
    const snapped = snapWindow(positions[id], others, threshold);
    if (snapped.dock) docks = setDock(docks, id, snapped.dock);
  }
  return docks;
}

export function layoutPlaylist(w, h) {
  const title = 14, pad = 10, footer = 23, sb = 7, sbGap = 9, btnH = 13, bottom = 7;
  const width = Math.max(AMP_DESIGN.plw.w, Number(w) || 0);
  const height = Math.max(AMP_DESIGN.plw.h - 10, Number(h) || 0);
  const listTop = 18;
  const listH = Math.max(24, height - footer - listTop);
  const listW = Math.max(40, width - pad - sbGap - sb);
  return {
    title: { l: 0, t: 0, w: width, h: title },
    list: { l: pad, t: listTop, w: listW, h: listH },
    scrollbar: { l: width - sbGap - sb, t: listTop, w: sb, h: listH },
    tools: { l: pad, t: height - bottom - btnH, w: width - pad * 2, h: btnH },
    fontPx: Math.min(14, Math.max(9, Math.round(9 * (width / AMP_DESIGN.plw.w)))),
  };
}

export function skinScale(w, h, designW = AMP_DESIGN.amp.w, designH = AMP_DESIGN.amp.h, title = 14) {
  const width = Math.max(designW, Number(w) || 0);
  const height = Math.max(designH, Number(h) || 0);
  return {
    sx: width / designW,
    sy: (height - title) / (designH - title),
    bodyW: designW,
    bodyH: designH - title,
    title,
  };
}

const AUDIO_HOST_EXACT = new Set([
  "stock.admira.store",
  "api.admira.store",
  "admira.store",
  "admira.tv",
  "www.admira.tv",
  "admira.studio",
  "www.admira.studio",
  "admira.live",
  "www.admira.live",
]);

export function hostPermitido(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (AUDIO_HOST_EXACT.has(h)) return true;
  return /\.admira\.(store|tv|studio|live)$/.test(h);
}

export function urlPublicaAudio(u) {
  if (typeof u !== "string" || !u || u.length > 1024) return "";
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return "";
    if (!hostPermitido(x.hostname)) return "";
    if (x.username || x.password) return "";
    return x.toString();
  } catch {
    return "";
  }
}

export function proxyAudioPath(url) {
  const u = urlPublicaAudio(url);
  if (!u) return "";
  return "/api/win95/audio?u=" + encodeURIComponent(u);
}

export function corsAllowsOrigin(allowOrigin, origin = "https://www.admira.live") {
  const a = String(allowOrigin || "").trim();
  if (!a) return false;
  if (a === "*") return true;
  return a === origin;
}

export function audioPlaybackSrc(url, opts = {}) {
  const u = urlPublicaAudio(url);
  if (!u) return "";
  if (opts.useProxy) return proxyAudioPath(u);
  return u;
}

export function isProxySrc(src) {
  return typeof src === "string" && src.startsWith("/api/win95/audio?");
}

/* ---------- Lista: quitar, añadir local, importar, refresco ---------- */

export function trackKey(t) {
  if (!t) return "";
  if (t.localId) return "local:" + String(t.localId);
  if (t.stockId) return "stock:" + String(t.stockId);
  if (t.src) return "src:" + String(t.src);
  return "";
}

export function shouldProxyAudio(url) {
  if (typeof url !== "string" || !url) return false;
  if (/^(blob:|file:|data:)/i.test(url)) return false;
  if (isProxySrc(url)) return false;
  if (url.startsWith("/")) return false;
  return !!urlPublicaAudio(url);
}

export function cleanLocalName(filename) {
  let name = String(filename || "Audio").replace(/\\/g, "/");
  name = name.slice(name.lastIndexOf("/") + 1);
  name = name.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim() || "Audio";
  const k = name.indexOf(" - ");
  if (k > 0) return { artist: name.slice(0, k).trim(), title: name.slice(k + 3).trim() };
  return { artist: "Local", title: name };
}

export function removeSelected(tracks, sel, cur, state) {
  const list = Array.isArray(tracks) ? tracks.slice() : [];
  if (!list.length) {
    return { tracks: [], sel: 0, cur: 0, state: "stop", removed: null, playIndex: null };
  }
  const i = clamp(sel | 0, 0, list.length - 1);
  const removed = list.splice(i, 1)[0];
  if (!list.length) {
    return { tracks: [], sel: 0, cur: 0, state: "stop", removed, playIndex: null };
  }
  let newSel = Math.min(i, list.length - 1);
  let newCur = cur | 0;
  let playIndex = null;
  let newState = state || "stop";
  if (newCur === i) {
    newCur = newSel;
    if (state === "play") playIndex = newCur;
    else newState = "stop";
  } else if (newCur > i) {
    newCur -= 1;
  }
  if (sel > i) newSel = Math.min(sel - 1, list.length - 1);
  return { tracks: list, sel: newSel, cur: newCur, state: newState, removed, playIndex };
}

export function mergePlaylist({ stock = [], extras = [], hiddenKeys = [] } = {}) {
  const hidden = new Set((hiddenKeys || []).filter(Boolean));
  const out = [];
  const seen = new Set();
  for (const t of [...(stock || []), ...(extras || [])]) {
    if (!t) continue;
    const k = trackKey(t);
    if (k && hidden.has(k)) continue;
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(t);
  }
  return out;
}

/** Barras 0..1 de las 10 bandas del EQ a partir de getByteFrequencyData. */
export function eqLiveBars(freq, sampleRate = 44100, n = 10) {
  const bins = freq && freq.length ? freq : [];
  const count = bins.length || 512;
  const nyquist = (Number(sampleRate) || 44100) / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = EQ_FREQS[i] || 0;
    const idx = Math.min(count - 1, Math.round((f / nyquist) * count));
    const lo = Math.max(0, idx - 2);
    const hi = Math.min(count - 1, idx + 2);
    let m = 0;
    for (let b = lo; b <= hi; b++) if ((bins[b] || 0) > m) m = bins[b] || 0;
    out.push(m / 255);
  }
  return out;
}

/** Solo se inventa un pulso en pistas sintéticas (sin src). Con audio real, o hay analizador o barras a 0. */
export function useFakeSpectrum(track) {
  return !(track && track.src);
}

export function importStatus(wroteTag) {
  if (wroteTag) return "Importada a #winamp en Stock y en la lista de esta sesión.";
  return "Importada a la lista de Winamp de esta sesión. En este sitio no hay un API para escribir la etiqueta #winamp en el catálogo de Stock.";
}

export function isAudioResult(p) {
  const typ = String((p && (p.tipo || p.type)) || "").toLowerCase();
  if (typ && /video|imagen|image|html/.test(typ)) return false;
  const url = String((p && p.url) || "");
  if (/\.(mp4|webm|mov|mkv|avi)(\?|$)/i.test(url)) return false;
  return true;
}
