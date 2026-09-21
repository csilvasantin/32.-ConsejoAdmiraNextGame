/*!
 * consejeros-desk.js — overlay Escritorio · 4 MacBook Air
 * Azul=Jobs · Plata=Wozniak · Rosa=Lucas · Crema=Disney
 * El overlay se pinta YA; el POST wallpaper/mode va en segundo plano y no alerta.
 */
(function () {
  if (window.openConsejerosDesk) return;

  var API = "https://macmini.tail48b61c.ts.net/demo/wallpaper/mode";
  var API_CAPTURAS = "https://macmini.tail48b61c.ts.net/demo/wallpaper/capturas";
  var STYLE_ID = "cd-desk-style";
  var OV_ID = "cd-desk";
  var posting = false;
  var postedOpen = false;
  var capturing = false;
  var gen = 0;
  var capGen = 0;

  var CHAIRS = [
    { id: "jobs",    name: "Jobs",    role: "CEO", chair: "Azul",  bezel: "#3b6ea5", key: "azul",
      src: "/wallpapers/consejero-jobs.jpg",    fallback: "/wallpapers/machines/macbookairazul.jpg" },
    { id: "wozniak", name: "Wozniak", role: "CTO", chair: "Plata", bezel: "#c5c7cb", key: "plata",
      src: "/wallpapers/consejero-wozniak.jpg", fallback: "/wallpapers/machines/macbookairplata.jpg" },
    { id: "lucas",   name: "Lucas",   role: "CSO", chair: "Rosa",  bezel: "#d48aa8", key: "rosa",
      src: "/wallpapers/consejero-lucas.jpg",   fallback: "/wallpapers/machines/macbookairrosa.jpg" },
    { id: "disney",  name: "Disney",  role: "CCO", chair: "Crema", bezel: "#e6d5b8", key: "crema",
      src: "/wallpapers/consejero-disney.jpg",  fallback: "/wallpapers/machines/macbookaircrema.jpg" }
  ];

  var CSS = [
    "#cd-desk{display:none;position:fixed;inset:0;z-index:100050;flex-direction:column;",
      "background:radial-gradient(120% 80% at 50% 0%,#2a1c10 0%,#120c08 55%,#0a0705 100%);",
      "color:#f3e6d0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
      "box-sizing:border-box;overflow:auto}",
    "#cd-desk.cd-on{display:flex}",
    "#cd-desk *,#cd-desk *::before,#cd-desk *::after{box-sizing:border-box}",
    "#cd-desk .cd-bar{flex:none;display:flex;align-items:flex-start;gap:16px;padding:18px 22px 8px;",
      "border-bottom:1px solid rgba(230,200,140,.18)}",
    "#cd-desk .cd-titles{flex:1;min-width:0}",
    "#cd-desk h2{margin:0;font-size:22px;font-weight:800;letter-spacing:.2px;color:#fff6e4}",
    "#cd-desk .cd-sub{margin:6px 0 0;font-size:13px;color:#d4b48a;letter-spacing:.3px}",
    "#cd-desk .cd-sum{margin:8px 0 0;font-size:12px;color:#c9b089;min-height:1.2em}",
    "#cd-desk .cd-x{flex:none;width:42px;height:42px;border-radius:10px;cursor:pointer;",
      "background:rgba(40,24,14,.7);color:#ffe9c4;border:1px solid rgba(230,200,140,.35);",
      "font-size:22px;line-height:1}",
    "#cd-desk .cd-x:hover{background:#3a2410;border-color:#e8c547;color:#fff}",
    "#cd-desk .cd-wall{flex:1;min-height:0;position:relative;background:#120c08}",
    "#cd-desk .cd-wall img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}",
    "#cd-desk .cd-legend{position:absolute;left:18px;bottom:16px;padding:8px 12px;border-radius:10px;",
      "background:rgba(12,8,5,.62);color:#ffe9c4;font-size:12px;letter-spacing:.2px}",
    "#cd-desk .cd-stage{flex:1;min-height:0;display:flex;flex-direction:column;padding:8px 18px 16px}",
    "#cd-desk .cd-grid{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;",
      "gap:10px 22px;align-items:center;justify-items:center}",
    "#cd-desk .cd-seat{width:min(100%,560px);margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}"
    "#cd-desk .cd-mba{width:100%;filter:drop-shadow(0 14px 22px rgba(0,0,0,.45))}",
    "#cd-desk .cd-lid{background:var(--bezel);border-radius:14px 14px 8px 8px;padding:9px 9px 0;",
      "box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -1px 0 rgba(0,0,0,.25)}",
    "#cd-desk .cd-cam{display:block;width:7px;height:7px;margin:0 auto 7px;border-radius:50%;",
      "background:#1a1a1a;box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.15)}",
    "#cd-desk .cd-screen{background:#0b0b0b;border-radius:4px;overflow:hidden;aspect-ratio:16/10;position:relative}",
    "#cd-desk .cd-screen img{width:100%;height:100%;object-fit:cover;object-position:center;display:block;background:#111}",
    "#cd-desk .cd-chin{height:14px;border-radius:0 0 8px 8px;background:var(--bezel);",
      "box-shadow:inset 0 1px 0 rgba(0,0,0,.18)}",
    "#cd-desk .cd-base{height:16px;margin:1px 10px 0;border-radius:0 0 11px 11px;",
      "background:linear-gradient(180deg,#d0d2d6,#9ea1a6);",
      "background:linear-gradient(180deg,color-mix(in srgb,var(--bezel) 35%,#d8dadc),#9ea1a6);",
      "box-shadow:0 8px 10px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.4)}",
    "#cd-desk .cd-notch{width:18%;height:4px;margin:-2px auto 0;border-radius:0 0 4px 4px;background:#8a8d92;",
      "background:color-mix(in srgb,var(--bezel) 55%,#888)}",
    "#cd-desk figcaption{text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px}",
    "#cd-desk .cd-name{font-size:16px;font-weight:800;color:#fff6e4}",
    "#cd-desk .cd-chair{font-size:12px;color:#d4b48a}",
    "#cd-desk .cd-badge{display:inline-block;margin-top:2px;padding:3px 9px;border-radius:999px;",
      "font-size:11px;letter-spacing:.2px;border:1px solid rgba(230,200,140,.3);background:rgba(40,24,14,.65);color:#e8d3a8}",
    "#cd-desk .cd-badge.cd-wait{color:#ffd27a;border-color:#8a6a28}",
    "#cd-desk .cd-badge.cd-ok{color:#b6f0c4;border-color:#2e7a48;background:rgba(20,50,30,.55)}",
    "#cd-desk .cd-badge.cd-fail{color:#ffc4b0;border-color:#8a3a2a;background:rgba(50,20,16,.55)}",
    "#cd-desk .cd-badge.cd-warn{color:#ffe9a0;border-color:#8a6a28;background:rgba(50,36,12,.55)}",
    "#consejerosOpen.active,#consejeros-btn.active,#consejeros-desk-btn.active,",
    "[data-open=\"consejeros-desk\"].active{filter:brightness(1.15)}",
    ".rail-btn#consejeros-desk-btn.active,.rail-btn[data-open=\"consejeros-desk\"].active{",
      "color:#000;background:#daa520}",
    "@media (max-width:720px){#cd-desk h2{font-size:16px}#cd-desk .cd-sub{font-size:11px}",
      "#cd-desk .cd-grid{gap:10px;padding:12px}}",
    "@supports not (background:color-mix(in srgb,red 50%,blue)){",
      "#cd-desk .cd-base{background:linear-gradient(180deg,#d0d2d6,#9ea1a6)}",
      "#cd-desk .cd-notch{background:#8a8d92}}"
  ].join("");

  function timeoutSignal(ms) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(ms);
    }
    if (typeof AbortController === "undefined") return undefined;
    var c = new AbortController();
    setTimeout(function () { try { c.abort(); } catch (e) {} }, ms);
    return c.signal;
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function markActive(on) {
    ["consejerosOpen", "consejeros-btn", "consejeros-desk-btn"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.classList.toggle("active", !!on);
    });
    qsa('[data-open="consejeros-desk"]').forEach(function (b) {
      b.classList.toggle("active", !!on);
    });
  }

  function setBadge(id, text, kind) {
    var el = qs('#cd-desk [data-badge="' + id + '"]');
    if (!el) return;
    el.textContent = text;
    el.className = "cd-badge" + (kind ? " cd-" + kind : "");
  }

  function setSummary(text) {
    var el = qs("#cd-desk .cd-sum");
    if (el) el.textContent = text || "";
  }

  function resetBadges(text, kind) {
    CHAIRS.forEach(function (c) { setBadge(c.id, text, kind); });
  }

  function machineId(m) {
    return String((m && (m.id || m.host || m.name || m.machine || m.hostname)) || "").toLowerCase();
  }

  function matchChair(m, chair) {
    var id = machineId(m);
    if (!id) return false;
    if (id.indexOf(chair.key) !== -1) return true;
    if (id.indexOf(chair.id) !== -1) return true;
    return false;
  }

  function seatOk(m) {
    if (!m) return false;
    if (m.ok === true) return true;
    if (m.ok === false) return false;
    var st = String(m.status || m.action || m.state || "").toLowerCase();
    if (/fail|error|timeout|ssh|offline|unreachable/.test(st) && !/ssh_ok|ssh_launched/.test(st)) return false;
    if (/ok|applied|vivo|online|ssh_ok|ssh_launched|done/.test(st)) return true;
    return false;
  }

  function paintFromData(data) {
    var machines = (data && (data.machines || data.results || data.items || data.seats)) || [];
    if (!Array.isArray(machines)) machines = [];
    var summary = (data && data.summary) || {};
    var ok = typeof summary.ok === "number" ? summary.ok : null;
    var total = typeof summary.total === "number" ? summary.total : null;
    var matched = 0;
    CHAIRS.forEach(function (c) {
      var m = null;
      for (var i = 0; i < machines.length; i++) {
        if (matchChair(machines[i], c)) { m = machines[i]; break; }
      }
      if (m) {
        matched++;
        if (seatOk(m)) setBadge(c.id, "vivo", "ok");
        else setBadge(c.id, "sin SSH", "fail");
      } else {
        setBadge(c.id, "sin SSH", "fail");
      }
    });
    if (ok != null && total != null) {
      setSummary("fondos " + ok + "/" + total);
      if (!matched && total) {
        CHAIRS.forEach(function (c, i) {
          if (i < ok) setBadge(c.id, "vivo", "ok");
          else setBadge(c.id, "sin SSH", "fail");
        });
      }
    } else if (!matched) {
      resetBadges("fondo publicado · silla no alcanzada", "warn");
    }
  }

  function failBadges() {
    resetBadges("fondo publicado · silla no alcanzada", "warn");
    setSummary("fondo publicado · silla no alcanzada");
  }

  function bindImg(img, chair) {
    img.alt = chair.name;
    img.src = chair.src;
    img.addEventListener("error", function onErr() {
      img.removeEventListener("error", onErr);
      if (img.getAttribute("data-fb") === "1") return;
      img.setAttribute("data-fb", "1");
      img.src = chair.fallback;
    });
  }

  function seatHtml(c) {
    return (
      '<figure class="cd-seat" data-seat="' + c.id + '">' +
        '<div class="cd-mba" style="--bezel:' + c.bezel + '">' +
          '<div class="cd-lid">' +
            '<span class="cd-cam" aria-hidden="true"></span>' +
            '<div class="cd-screen"><img alt="' + c.name + '"></div>' +
            '<div class="cd-chin"></div>' +
          '</div>' +
          '<div class="cd-base"><div class="cd-notch"></div></div>' +
        '</div>' +
        '<figcaption>' +
          '<span class="cd-name">' + c.name + '</span>' +
          '<span class="cd-chair">' + c.chair + " · " + c.role + '</span>' +
          '<span class="cd-badge cd-wait" data-badge="' + c.id + '">aplicando</span>' +
        '</figcaption>' +
      '</figure>'
    );
  }

  function ensure() {
    if (!document.getElementById(STYLE_ID)) {
      var st = document.createElement("style");
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var ov = document.getElementById(OV_ID);
    if (ov) return ov;
    ov = document.createElement("div");
    ov.id = OV_ID;
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-labelledby", "cd-desk-title");
    ov.innerHTML =
      '<div class="cd-bar">' +
        '<div class="cd-titles">' +
          '<h2 id="cd-desk-title">Fondo de escritorio · 4 MacBook Air</h2>' +
          '<p class="cd-sub">Azul Jobs · Plata Wozniak · Rosa Lucas · Crema Disney</p>' +
          '<p class="cd-sum">aplicando fondos…</p>' +
        '</div>' +
        '<button type="button" class="cd-x" data-cd-close title="Cerrar (Esc)" aria-label="Cerrar">✕</button>' +
      '</div>' +
      '<div class="cd-stage"><div class="cd-grid">' + CHAIRS.map(seatHtml).join("") + "</div></div>";
    document.body.appendChild(ov);
    CHAIRS.forEach(function (c) {
      var img = qs('#cd-desk [data-seat="' + c.id + '"] .cd-screen img');
      if (img) bindImg(img, c);
    });
    ov.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-cd-close]");
      if (t) closeDesk();
    });
    return ov;
  }

  function setConsejerosCaptures(shots) {
    shots = shots || {};
    var ok = 0;
    CHAIRS.forEach(function (c) {
      var src = shots[c.id] || shots[c.key] || shots[c.chair.toLowerCase()];
      var img = qs('#cd-desk [data-seat="' + c.id + '"] .cd-screen img');
      if (src && img) {
        img.setAttribute("data-live", "1");
        img.src = src.indexOf("data:") === 0 || src.indexOf("http") === 0 || src.charAt(0) === "/"
          ? src
          : "data:image/jpeg;base64," + src;
        setBadge(c.id, "captura limpia", "ok");
        ok++;
      }
    });
    setSummary("capturas " + ok + "/4 · sin iconos ni ventanas");
    return ok;
  }

  function captureLive() {
    if (capturing) return;
    capturing = true;
    var my = ++capGen;
    resetBadges("capturando", "wait");
    setSummary("despejando escritorios y capturando las 4 sillas…");
    fetch(API_CAPTURAS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capturar: true, only_ids: [] }),
      mode: "cors",
      credentials: "omit",
      signal: timeoutSignal(70000)
    }).then(function (res) {
      return res.json().catch(function () { return {}; });
    }).then(function (data) {
      if (my !== capGen) return;
      var shots = {};
      var machines = (data && data.machines) || [];
      machines.forEach(function (m) {
        if (m && m.ok && (m.jpeg || m.jpg || m.image)) {
          shots[m.seat || m.id] = m.jpeg || m.jpg || m.image;
        } else if (m && m.seat) {
          setBadge(m.seat, m.despejado ? "sin captura" : "sin SSH", "fail");
        }
      });
      var n = setConsejerosCaptures(shots);
      if (!n) {
        resetBadges("fondo publicado · silla no alcanzada", "warn");
        setSummary("sin capturas limpias");
      }
    }).catch(function () {
      if (my !== capGen) return;
      setSummary("captura no alcanzó las sillas");
    }).then(function () {
      if (my === capGen) capturing = false;
    });
  }

  function publish() {
    if (posting) return;
    posting = true;
    var my = ++gen;
    resetBadges("aplicando", "wait");
    setSummary("aplicando fondos…");
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "consejeros", only_ids: [] }),
      mode: "cors",
      credentials: "omit",
      signal: timeoutSignal(60000)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { res: res, data: data };
      });
    }).then(function (pack) {
      if (my !== gen) return;
      var data = pack.data || {};
      // demo-server responde 400 si alguna silla SSH falla; el cuerpo sigue
      // trayendo machines[] (Azul/Plata ok, Rosa/Crema timeout). Pintar por silla.
      if (data && Array.isArray(data.machines) && data.machines.length) {
        paintFromData(data);
        return;
      }
      failBadges();
    }).catch(function () {
      if (my !== gen) return;
      failBadges();
    }).then(function () {
      if (my === gen) posting = false;
    });
  }

  function openDesk() {
    var ov = ensure();
    ov.classList.add("cd-on");
    document.documentElement.style.overflow = "hidden";
    markActive(true);
    captureLive();
  }

  function closeDesk() {
    gen++;
    capGen++;
    posting = false;
    capturing = false;
    postedOpen = false;
    var ov = document.getElementById(OV_ID);
    if (ov) ov.classList.remove("cd-on");
    document.documentElement.style.overflow = "";
    markActive(false);
    if (/^#(consejeros|consejeros-desk)$/i.test(location.hash || "")) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
  }

  function isOpenTrigger(el) {
    if (!el || !el.closest) return null;
    return el.closest("#consejerosOpen, #consejeros-btn, #consejeros-desk-btn, [data-open=\"consejeros-desk\"]");
  }

  function onDocClick(e) {
    if (!isOpenTrigger(e.target)) return;
    openDesk();
  }

  function onKey(e) {
    if (e.key === "Escape" && document.getElementById(OV_ID) &&
        document.getElementById(OV_ID).classList.contains("cd-on")) {
      e.preventDefault();
      closeDesk();
    }
  }

  function bind() {
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    ["consejerosOpen", "consejeros-btn", "consejeros-desk-btn"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b && !b.getAttribute("data-cd-bound")) {
        b.setAttribute("data-cd-bound", "1");
      }
    });
  }

  function maybeHash() {
    var h = (location.hash || "").toLowerCase();
    if (h === "#consejeros" || h === "#consejeros-desk") openDesk();
  }

  window.openConsejerosDesk = openDesk;
  window.closeConsejerosDesk = closeDesk;
  window.setConsejerosCaptures = setConsejerosCaptures;
  window.refreshConsejerosCaptures = captureLive;

  function boot() {
    bind();
    maybeHash();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("hashchange", maybeHash);
})();
