/*!
 * consejeros-desk.js — overlay fullscreen · retratos BN delante de todo
 * Azul=Jobs · Plata=Wozniak · Rosa=Lucas · Crema=Disney
 * El overlay se pinta YA; POST wallpaper/mode (BN + CreateDesktop false) en segundo plano.
 */
(function () {
  if (window.openConsejerosDesk) return;

  var API = "https://macmini.tail48b61c.ts.net/demo/wallpaper/mode";
  var STYLE_ID = "cd-desk-style";
  var OV_ID = "cd-desk";
  var BUST = "20260921-bn";
  var posting = false;
  var postedOpen = false;
  var gen = 0;

  var CHAIRS = [
    { id: "jobs",    name: "Jobs",    role: "CEO", chair: "Azul",  key: "azul",
      src: "/wallpapers/consejero-jobs.jpg?v=" + BUST,    fallback: "/wallpapers/machines/macbookairazul.jpg" },
    { id: "wozniak", name: "Wozniak", role: "CTO", chair: "Plata", key: "plata",
      src: "/wallpapers/consejero-wozniak.jpg?v=" + BUST, fallback: "/wallpapers/machines/macbookairplata.jpg" },
    { id: "lucas",   name: "Lucas",   role: "CSO", chair: "Rosa",  key: "rosa",
      src: "/wallpapers/consejero-lucas.jpg?v=" + BUST,   fallback: "/wallpapers/machines/macbookairrosa.jpg" },
    { id: "disney",  name: "Disney",  role: "CCO", chair: "Crema", key: "crema",
      src: "/wallpapers/consejero-disney.jpg?v=" + BUST,  fallback: "/wallpapers/machines/macbookaircrema.jpg" }
  ];

  var CSS = [
    "#cd-desk{display:none;position:fixed;inset:0;z-index:2147483646;flex-direction:column;",
      "background:#000;color:#f3e6d0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
      "box-sizing:border-box;overflow:hidden}",
    "#cd-desk.cd-on{display:flex}",
    "#cd-desk *,#cd-desk *::before,#cd-desk *::after{box-sizing:border-box}",
    "#cd-desk .cd-x{position:absolute;top:14px;right:14px;z-index:3;width:42px;height:42px;",
      "border-radius:10px;cursor:pointer;background:rgba(0,0,0,.55);color:#fff;",
      "border:1px solid rgba(255,255,255,.35);font-size:22px;line-height:1}",
    "#cd-desk .cd-x:hover{background:#111;border-color:#fff}",
    "#cd-desk .cd-grid{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:0}",
    "#cd-desk .cd-cell{position:relative;overflow:hidden;min-width:0;min-height:0;background:#000}",
    "#cd-desk .cd-cell img{width:100%;height:100%;object-fit:cover;object-position:center;display:block;",
      "filter:grayscale(1);background:#111}",
    "#cd-desk .cd-tag{position:absolute;left:12px;bottom:12px;padding:6px 10px;border-radius:8px;",
      "background:rgba(0,0,0,.62);color:#fff;font-size:13px;letter-spacing:.2px;",
      "display:flex;flex-direction:column;gap:2px;pointer-events:none}",
    "#cd-desk .cd-tag b{font-size:15px;font-weight:800}",
    "#cd-desk .cd-badge{font-size:11px;opacity:.85}",
    "#cd-desk .cd-badge.cd-ok{color:#b6f0c4}",
    "#cd-desk .cd-badge.cd-fail{color:#ffc4b0}",
    "#cd-desk .cd-badge.cd-wait{color:#ffd27a}",
    "#cd-desk .cd-badge.cd-warn{color:#ffe9a0}",
    "#consejerosOpen.active,#consejeros-btn.active,#consejeros-desk-btn.active,",
    "[data-open=\"consejeros-desk\"].active{filter:brightness(1.15)}",
    ".rail-btn#consejeros-desk-btn.active,.rail-btn[data-open=\"consejeros-desk\"].active{",
      "color:#000;background:#daa520}"
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
        if (seatOk(m)) setBadge(c.id, "BN aplicado", "ok");
        else setBadge(c.id, "sin SSH", "fail");
      } else {
        setBadge(c.id, "sin SSH", "fail");
      }
    });
    if (ok != null && total != null && !matched && total) {
      CHAIRS.forEach(function (c, i) {
        setBadge(c.id, i < ok ? "BN aplicado" : "sin SSH", i < ok ? "ok" : "fail");
      });
    }
  }

  function failBadges() {
    resetBadges("retrato BN · silla no alcanzada", "warn");
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

  function cellHtml(c) {
    return (
      '<div class="cd-cell" data-seat="' + c.id + '">' +
        '<img alt="' + c.chair + " · " + c.name + '">' +
        '<div class="cd-tag"><b>' + c.name + "</b>" +
          '<span>' + c.chair + " · " + c.role + "</span>" +
          '<span class="cd-badge cd-wait" data-badge="' + c.id + '">aplicando</span>' +
        "</div>" +
      "</div>"
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
    ov.setAttribute("aria-label", "Consejeros · retratos BN");
    ov.innerHTML =
      '<button type="button" class="cd-x" data-cd-close title="Cerrar (Esc)" aria-label="Cerrar">✕</button>' +
      '<div class="cd-grid">' + CHAIRS.map(cellHtml).join("") + "</div>";
    document.body.appendChild(ov);
    CHAIRS.forEach(function (c) {
      var img = qs('#cd-desk [data-seat="' + c.id + '"] img');
      if (img) bindImg(img, c);
    });
    ov.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("[data-cd-close]");
      if (t) closeDesk();
    });
    return ov;
  }

  function publish() {
    if (posting) return;
    posting = true;
    var my = ++gen;
    resetBadges("aplicando BN", "wait");
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
    if (!postedOpen) {
      postedOpen = true;
      publish();
    }
  }

  function closeDesk() {
    gen++;
    posting = false;
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
  }

  function maybeHash() {
    var h = (location.hash || "").toLowerCase();
    if (h === "#consejeros" || h === "#consejeros-desk") openDesk();
  }

  window.openConsejerosDesk = openDesk;
  window.closeConsejerosDesk = closeDesk;

  function boot() {
    bind();
    maybeHash();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("hashchange", maybeHash);
})();
