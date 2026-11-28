/**
 * Escena visual: píldoras Matrix y, tras la roja, la Ciudad de las Máquinas
 * (homenaje propio al look ámbar/negro, rostro-enjambre, chispas y plataforma).
 * Limpia canvas, timers y listeners al salir. No usa fotogramas de terceros.
 */
import {
  buildAiFlow, guionDeus, simularOrden, prefersReducedMotion, particleBudget,
  buildFaceCloud, syncPildoraUrl, etiquetaColor, ETIQUETA_EJEMPLO, DEUS_PALETTE,
} from './win95-deus-lib.mjs';

const COLOR = { rojo: '#e02020', verde: '#2fc42f', amarillo: '#f0c800' };
const P = DEUS_PALETTE;

let root = null;
let ctl = null;

function el(doc, tag, attrs, html) {
  const n = doc.createElement(tag);
  if (attrs) Object.keys(attrs).forEach((k) => {
    if (k === 'style' && typeof attrs[k] === 'object') Object.assign(n.style, attrs[k]);
    else if (k === 'className') n.className = attrs[k];
    else n.setAttribute(k, attrs[k]);
  });
  if (html != null) n.innerHTML = html;
  return n;
}

export function showPills(opts) {
  const options = opts || {};
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;
  hidePills(doc);
  const host = options.host || doc.getElementById('stage') || doc.getElementById('desktop') || doc.body;
  const wrap = el(doc, 'div', { id: 'mx-pills', className: 'mx-pills', role: 'dialog', 'aria-label': 'Elige una píldora' });
  wrap.innerHTML = [
    '<div class="mx-pills-inner">',
    '  <p class="mx-pills-kicker">AdmiraNeXT</p>',
    '  <h2 class="mx-pills-title">Elige un camino</h2>',
    '  <p class="mx-pills-sub">La azul te devuelve a Win95. La roja abre el mundo de las máquinas y el flujo real de la flota.</p>',
    '  <div class="mx-pills-row">',
    '    <button type="button" class="mx-pill mx-pill-azul" data-pill="azul" aria-label="Píldora azul: volver a Win95">',
    '      <span class="mx-pill-cap" aria-hidden="true"></span><span class="mx-pill-lbl">Azul · Win95</span>',
    '    </button>',
    '    <button type="button" class="mx-pill mx-pill-roja" data-pill="roja" aria-label="Píldora roja: mundo de las máquinas">',
    '      <span class="mx-pill-cap" aria-hidden="true"></span><span class="mx-pill-lbl">Roja · Máquinas</span>',
    '    </button>',
    '  </div>',
    '  <p class="mx-pills-hint">Escape también vuelve a Win95.</p>',
    '</div>',
  ].join('');
  host.appendChild(wrap);
  const onKey = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); if (options.onBlue) options.onBlue(); }
    else if (e.key === 'ArrowLeft') wrap.querySelector('[data-pill="azul"]') && wrap.querySelector('[data-pill="azul"]').focus();
    else if (e.key === 'ArrowRight') wrap.querySelector('[data-pill="roja"]') && wrap.querySelector('[data-pill="roja"]').focus();
    else if (e.key === 'Enter' && doc.activeElement && doc.activeElement.getAttribute && doc.activeElement.getAttribute('data-pill') === 'roja') {
      if (options.onRed) options.onRed();
    }
  };
  doc.addEventListener('keydown', onKey);
  wrap._onKey = onKey;
  wrap._doc = doc;
  wrap.querySelector('[data-pill="azul"]').addEventListener('click', function () { if (options.onBlue) options.onBlue(); });
  wrap.querySelector('[data-pill="roja"]').addEventListener('click', function () { if (options.onRed) options.onRed(); });
  const focus = wrap.querySelector('[data-pill="roja"]');
  if (focus && typeof focus.focus === 'function') {
    try { focus.focus(); } catch (e) {}
  }
  return wrap;
}

export function hidePills(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return;
  const wrap = d.getElementById('mx-pills');
  if (!wrap) return;
  if (wrap._onKey && wrap._doc) wrap._doc.removeEventListener('keydown', wrap._onKey);
  if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
}

function cssColor(c) { return COLOR[c] || COLOR.amarillo; }

