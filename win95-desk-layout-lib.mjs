// Layout puro del escritorio Win95 (modo 4:3 y Extended) y de las
// columnas de Correo Admira. Lo carga windows95/index.html (window.Win95DeskLayout).

export const TASKBAR_H = 28;
export const ICON_W = 72;
export const ICON_H = 48;
export const ICON_COL = 78;
export const ICON_ROW = 62;
export const ICON_ML = 4;
export const ICON_MT = 6;
export const ICON_RIGHT_PAD = 76;

export const DEFAULT_ICON_POS = {
  mypc: { left: 4, top: 6 },
  browser: { left: 4, top: 68 },
  'fld-descargas': { left: 4, top: 130 },
  'fld-misc': { left: 4, top: 192 },
  'fld-misiones': { left: 82, top: 192 },
  p2p: { left: 4, top: 254 },
  amp: { left: 4, top: 316 },
  media: { left: 4, top: 378 },
  readme: { left: 82, top: 6 },
  'doc-leyendas': { left: 160, top: 6 },
  inbox: { left: 564, top: 6 },
  ssaver: { left: 564, top: 192 },
  trash: { left: 564, top: 378 },
};

export const RIGHT_EDGE_ICONS = { inbox: 'top', ssaver: 'mid', trash: 'bottom' };
export const FLOW_ORDER = [
  'mypc', 'browser', 'fld-descargas', 'fld-misc', 'p2p', 'amp', 'media',
  'readme', 'fld-misiones', 'doc-leyendas',
];

export function clamp(n, a, b) {
  n = +n;
  if (!isFinite(n)) n = a;
  return n < a ? a : n > b ? b : n;
}

export function viewportSize(win) {
  const w0 = win || (typeof window !== 'undefined' ? window : null);
  let w = 1, h = 1, left = 0, top = 0;
  if (w0) {
    w = Math.max(1, w0.innerWidth || 0);
    h = Math.max(1, w0.innerHeight || 0);
    try {
      const vv = w0.visualViewport;
      if (vv && vv.width && vv.height) {
        w = Math.max(1, Math.round(vv.width));
        h = Math.max(1, Math.round(vv.height));
        left = Math.round(vv.offsetLeft || 0);
        top = Math.round(vv.offsetTop || 0);
      }
    } catch (e) {}
    try {
      const de = w0.document && w0.document.documentElement;
      if (de) {
        if (de.clientWidth > 0 && de.clientWidth < w) w = de.clientWidth;
        if (de.clientHeight > 0 && de.clientHeight < h) h = de.clientHeight;
      }
    } catch (e) {}
  }
  return { w: w, h: h, left: left, top: top };
}

export function deskMetrics(extended, vp, taskbar) {
  const tb = taskbar == null ? TASKBAR_H : taskbar;
  const view = vp || { w: 640, h: 480 };
  if (extended) {
    const w = Math.max(1, view.w);
    const h = Math.max(0, view.h - tb);
    return {
      w: w,
      h: h,
      topMax: Math.max(0, h - 22),
      rightCol: Math.max(0, w - ICON_RIGHT_PAD),
      taskbar: tb,
    };
  }
  return { w: 640, h: 452, topMax: 430, rightCol: 564, taskbar: tb };
}

export function deskGrid(deskW, deskH) {
  const cols = Math.max(1, Math.floor((Math.max(0, deskW) - ICON_ML) / ICON_COL));
  let rows = Math.max(1, Math.floor((Math.max(0, deskH) - ICON_MT) / ICON_ROW));
  let lastTop = ICON_MT + (rows - 1) * ICON_ROW;
  if (lastTop + ICON_H > deskH && rows > 1) {
    rows -= 1;
    lastTop = ICON_MT + (rows - 1) * ICON_ROW;
  }
  const right = Math.max(ICON_ML, Math.max(0, deskW) - ICON_RIGHT_PAD);
  return {
    col: ICON_COL, row: ICON_ROW, ml: ICON_ML, mt: ICON_MT,
    cols: cols, rows: rows, right: right, lastTop: lastTop,
    iw: ICON_W, ih: ICON_H,
  };
}

export function factoryFits(deskW, deskH, home) {
  const pos = home || DEFAULT_ICON_POS;
  return Object.keys(pos).every(function (id) {
    const p = pos[id];
    return p.left + ICON_W <= deskW && p.top + ICON_H <= deskH;
  });
}

export function rightEdgePos(id, grid) {
  const g = grid;
  const kind = RIGHT_EDGE_ICONS[id];
  if (kind === 'bottom' || id === 'trash') return { left: g.right, top: g.lastTop };
  if (kind === 'top' || id === 'inbox') return { left: g.right, top: g.mt };
  const midRow = Math.round((Math.max(1, g.rows) - 1) * 0.5);
  return { left: g.right, top: g.mt + midRow * g.row };
}

