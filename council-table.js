/* The remote screen belongs to the selected adviser. Coordinates refer to the
 * council artwork, never the browser viewport. No transport is started here. */
(function (root) {
  'use strict';

  // Calibrated against assets/council-leyendas.jpg (1360 × 768). The perimeter
  // clears the coffee, papers, radio, lightsaber, people and front table edge.
  const TABLE_REGION = Object.freeze({ x: .35, y: .595, width: .31, height: .28 });
  const STATUS = Object.freeze({
    idle: 'Sin escritorio conectado', connecting: 'Conectando…', live: 'En directo',
    stale: 'Última imagen · sin conexión', unavailable: 'Escritorio no disponible',
    error: 'No se pudo conectar'
  });
  const ACTIONS = Object.freeze({ history: 'Historial', routines: 'Rutinas', attachments: 'Adjuntar', reconnect: 'Reconectar' });

  function computeLayout({ width, height, generation = 'leyendas', minWidth = 320, minHeight = 180 } = {}) {
    if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
      return { placement: 'pending', reason: 'scene-not-measured', rect: null };
    }
    // Coetáneos has a logo and name plates in its centre. A screen there would
    // obscure the artwork; retain the complete scene and dock the screen below.
    if (generation !== 'leyendas') return { placement: 'dock', reason: 'artwork-occupied', rect: null };
    const r = TABLE_REGION;
    const rect = { x: width * r.x, y: height * r.y, width: width * r.width, height: height * r.height };
    if (rect.width < minWidth || rect.height < minHeight) return { placement: 'dock', reason: 'screen-too-small', rect: null };
    return { placement: 'table', reason: null, rect };
  }

  function mediaUrl(value, base, allowedOrigins) {
    try {
      const url = new URL(String(value || ''), base);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
      if (allowedOrigins && !allowedOrigins.includes(url.origin)) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function mount(options = {}) {
    const doc = options.document || root.document;
    const resolve = value => typeof value === 'string' ? doc.querySelector(value) : value;
    const scene = resolve(options.scene || '.council-image');
    if (!scene) throw new Error('CouncilTable requires the council scene.');
    const picture = resolve(options.referenceImage) || scene.querySelector('#council-img');
    let dock = resolve(options.dock);
    const ownsDock = !dock;
    if (!dock) {
      dock = doc.createElement('div');
      dock.className = 'council-table-dock';
      const anchor = scene.closest('.stage-row') || scene;
      anchor.parentNode.insertBefore(dock, anchor.nextSibling);
    }
    dock.hidden = true;
    const panel = doc.createElement('section');
    panel.className = 'council-table';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Escritorio del consejero');
    panel.innerHTML = '<header class="council-table__header"><div class="council-table__heading"><strong class="council-table__person"></strong><span class="council-table__status" role="status" aria-live="polite"></span></div><div class="council-table__window-actions"><button type="button" data-table-expand aria-label="Ampliar escritorio" title="Ampliar escritorio">⛶</button><button type="button" data-table-close aria-label="Cerrar escritorio" title="Cerrar escritorio">×</button></div></header><div class="council-table__surface"><div class="council-table__media"></div><p class="council-table__empty"></p></div><nav class="council-table__actions" aria-label="Acciones del consejero"></nav>';
    const person = panel.querySelector('.council-table__person');
    const status = panel.querySelector('.council-table__status');
    const media = panel.querySelector('.council-table__media');
    const empty = panel.querySelector('.council-table__empty');
    const actions = panel.querySelector('.council-table__actions');
    const expandButton = panel.querySelector('[data-table-expand]');
    let state = { persona: '', generation: options.generation || 'leyendas', status: 'idle', media: null, capabilities: {} };
    let visible = false;
    let expanded = false;
    let destroyed = false;
    let mediaDescriptor = null;
    let previousFocus = null;
    let frame = null;
    let lastLayout = { placement: 'pending', rect: null };

    function renderMedia() {
      const descriptor = state.media;
      if (descriptor === mediaDescriptor) return;
      mediaDescriptor = descriptor;
      media.replaceChildren(); // Stops the preceding adviser's iframe/video.
      if (!descriptor) return;
      let node;
      if (descriptor.kind === 'element' && descriptor.element && descriptor.element.nodeType === 1) {
        node = descriptor.element;
      } else {
        const allowedOrigins = options.allowedOrigins || [new URL(doc.baseURI).origin];
        const url = mediaUrl(descriptor.url, doc.baseURI, allowedOrigins);
        if (!url) {
          state.status = 'error';
          state.message = 'El origen del escritorio no está autorizado.';
          return;
        }
        if (descriptor.kind === 'iframe') {
          node = doc.createElement('iframe');
          node.title = descriptor.title || 'Escritorio de ' + state.persona;
          node.setAttribute('allow', 'fullscreen; clipboard-write');
          node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads allow-pointer-lock');
          node.referrerPolicy = 'strict-origin-when-cross-origin';
        } else if (descriptor.kind === 'image') {
          node = doc.createElement('img');
          node.alt = descriptor.title || 'Captura del escritorio de ' + state.persona;
          node.draggable = false;
        } else if (descriptor.kind === 'video') {
          node = doc.createElement('video');
          node.playsInline = true;
          node.muted = true;
          node.autoplay = true;
          node.setAttribute('aria-label', descriptor.title || 'Escritorio de ' + state.persona);
        } else {
          state.status = 'error';
          state.message = 'Formato de escritorio no compatible.';
          return;
        }
        // Loading a frame is not evidence that the remote agent is connected.
        node.addEventListener('error', () => {
          if (mediaDescriptor !== descriptor || !visible) return;
          state.status = 'error';
          state.message = 'No se pudo cargar el escritorio.';
          renderStatus();
        });
        node.src = url;
      }
      node.classList.add('council-table__stream');
      media.appendChild(node);
    }

    function renderStatus() {
      const currentStatus = Object.hasOwn(STATUS, state.status) ? state.status : 'unavailable';
      const isStill = state.media && state.media.kind === 'image';
      status.textContent = isStill && currentStatus === 'live' ? 'Captura actual' : STATUS[currentStatus];
      panel.dataset.connection = currentStatus;
      empty.textContent = state.message || (currentStatus === 'live' && !media.firstElementChild ? 'El agente aún no ha compartido su escritorio.' : STATUS[currentStatus]);
      empty.hidden = Boolean(media.firstElementChild) && !['error', 'unavailable'].includes(currentStatus);
      media.hidden = !media.firstElementChild || ['error', 'unavailable'].includes(currentStatus);
    }

    function renderActions() {
      actions.replaceChildren();
      for (const [key, label] of Object.entries(ACTIONS)) {
        if (!state.capabilities[key] || typeof options.onAction !== 'function') continue;
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.tableAction = key;
        button.addEventListener('click', () => options.onAction(key, { persona: state.persona }));
        actions.appendChild(button);
      }
      actions.hidden = !actions.childElementCount;
    }

    function layout() {
      frame = null;
      if (destroyed || !visible) return;
      if (expanded) {
        dock.hidden = true;
        panel.dataset.placement = 'expanded';
        panel.style.removeProperty('left'); panel.style.removeProperty('top');
        panel.style.removeProperty('width'); panel.style.removeProperty('height');
        doc.body.appendChild(panel);
        panel.hidden = false;
        return;
      }
      const sceneRect = scene.getBoundingClientRect();
      const imageRect = (picture || scene).getBoundingClientRect();
      lastLayout = computeLayout({ width: imageRect.width, height: imageRect.height, generation: state.generation });
      const { placement, rect } = lastLayout;
      panel.dataset.placement = placement;
      panel.hidden = placement === 'pending';
      dock.hidden = placement !== 'dock';
      if (placement === 'table') {
        scene.appendChild(panel);
        panel.style.left = (rect.x + imageRect.left - sceneRect.left) + 'px';
        panel.style.top = (rect.y + imageRect.top - sceneRect.top) + 'px';
        panel.style.width = rect.width + 'px';
        panel.style.height = rect.height + 'px';
      } else if (placement === 'dock') {
        dock.appendChild(panel);
        panel.style.removeProperty('left'); panel.style.removeProperty('top');
        panel.style.removeProperty('width'); panel.style.removeProperty('height');
      }
    }

    function scheduleLayout() {
      if (frame !== null || destroyed) return;
      frame = root.requestAnimationFrame(layout);
    }

    function setExpanded(next) {
      if (!visible || expanded === next) return;
      expanded = next;
      if (next) {
        previousFocus = doc.activeElement;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
      } else {
        panel.removeAttribute('role');
        panel.removeAttribute('aria-modal');
      }
      expandButton.textContent = next ? '↙' : '⛶';
      expandButton.setAttribute('aria-label', next ? 'Volver a la mesa' : 'Ampliar escritorio');
      expandButton.title = next ? 'Volver a la mesa' : 'Ampliar escritorio';
      layout();
      if (next) expandButton.focus();
      else if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }

    function onKey(event) {
      if (!visible || !expanded) return;
      if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); return; }
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll('button:not([disabled]), iframe, [tabindex="0"]')].filter(node => !node.hidden);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    function update(patch = {}) {
      if (destroyed) return api;
      // Never leave the prior adviser's screen visible under a new name.
      if (patch.persona !== undefined && patch.persona !== state.persona) {
        state = { persona: '', generation: state.generation, status: 'idle', media: null, capabilities: {} };
      }
      state = { ...state, ...patch, capabilities: patch.capabilities === undefined ? state.capabilities : { ...patch.capabilities } };
      person.textContent = state.persona || 'Consejero';
      panel.setAttribute('aria-label', 'Escritorio de ' + (state.persona || 'Consejero'));
      if (visible) renderMedia();
      renderStatus(); renderActions(); layout();
      return api;
    }

    function close() {
      if (destroyed) return;
      if (expanded) setExpanded(false);
      visible = false;
      panel.hidden = true;
      dock.hidden = true;
      media.replaceChildren();
      mediaDescriptor = null;
      state.media = null;
      if (typeof options.onClose === 'function') options.onClose({ persona: state.persona });
    }

    const observer = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(scheduleLayout) : null;
    if (observer) { observer.observe(scene); if (picture) observer.observe(picture); }
    else root.addEventListener('resize', scheduleLayout);
    if (picture) picture.addEventListener('load', scheduleLayout);
    panel.querySelector('[data-table-close]').addEventListener('click', close);
    expandButton.addEventListener('click', () => setExpanded(!expanded));
    doc.addEventListener('keydown', onKey);
    const api = {
      element: panel,
      show(patch = {}) { if (!destroyed) { visible = true; update(patch); } return api; },
      update, close,
      expand() { setExpanded(true); },
      collapse() { setExpanded(false); },
      get layout() { return expanded ? { placement: 'expanded', rect: null } : lastLayout; },
      destroy() {
        if (destroyed) return;
        close(); destroyed = true;
        if (observer) observer.disconnect(); else root.removeEventListener('resize', scheduleLayout);
        if (picture) picture.removeEventListener('load', scheduleLayout);
        if (frame !== null) root.cancelAnimationFrame(frame);
        doc.removeEventListener('keydown', onKey);
        panel.remove(); if (ownsDock) dock.remove();
      }
    };
    return api;
  }

  root.CouncilTable = Object.freeze({ mount, computeLayout, mediaUrl, TABLE_REGION });
})(typeof window === 'undefined' ? globalThis : window);
