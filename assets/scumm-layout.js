// Layout controls enhance the existing SCUMM nodes; their actions keep their handlers.
// v8 (Carlos 2026-10-05 23:56): keep Accesos icons INSIDE Verbos (continuum), AND
// restore the third block — Previos (mac-scumm / conversación con consejeros) —
// visible to the right. Accesos module stays hidden (icons already in Verbos).
// Chat limpio al entrar sigue en cargaHilos(); el bloque Previos nace vacío/usable.
export const IDS = ['verbos', 'accesos', 'previos'];
const LABELS = { verbos: 'Verbos', accesos: 'Accesos', previos: 'Previos' };
const KEY = 'admira.scumm.layout.v8';
const PREVIOUS_KEYS = [
  'admira.scumm.layout.v7',
  'admira.scumm.layout.v6',
  'admira.scumm.layout.v5',
  'admira.scumm.layout.v4',
  'admira.scumm.layout.v3',
  'admira.scumm.layout.v2',
  'admira.scumm.layout.v1'
];
const INTEGRATED_ORDER = ['verbos', 'accesos', 'previos'];
// Classic 22+22 / 56 with Accesos folded into Verbos → ~44 / 56.
const DEFAULT_WEIGHTS = { verbos: 44, accesos: 1, previos: 56 };
const DEFAULT_HIDDEN = ['accesos']; // Previos VISIBLE again
const DEFAULT_HEIGHT = 220;
export function normalizeLayout(raw = {}) {
  const order = Array.isArray(raw?.order) ? [...new Set(raw.order.filter(id => IDS.includes(id)))] : [];
  const hiddenSrc = Array.isArray(raw?.hidden) ? raw.hidden : DEFAULT_HIDDEN;
  const hidden = IDS.filter(id => hiddenSrc.includes(id));
  // Accesos module never shows — icons live inside Verbos.
  if (!hidden.includes('accesos')) hidden.push('accesos');
  // Strip previos from hidden when using defaults (restore third block).
  if (!Array.isArray(raw?.hidden)) {
    const i = hidden.indexOf('previos');
    if (i >= 0) hidden.splice(i, 1);
  }
  return {
    order: [...order, ...IDS.filter(id => !order.includes(id))],
    hidden,
    weights: Object.fromEntries(IDS.map(id => [id, Number.isFinite(raw?.weights?.[id]) && raw.weights[id] > 0 ? Math.min(100, Math.max(.01, raw.weights[id])) : DEFAULT_WEIGHTS[id]])),
    height: Number.isFinite(raw?.height) ? Math.min(600, Math.max(160, raw.height)) : DEFAULT_HEIGHT
  };
}
export function migrateLegacyLayout(raw) {
  // Any prior layout → integrated Verbos+icons + visible Previos.
  const layout = normalizeLayout({ ...raw, hidden: DEFAULT_HIDDEN, order: INTEGRATED_ORDER });
  layout.weights = { ...DEFAULT_WEIGHTS };
  layout.height = DEFAULT_HEIGHT;
  layout.order = [...INTEGRATED_ORDER];
  layout.hidden = [...DEFAULT_HIDDEN];
  return layout;
}
export function resizePair(weights, left, right, fraction) {
  const share = Math.max(.15, Math.min(.85, fraction));
  const total = weights[left] + weights[right];
  return { ...weights, [left]: total * share, [right]: total * (1 - share) };
}
export function moveModule(order, id, target) {
  const next = order.slice();
  if (!next.includes(id) || !next.includes(target)) return next;
  const from = next.indexOf(id), to = next.indexOf(target);
  next.splice(from, 1); next.splice(to, 0, id);
  return next;
}