export function mapUserIcon(pos, prev, deskW, deskH) {
  const prevW = (prev && prev.w) || 640, prevH = (prev && prev.h) || 452;
  const prevG = deskGrid(prevW, prevH);
  const g = deskGrid(deskW, deskH);
  let left = +pos.left || 0, top = +pos.top || 0;
  const nearRight = left >= prevG.right - 16;
  const nearBottom = top >= prevG.lastTop - 16;
  const nearTop = top <= ICON_MT + 16;
  if (nearRight) left = g.right;
  else if (prevW > 0 && prevW !== deskW) left = Math.round(left * (deskW / prevW));
  if (nearBottom) top = g.lastTop;
  else if (!nearTop && prevH > 0 && prevH !== deskH) top = Math.round(top * (deskH / prevH));
  left = clamp(left, 0, Math.max(0, deskW - ICON_W));
  top = clamp(top, 0, Math.max(0, deskH - ICON_H));
  return { left: left, top: top };
}

function reflowFlow(ids, grid) {
  const flowCols = Math.max(1, grid.cols - (grid.cols > 1 ? 1 : 0));
  const out = {};
  ids.forEach(function (id, i) {
    const col = Math.floor(i / grid.rows);
    const row = i % grid.rows;
    const c = Math.min(col, flowCols - 1);
    out[id] = { left: grid.ml + c * grid.col, top: grid.mt + row * grid.row };
  });
  return out;
}

export function autoIconPositions(deskW, deskH, opts) {
  const options = opts || {};
  const home = options.home || DEFAULT_ICON_POS;
  const userMoved = options.userMoved || {};
  const current = options.current || {};
  const prev = options.prev || { w: 640, h: 452 };
  const extra = options.extraIds || [];
  const g = deskGrid(deskW, deskH);
  const out = {};
  const fits = factoryFits(deskW, deskH, home);

  const flow = FLOW_ORDER.filter(function (id) { return home[id] && !userMoved[id]; });
  extra.forEach(function (id) {
    if (id && !home[id] && !RIGHT_EDGE_ICONS[id] && !userMoved[id] && flow.indexOf(id) < 0) flow.push(id);
  });

  Object.keys(RIGHT_EDGE_ICONS).forEach(function (id) {
    if (userMoved[id]) return;
    out[id] = rightEdgePos(id, g);
  });

  if (fits) {
    flow.forEach(function (id) {
      const p = home[id];
      if (p) out[id] = { left: p.left, top: p.top };
    });
  } else {
    const packed = reflowFlow(flow, g);
    Object.keys(packed).forEach(function (id) { out[id] = packed[id]; });
  }

  Object.keys(userMoved).forEach(function (id) {
    if (!userMoved[id]) return;
    const pos = current[id] || home[id] || { left: ICON_ML, top: ICON_MT };
    out[id] = mapUserIcon(pos, prev, deskW, deskH);
  });

  return out;
}

export function mailFlexColumns(totalWidth, cols, flexTitle) {
  const list = (cols || []).map(function (c) {
    return { title: c.title || c[0], width: Math.max(0, +((c.width != null) ? c.width : c[1]) || 0) };
  });
  const flexName = flexTitle || 'Asunto';
  let flexI = list.findIndex(function (c) { return c.title === flexName; });
  if (flexI < 0) flexI = Math.max(0, list.length - 2);
  const MIN = 48;
  let others = 0;
  list.forEach(function (c, i) { if (i !== flexI) others += Math.max(MIN, c.width); });
  const avail = Math.max(0, Math.round(totalWidth));
  list.forEach(function (c, i) {
    if (i === flexI) c.width = Math.max(MIN, avail - others);
    else c.width = Math.max(MIN, c.width);
  });
  return list;
}

export function clampMailFold(width, mailW) {
  const min = 120, max = Math.max(min, Math.round((mailW || 0) * 0.55));
  return clamp(width, min, max);
}

export function clampMailSplit(y, mailH, topBar, bottomBar) {
  const top = topBar == null ? 71 : topBar;
  const bot = bottomBar == null ? 26 : bottomBar;
  const minY = top + 56;
  const maxY = Math.max(minY, (mailH || 0) - bot - 56);
  return clamp(y, minY, maxY);
}

const api = {
  TASKBAR_H, ICON_W, ICON_H, ICON_COL, ICON_ROW, ICON_ML, ICON_MT, ICON_RIGHT_PAD,
  DEFAULT_ICON_POS, RIGHT_EDGE_ICONS, FLOW_ORDER,
  clamp, viewportSize, deskMetrics, deskGrid, factoryFits, rightEdgePos,
  mapUserIcon, autoIconPositions, mailFlexColumns, clampMailFold, clampMailSplit,
};

export default api;

if (typeof globalThis !== 'undefined') globalThis.Win95DeskLayout = api;
