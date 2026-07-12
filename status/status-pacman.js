/* ============================================================================
   status-pacman.js — Celebración Pac-Man al COMPLETARSE un encargo.
   admira.live/status · encargo de Carlos (2026-07-12).

   Cuando una tarea del inbox pasa a DONE, en la LÍNEA INFERIOR de la pantalla
   cruza un Pac-Man (canvas, boca abriendo/cerrando) comiéndose una hilera de
   puntos, arrastrando detrás una PANCARTA:
      «✔ #<id> HECHA — <primeras palabras> (<persona>)»
   con el waka-waka típico EMULADO por síntesis WebAudio (sin assets externos).

   Fuente de verdad: GET /api/public/inbox del worker admira-telegram — que desde
   el fix de la Parte 1 (2026-07-12) INCLUYE los done recientes. Detectamos la
   transición a done por diff contra un conjunto persistido en localStorage
   (no re-celebra tras recargar). Autónomo: no toca la lógica de la página; solo
   se engancha por su cuenta. Respeta prefers-reduced-motion y la política de
   autoplay de audio (silencio hasta la primera interacción del usuario).

   Debug: window.pacmanTest()  → dispara una celebración de mentira.
   ========================================================================== */
(function () {
  "use strict";

  var INBOX_URL = "https://admira-telegram.csilvasantin.workers.dev/api/public/inbox";
  var POLL_MS = 30000;                       // sondeo cada 30s (tab visible)
  var LS_KEY = "pacman.celebrated.v1";       // ids done ya celebrados
  var LS_CAP = 300;                          // recorta el histórico
  var DUR_MS = 7000;                         // duración del recorrido
  var reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  /* ---- estado persistido: ids done ya celebrados ------------------------- */
  function loadSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveSeen(set) {
    try {
      var arr = Array.from(set);
      if (arr.length > LS_CAP) arr = arr.slice(arr.length - LS_CAP);
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  var seen = loadSeen();
  var seeded = false;                        // 1ª pasada: sembrar sin celebrar

  /* ---- cola de celebraciones -------------------------------------------- */
  var queue = [];
  var busy = false;

  /* ---- audio: waka-waka emulado (WebAudio, sin archivos) ----------------- */
  var actx = null, audioReady = false;
  function ensureAudio() {
    if (actx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
    } catch (e) { actx = null; }
  }
  function unlockAudio() {
    ensureAudio();
    if (actx && actx.state === "suspended") {
      actx.resume().then(function () { audioReady = true; }).catch(function () {});
    } else if (actx) {
      audioReady = true;
    }
  }
  // Desbloqueo con la primera interacción (política de autoplay).
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, unlockAudio, { once: false, passive: true });
  });

  // Un "waka": blip de onda cuadrada con la frecuencia deslizando abajo→arriba
  // (o al revés), muy corto y a volumen discreto. `down` alterna el sentido para
  // el clásico wa-ka wa-ka.
  function chomp(down) {
    if (!actx || actx.state !== "running") return;
    var t = actx.currentTime;
    var osc = actx.createOscillator();
    var g = actx.createGain();
    osc.type = "square";
    var hi = 620, lo = 300;
    osc.frequency.setValueAtTime(down ? hi : lo, t);
    osc.frequency.exponentialRampToValueAtTime(down ? lo : hi, t + 0.085);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.008); // volumen discreto
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g); g.connect(actx.destination);
    osc.start(t); osc.stop(t + 0.12);
  }

  /* ---- DOM: banda + canvas + pancarta ----------------------------------- */
  var band, canvas, ctx, banner, bannerText;
  function buildDom() {
    if (band) return;
    band = document.createElement("div");
    band.id = "pm-band";
    band.setAttribute("aria-hidden", "true");
    band.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;height:60px;z-index:60;" +
      "pointer-events:none;display:none;overflow:hidden;" +
      "background:linear-gradient(180deg,rgba(3,6,12,0) 0%,rgba(3,6,12,.72) 40%,rgba(3,6,12,.92) 100%);";

    canvas = document.createElement("canvas");
    canvas.id = "pm-canvas";
    canvas.style.cssText = "position:absolute;left:0;bottom:0;width:100%;height:100%;";
    band.appendChild(canvas);
    ctx = canvas.getContext("2d");

    banner = document.createElement("div");
    banner.id = "pm-banner";
    banner.style.cssText =
      "position:absolute;bottom:12px;left:0;transform:translateX(-999px);" +
      "display:flex;align-items:center;height:30px;padding:0 14px;white-space:nowrap;" +
      "font-family:'Orbitron','JetBrains Mono',ui-monospace,monospace;" +
      "font-size:12px;letter-spacing:.12em;text-transform:uppercase;" +
      "color:#03060c;background:#ffcf3f;border:2px solid #ffe58a;border-radius:5px;" +
      "box-shadow:0 0 14px rgba(255,207,63,.55),0 3px 10px rgba(1,4,10,.6);" +
      "text-shadow:0 1px 0 rgba(255,255,255,.35);will-change:transform;";
    bannerText = document.createElement("span");
    banner.appendChild(bannerText);
    band.appendChild(banner);

    (document.body || document.documentElement).appendChild(band);
  }

  function fitCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var w = band.clientWidth, h = band.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  /* ---- una celebración --------------------------------------------------- */
  function firstWords(text, max) {
    var t = (text || "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    var cut = t.slice(0, max);
    var sp = cut.lastIndexOf(" ");
    if (sp > max * 0.5) cut = cut.slice(0, sp);
    return cut + "…";
  }

  function celebrate(item) {
    buildDom();
    var id = item.id != null ? item.id : "?";
    var persona = (item.target_persona || item.from_name || "").toString().trim() || "flota";
    var label = "✔ #" + id + " HECHA — " + firstWords(item.text, 46) + "  (" + persona + ")";
    bannerText.textContent = label;

    band.style.display = "block";
    var dim = fitCanvas();
    var W = dim.w, H = dim.h;
    var cy = H - 26;                          // línea de la boca / puntos
    var R = 15;                               // radio de Pac-Man

    // hilera de puntos a lo largo del recorrido
    var dots = [];
    var gap = 34, start = 40;
    for (var x = start; x < W - 20; x += gap) dots.push({ x: x, eaten: false });

    var bw = Math.min(banner.offsetWidth || 260, W - 20);
    var t0 = null;
    var lastChompAt = -1, chompFlip = false;

    if (reduced) {
      // Sin recorrido: pancarta centrada + Pac-Man estático mordisqueando.
      var bx = Math.max(8, (W - bw) / 2);
      banner.style.transform = "translateX(" + bx + "px)";
      var px = bx - 30;
      unlockAudio();
      var frames = 0;
      var iv = setInterval(function () {
        ctx.clearRect(0, 0, W, H);
        drawPac(px < 20 ? 30 : px, cy, R, (frames % 20) / 20, 1);
        if (frames % 12 === 0) { chomp(chompFlip); chompFlip = !chompFlip; }
        frames++;
      }, 60);
      setTimeout(function () {
        clearInterval(iv);
        finishCelebration();
      }, 5000);
      return;
    }

    unlockAudio();
    function step(ts) {
      if (t0 == null) t0 = ts;
      var p = (ts - t0) / DUR_MS;             // 0..1
      if (p > 1) { finishCelebration(); return; }

      var pacX = -R + p * (W + 2 * R);        // entra por izq, sale por dcha
      // boca: abre/cierra ~4 veces por segundo
      var mouth = Math.abs(Math.sin((ts - t0) / 1000 * Math.PI * 4)); // 0..1

      ctx.clearRect(0, 0, W, H);

      // puntos aún no comidos
      ctx.fillStyle = "#ffe58a";
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (!d.eaten && d.x <= pacX - R * 0.3) {
          d.eaten = true;
          // waka al morder cada punto
          if (lastChompAt < 0 || ts - lastChompAt > 90) {
            chomp(chompFlip); chompFlip = !chompFlip; lastChompAt = ts;
          }
        }
        if (!d.eaten) {
          ctx.beginPath();
          ctx.arc(d.x, cy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      drawPac(pacX, cy, R, mouth, 1);

      // pancarta arrastrada: justo detrás de la boca
      var bx = pacX - R - bw - 6;
      banner.style.transform = "translateX(" + bx + "px)";

      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Dibuja Pac-Man mirando a la derecha. `mouth` 0 (cerrada) .. 1 (abierta ~45º).
  function drawPac(x, y, r, mouth, alpha) {
    var open = mouth * 0.62;                  // radianes de media apertura
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, open, Math.PI * 2 - open, false);
    ctx.closePath();
    var grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    grad.addColorStop(0, "#ffe27a");
    grad.addColorStop(1, "#ffcf3f");
    ctx.fillStyle = grad;
    ctx.shadowColor = "rgba(255,207,63,.7)";
    ctx.shadowBlur = 12;
    ctx.fill();
    // ojo
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#1a1200";
    ctx.beginPath();
    ctx.arc(x + r * 0.15, y - r * 0.45, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function finishCelebration() {
    if (banner) banner.style.transform = "translateX(-999px)";
    if (ctx && band) ctx.clearRect(0, 0, band.clientWidth, band.clientHeight);
    if (band) band.style.display = "none";
    busy = false;
    setTimeout(pump, 350);                    // pequeño respiro entre celebraciones
  }

  function pump() {
    if (busy) return;
    var next = queue.shift();
    if (!next) return;
    busy = true;
    celebrate(next);
  }

  function enqueue(item) { queue.push(item); pump(); }

  /* ---- polling del inbox: detectar transiciones a done ------------------- */
  function scan(items) {
    var newlyDone = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.status !== "done" || it.id == null) continue;
      var key = String(it.id);
      if (seen.has(key)) continue;
      seen.add(key);
      newlyDone.push(it);
    }
    saveSeen(seen);
    if (seeded) {
      // celebra en orden de done (más antiguo primero) para que la secuencia
      // tenga sentido si se acumularon varias entre sondeos.
      newlyDone.sort(function (a, b) { return (a.done_at || 0) - (b.done_at || 0); });
      newlyDone.forEach(enqueue);
    }
    seeded = true;                            // a partir de aquí, sí celebramos
  }

  function poll() {
    if (document.hidden) return;
    fetch(INBOX_URL, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok && Array.isArray(d.items)) scan(d.items); })
      .catch(function () {});
  }

  /* ---- hook de debug ----------------------------------------------------- */
  window.pacmanTest = function (over) {
    var fake = Object.assign({
      id: "TEST",
      target_persona: "Neo",
      status: "done",
      done_at: Math.floor(Date.now() / 1000),
      text: "prueba de celebración Pac-Man con pancarta arrastrada"
    }, over || {});
    enqueue(fake);
    return "🟡 waka waka — celebración de prueba encolada";
  };

  /* ---- arranque ---------------------------------------------------------- */
  function start() {
    poll();                                   // 1ª pasada: siembra (no celebra)
    setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
    window.addEventListener("resize", function () { if (band && band.style.display === "block") fitCanvas(); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
