// Layout controls enhance the existing SCUMM nodes; their actions keep their handlers.
export const IDS = ['verbos', 'accesos', 'previos'];
const LABELS = { verbos: 'Verbos', accesos: 'Accesos', previos: 'Previos' };
const KEY = 'admira.scumm.layout.v1';
export function normalizeLayout(raw = {}) {
  const order = Array.isArray(raw?.order) ? [...new Set(raw.order.filter(id => IDS.includes(id)))] : [];
  return {
    order: [...order, ...IDS.filter(id => !order.includes(id))],
    hidden: IDS.filter(id => Array.isArray(raw?.hidden) && raw.hidden.includes(id)),
    weights: Object.fromEntries(IDS.map(id => [id, Number.isFinite(raw?.weights?.[id]) && raw.weights[id] > 0 ? Math.min(100, Math.max(.01, raw.weights[id])) : 1])),
    height: Number.isFinite(raw?.height) ? Math.min(600, Math.max(160, raw.height)) : 270
  };
}
// Resize two visible neighbours while conserving their total share of the row.
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
  try { state = normalizeLayout(JSON.parse(localStorage.getItem(KEY))); } catch { state = normalizeLayout(); }
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
  const toolbar = create('div', 'scumm-layout-tools');
  toolbar.setAttribute('aria-label', 'Bloques del menú SCUMM');
  row.before(toolbar);
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
      state.hidden.push(id); render(); save(); toggles[id].focus();
    });
    head.append(grip, close);
    const content = create('div', 'scumm-module-content'); content.append(...source[id]);
    const handle = create('div', 'scumm-module-resizer'); handle.tabIndex = 0;
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Redimensionar ' + LABELS[id]);
    handle.title = 'Arrastra para ajustar ancho · flechas para ajustar · doble clic para igualar';
    module.append(head, content, handle); row.append(module);
    modules[id] = { module, grip, handle };
    const toggle = button('Mostrar ' + LABELS[id], '+ ' + LABELS[id].toUpperCase());
    toggle.addEventListener('click', () => {
      state.hidden = state.hidden.filter(x => x !== id); render(); save(); grip.focus();
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
      const next = neighbour(); if (!next || !['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
      e.preventDefault();
      const fraction = state.weights[id] / (state.weights[id] + state.weights[next]);
      state.weights = resizePair(state.weights, id, next, e.key === 'Home' ? .5 : fraction + (e.key === 'ArrowRight' ? .05 : -.05));
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
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const visible = state.order.filter(x => !state.hidden.includes(x));
      const target = visible[visible.indexOf(id) + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (target) { state.order = moveModule(state.order, id, target); render(); save(); grip.focus(); }
    });
  }
  const reset = button('Restaurar los tres bloques', '↺ RESTAURAR');
  reset.addEventListener('click', () => { state = normalizeLayout(); render(); save(); });
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
    const visible = state.order.filter(id => !state.hidden.includes(id));
    row.style.setProperty('--scumm-height', state.height + 'px');
    row.hidden = !visible.length; heightHandle.hidden = !visible.length;
    heightHandle.setAttribute('aria-valuemin', '160'); heightHandle.setAttribute('aria-valuemax', '600');
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
}
if (typeof document !== 'undefined') init();
