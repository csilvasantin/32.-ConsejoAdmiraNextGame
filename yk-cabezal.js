/* ═══════════════════════════════════════════════════════════════════════════
   yk-cabezal.js — el CABEZAL COMPARTIDO de Yokup (Carlos, 2026-07-21)

   Un solo componente para que /misiones y /tareas luzcan y se comporten con
   EL MISMO cabezal, sin divergir: contadores por estado (KPIs) + día del
   tablero · fila de título + buscador · ALTA de misión de flota completa
   (selector de agente/equipo con acordeón, detección por texto, ⚡ prioridad y
   📎 adjuntos). La lógica de alta es la de misiones.html, movida aquí VERBATIM.

   USO:
     const cab = YkCabezal.mount(document.getElementById("cabezal"), {
       worker:  "https://api.yokup.com",
       title:   "Tareas",
       intro:   "<html de la explicación plegable>",   // opcional
       search:  true,                                   // muestra el buscador
       searchPlaceholder: "🔎 Buscar tarea…",
       onState:  filtro => {...},   // KPI pulsado (toggle) → filtro o null
       onSearch: q => {...},        // buscador (debounce 250 ms)
       onDay:    ymd => {...},      // selector de día cambiado
       onCreated: () => {...}       // tras crear una misión de flota
     });
     cab.setCounts({asig,prog,noCon,res,del}); // pinta los contadores
     cab.setActiveFilter("cancelled"|null); // resalta un KPI desde fuera
     cab.getDay(); cab.setDay(ymd);         // día del tablero
     cab.getSearch();

   Depende de window.YkMisiones (yk-misiones.js) y window.YkAdjuntos
   (yk-adjuntos.js), que deben cargarse ANTES.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function mount(container, opts) {
    opts = opts || {};
    const WORKER = opts.worker;
    const taskMode = opts.createKind === "task";
    const showSearch = opts.search !== false;
    const showDay = opts.showDay !== false;
    const $ = id => document.getElementById(id);

    // ── MARCADO DEL CABEZAL ────────────────────────────────────────────────
    const searchBox = showSearch
      ? '<input id="busca" type="search" placeholder="' +
        (opts.searchPlaceholder || "🔎 Buscar misión…") +
        '" title="Buscar en título, id, agente y equipo">'
      : "";
    const introBlock = opts.intro
      ? '<p class="sub" id="intro" hidden>' + opts.intro + "</p>"
      : "";
    container.innerHTML =
      // DATOS GENERALES arriba del todo: estados canónicos + día del tablero.
      '<div class="kpis">' +
        '<button data-f="asignadas" class="kpi a"><b id="kAsig">—</b> pendientes</button>' +
        '<button data-f="in_progress" class="kpi b"><b id="kProg">—</b> en curso</button>' +
        '<button data-f="unconcluded" class="kpi a"><b id="kNoCon">—</b> no concluidas</button>' +
        '<button data-f="resolved" class="kpi c"><b id="kRes">—</b> finalizadas</button>' +
        '<button data-f="cancelled" class="kpi d"><b id="kDel">—</b> eliminadas</button>' +
        (showDay ? '<input type="date" id="selDia" class="kpi kdate" title="Día del tablero — por defecto hoy">' : '') +
        // Conmutador de VISTA (fichas / lista), recuerda la elección por página. (962)
        '<button id="viewTgl" class="kpi kview" title="Cambiar vista: fichas o lista">🗂</button>' +
      '</div>' +
      // Fila de título + buscador (el buscador es lo que más se usa: a la vista).
      '<div class="hrow">' +
        '<h1>' + (opts.title || "Misiones") +
          ' <button id="introTgl" class="tgl" title="desplegar/plegar la explicación" aria-expanded="false">▸</button></h1>' +
        searchBox +
      '</div>' +
      introBlock +
      // ALTA de misión de flota: texto + asignación (Auto = al que esté libre),
      // ⚡ prioridad y 📎 adjuntos. Crea el ENCARGO en el bot-inbox y fuerza sync.
      '<form class="alta" id="alta" autocomplete="off">' +
        '<div class="alta-field">' +
          '<input class="alta-txt" id="altaTxt" type="text" maxlength="4000" placeholder="' +
            (opts.altaPlaceholder || (taskMode ? "Nueva tarea suelta… (Enter para encargarla)" : "Nueva misión para la flota… (Enter para crearla)")) + '">' +
          '<button type="button" class="alta-adj" id="altaAdjBtn" title="Adjuntar imagen — o pega (⌘V, también desde Telegram)" aria-label="Adjuntar imagen">📎</button>' +
        '</div>' +
        '<button type="button" class="alta-agente" id="altaAgentBtn" aria-haspopup="menu" aria-expanded="false" title="Asignar a — pulsa para elegir agente y máquina; en automático va al equipo con menos misiones abiertas">🎯 Auto · el más libre <span class="cv">▾</span></button>' +
        '<label class="alta-pa" id="altaPaWrap" title="Prioridad: entrega la máquina destino a la IA aunque haya un humano delante — la fuerza a «desatendida» durante 2 h para que el agente trabaje sin interrupción.">' +
          '<input type="checkbox" id="altaPa"> ⚡ Prioridad' +
        '</label>' +
        '<input type="file" id="altaAdjFile" accept="image/*" multiple hidden>' +
        '<button class="alta-go" type="submit">＋ Crear ' + (taskMode ? "tarea" : "misión") + '</button>' +
        '<div class="alta-hint" id="altaPaHint" hidden>⚠️ Prioridad: la máquina destino se entrega a la IA <b>aunque haya humanos delante</b> (se fuerza a «desatendida» ~2 h). Úsalo solo cuando la misión no pueda esperar.</div>' +
        '<div class="alta-det" id="altaDetectHint" hidden></div>' +
        '<div class="yk-thumbs" id="altaThumbs" style="display:none"></div>' +
        '<div class="alta-msg" id="altaMsg"></div>' +
      '</form>';

    // ── TÍTULO: explicación PLEGADA por defecto (triangulito) ──────────────
    if (opts.intro) {
      const t = $("introTgl"), p = $("intro");
      if (t && p) t.onclick = () => { const abierto = p.hidden; p.hidden = !abierto;
        t.textContent = abierto ? "▾" : "▸"; t.setAttribute("aria-expanded", String(abierto)); };
    }

    // ── KPIs COMO FILTRO ────────────────────────────────────────────────────
    // Por defecto el módulo gestiona el estado como TOGGLE (pulsar filtra, volver
    // a pulsar quita) y pinta el .on. Con opts.manageState===false NO toca el
    // estado ni el .on: solo reenvía el filtro pulsado a onState y deja que el
    // anfitrión lo gobierne (p.ej. /misiones, que sincroniza su raíl de pestañas).
    const manageState = opts.manageState !== false;
    const KPI_BTNS = [...container.querySelectorAll(".kpi[data-f]")];
    let STATE = null;
    function paintKpi() { KPI_BTNS.forEach(x => x.classList.toggle("on", x.dataset.f === STATE)); }
    KPI_BTNS.forEach(b => b.onclick = () => {
      if (manageState) { STATE = (STATE === b.dataset.f) ? null : b.dataset.f; paintKpi(); }
      if (opts.onState) opts.onState(manageState ? STATE : b.dataset.f);
    });

    // ── CONMUTADOR DE VISTA (fichas / lista) ───────────────────────────────
    // La elección se recuerda POR PÁGINA (Carlos puede querer /tareas en lista y
    // /misiones en fichas). Marca data-yk-view en <html> para que el CSS/render
    // responda, y avisa a la página vía opts.onView. (962)
    const viewTgl = $("viewTgl");
    const VIEW_KEY = "yk_view_" + (location.pathname.replace(/[^a-z0-9]+/gi, "") || "x");
    let curView = (function () { try { return localStorage.getItem(VIEW_KEY) || opts.defaultView || "cards"; } catch (e) { return opts.defaultView || "cards"; } })();
    function setViewUI(v) { document.documentElement.setAttribute("data-yk-view", v); if (viewTgl) { viewTgl.textContent = v === "list" ? "▤" : "🗂"; viewTgl.title = "Vista: " + (v === "list" ? "lista (pulsa para fichas)" : "fichas (pulsa para lista)"); } }
    if (viewTgl) viewTgl.onclick = function () { curView = curView === "list" ? "cards" : "list"; try { localStorage.setItem(VIEW_KEY, curView); } catch (e) {} setViewUI(curView); if (opts.onView) opts.onView(curView); };
    setViewUI(curView);   // aplica la vista guardada al montar (sin re-render: la página ya lee getView())

    // ── DÍA DEL TABLERO ────────────────────────────────────────────────────
    const selDia = $("selDia");
    if (selDia) selDia.onchange = () => { if (opts.onDay) opts.onDay(selDia.value); };

    // ── BUSCADOR con debounce ──────────────────────────────────────────────
    const busca = $("busca");
    if (busca) { let bt; busca.oninput = () => { clearTimeout(bt);
      bt = setTimeout(() => { if (opts.onSearch) opts.onSearch(busca.value.trim()); }, 250); }; }

    // ════════════════════════════════════════════════════════════════════════
    // ALTA de misiones de flota (VERBATIM de misiones.html, Carlos 2026-07-15..21)
    // La misión nace como ENCARGO del bot-inbox (admira-telegram); yokup-rtc la
    // reconcilia a ticket FLT-<id>. El selector desglosa cada equipo en SUS
    // agentes (parejas vistas en /api/presence, 🟢 = latido <15 min).
    // ════════════════════════════════════════════════════════════════════════
    // Dominio propio: LaLiga bloquea workers.dev en horas de fútbol (FLT-1633); workers.dev sigue vivo como respaldo.
    const TG = "https://bot.yokup.com";
    const NAV = "https://navegadores.yokup.com";
    const AGENTES = ["Neo", "Morfeo", "Trinity", "Oráculo", "Smith", "WhiteRabbit"];
    const RT_FIJO = { Neo: "Claude", Morfeo: "Claude", WhiteRabbit: "Claude", "Oráculo": "Codex", Trinity: "Codex", Smith: "Grok" };
    // Solo agentes PRINCIPALES: los sub*/infra* los gobierna su principal y
    // Cypher es el nombre legado de Smith.
    const esPrincipal = p => !/^(sub|infra)/i.test(p) && p !== "Cypher";
    const esc = s => String(s).replace(/[<>&"]/g, "");
    const normM = s => String(s || "").toLowerCase().replace(/[\s·._-]+/g, "");
    const stripAcc = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

    // MAQS: persona -> {canon:{online,norm,raw,runtime,host,inject,updated}}
    let MAQS = {}, SOLOMAQ = {}, CARGA_P = {}, CARGA_PM = {}, CARGA_M = {}, LIBRE = null, UNIV = [], ALTA_SEL = { auto: true };
    let RUNTIME = {};

    function catDe(p) {
      const r = String(RUNTIME[p] || "").toLowerCase();
      if (r.includes("codex")) return "Codex";
      if (r.includes("grok")) return "Grok";
      if (r.includes("claude")) return "Claude";
      return RT_FIJO[p] || "Claude";
    }

    async function radar() {
      try {
        const [pr, ib, nav] = await Promise.all([
          fetch(TG + "/api/presence", { cache: "no-store" }).then(r => r.json()),
          fetch(TG + "/api/public/inbox", { cache: "no-store" }).then(r => r.json()),
          fetch(NAV + "/api/browsers", { cache: "no-store" }).then(r => r.json()).catch(() => ({ browsers: [] }))
        ]);
        const now = Date.now() / 1000;
        MAQS = {}; RUNTIME = {};
        for (const p of (pr.presence || [])) {
          if (p.persona && p.runtime && esPrincipal(p.persona)) RUNTIME[p.persona] = p.runtime;
          if (!p.persona || !p.machine || !esPrincipal(p.persona)) continue;
          const canon = YkMisiones.canonMachine(p.machine);
          (MAQS[p.persona] = MAQS[p.persona] || {});
          const prev = MAQS[p.persona][canon];
          if (!prev || (p.updated || 0) >= (prev.updated || 0)) MAQS[p.persona][canon] = {
            online: (now - (p.updated || 0)) < 900, norm: normM(canon), raw: p.machine,
            runtime: p.runtime || RUNTIME[p.persona] || "", host: p.host || "", inject: p.inject ? 1 : 0, updated: p.updated || 0
          };
        }
        SOLOMAQ = {};
        for (const b of (nav.browsers || [])) {
          const raw = b.machine || "";
          if (!raw || /obsoleto|probe|ident|verify|pendiente|huella|\bno\b/i.test(raw)) continue;
          if ((Date.now() - (b.ts || 0)) > 900000) continue;
          const canon = YkMisiones.canonMachine(raw);
          if (!SOLOMAQ[canon]) SOLOMAQ[canon] = { raw: raw, norm: normM(canon) };
        }
        CARGA_P = {}; CARGA_PM = {}; CARGA_M = {};
        for (const it of (ib.items || [])) {
          if (it.status === "done") continue;
          if (it.target_persona) CARGA_P[it.target_persona] = (CARGA_P[it.target_persona] || 0) + 1;
          if (it.target_machine) {
            const nm = normM(YkMisiones.canonMachine(it.target_machine));
            CARGA_M[nm] = (CARGA_M[nm] || 0) + 1;
            if (it.target_persona) CARGA_PM[it.target_persona + "|" + nm] = (CARGA_PM[it.target_persona + "|" + nm] || 0) + 1;
          }
        }
      } catch (e) { /* sin red: se mantiene el último radar */ }
      UNIV = [...new Set([...AGENTES, ...Object.keys(MAQS)])];
      let best = null;
      const menor = (a, b) => a[0] !== b[0] ? a[0] < b[0] : (a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]);
      for (const p of UNIV) for (const [maq, i] of Object.entries(MAQS[p] || {})) {
        if (!i.online) continue;
        const key = [CARGA_PM[p + "|" + i.norm] || 0, CARGA_P[p] || 0, UNIV.indexOf(p)];
        if (!best || menor(key, best.key)) best = { p, maq, raw: i.raw, key };
      }
      LIBRE = best ? { p: best.p, maq: best.maq, raw: best.raw } : { p: UNIV[0] || "Neo", maq: "", raw: "" };
      renderAltaBtn();
    }

    function renderAltaBtn() {
      const b = $("altaAgentBtn"); if (!b) return;
      const lbl = ALTA_SEL.auto ? "🎯 Auto · el más libre" : (ALTA_SEL.label || ALTA_SEL.persona || "—");
      b.innerHTML = esc(lbl) + ' <span class="cv">▾</span>';
    }
    function esAsignable(p) { return esPrincipal(p) && (AGENTES.includes(p) || /claude|codex|grok/i.test(RUNTIME[p] || "")); }
    // AUTO = el equipo MÁS LIBRE, no una lotería (Carlos: «hay que eliminar el auto
    // aleatorio»). Antes esto sorteaba persona y máquina entre las que estuvieran
    // online: con la flota desigual, el azar mandaba trabajo a quien ya tenía cinco
    // misiones abiertas y dejaba parado al que no tenía ninguna, y dos altas
    // seguidas del mismo encargo podían acabar en máquinas distintas sin motivo.
    // El criterio bueno ya se calculaba al lado para otra cosa: menos misiones en
    // esa máquina, luego menos en total, y el orden del censo para desempatar. Es
    // determinista, así que el mismo estado da siempre la misma respuesta.
    function autoLibre() {
      let best = null;
      const menor = (a, b) => a[0] !== b[0] ? a[0] < b[0] : (a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]);
      for (const p of UNIV.filter(esAsignable)) for (const [, i] of Object.entries(MAQS[p] || {})) {
        if (!i.online) continue;
        const key = [CARGA_PM[p + "|" + i.norm] || 0, CARGA_P[p] || 0, UNIV.indexOf(p)];
        if (!best || menor(key, best.key)) best = { persona: p, machine: i.raw, key };
      }
      if (best) return { persona: best.persona, machine: best.machine };
      // Nadie online: el primero asignable del censo. Sin máquina, como antes, pero
      // sin sortear —el orden del censo es una respuesta, el azar no.
      const prin = UNIV.filter(esAsignable);
      return { persona: prin.length ? prin[0] : "Neo", machine: "" };
    }

    // ── PARSEO DEL TEXTO DEL ALTA: a qué MÁQUINA y AGENTE va según lo escrito ──
    function todasMaquinas() {
      const out = new Map();
      for (const p in MAQS) for (const [canon, i] of Object.entries(MAQS[p])) if (!out.has(canon)) out.set(canon, i.raw);
      for (const [canon, i] of Object.entries(SOLOMAQ)) if (!out.has(canon)) out.set(canon, i.raw || canon);
      return out;
    }
    function aliasesDeCanon(nombre) {
      const set = new Set();
      const add = a => { if (a && a.length >= 4 && !/^\d+$/.test(a)) set.add(a); };
      add(normM(stripAcc(nombre)));
      const segs = stripAcc(nombre)
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/([a-zA-Z])(\d)/g, "$1 $2")
        .replace(/(\d)([a-zA-Z])/g, "$1 $2")
        .split(/[\s._·-]+/).filter(Boolean).map(s => s.toLowerCase());
      const filler = new Set(["mac", "book"]);
      const lineas = new Set(["pro", "air", "mini", "studio", "imac"]);
      const sig = segs.filter(s => !filler.has(s));
      const nums = sig.filter(s => /^\d+$/.test(s));
      const linea = sig.find(s => lineas.has(s)) || "";
      const colores = sig.filter(s => !/^\d+$/.test(s) && !lineas.has(s));
      add(sig.join(""));
      colores.forEach(c => { add(c); nums.forEach(n => add(c + n)); });
      if (linea) { nums.forEach(n => add(linea + n)); colores.forEach(c => add(linea + c)); }
      colores.forEach(c => { if (linea) add("macbook" + linea + c); });
      if (linea) nums.forEach(n => add("macbook" + linea + n));
      if (sig.length === 1) add("mac" + sig[0]);
      return [...set];
    }
    function detectaMaquina(txt) {
      const full = normM(stripAcc(txt));
      const wordSet = new Set(stripAcc(txt).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w => normM(w)));
      let best = null;
      for (const [canon, raw] of todasMaquinas()) {
        const aliases = new Set([...aliasesDeCanon(canon), ...aliasesDeCanon(raw)]);
        for (const a of aliases) {
          const canSub = a.length >= 6 || (/\d/.test(a) && a.length >= 5);
          if (((canSub && full.includes(a)) || wordSet.has(a)) && (!best || a.length > best.len)) best = { raw, canon, len: a.length };
        }
      }
      return best ? { raw: best.raw, canon: best.canon } : null;
    }
    function pickAgenteCat(cat, maqRaw) {
      const cand = UNIV.filter(p => esAsignable(p) && catDe(p) === cat);
      const onlineOn = p => Object.values(MAQS[p] || {}).some(i => i.online && (!maqRaw || i.raw === maqRaw));
      const anyOn = p => Object.values(MAQS[p] || {}).some(i => i.online);
      return cand.find(onlineOn) || cand.find(anyOn) || cand[0] || Object.keys(RT_FIJO).find(p => RT_FIJO[p] === cat) || null;
    }
    function agenteVivoEnMaquina(maqRaw) {
      const canon = YkMisiones.canonMachine(maqRaw);
      const cand = UNIV.filter(p => esAsignable(p) && MAQS[p] && MAQS[p][canon] && MAQS[p][canon].online);
      if (!cand.length) return "";
      const prio = p => { const rt = (RUNTIME[p] || "").toLowerCase(); return /claude/.test(rt) ? 0 : /codex/.test(rt) ? 1 : /grok/.test(rt) ? 2 : 3; };
      return cand.slice().sort((a, b) => prio(a) - prio(b) || (CARGA_P[a] || 0) - (CARGA_P[b] || 0))[0];
    }
    const AG_ALIAS = { neo: "Neo", morfeo: "Morfeo", trinity: "Trinity", oraculo: "Oráculo", smith: "Smith", whiterabbit: "WhiteRabbit" };
    function detectaAgente(txt, maqRaw) {
      const full = normM(stripAcc(txt));
      const words = new Set(stripAcc(txt).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
      for (const [al, p] of Object.entries(AG_ALIAS)) if (words.has(al) || (al === "whiterabbit" && full.includes("whiterabbit"))) return { persona: p };
      if (words.has("grok")) return { persona: "Smith" };
      const cat = words.has("codex") ? "Codex" : (words.has("claude") ? "Claude" : null);
      if (cat) { const p = pickAgenteCat(cat, maqRaw); if (p) return { persona: p }; }
      return null;
    }
    function detectaAlta() {
      const txt = $("altaTxt").value, hint = $("altaDetectHint");
      const maq = detectaMaquina(txt);
      const ag = detectaAgente(txt, maq && maq.raw);
      if (!maq && !ag) {
        if (ALTA_SEL.fromText) { ALTA_SEL = { auto: true }; renderAltaBtn(); }
        if (hint) { hint.hidden = true; hint.textContent = ""; }
        return;
      }
      let persona = ag ? ag.persona : "", machine = maq ? maq.raw : "", canon = maq ? maq.canon : "";
      if (persona && !machine) {
        const on = Object.entries(MAQS[persona] || {}).find(([, i]) => i.online);
        if (on) { machine = on[1].raw; canon = on[0]; }
      }
      const cm = canon || (machine ? YkMisiones.canonMachine(machine) : "");
      const label = persona ? (persona + (cm ? " · " + cm : " · cualquier máquina")) : ("🖥 " + cm);
      const choca = !ALTA_SEL.auto && !ALTA_SEL.fromText && (ALTA_SEL.persona !== persona || ALTA_SEL.machine !== machine);
      ALTA_SEL = { auto: false, persona, machine, label, fromText: true };
      renderAltaBtn();
      if (hint) {
        hint.innerHTML = "🎯 detectado en el texto: <b>" + esc(persona || "cualquier agente") + "</b> · <b>" + esc(cm || "—") + "</b>" +
          (persona && !maq ? " (su máquina online)" : "") + (choca ? " · prevalece sobre el selector" : "");
        hint.hidden = false;
      }
    }
    let detT; $("altaTxt").addEventListener("input", () => { clearTimeout(detT); detT = setTimeout(detectaAlta, 300); });

    // ── POPOVER del selector de agente/equipo (una sola instancia) ──────────
    let PICKER = null;
    function cerrarPicker() {
      if (!PICKER) return;
      PICKER.el.remove();
      document.removeEventListener("click", PICKER.out, true);
      document.removeEventListener("keydown", PICKER.key, true);
      PICKER = null;
    }
    function itHtml(val, label, meta, on) {
      return '<button class="yk-pick-it' + (on ? " on" : "") + (String(label).startsWith("—") ? " none" : "") + '" role="menuitem" data-val="' + esc(val) + '">' +
        (on ? '<span class="ck">✓</span>' : '') + '<span class="lb">' + esc(label) + '</span>' +
        (meta ? '<span class="kg">' + esc(meta) + '</span>' : '') + '</button>';
    }
    function posicionaPicker(el, anchor) {
      const r = anchor.getBoundingClientRect();
      el.style.left = "0px"; el.style.top = "0px"; el.style.visibility = "hidden";
      const w = el.offsetWidth, h = el.offsetHeight;
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      let left = r.left; if (left + w > vw - 8) left = vw - w - 8; if (left < 8) left = 8;
      let top = r.bottom + 6; if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
      el.style.left = left + "px"; el.style.top = top + "px"; el.style.visibility = "";
    }
    function pickerAlta(anchor) {
      cerrarPicker();
      const el = document.createElement("div");
      el.className = "yk-picker"; el.setAttribute("role", "menu"); el.setAttribute("aria-label", "Asignar la nueva misión");
      let html = '<div class="yk-picker-hd">Asignar a</div>';
      html += itHtml("__auto", "🎯 Auto · el más libre", "menos carga", ALTA_SEL.auto);
      const personas = UNIV.filter(esAsignable).sort((a, b) => a.localeCompare(b));
      const equipos = new Map();
      for (const p of personas) for (const [canon, i] of Object.entries(MAQS[p] || {})) {
        if (!equipos.has(canon)) equipos.set(canon, { raw: i.raw, norm: i.norm });
      }
      for (const [canon, i] of Object.entries(SOLOMAQ)) if (!equipos.has(canon)) equipos.set(canon, { raw: i.raw, norm: i.norm });
      const orden = [...equipos.entries()].sort((a, b) => {
        const vivos = c => personas.some(p => MAQS[p] && MAQS[p][c] && MAQS[p][c].online);
        return Number(vivos(b[0])) - Number(vivos(a[0])) || a[0].localeCompare(b[0]);
      });
      html += '<div class="yk-picker-grp">🖥 Equipos y agentes</div>';
      orden.forEach(([canon, maq]) => {
        const vivos = personas.filter(p => MAQS[p] && MAQS[p][canon] && MAQS[p][canon].online);
        const abierto = !ALTA_SEL.auto && ALTA_SEL.machine && YkMisiones.canonMachine(ALTA_SEL.machine) === canon;
        html += '<button type="button" class="yk-pick-agent' + (abierto ? " open" : "") + '"><span class="cv">▸</span><span class="lb">🖥 ' + esc(canon) + '</span><span class="machine-state">' + (vivos.length ? vivos.length + ' operativos' : 'sin agentes') + '</span></button>';
        html += '<div class="yk-pick-machines' + (abierto ? " open" : "") + '">';
        html += itHtml("|" + maq.raw, "· cualquier agente", (CARGA_M[maq.norm] || 0) + " ab.", !ALTA_SEL.auto && !ALTA_SEL.persona && ALTA_SEL.machine === maq.raw);
        {
          const rtsVivos = new Set(vivos.map(p => String((MAQS[p] && MAQS[p][canon] && MAQS[p][canon].runtime) || RUNTIME[p] || RT_FIJO[p] || "").toLowerCase()).filter(rt => rt === "claude" || rt === "codex" || rt === "grok"));
          if (rtsVivos.size >= 2)
            html += itHtml("__trio|" + maq.raw, "🤖 Los 3 CLI · Claude·Codex·Grok", rtsVivos.size + " LLM", ALTA_SEL.trio && ALTA_SEL.machine === maq.raw);
        }
        personas.slice().sort((a, b) => {
          const ao = !!(MAQS[a] && MAQS[a][canon] && MAQS[a][canon].online), bo = !!(MAQS[b] && MAQS[b][canon] && MAQS[b][canon].online);
          return Number(bo) - Number(ao) || a.localeCompare(b);
        }).forEach(p => {
          const info = MAQS[p] && MAQS[p][canon], on = !!(info && info.online);
          const runtime = (info && info.runtime) || RUNTIME[p] || RT_FIJO[p] || "";
          const superficie = info && info.host === "cli" ? "CLI" : info && info.host === "app" ? (info.inject ? "Desktop + CLI" : "Desktop") : (on ? "operativo" : "no arrancado");
          const label = (on ? "🟢 " : "⚪ ") + p + (runtime ? " · " + runtime : "");
          const meta = on ? superficie : "no arrancado";
          const selected = !ALTA_SEL.auto && ALTA_SEL.persona === p && YkMisiones.canonMachine(ALTA_SEL.machine) === canon;
          html += '<button class="yk-pick-it ' + (on ? 'online' : 'offline') + (selected ? ' on' : '') + '" role="menuitem" data-val="' + esc(p + '|' + maq.raw) + '">' +
            (selected ? '<span class="ck">✓</span>' : '') + '<span class="lb">' + esc(label) + '</span><span class="agent-state">' + esc(meta) + '</span></button>';
        });
        html += '</div>';
      });
      el.innerHTML = html;
      document.body.appendChild(el);
      posicionaPicker(el, anchor);
      el.addEventListener("click", ev => {
        const ag = ev.target.closest(".yk-pick-agent");
        if (ag) { ev.stopPropagation();
          const box = ag.nextElementSibling, willOpen = !ag.classList.contains("open");
          el.querySelectorAll(".yk-pick-agent.open").forEach(a => a.classList.remove("open"));
          el.querySelectorAll(".yk-pick-machines.open").forEach(m => m.classList.remove("open"));
          if (willOpen) { ag.classList.add("open"); if (box && box.classList.contains("yk-pick-machines")) box.classList.add("open"); }
          return;
        }
        const it = ev.target.closest("[data-val]"); if (!it) return;
        ev.stopPropagation();
        const v = it.getAttribute("data-val");
        if (v === "__auto") { ALTA_SEL = { auto: true }; }
        else if (v.startsWith("__trio|")) { const machine = v.slice(7);
          ALTA_SEL = { auto: false, trio: true, machine: machine, label: "🤖 Los 3 CLI · " + YkMisiones.canonMachine(machine) }; }
        else { const parts = v.split("|"), persona = parts[0] || "", machine = parts[1] || "";
          const cm = machine ? YkMisiones.canonMachine(machine) : "";
          const label = persona ? (persona + (machine ? " · " + cm : " · cualquier máquina")) : ("🖥 " + cm);
          ALTA_SEL = { auto: false, persona: persona, machine: machine, label: label }; }
        renderAltaBtn(); cerrarPicker();
      });
      const out = ev => { if (!el.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) cerrarPicker(); };
      const key = ev => { if (ev.key === "Escape") { ev.stopPropagation(); cerrarPicker(); } };
      document.addEventListener("click", out, true);
      document.addEventListener("keydown", key, true);
      PICKER = { el, out, key };
      const first = el.querySelector("[data-val],.yk-pick-agent"); if (first) first.focus();
    }
    $("altaAgentBtn").addEventListener("click", e => { e.stopPropagation(); const abierto = PICKER && PICKER.el && PICKER.el.getAttribute("aria-label") === "Asignar la nueva misión"; cerrarPicker(); if (!abierto) pickerAlta(e.currentTarget); });

    // ── ⚡ PRIORIDAD ────────────────────────────────────────────────────────
    const paChk = $("altaPa"), paWrap = $("altaPaWrap"), paHint = $("altaPaHint");
    if (paChk) {
      const syncPa = () => { const on = paChk.checked;
        if (paWrap) { paWrap.classList.toggle("on", on);
          paWrap.style.setProperty("color", on ? "var(--warn)" : ""); paWrap.style.setProperty("border-color", on ? "var(--warn)" : ""); }
        if (paHint) paHint.hidden = !on; };
      paChk.addEventListener("change", syncPa); syncPa();
    }
    // ── 📎 Adjuntos de imagen ──────────────────────────────────────────────
    YkAdjuntos.init(WORKER);
    const altaAdj = YkAdjuntos.attach({ zone: $("alta"), thumbs: $("altaThumbs") });
    $("altaAdjBtn").onclick = () => $("altaAdjFile").click();
    $("altaAdjFile").onchange = e => { Array.from(e.target.files || []).forEach(f => altaAdj.add(f)); e.target.value = ""; };

    function trioDe(maquina) {
      const canon = YkMisiones.canonMachine(maquina), porRt = {};
      for (const p of UNIV.filter(esAsignable)) {
        const info = MAQS[p] && MAQS[p][canon]; if (!info || !info.online) continue;
        const rt = String(info.runtime || RUNTIME[p] || RT_FIJO[p] || "").toLowerCase();
        if ((rt === "claude" || rt === "codex" || rt === "grok") && !porRt[rt])
          porRt[rt] = { persona: p, runtime: info.runtime || rt, host: info.host || "" };
      }
      return ["claude", "codex", "grok"].map(rt => porRt[rt]).filter(Boolean);
    }
    async function crearUnEncargo(persona, maquina, encargo, txtCorto, pa, runtime, host) {
      const textoBot = taskMode ? "[TAREA SUELTA] " + encargo : encargo;
      const projectId = String(typeof opts.getProjectId === "function" ? opts.getProjectId() || "" : "").trim();
      if (!projectId) throw new Error("Selecciona un proyecto antes de crear la misión");
      const r = await fetch(TG + "/api/bot-inbox", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_persona: persona, target_machine: maquina, project_id: projectId, text: textoBot, from: taskMode ? "yokup-tareas" : "yokup-misiones" }) });
      const d = await r.json(); if (!d.ok) throw new Error(d.error || "error " + r.status);
      const syncResponse = await fetch(WORKER + "/fleet/sync", { method: "POST" });
      const sync = await syncResponse.json().catch(() => ({}));
      const rejected = (sync.rejected || []).find(item => String(item.inbox_id) === String(d.id));
      if (!syncResponse.ok || !sync.ok || rejected) throw new Error(rejected && rejected.error || sync.error || "fleet sync rechazó el encargo");
      if (maquina) { try {
        await fetch(WORKER + "/fleet/nudge", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ machine: maquina, persona: persona, missionId: "#" + d.id, priority: pa, runtime: runtime, host: host,
            text: "⚡ Nueva " + (taskMode ? "tarea" : "misión") + " para ti desde yokup.com/" + (taskMode ? "tareas" : "misiones") + ": «" + txtCorto + "». Encargo #" + d.id + " de tu bot-inbox: reclámalo con bash ~/Claude/admira-vault/bot-inbox-claim.sh " + d.id + " y ponte con " + (taskMode ? "ella" : "la misión") + "." }) });
      } catch (e) {} }
      return d;
    }
    function resetPa() {
      if (paChk) { paChk.checked = false; if (paWrap) { paWrap.classList.remove("on"); paWrap.style.setProperty("color", ""); paWrap.style.setProperty("border-color", ""); } if (paHint) paHint.hidden = true; }
    }
    $("alta").onsubmit = async e => {
      e.preventDefault();
      const txt = $("altaTxt").value.trim(); if (!txt) return;
      if (altaAdj.pending() > 0) { $("altaMsg").className = "alta-msg"; $("altaMsg").textContent = "⏳ espera a que suban las imágenes…"; return; }
      clearTimeout(detT); detectaAlta();
      const pa = !!(paChk && paChk.checked);
      const img = altaAdj.bloque();
      const encargo = (pa ? "[PRIORIDAD ABSOLUTA] " + txt : txt) + img;
      const go = container.querySelector(".alta-go") || $("alta").querySelector(".alta-go"), msg = $("altaMsg");
      go.disabled = true; msg.className = "alta-msg"; msg.textContent = "Dando de alta…";
      try {
        if (ALTA_SEL.trio) {
          const maquina = ALTA_SEL.machine, trio = trioDe(maquina);
          if (!trio.length) throw new Error("no hay CLIs operativos en " + YkMisiones.canonMachine(maquina));
          const ids = [];
          for (const a of trio) { await crearUnEncargo(a.persona, maquina, encargo, txt, pa, a.runtime, a.host); ids.push(a.runtime); }
          msg.className = "alta-msg ok"; msg.textContent = "✓ " + trio.length + " " + (taskMode ? "tareas" : "misiones") + " en " + YkMisiones.canonMachine(maquina) + ": " + ids.join(" · ") + (pa ? " ⚡" : "");
          $("altaTxt").value = ""; altaAdj.clear(); detectaAlta(); resetPa();
          radar(); if (opts.onCreated) opts.onCreated(); go.disabled = false; return;
        }
        const pick = ALTA_SEL.auto ? autoLibre() : { persona: ALTA_SEL.persona || "", machine: ALTA_SEL.machine || "" };
        let persona = pick.persona; const maquina = pick.machine;
        if (!persona && maquina) { const v = agenteVivoEnMaquina(maquina); if (v) persona = v; }
        const maqCanon = YkMisiones.canonMachine(maquina);
        const superficie = (persona && maqCanon && MAQS[persona] && MAQS[persona][maqCanon]) || {};
        const runtime = superficie.runtime || RUNTIME[persona] || "";
        const host = superficie.host || "";
        const d = await crearUnEncargo(persona, maquina, encargo, txt, pa, runtime, host);
        const destino = persona ? (persona + (maquina ? " en " + YkMisiones.canonMachine(maquina) : "")) : ("la máquina " + YkMisiones.canonMachine(maquina) + " (quien esté allí)");
        const nimg = altaAdj.urls().length;
        msg.className = "alta-msg ok"; msg.textContent = "✓ " + (taskMode ? "tarea" : "misión") + " #" + d.id + (pa ? " ⚡ PRIORIDAD" : "") + (nimg ? " 🖼×" + nimg : "") + " dada de alta y asignada a " + destino;
        $("altaTxt").value = ""; altaAdj.clear(); detectaAlta(); resetPa();
        radar(); if (opts.onCreated) opts.onCreated();
      } catch (err) {
        msg.className = "alta-msg err"; msg.textContent = "✗ no se pudo crear: " + esc(err && err.message || err);
      }
      go.disabled = false;
    };
    radar(); setInterval(radar, 60000);

    // ── API pública para el anfitrión ──────────────────────────────────────
    return {
      setCounts(c) {
        c = c || {};
        if ($("kAsig")) $("kAsig").textContent = c.asig != null ? c.asig : "—";
        if ($("kProg")) $("kProg").textContent = c.prog != null ? c.prog : "—";
        if ($("kNoCon")) $("kNoCon").textContent = c.noCon != null ? c.noCon : "—";
        if ($("kRes")) $("kRes").textContent = c.res != null ? c.res : "—";
        if ($("kDel")) $("kDel").textContent = c.del != null ? c.del : "—";
      },
      setActiveFilter(f) { STATE = f || null; paintKpi(); },
      getState() { return STATE; },
      getDay() { return selDia ? selDia.value : ""; },
      getView() { return curView; },
      setDay(v) { if (selDia) selDia.value = v || ""; },
      getSearch() { return busca ? busca.value.trim() : ""; },
      refreshRadar: radar
    };
  }

  window.YkCabezal = { mount: mount };
})();