function init() {
  const row = document.querySelector('.scumm-bottom');
  const grid = row?.querySelector('.verb-grid');
  const pager = row?.querySelector('.verb-pager');
  const inventory = row?.querySelector('.inventory');
  const preview = row?.querySelector('.mac-scumm');
  if (!grid || !pager || !inventory || !preview || row.dataset.layoutReady) return;
  row.dataset.layoutReady = 'true';
  let state;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) state = normalizeLayout(JSON.parse(saved));
    else {
      let previous = null;
      for (const k of PREVIOUS_KEYS) {
        previous = localStorage.getItem(k);
        if (previous !== null) break;
      }
      const raw = previous === null ? null : JSON.parse(previous);
      state = previous === null ? normalizeLayout() : migrateLegacyLayout(raw);
    }
  } catch { state = normalizeLayout(); }
  state.order = [...INTEGRATED_ORDER];
  if (!state.hidden.includes('accesos')) state.hidden.push('accesos');
  // Force-show Previos on first paint after migrate (third block restored).
  state.hidden = state.hidden.filter(id => id !== 'previos');
  if (!state.hidden.includes('accesos')) state.hidden.push('accesos');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const create = (tag, cls, text) => {
    const node = document.createElement(tag); node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const button = (label, text) => {
    const node = create('button', '', text); node.type = 'button';
    node.setAttribute('aria-label', label); node.title = label; return node;
  };
  const menu = create('details', 'scumm-layout-menu');
  const menuToggle = create('summary', '', '⋯');
  menuToggle.setAttribute('aria-label', 'Opciones de los bloques SCUMM');
  menuToggle.title = 'Restaurar o mostrar bloques SCUMM';
  const toolbar = create('div', 'scumm-layout-tools');
  toolbar.setAttribute('aria-label', 'Bloques del menú SCUMM');
  menu.append(menuToggle, toolbar);
  row.parentElement.querySelector('.action-line').insertBefore(menu, document.getElementById('scumm-fold'));
  document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.open = false; });
  menu.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.open = false; menuToggle.focus(); } });
  const modules = {}, toggles = {};
  // Inventory inside Verbos; Previos = mac-scumm (third block / conversación).
  const source = { verbos: [grid, pager, inventory], accesos: [], previos: [preview] };
  for (const id of IDS) {
    const module = create('section', 'scumm-module'); module.dataset.module = id;
    module.setAttribute('aria-label', LABELS[id]);
    const head = create('div', 'scumm-module-head');
    const grip = button('Mover ' + LABELS[id] + ' · arrastra o usa las flechas', '⠿ ' + LABELS[id].toUpperCase());
    grip.className = 'scumm-module-grip';
    const close = button('Cerrar ' + LABELS[id], '×'); close.className = 'scumm-module-close';
    close.addEventListener('click', () => {
      if (id === 'accesos') return;
      if (!state.hidden.includes(id)) state.hidden.push(id);
      render(); save(); menuToggle.focus();
    });
    head.append(grip, close);
    const content = create('div', 'scumm-module-content');
    if (source[id].length) content.append(...source[id]);
    const handle = create('div', 'scumm-module-resizer'); handle.tabIndex = 0;
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Redimensionar ' + LABELS[id]);
    handle.title = 'Arrastra para ajustar · flechas · doble clic para igualar';
    module.append(head, content, handle); row.append(module);
    modules[id] = { module, grip, handle };
    const toggle = button('Mostrar ' + LABELS[id], '+ ' + LABELS[id].toUpperCase());
    toggle.addEventListener('click', () => {
      if (id === 'accesos') { menu.open = false; return; }
      state.hidden = state.hidden.filter(x => x !== id);
      if (!state.hidden.includes('accesos')) state.hidden.push('accesos');
      render(); save(); menu.open = false; grip.focus();
    });
    toggles[id] = toggle; toolbar.append(toggle);
    const neighbour = () => { const visible = state.order.filter(x => !state.hidden.includes(x)); return visible[visible.indexOf(id) + 1]; };
    let resizing = null;
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !neighbour()) return;
      const next = neighbour(), a = module.getBoundingClientRect(), b = modules[next].module.getBoundingClientRect();
      resizing = { next, x: e.clientX, width: a.width, total: a.width + b.width, weights: { ...state.weights } };
      handle.setPointerCapture(e.pointerId); e.preventDefault();
    });
    handle.addEventListener('pointermove', e => {
      if (!resizing) return;
      state.weights = resizePair(resizing.weights, id, resizing.next, (resizing.width + e.clientX - resizing.x) / resizing.total);
      render(false);
    });
    const stopResize = () => { if (resizing) { resizing = null; save(); } };
    handle.addEventListener('pointerup', stopResize); handle.addEventListener('pointercancel', stopResize);
    handle.addEventListener('lostpointercapture', stopResize);
    handle.addEventListener('keydown', e => {
      const next = neighbour(); if (!next || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
      e.preventDefault();
      const fraction = state.weights[id] / (state.weights[id] + state.weights[next]);
      const grow = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      state.weights = resizePair(state.weights, id, next, e.key === 'Home' ? .5 : fraction + (grow ? .05 : -.05));
      render(false); save();
    });
    handle.addEventListener('dblclick', () => {
      const next = neighbour(); if (next) { state.weights = resizePair(state.weights, id, next, .5); render(false); save(); }
    });
    let moving = null;
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      moving = { x: e.clientX, y: e.clientY }; grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointerup', e => {
      if (!moving) return;
      const moved = Math.abs(e.clientX - moving.x) + Math.abs(e.clientY - moving.y) > 6;
      moving = null;
      if (!moved) return;
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.scumm-module')?.dataset.module;
      if (target && target !== 'accesos') { state.order = moveModule(state.order, id, target); render(); save(); grip.focus(); }
    });
    grip.addEventListener('pointercancel', () => { moving = null; });
    grip.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const visible = state.order.filter(x => !state.hidden.includes(x));
      const target = visible[visible.indexOf(id) + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (target) { state.order = moveModule(state.order, id, target); render(); save(); grip.focus(); }
    });
  }
  const reset = button('Restaurar Verbos+iconos | Previos', '↺ RESTAURAR');
  reset.addEventListener('click', () => { state = normalizeLayout(); state.hidden = [...DEFAULT_HIDDEN]; render(); save(); menu.open = false; menuToggle.focus(); });
  toolbar.append(reset);
  const heightHandle = create('div', 'scumm-height-resizer'); heightHandle.tabIndex = 0;
  heightHandle.setAttribute('role', 'separator'); heightHandle.setAttribute('aria-orientation', 'horizontal');
  heightHandle.setAttribute('aria-label', 'Redimensionar altura del menú SCUMM');
  heightHandle.title = 'Arrastra para ajustar la altura · flechas arriba/abajo';
  row.after(heightHandle);
  let heightDrag = null;
  heightHandle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    heightDrag = { y: e.clientY, height: row.getBoundingClientRect().height };
    heightHandle.setPointerCapture(e.pointerId); e.preventDefault();
  });
  const setHeight = value => { state.height = Math.min(600, Math.max(160, value)); render(false); };
  heightHandle.addEventListener('pointermove', e => { if (heightDrag) setHeight(heightDrag.height + e.clientY - heightDrag.y); });
  const stopHeight = () => { if (heightDrag) { heightDrag = null; save(); } };
  heightHandle.addEventListener('pointerup', stopHeight); heightHandle.addEventListener('pointercancel', stopHeight);
  heightHandle.addEventListener('lostpointercapture', stopHeight);
  heightHandle.addEventListener('keydown', e => {
    if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); setHeight(state.height + (e.key === 'ArrowDown' ? 20 : -20)); save();
  });
  function render(reorder = true) {
    state.order = [...INTEGRATED_ORDER];
    if (!state.hidden.includes('accesos')) state.hidden.push('accesos');
    const visible = state.order.filter(id => !state.hidden.includes(id));
    row.style.setProperty('--scumm-height', state.height + 'px');
    row.hidden = !visible.length; heightHandle.hidden = !visible.length;
    heightHandle.setAttribute('aria-valuemin', '160'); heightHandle.setAttribute('aria-valuemax', '600');
    heightHandle.setAttribute('aria-valuenow', String(Math.round(state.height)));
    for (const id of state.order) {
      const { module, handle } = modules[id];
      if (reorder) row.append(module);
      module.hidden = state.hidden.includes(id);
      toggles[id].hidden = !module.hidden || id === 'accesos';
      module.style.flexGrow = state.weights[id];
      const next = visible[visible.indexOf(id) + 1];
      handle.hidden = module.hidden || !next;
      handle.setAttribute('aria-valuemin', '15'); handle.setAttribute('aria-valuemax', '85');
      handle.setAttribute('aria-valuenow', next ? String(Math.round(100 * state.weights[id] / (state.weights[id] + state.weights[next]))) : '50');
    }
  }
  render();
  save();
}
if (typeof document !== 'undefined') init();
