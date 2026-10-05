// Layout controls enhance the existing SCUMM nodes; their actions keep their handlers.
// v4 (Carlos 2026-10-05): Accesos DEBAJO de Verbos (columna), Verbos arriba,
// Previos oculto por defecto → más espacio para la conversación.
export const IDS = ['verbos', 'accesos', 'previos'];
const LABELS = { verbos: 'Verbos', accesos: 'Accesos', previos: 'Previos' };
const KEY = 'admira.scumm.layout.v4';
const PREVIOUS_KEY = 'admira.scumm.layout.v3';
const LEGACY_KEYS = ['admira.scumm.layout.v2', 'admira.scumm.layout.v1'];
// Compact stack: Verbos then Accesos share the column; Previos hidden frees chat space.
const DEFAULT_WEIGHTS = { verbos: 62, accesos: 38, previos: 40 };
const DEFAULT_HIDDEN = ['previos'];
const DEFAULT_HEIGHT = 260;
export function normalizeLayout(raw = {}) {
  const order = Array.isArray(raw?.order) ? [...new Set(raw.order.filter(id => IDS.includes(id)))] : [];
  const hiddenSrc = Array.isArray(raw?.hidden) ? raw.hidden : DEFAULT_HIDDEN;
  return {
    order: [...order, ...IDS.filter(id => !order.includes(id))],
    hidden: IDS.filter(id => hiddenSrc.includes(id)),
    weights: Object.fromEntries(IDS.map(id => [id, Number.isFinite(raw?.weights?.[id]) && raw.weights[id] > 0 ? Math.min(100, Math.max(.01, raw.weights[id])) : DEFAULT_WEIGHTS[id]])),
    height: Number.isFinite(raw?.height) ? Math.min(600, Math.max(120, raw.height)) : DEFAULT_HEIGHT
  };
}
export function migrateLegacyLayout(raw) {
  // Old side-by-side defaults (equal thirds / 22-22-56) become the new stack + hide Previos.
  const layout = normalizeLayout({ ...raw, hidden: DEFAULT_HIDDEN, order: ['verbos', 'accesos', 'previos'] });
  const w = raw?.weights || {};
  const wasSideBySide = IDS.every(id => w[id] === 1) || (w.verbos === 22 && w.accesos === 22 && w.previos === 56);
  if (wasSideBySide || !raw?.weights) {
    layout.weights = { ...DEFAULT_WEIGHTS };
    layout.height = DEFAULT_HEIGHT;
  }
  return layout;
}
// Resize two visible neighbours while conserving their total share of the stack/row.
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
      const v3 = localStorage.getItem(PREVIOUS_KEY);
      let previous = v3;
      if (previous === null) {
        for (const k of LEGACY_KEYS) {
          previous = localStorage.getItem(k);
          if (previous !== null) break;
        }
      }
      const raw = previous === null ? null : JSON.parse(previous);
      state = previous === null ? normalizeLayout() : migrateLegacyLayout(raw);
    }
  } catch { state = normalizeLayout(); }
  // Guarantee Verbos is first in the default stack (Accesos below).
  if (!state.order.includes('verbos') || state.order[0] !== 'verbos') {
    state.order = ['verbos', ...state.order.filter(id => id !== 'verbos')];
  }
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
  const source = { verbos: [grid, pager], accesos: [inventory], previos: [preview] };
  for (const id of IDS) {
    const module = create('section', 'scumm-module'); module.dataset.module = id;
    module.setAttribute('aria-label', LABELS[id]);
    const head = create('div', 'scumm-module-head');
    const grip = button('Mover ' + LABELS[id] + ' · arrastra o usa las flechas', '⠿ ' + LABELS[id].toUpperCase());
    grip.className = 'scumm-module-grip';
    const close = button('Cerrar ' + LABELS[id], '×'); close.className = 'scumm-module-close';
    close.addEventListener('click', () => {
      state.hidden.push(id); render(); save(); menuToggle.focus();
    });
    head.append(grip, close);
    const content = create('div', 'scumm-module-content'); content.append(...source[id]);
    const handle = create('div', 'scumm-module-resizer'); handle.tabIndex = 0;
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-label', 'Redimensionar ' + LABELS[id]);
    handle.title = 'Arrastra para ajustar alto · flechas para ajustar · doble clic para igualar';
    module.append(head, content, handle); row.append(module);
    modules[id] = { module, grip, handle };
    const toggle = button('Mostrar ' + LABELS[id], '+ ' + LABELS[id].toUpperCase());
    toggle.addEventListener('click', () => {
      state.hidden = state.hidden.filter(x => x !== id); render(); save(); menu.open = false; grip.focus();
    });
    toggles[id] = toggle; toolbar.append(toggle);
    const neighbour = () => { const visible = state.order.filter(x => !state.hidden.includes(x)); return visible[visible.indexOf(id) + 1]; };
    let resizing = null;
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !neighbour()) return;
      const next = neighbour(), a = module.getBoundingClientRect(), b = modules[next].module.getBoundingClientRect();
      resizing = { next, y: e.clientY, height: a.height, total: a.height + b.height, weights: { ...state.weights } };
      handle.setPointerCapture(e.pointerId); e.preventDefault();
    });
    handle.addEventListener('pointermove', e => {
      if (!resizing) return;
      state.weights = resizePair(resizing.weights, id, resizing.next, (resizing.height + e.clientY - resizing.y) / resizing.total);
      render(false);
    });
    const stopResize = () => { if (resizing) { resizing = null; save(); } };
    handle.addEventListener('pointerup', stopResize); handle.addEventListener('pointercancel', stopResize);
    handle.addEventListener('lostpointercapture', stopResize);
    handle.addEventListener('keydown', e => {
      const next = neighbour(); if (!next || !['ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
      e.preventDefault();
      const fraction = state.weights[id] / (state.weights[id] + state.weights[next]);
      state.weights = resizePair(state.weights, id, next, e.key === 'Home' ? .5 : fraction + (e.key === 'ArrowDown' ? .05 : -.05));
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
      if (target) { state.order = moveModule(state.order, id, target); render(); save(); grip.focus(); }
    });
    grip.addEventListener('pointercancel', () => { moving = null; });
    grip.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const visible = state.order.filter(x => !state.hidden.includes(x));
      const target = visible[visible.indexOf(id) + (e.key === 'ArrowUp' ? -1 : 1)];
      if (target) { state.order = moveModule(state.order, id, target); render(); save(); grip.focus(); }
    });
  }
  const reset = button('Restaurar Verbos↑ Accesos↓', '↺ RESTAURAR');
  reset.addEventListener('click', () => { state = normalizeLayout(); render(); save(); menu.open = false; menuToggle.focus(); });
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
  const setHeight = value => { state.height = Math.min(600, Math.max(120, value)); render(false); };
  heightHandle.addEventListener('pointermove', e => { if (heightDrag) setHeight(heightDrag.height + e.clientY - heightDrag.y); });
  const stopHeight = () => { if (heightDrag) { heightDrag = null; save(); } };
  heightHandle.addEventListener('pointerup', stopHeight); heightHandle.addEventListener('pointercancel', stopHeight);
  heightHandle.addEventListener('lostpointercapture', stopHeight);
  heightHandle.addEventListener('keydown', e => {
    if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); setHeight(state.height + (e.key === 'ArrowDown' ? 20 : -20)); save();
  });
  function render(reorder = true) {
    const visible = state.order.filter(id => !state.hidden.includes(id));
    row.style.setProperty('--scumm-height', state.height + 'px');
    row.hidden = !visible.length; heightHandle.hidden = !visible.length;
    heightHandle.setAttribute('aria-valuemin', '120'); heightHandle.setAttribute('aria-valuemax', '600');
    heightHandle.setAttribute('aria-valuenow', String(Math.round(state.height)));
    for (const id of state.order) {
      const { module, handle } = modules[id];
      if (reorder) row.append(module);
      module.hidden = state.hidden.includes(id); toggles[id].hidden = !module.hidden;
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
