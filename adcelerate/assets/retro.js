/* ============================================================
   ADcelerate · retro.js
   ============================================================
   Capa de comportamiento del tema retro. Vanilla, sin frameworks.
   · Fondo synthwave en perspectiva (canvas 2D) — solo si hay .rf-canvas
     y NO se pide movimiento reducido.
   · View Transitions API entre páginas (con fallback silencioso).
   · Easter egg Konami (↑↑↓↓←→←→BA) → "modo CRT total" persistente.
   · Todo respeta prefers-reduced-motion.
   Se carga ANTES que nav.js no es necesario; es independiente.
   ============================================================ */
(function () {
  'use strict';
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Scanlines globales sutiles (capa fija) ───────────────── */
  if (!document.querySelector('.rf-scanlines')) {
    var sc = document.createElement('div');
    sc.className = 'rf-scanlines';
    sc.setAttribute('aria-hidden', 'true');
    document.body.appendChild(sc);
  }

  /* ============================================================
     1 · GRID SYNTHWAVE EN PERSPECTIVA (canvas 2D)
     Rejilla que corre hacia el horizonte, estilo Blade Runner/outrun.
     Ligera: líneas, sin texturas; se pausa fuera de foco y en reduce-motion.
     ============================================================ */
  function synthGrid(canvas) {
    if (REDUCE) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, horizon;
    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      horizon = H * 0.56;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    var offset = 0;
    var running = true;
    document.addEventListener('visibilitychange', function () { running = !document.hidden; });

    var SPACING = 46;          // separación de líneas horizontales en la base
    var VLINES = 26;           // líneas verticales (radiales)
    var lastT = 0;

    function draw(t) {
      if (!lastT) lastT = t;
      var dt = Math.min(50, t - lastT); lastT = t;
      if (running) offset = (offset + dt * 0.06) % SPACING;

      ctx.clearRect(0, 0, W, H);
      var cx = W / 2;
      var depth = H - horizon;

      // resplandor del horizonte (sol synthwave difuso)
      var sunR = Math.min(W * 0.5, 320);
      var sun = ctx.createRadialGradient(cx, horizon, 0, cx, horizon, sunR);
      sun.addColorStop(0, 'rgba(255,68,136,0.16)');
      sun.addColorStop(0.5, 'rgba(170,136,255,0.08)');
      sun.addColorStop(1, 'rgba(80,200,255,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, horizon - sunR, W, sunR + depth * 0.5);

      var glow = ctx.createLinearGradient(0, horizon - 70, 0, horizon + 50);
      glow.addColorStop(0, 'rgba(80,200,255,0)');
      glow.addColorStop(0.7, 'rgba(80,200,255,0.16)');
      glow.addColorStop(1, 'rgba(255,68,136,0.08)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, horizon - 70, W, 120);

      ctx.lineWidth = 1;

      // líneas horizontales que se acercan (perspectiva: se separan hacia abajo)
      for (var i = 0; i < 34; i++) {
        var p = (i * SPACING + offset);
        // proyección: y crece no linealmente hacia la base
        var frac = p / (34 * SPACING);
        var y = horizon + Math.pow(frac, 2.1) * depth;
        if (y > H) continue;
        var a = 0.10 + 0.45 * (1 - frac);
        ctx.strokeStyle = 'rgba(80,200,255,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // líneas verticales radiales desde el punto de fuga
      for (var j = -VLINES; j <= VLINES; j++) {
        var spread = (j / VLINES);
        var xBase = cx + spread * W * 1.35;
        var a2 = 0.08 + 0.28 * (1 - Math.abs(spread));
        ctx.strokeStyle = 'rgba(80,200,255,' + a2.toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(cx + spread * 6, horizon);
        ctx.lineTo(xBase, H);
        ctx.stroke();
      }

      // línea del horizonte (magenta con glow)
      ctx.strokeStyle = 'rgba(255,68,136,0.55)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(255,68,136,0.7)'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke();
      ctx.shadowBlur = 0;

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  var gridCanvas = document.querySelector('.rf-canvas[data-effect="synthgrid"]');
  if (gridCanvas) synthGrid(gridCanvas);

  /* ============================================================
     2 · VIEW TRANSITIONS API entre páginas internas
     Intercepta clicks a .html del propio sitio y hace una transición
     suave. Fallback: navegación normal si la API no existe.
     ============================================================ */
  if (document.startViewTransition && !REDUCE) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href$=".html"]');
      if (!a) return;
      var url = a.getAttribute('href');
      if (!url || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      // solo enlaces internos relativos
      if (/^https?:/i.test(url)) return;
      e.preventDefault();
      document.startViewTransition(function () { window.location.href = url; });
    });
  }

  /* ============================================================
     3 · EASTER EGG KONAMI → MODO CRT TOTAL (persistente)
     ↑↑↓↓←→←→ B A
     ============================================================ */
  var KEY = 'adcelerate.crt';
  var veil, toast;
  function ensureVeil() {
    if (!veil) {
      veil = document.createElement('div'); veil.className = 'rf-crt-veil'; veil.setAttribute('aria-hidden','true');
      document.body.appendChild(veil);
    }
  }
  function applyCRT(on, announce) {
    document.body.classList.toggle('rf-crt', on);
    if (on) ensureVeil();
    if (announce) {
      if (!toast) {
        toast = document.createElement('div'); toast.className = 'rf-crt-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
      }
      toast.textContent = on ? '▚ Modo CRT total activado' : '▚ Modo CRT total desactivado';
      toast.classList.add('show');
      clearTimeout(applyCRT._t);
      applyCRT._t = setTimeout(function () { toast.classList.remove('show'); }, 2200);
    }
  }
  // restaurar preferencia
  try { if (localStorage.getItem(KEY) === '1') applyCRT(true, false); } catch (e) {}

  var seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var pos = 0;
  window.addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === seq[pos]) {
      pos++;
      if (pos === seq.length) {
        pos = 0;
        var on = !document.body.classList.contains('rf-crt');
        applyCRT(on, true);
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e2) {}
      }
    } else {
      pos = (k === seq[0]) ? 1 : 0;
    }
  });

  // API mínima para debug/otros scripts
  window.RF = { crt: applyCRT, reduce: REDUCE };
})();