function makeSpires(w, h) {
  const n = 16;
  const list = [];
  for (let i = 0; i < n; i++) {
    const side = i < n / 2 ? -1 : 1;
    const k = (i % (n / 2)) / (n / 2);
    list.push({
      x: w * (0.5 + side * (0.18 + k * 0.42)),
      w: 8 + (i * 13) % 22,
      h: h * (0.18 + ((i * 17) % 23) / 80),
      hue: 0.5 + (i % 5) * 0.1,
    });
  }
  return list;
}

export function enterDeus(opts) {
  exitDeus();
  const options = opts || {};
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;
  hidePills(doc);
  const host = options.host || doc.getElementById('stage') || doc.getElementById('desktop') || doc.body;
  const reduced = options.reducedMotion != null ? !!options.reducedMotion : prefersReducedMotion(options);
  let flow = options.flow || buildAiFlow({});
  const lines = guionDeus(flow);
  root = el(doc, 'div', { id: 'deus-root', className: 'deus-root' + (reduced ? ' deus-reduced' : ''), role: 'dialog', 'aria-label': 'Ciudad de las Máquinas' });
  const canvas = el(doc, 'canvas', { id: 'deus-canvas', 'aria-hidden': 'true' });
  const ui = el(doc, 'div', { className: 'deus-ui' });
  ui.innerHTML = [
    '<div class="deus-subs" id="deus-subs" aria-live="polite"></div>',
    '<div class="deus-hint" id="deus-hint"></div>',
    '<form class="deus-form" id="deus-form" autocomplete="off">',
    '  <label class="deus-form-lbl" for="deus-input">Tu orden (demo, no se envía)</label>',
    '  <input id="deus-input" type="text" maxlength="240" spellcheck="false" placeholder="¿Qué quieres?">',
    '  <button type="submit" class="deus-btn">Mostrar flujo</button>',
    '  <button type="button" class="deus-btn deus-btn-azul" data-deus-exit>Píldora azul</button>',
    '</form>',
    '<p class="deus-src" id="deus-src"></p>',
  ].join('');
  root.appendChild(canvas);
  root.appendChild(ui);
  host.appendChild(root);

  const state = {
    doc, canvas, root, reduced, destroyed: false,
    raf: 0, timers: [], listeners: [],
    w: 0, h: 0, dpr: 1, t0: 0, t: 0,
    phase: reduced ? 'flow' : 'tunnel',
    pace: 1, fade: 0,
    particles: null, face: null, nodes: [], spires: [], bolts: [],
    lineI: 0, charI: 0, subText: '',
    hover: null, demoMsg: '', speaking: false,
    flow,
  };

  const ctx = canvas.getContext('2d', { alpha: false });
  const rafFn = options.requestAnimationFrame || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);

  function resize() {
    if (state.destroyed) return;
    const parent = root;
    const size = options.getSize ? options.getSize() : {
      w: parent.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 640),
      h: parent.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 480),
    };
    state.w = Math.max(1, size.w || 640);
    state.h = Math.max(1, size.h || 480);
    state.dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = state.w + 'px';
    canvas.style.height = state.h + 'px';
    if (ctx.setTransform) ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.spires = makeSpires(state.w, state.h);
    layoutNodes();
    if (!state.particles) bootParticles();
  }

  function AVISO() { return 'sin datos verificados'; }

  function layoutNodes() {
    const w = state.w, h = state.h;
    const uiH = h < 430 ? Math.min(118, h * 0.34) : 108;
    const usable = Math.max(200, h - uiH);
    const faceCy = usable * 0.34;
    const platY = usable * 0.86;
    const agents = state.flow.agentes || [];
    const midY = usable * 0.70;
    const nodes = [
      { id: 'carlos', label: 'Carlos', kind: 'carlos', color: P.goldHot, x: w / 2, y: platY - 28, info: state.flow.orden && !state.flow.orden.ejemplo ? ((state.flow.orden.etiqueta || '') + ' ' + (state.flow.orden.titulo || '')).trim() : (state.flow.ejemplo ? 'ejemplo' : AVISO()) },
      { id: 'consejo', label: 'Consejo', kind: 'consejo', color: P.gold, x: w / 2, y: midY - 8, info: state.flow.consejo || (state.flow.ok ? 'sin consejero visible' : AVISO()) },
    ];
    agents.forEach((a, i) => {
      const t = agents.length === 1 ? 0.5 : i / (agents.length - 1);
      nodes.push({
        id: a.id, label: a.nombre, kind: 'agente', color: cssColor(a.color),
        x: w * (0.07 + t * 0.70), y: midY + (usable < 320 ? 10 : 36), info: agentInfo(a), agente: a,
      });
    });
    nodes.push({
      id: 'resultados', label: 'Resultados', kind: 'resultados', color: P.amber,
      x: w * 0.92, y: platY + (usable < 320 ? 10 : 0),
      info: (state.flow.resultados && state.flow.resultados.length)
        ? state.flow.resultados.slice(0, 3).map((r) => (r.etiqueta || '') + ' ' + r.titulo).join(' · ')
        : (state.flow.ok ? 'sin cierres recientes' : AVISO()),
    });
    state.nodes = nodes;
    state.faceOrigin = { x: w / 2, y: faceCy, s: Math.min(w * 0.86, usable * 0.78) };
    state.platform = { x: w / 2, y: platY, rx: Math.min(130, w * 0.2), ry: 18 };
  }

  function agentInfo(a) {
    const bits = [a.nombre, etiquetaColor(a.color)];
    if (a.mision && a.mision.titulo) bits.push((a.mision.etiqueta ? a.mision.etiqueta + ' · ' : '') + a.mision.titulo);
    else bits.push(a.sesion ? 'sin misión visible' : 'sin datos verificados');
    if (a.mision && a.mision.ejemplo) bits.push(ETIQUETA_EJEMPLO);
    return bits.join(' — ');
  }

  function bootParticles() {
    const n = particleBudget(state.w, state.h, state.dpr, state.reduced);
    const faceN = Math.floor(n * 0.70);
    const cloud = buildFaceCloud(faceN);
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
      const isFace = i < cloud.length;
      const fc = isFace ? cloud[i] : null;
      const ray = !isFace && i % 5 === 0;
      pts[i] = {
        x: (Math.random() - 0.5) * state.w,
        y: (Math.random() - 0.5) * state.h,
        z: 0.2 + Math.random() * 1.7,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        kind: isFace ? 'face' : (ray ? 'ray' : 'flow'),
        fc, gold: !!(fc && fc.w > 0.8) || Math.random() < 0.2,
        node: 0,
        life: Math.random(),
        ang: Math.random() * Math.PI * 2,
      };
    }
    state.particles = pts;
    bindFlowTargets();
  }

  function bindFlowTargets() {
    const pts = state.particles;
    if (!pts) return;
    const nodes = state.nodes;
    pts.forEach((p, i) => {
      if (p.kind === 'flow' || p.kind === 'ray') p.node = nodes.length ? i % nodes.length : 0;
    });
  }

  function faceXY(p) {
    const o = state.faceOrigin;
    if (!o || !p.fc) return { x: p.x, y: p.y };
    const t = state.t;
    const breath = state.reduced ? 1 : 1 + 0.025 * Math.sin(t * 0.0014);
    const speak = (!state.reduced && state.speaking) ? 1 : 0;
    const mouth = p.fc.y < -0.22 ? 1 : 0;
    const brow = p.fc.y > 0.22 ? 1 : 0;
    const wave = speak * (mouth * Math.sin(t * 0.014 + p.fc.x * 10) * 7 + brow * Math.sin(t * 0.01) * 2);
    const swirl = speak * 2.2 * Math.sin(t * 0.003 + p.life * 12);
    return {
      x: o.x + p.fc.x * o.s * 0.52 * breath + swirl,
      y: o.y - p.fc.y * o.s * 0.64 * breath + wave,
    };
  }

  function nodeXY(p) {
    const n = state.nodes[p.node];
    if (!n) return { x: p.x, y: p.y };
    const ang = p.life * Math.PI * 2 + state.t * 0.0009;
    const rad = p.kind === 'ray' ? 22 : 14;
    return { x: n.x + Math.cos(ang) * rad, y: n.y + Math.sin(ang) * rad * 0.55 };
  }

  function paintCity(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, P.bgDeep);
    g.addColorStop(0.45, '#0a0603');
    g.addColorStop(0.72, '#1a0c04');
    g.addColorStop(1, '#2a1406');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const horizon = h * 0.62;
    (state.spires || []).forEach((s, i) => {
      const x = s.x, top = horizon - s.h, bw = s.w;
      ctx.fillStyle = i % 3 === 0 ? '#120904' : '#0c0704';
      ctx.fillRect(x - bw / 2, top, bw, s.h + 8);
      ctx.fillStyle = 'rgba(224,144,32,0.18)';
      ctx.fillRect(x - 1, top, 2, s.h);
      const win = 3 + (i % 4);
      for (let k = 0; k < win; k++) {
        const flicker = (Math.sin(state.t * 0.004 + i * 2 + k) + 1) * 0.5;
        ctx.globalAlpha = 0.25 + flicker * 0.55;
        ctx.fillStyle = k % 2 ? P.amber : P.gold;
        ctx.fillRect(x - bw / 2 + 2 + (k % 3) * 4, top + 6 + k * 7, 2, 2);
      }
      ctx.globalAlpha = 1;
    });

    // suelo de luces
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 80; i++) {
      const x = ((i * 97 + state.t * 0.01) % w);
      const y = horizon + 8 + (i * 13) % (h - horizon - 8);
      ctx.fillStyle = i % 4 ? P.amber : P.gold;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
  }

  function paintPlatform() {
    const p = state.platform;
    if (!p) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(0, 10, p.rx * 1.15, p.ry * 1.6, 0, 0, Math.PI * 2); ctx.fill();
    const rg = ctx.createRadialGradient(0, 0, 4, 0, 0, p.rx);
    rg.addColorStop(0, 'rgba(255,208,120,0.28)');
    rg.addColorStop(0.55, 'rgba(80,40,10,0.65)');
    rg.addColorStop(1, 'rgba(10,6,2,0.9)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P.gold;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    // figura en silueta, escala humana frente al rostro
    ctx.fillStyle = '#050302';
    ctx.beginPath();
    ctx.ellipse(0, -22, 4.2, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-3.2, -18, 6.4, 16);
    ctx.restore();
  }

  function paintBolts(w, h) {
    if (state.reduced) return;
    const o = state.faceOrigin;
    if (Math.random() < (state.speaking ? 0.09 : 0.025)) {
      const ang = Math.random() * Math.PI * 2;
      const r0 = o.s * 0.28;
      const r1 = o.s * (0.55 + Math.random() * 0.35);
      state.bolts.push({
        x0: o.x + Math.cos(ang) * r0,
        y0: o.y + Math.sin(ang) * r0 * 0.85,
        x1: o.x + Math.cos(ang) * r1,
        y1: o.y + Math.sin(ang) * r1 * 0.85,
        life: 1,
      });
    }
    state.bolts = (state.bolts || []).filter((b) => b.life > 0);
    state.bolts.forEach((b) => {
      b.life -= 0.08;
      ctx.strokeStyle = b.life > 0.6 ? P.goldHot : P.amber;
      ctx.globalAlpha = Math.max(0, b.life);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      const mx = (b.x0 + b.x1) / 2 + (Math.random() - 0.5) * 18;
      const my = (b.y0 + b.y1) / 2 + (Math.random() - 0.5) * 18;
      ctx.quadraticCurveTo(mx, my, b.x1, b.y1);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function stepTunnel(dt) {
    const w = state.w, h = state.h, cx = w / 2, cy = h / 2;
    const pts = state.particles;
    const speed = 0.00125 * (1 + state.pace);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.z -= speed * dt * (0.7 + (i % 5) * 0.12);
      if (p.z < 0.08) {
        p.z = 1.5 + Math.random() * 0.6;
        const ang = Math.random() * Math.PI * 2;
        const rad = 0.15 + Math.random() * 0.95;
        p.x = Math.cos(ang) * rad * w;
        p.y = Math.sin(ang) * rad * h;
      }
    }
    const bg = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#fff3d0');
    bg.addColorStop(0.12, '#e09020');
    bg.addColorStop(0.4, '#3a1a06');
    bg.addColorStop(1, '#030201');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const s = 1 / Math.max(0.08, p.z);
      const x = cx + p.x * s * 0.55;
      const y = cy + p.y * s * 0.55;
      ctx.globalAlpha = Math.max(0.12, Math.min(0.95, 0.2 + s * 0.55));
      ctx.fillStyle = p.gold || i % 9 === 0 ? P.goldHot : (i % 3 ? P.amber : P.gold);
      const sz = Math.max(0.6, Math.min(3.6, s * 2.6));
      const len = sz * (2.2 + s);
      const dx = x - cx, dy = y - cy;
      const dist = Math.max(1, Math.hypot(dx, dy));
      ctx.fillRect(x, y, sz, sz);
      ctx.globalAlpha *= 0.55;
      ctx.fillRect(x - (dx / dist) * len * 0.4, y - (dy / dist) * len * 0.4, sz * 0.7, len);
    }
    ctx.globalAlpha = 1;
    // silueta al fondo del túnel
    ctx.fillStyle = 'rgba(5,3,1,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 7, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function stepFlow(dt) {
    const w = state.w, h = state.h;
    const pts = state.particles;
    const settle = state.reduced ? 1 : Math.min(1, (state.t - state.tPhase) / 1600);
    paintCity(w, h);

    const o = state.faceOrigin;
    const halo = ctx.createRadialGradient(o.x, o.y, 10, o.x, o.y, o.s * 0.85);
    halo.addColorStop(0, 'rgba(255,208,120,0.16)');
    halo.addColorStop(0.45, 'rgba(224,144,32,0.08)');
    halo.addColorStop(1, 'rgba(7,4,3,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.s * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // rayos de enjambre (corona)
    ctx.strokeStyle = 'rgba(224,144,32,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2 + state.t * 0.00015;
      ctx.globalAlpha = 0.10 + 0.08 * Math.sin(state.t * 0.002 + i);
      ctx.beginPath();
      ctx.moveTo(o.x + Math.cos(ang) * o.s * 0.22, o.y + Math.sin(ang) * o.s * 0.18);
      ctx.lineTo(o.x + Math.cos(ang) * o.s * 0.72, o.y + Math.sin(ang) * o.s * 0.55);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const carlos = state.nodes.find((n) => n.id === 'carlos');
    const consejo = state.nodes.find((n) => n.id === 'consejo');
    const res = state.nodes.find((n) => n.id === 'resultados');
    function link(a, b, col, alpha) {
      if (!a || !b) return;
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 16, b.x, b.y);
      ctx.stroke();
    }
    // enjambres que salen del rostro hacia los nodos
    if (consejo) link({ x: o.x, y: o.y + o.s * 0.28 }, consejo, 'rgba(255,208,120,0.35)', 0.45);
    if (carlos && consejo) link(consejo, carlos, 'rgba(255,243,208,0.4)', 0.4);
    state.nodes.forEach((n) => {
      if (n.kind === 'agente') {
        link({ x: o.x, y: o.y + o.s * 0.22 }, n, n.color, 0.28);
        if (res) link(n, res, 'rgba(224,144,32,0.28)', 0.25);
      }
    });
    ctx.globalAlpha = 1;

    paintPlatform();

    const k = state.reduced ? 1 : 0.07 + settle * 0.2;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let tgt;
      if (p.kind === 'face') tgt = faceXY(p);
      else if (p.kind === 'ray') {
        const n = state.nodes[p.node] || o;
        const u = (p.life + state.t * 0.00025) % 1;
        const from = { x: o.x, y: o.y + o.s * 0.2 };
        tgt = { x: from.x + (n.x - from.x) * u, y: from.y + (n.y - from.y) * u };
      } else tgt = nodeXY(p);
      p.x += (tgt.x - p.x) * k;
      p.y += (tgt.y - p.y) * k;
      if (!state.reduced && p.kind === 'face') {
        const amp = state.speaking ? 0.35 : 0.14;
        p.x += Math.sin(state.t * 0.0022 + i) * amp;
        p.y += Math.cos(state.t * 0.0018 + i * 0.3) * amp;
      }
      if (p.kind === 'face') {
        ctx.globalAlpha = p.gold ? 0.95 : 0.62;
        ctx.fillStyle = p.gold ? P.goldHot : (p.fc && p.fc.w > 0.95 ? P.gold : P.amber);
      } else if (p.kind === 'ray') {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = state.nodes[p.node] ? state.nodes[p.node].color : P.amber;
      } else {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = state.nodes[p.node] ? state.nodes[p.node].color : P.amber;
      }
      const sz = p.kind === 'face' ? (p.gold ? 2.0 : 1.45) : 1.7;
      ctx.fillRect(p.x, p.y, sz, p.kind === 'face' ? sz : sz * 1.6);
    }
    ctx.globalAlpha = 1;

    paintBolts(w, h);

    state.nodes.forEach((n) => {
      const glow = state.hover && state.hover.id === n.id;
      ctx.beginPath();
      ctx.fillStyle = n.color;
      ctx.globalAlpha = glow ? 1 : 0.92;
      ctx.arc(n.x, n.y, glow ? 9 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '600 11px "JetBrains Mono","Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = P.goldHot;
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4;
      ctx.fillText(n.label, n.x, n.y + 12);
      ctx.shadowBlur = 0;
    });

    if (state.hover && state.hover.info) drawTip(state.hover);
    if (state.flow.ejemplo) {
      ctx.font = '700 11px "Segoe UI",sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = P.gold;
      ctx.fillText('EJEMPLO — datos de animación, no reales', 12, 16);
    }
  }

  function drawTip(n) {
    const ctxw = Math.min(320, state.w - 24);
    ctx.font = '12px "Segoe UI",sans-serif';
    const text = String(n.info || '');
    const words = text.split(' ');
    const linesT = [];
    let cur = '';
    words.forEach((w) => {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > ctxw - 16) { if (cur) linesT.push(cur); cur = w; }
      else cur = t;
    });
    if (cur) linesT.push(cur);
    const boxH = 14 + linesT.length * 16;
    let bx = n.x - ctxw / 2, by = n.y - 22 - boxH;
    if (by < 8) by = n.y + 28;
    if (bx < 8) bx = 8;
    if (bx + ctxw > state.w - 8) bx = state.w - 8 - ctxw;
    ctx.fillStyle = 'rgba(10,6,2,0.9)';
    ctx.strokeStyle = n.color;
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, ctxw, boxH);
    ctx.strokeRect(bx, by, ctxw, boxH);
    ctx.fillStyle = P.goldHot;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    linesT.forEach((ln, i) => ctx.fillText(ln, bx + 8, by + 8 + i * 16));
  }

  function paint(ts) {
    if (state.destroyed) return;
    if (!state.t0) state.t0 = ts;
    const dt = Math.min(40, ts - (state.t || ts));
    state.t = ts;
    if (state.phase === 'tunnel') {
      if (!state.tPhase) state.tPhase = ts;
      state.pace = Math.min(8, 1 + (ts - state.tPhase) / 180);
      stepTunnel(dt);
      if (ts - state.tPhase > 1700) {
        state.phase = 'face';
        state.tPhase = ts;
        setUiOn(true);
        if (!state._typed) { state._typed = true; startTyping(); }
        const pts = state.particles;
        for (let i = 0; i < pts.length; i++) {
          if (pts[i].kind === 'face') {
            const t = faceXY(pts[i]);
            pts[i].x = t.x + (Math.random() - 0.5) * 90;
            pts[i].y = t.y + (Math.random() - 0.5) * 90;
          }
        }
      }
    } else {
      if (!state.tPhase) state.tPhase = ts;
      if (state.phase === 'face' && ts - state.tPhase > 1000) state.phase = 'flow';
      stepFlow(dt);
    }
    if (!state.reduced && rafFn) state.raf = rafFn(paint);
  }

  function startTyping() {
    const subs = ui.querySelector('#deus-subs');
    const hint = ui.querySelector('#deus-hint');
    const src = ui.querySelector('#deus-src');
    src.textContent = state.flow.ejemplo
      ? 'Fuente: ejemplo para la animación (no son datos reales).'
      : (state.flow.ok
        ? 'Fuente: la misma que ICQGram y CLI DeepAgents (sesión de flota, solo lectura).'
        : 'Fuente: sin datos verificados. Los estados quedan en amarillo.');
    if (state.reduced) {
      state.speaking = false;
      subs.textContent = lines.join(' ');
      hint.textContent = 'Escape o píldora azul para volver.';
      return;
    }
    function tick() {
      if (state.destroyed) return;
      if (state.lineI >= lines.length) {
        state.speaking = false;
        hint.textContent = 'Pasa por un nodo para ver la misión. Escape o píldora azul para volver.';
        return;
      }
      const line = lines[state.lineI];
      state.speaking = true;
      state.charI += 1;
      state.subText = line.slice(0, state.charI);
      subs.textContent = state.subText;
      if (state.charI >= line.length) {
        state.speaking = false;
        state.lineI += 1;
        state.charI = 0;
        state.timers.push(setTimeout(tick, 900));
      } else {
        state.timers.push(setTimeout(tick, 22));
      }
    }
    tick();
  }

  function onPointer(e) {
    if (state.destroyed) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (state.w / (r.width || state.w));
    const y = (e.clientY - r.top) * (state.h / (r.height || state.h));
    let hit = null;
    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i];
      const dx = x - n.x, dy = y - n.y;
      if (dx * dx + dy * dy < 22 * 22) hit = n;
    }
    state.hover = hit;
    if (state.reduced) stepFlow(0);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (options.onExit) options.onExit('azul');
    }
  }

  function onResize() { resize(); if (state.reduced) { stepFlow(0); } }

  function onSubmit(e) {
    e.preventDefault();
    const inp = ui.querySelector('#deus-input');
    const sim = simularOrden(inp && inp.value);
    const hint = ui.querySelector('#deus-hint');
    hint.textContent = sim.mensaje;
    if (inp) inp.value = '';
    if (options.onDemoOrder) options.onDemoOrder(sim);
  }

  function setUiOn(on) {
    if (ui && ui.classList) ui.classList.toggle('deus-ui-on', !!on);
    if (ui && ui.style) {
      if (on) ui.style.removeProperty && ui.style.removeProperty('opacity');
      ui.style.opacity = on ? '1' : '0';
    }
  }
  setUiOn(!!state.reduced);

  resize();
  if (state.reduced) {
    startTyping();
    stepFlow(0);
  } else if (rafFn) {
    state.raf = rafFn(paint);
  } else {
    startTyping();
    setUiOn(true);
    stepFlow(0);
  }

  function addL(target, ev, fn, cap) {
    target.addEventListener(ev, fn, cap);
    state.listeners.push([target, ev, fn, cap]);
  }
  addL(doc, 'keydown', onKey);
  addL(canvas, 'pointermove', onPointer);
  addL(canvas, 'pointerdown', onPointer);
  addL(ui.querySelector('#deus-form'), 'submit', onSubmit);
  addL(ui.querySelector('[data-deus-exit]'), 'click', function () { if (options.onExit) options.onExit('azul'); });
  if (typeof window !== 'undefined') addL(window, 'resize', onResize);

  ctl = {
    root, canvas, state,
    updateFlow(next) {
      if (state.destroyed || !next) return;
      state.flow = next;
      layoutNodes();
      bindFlowTargets();
      const src = ui.querySelector('#deus-src');
      if (src) {
        src.textContent = next.ejemplo
          ? 'Fuente: ejemplo para la animación (no son datos reales).'
          : (next.ok
            ? 'Fuente: la misma que ICQGram y CLI DeepAgents (sesión de flota, solo lectura).'
            : 'Fuente: sin datos verificados. Los estados quedan en amarillo.');
      }
    },
    destroy: exitDeus,
    get destroyed() { return state.destroyed; },
    get phase() { return state.phase; },
  };

  const rain = options.rain;
  if (rain && typeof rain.setPace === 'function' && !state.reduced) {
    try { rain.setPace(5); } catch (e) {}
  }

  if (options.syncUrl !== false && typeof window !== 'undefined') {
    try { syncPildoraUrl('roja', window.location && window.history ? window : options.location); } catch (e) {}
  }

  return ctl;
}

export function exitDeus() {
  if (ctl && ctl.state && !ctl.state.destroyed) {
    const s = ctl.state;
    s.destroyed = true;
    s.speaking = false;
    if (s.raf && (typeof cancelAnimationFrame === 'function')) cancelAnimationFrame(s.raf);
    s.raf = 0;
    (s.timers || []).forEach((id) => clearTimeout(id));
    s.timers = [];
    (s.listeners || []).forEach((L) => {
      try { L[0].removeEventListener(L[1], L[2], L[3]); } catch (e) {}
    });
    s.listeners = [];
    if (s.canvas) {
      try {
        const c = s.canvas.getContext && s.canvas.getContext('2d');
        if (c) c.clearRect(0, 0, s.canvas.width || 0, s.canvas.height || 0);
      } catch (e) {}
      s.canvas.width = 0;
      s.canvas.height = 0;
    }
  }
  if (root && root.parentNode) root.parentNode.removeChild(root);
  root = null;
  ctl = null;
  if (typeof document !== 'undefined') hidePills(document);
}

export function getDeusScene() { return ctl; }

const api = { showPills, hidePills, enterDeus, exitDeus, getDeusScene };
export default api;
if (typeof globalThis !== 'undefined') globalThis.Win95DeusScene = api;
