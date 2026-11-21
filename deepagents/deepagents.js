/* /deepagents — pinta el registro deepagents ↔ consejeros (GET /api/deepagents/registro).
 * La página va detrás de la puerta de servidor: la cookie de la puerta viaja sola. Neo, 21-11-2026. */
(function () {
  "use strict";
  var API = "/api/deepagents/registro";
  var CADA_MS = 60000;
  var $ = function (id) { return document.getElementById(id); };
  var estado = { datos: null, agente: "", consejero: "", q: "", pend: false };
  var HORA = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  var DIA = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  var CORTA = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  function el(tag, cls, texto) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function fecha(f, iso) { var t = Date.parse(iso); return isFinite(t) ? f.format(new Date(t)) : ""; }
  function parejaDe(m) {
    if (m.de_tipo === "agente") return { agente: m.de, consejero: m.para };
    if (m.para_tipo === "agente") return { agente: m.para, consejero: m.de };
    return null;
  }

  function visibles() {
    var d = estado.datos, q = norm(estado.q);
    if (!d) return [];
    return d.mensajes.filter(function (m) {
      var p = parejaDe(m);
      if (estado.agente && (!p || p.agente !== estado.agente)) return false;
      if (estado.consejero && (!p || p.consejero !== estado.consejero)) return false;
      if (estado.pend && m.leido) return false;
      if (q && norm([m.de, m.para, m.maquina, m.maquina_para, m.texto].join(" ")).indexOf(q) < 0) return false;
      return true;
    });
  }

  function pintarCifras() {
    var d = estado.datos, caja = $("cifras");
    caja.textContent = "";
    var pend = d.parejas.reduce(function (n, p) { return n + p.pendientes; }, 0);
    var filas = [
      [d.total_registro, "mensajes registrados", ""],
      [d.parejas.length, "parejas que han hablado", ""],
      [pend, "sin leer", pend ? "aviso" : ""],
      [d.archivo.desde ? fecha(CORTA, d.archivo.desde) : "—", "primer mensaje", "txt"],
    ];
    filas.forEach(function (f) {
      var c = el("div", "cifra" + (f[2] ? " " + f[2] : ""));
      c.appendChild(el("b", "", String(f[0])));
      c.appendChild(el("span", "", f[1]));
      caja.appendChild(c);
    });
  }

  function pintarParejas() {
    var d = estado.datos, caja = $("parejas");
    caja.textContent = "";
    var vistas = {};
    function tarjeta(p, vacia) {
      var activa = estado.agente === p.agente && estado.consejero === p.consejero;
      var b = el(vacia ? "div" : "button", "par" + (vacia ? " vacia" : ""));
      if (!vacia) { b.type = "button"; b.setAttribute("aria-pressed", activa ? "true" : "false"); }
      var q = el("div", "quien");
      q.appendChild(el("span", "a", p.agente));
      q.appendChild(el("span", "fl", "↔"));
      q.appendChild(el("span", "c", p.consejero));
      if (p.supervisor && p.supervisor === p.consejero) q.appendChild(el("span", "sup", "supervisor"));
      b.appendChild(q);
      b.appendChild(el("div", "datos", vacia
        ? "sin mensajes todavía"
        : p.total + " mensajes · " + p.del_agente + " del agente · " + p.del_consejero + " del consejero" + (p.pendientes ? " · " + p.pendientes + " sin leer" : "") + "\núltimo: " + fecha(CORTA, p.ultimo)));
      if (!vacia) b.addEventListener("click", function () {
        if (activa) { estado.agente = ""; estado.consejero = ""; } else { estado.agente = p.agente; estado.consejero = p.consejero; }
        $("f-agente").value = estado.agente; $("f-consejero").value = estado.consejero;
        pintar();
      });
      caja.appendChild(b);
    }
    d.parejas.forEach(function (p) { vistas[p.agente + "|" + p.consejero] = 1; tarjeta(p, false); });
    // Las parejas de supervisión que aún no se han escrito también se ven: el canal existe.
    Object.keys(d.supervisores || {}).forEach(function (a) {
      var c = d.supervisores[a];
      if (!vistas[a + "|" + c]) tarjeta({ agente: a, consejero: c, supervisor: c }, true);
    });
  }

  function opciones(sel, valores, actual) {
    var s = $(sel);
    while (s.options.length > 1) s.remove(1);
    valores.forEach(function (v) { var o = el("option", "", v); o.value = v; s.appendChild(o); });
    s.value = valores.indexOf(actual) >= 0 ? actual : "";
  }

  function pintarFeed() {
    var feed = $("feed"), lista = visibles(), dia = "";
    feed.textContent = "";
    if (!lista.length) {
      feed.appendChild(el("p", "empty", estado.datos.total_registro
        ? "Ningún mensaje con ese filtro."
        : "Todavía no hay mensajes entre deepagents y consejeros. En cuanto uno escriba por el MCP (consejero_mensaje), aparece aquí."));
      return;
    }
    lista.forEach(function (m) {
      var d = fecha(DIA, m.hora);
      if (d !== dia) { dia = d; feed.appendChild(el("p", "dia", d)); }
      var art = el("article", "msg" + (m.de_tipo === "agente" ? " de-agente" : ""));
      art.id = m.id;
      var cab = el("header");
      var who = el("span", "who");
      who.appendChild(el("span", m.de_tipo === "agente" ? "a" : "c", m.de));
      who.appendChild(el("span", "fl", "→"));
      who.appendChild(el("span", m.para_tipo === "agente" ? "a" : "c", m.para));
      cab.appendChild(who);
      var rutas = [m.maquina, m.maquina_para].filter(Boolean).join(" → ");
      if (rutas) cab.appendChild(el("span", "src", rutas));
      var cuando = el("time", "when", fecha(HORA, m.hora));
      cuando.dateTime = m.hora; cuando.title = m.hora;
      cab.appendChild(cuando);
      art.appendChild(cab);
      art.appendChild(el("p", "text", m.texto || ""));
      var tags = el("div", "tags");
      tags.appendChild(el("span", "tag" + (m.leido ? "" : " pend"), m.leido ? "leído" + (m.leido_en ? " " + fecha(CORTA, m.leido_en) : "") : "sin leer"));
      if (m.responde_a) {
        var r = el("a", "tag resp", "responde a " + m.responde_a);
        r.href = "#" + encodeURIComponent(m.responde_a);
        tags.appendChild(r);
      }
      tags.appendChild(el("span", "tag id", m.id));
      art.appendChild(tags);
      feed.appendChild(art);
    });
    resaltar();
  }

  function resaltar() {
    var id = decodeURIComponent((location.hash || "").slice(1));
    var n = id && document.getElementById(id);
    Array.prototype.forEach.call(document.querySelectorAll(".msg.resaltado"), function (x) { x.classList.remove("resaltado"); });
    if (n && n.classList.contains("msg")) { n.classList.add("resaltado"); n.scrollIntoView({ block: "center" }); }
  }

  function pintar() {
    var d = estado.datos;
    if (!d) return;
    pintarAhora();
    pintarCifras();
    pintarParejas();
    var ags = {}, cons = {};
    d.parejas.forEach(function (p) { ags[p.agente] = 1; cons[p.consejero] = 1; });
    opciones("f-agente", Object.keys(ags).sort(), estado.agente);
    opciones("f-consejero", Object.keys(cons).sort(), estado.consejero);
    pintarFeed();
    var nota = $("nota"), avisos = [];
    if (!d.bandeja.ok) avisos.push("La bandeja del MCP no responde ahora: se muestra lo archivado.");
    else if (d.bandeja.fallos.length) avisos.push("Bandeja incompleta en esta lectura (" + d.bandeja.fallos.join(", ") + ").");
    if (d.archivo.almacen !== "kv") avisos.push("Sin almacén: se ve solo lo que la bandeja conserva.");
    if (d.total_registro > d.mensajes.length) avisos.push("Se muestran los " + d.mensajes.length + " más recientes de " + d.total_registro + ".");
    nota.hidden = !avisos.length; nota.textContent = avisos.join(" ");
    $("pie").textContent = "Fuente: bandeja del MCP (consejero_mensaje · consejero_bandeja · consejero_responder) · archivo por mes en admira.live"
      + (d.archivo.meses.length ? " (" + d.archivo.meses.join(", ") + ")" : "") + " · se actualiza cada minuto.";
  }

  /* ── AHORA: qué hace cada deepagent principal (GET /api/flota/trabajando, la misma fuente que la barra de agentes) ── */
  var FLOTA = "/api/flota/trabajando";
  var FLOTA_MS = 20000;
  var GRUPOS = [{ motor: "Claude", agentes: ["Neo", "Morfeo"] }, { motor: "Codex", agentes: ["Trinity", "Oraculo"] }];
  var NOMBRE = { Oraculo: "Oráculo" };
  var flota = { tarjetas: null, error: "", generado: "", presencia: "" };

  function hace(seg) {
    var s = Number(seg);
    if (!isFinite(s) || s < 0) return "—";
    if (s < 90) return "ahora mismo";
    if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    if (s < 172800) return "hace " + Math.round(s / 3600) + " h";
    return "hace " + Math.round(s / 86400) + " días";
  }
  function miles(n) {
    var v = Number(n) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " M";
    if (v >= 1000) return Math.round(v / 1000) + " k";
    return String(v);
  }
  function mayus(t) { t = String(t || ""); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; }
  function tarjetaDe(nombre) {
    var k = norm(nombre), ts = flota.tarjetas || [];
    for (var i = 0; i < ts.length; i++) if (norm(ts[i].agente) === k) return ts[i];
    return null;
  }
  function ultimoMensaje(nombre) {
    var ms = estado.datos ? estado.datos.mensajes : [];
    for (var i = 0; i < ms.length; i++) { var p = parejaDe(ms[i]); if (p && p.agente === nombre) return ms[i]; }
    return null;
  }
  function dato(dl, k, v) { dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); }

  function fichaAgente(nombre) {
    var t = tarjetaDe(nombre), visible = NOMBRE[nombre] || nombre;
    var art = el("article", "ag " + (t && /^(verde|amarillo|rojo)$/.test(t.estado) ? t.estado : "gris"));
    var cab = el("div", "ag-cab");
    var img = el("img");
    img.alt = ""; img.loading = "lazy";
    img.src = (t && t.retrato && t.retrato.img) || "/avatars/" + norm(nombre) + ".jpg";
    cab.appendChild(img);
    var quien = el("div");
    quien.appendChild(el("div", "ag-nom", visible));
    quien.appendChild(el("div", "ag-sub", t ? [t.modelo || t.motor, t.maquina].filter(Boolean).join(" · ") : "sin datos de la flota"));
    cab.appendChild(quien);
    var led = el("span", "ag-led");
    led.title = t ? (t.porqueColor || t.motivo || "") : "";
    cab.appendChild(led);
    art.appendChild(cab);
    if (!t) { art.appendChild(el("p", "ag-tarea nada", "La flota no informa de este agente ahora.")); return art; }

    var tarea = String(t.tarea || "").trim();
    art.appendChild(el("p", "ag-tarea" + (tarea ? "" : " nada"), tarea || "Sin tarea declarada"));
    var proy = (t.foco && t.foco.proyecto) || (t.proyecto && t.proyecto !== "otros" ? t.proyecto : "");
    if (proy) art.appendChild(el("span", "ag-proy", proy));
    art.appendChild(el("p", "ag-motivo", mayus(t.motivo)));

    var dl = el("dl", "ag-datos");
    dato(dl, "encargos", (t.enCurso || 0) + " en curso · " + (t.abiertos || 0) + " abiertos" + (t.bloqueados ? " · " + t.bloqueados + " bloqueados" : ""));
    dato(dl, "tokens", t.sinMedicion ? "sin medición" : miles(t.tokHoy) + " hoy · " + miles(t.tokHora) + "/h");
    dato(dl, "latido", hace(t.haceS));
    if (t.limite && isFinite(t.limite.pct)) dato(dl, "cuota", Math.round(t.limite.pct) + " % usado");
    art.appendChild(dl);

    var m = ultimoMensaje(nombre), sup = estado.datos && estado.datos.supervisores ? estado.datos.supervisores[nombre] : "";
    var b = el("button", "ag-msg");
    b.type = "button";
    if (m) {
      b.appendChild(el("b", "", m.de + " → " + m.para));
      b.appendChild(document.createTextNode(" · " + fecha(CORTA, m.hora) + (m.leido ? "" : " · sin leer") + "\n" + String(m.texto || "").slice(0, 110) + (String(m.texto || "").length > 110 ? "…" : "")));
      b.style.whiteSpace = "pre-line";
    } else {
      b.textContent = sup ? "Sin mensajes con " + sup + " todavía" : "Sin mensajes con consejeros";
    }
    b.addEventListener("click", function () {
      estado.agente = nombre; estado.consejero = "";
      if (estado.datos) pintar();
      $("feed").scrollIntoView({ block: "start", behavior: "smooth" });
    });
    art.appendChild(b);
    return art;
  }

  function pintarAhora() {
    var caja = $("ahora"), nota = $("ahora-nota");
    if (!flota.tarjetas && !flota.error) return;
    caja.textContent = "";
    GRUPOS.forEach(function (g) {
      var sec = el("div", "grupo");
      sec.appendChild(el("h3", "", g.motor));
      g.agentes.forEach(function (a) { sec.appendChild(fichaAgente(a)); });
      caja.appendChild(sec);
    });
    $("ahora-hora").textContent = flota.generado ? "flota leída a las " + fecha(HORA, flota.generado) : "";
    // Cabecera (Carlos, 21-11-2026): la hora de lectura de los agentes, a la altura del título.
    // Es el «generado» real de la lectura de la flota; sin dato no se inventa ninguna hora.
    $("lectura-hora").textContent = flota.generado ? "agentes leídos a las " + fecha(HORA, flota.generado)
      : (flota.error ? "sin lectura de los agentes" : "");
    var avisos = [];
    if (flota.error) avisos.push(flota.error);
    else if (flota.presencia && flota.presencia !== "ok") avisos.push(flota.presencia === "cache" ? "Presencia de hace unos segundos (Yokup tarda en contestar)." : "La presencia de la flota no responde: los estados pueden ir atrasados.");
    nota.hidden = !avisos.length; nota.textContent = avisos.join(" ");
  }

  function cargarFlota() {
    return fetch(FLOTA, { cache: "no-store", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); })
      .then(function (d) {
        if (!d || !Array.isArray(d.tarjetas)) throw new Error("sin tarjetas");
        flota = { tarjetas: d.tarjetas, error: "", generado: d.generado || "", presencia: d.presencia || "" };
        pintarAhora();
      })
      .catch(function () { flota.error = "No se pudo leer el estado de la flota. Se reintentará."; pintarAhora(); });
  }

  function marcar(ok, texto) {
    $("led").className = "led " + (ok ? "ok" : "mal");
    $("estado-txt").textContent = texto;
  }

  function cargar() {
    return fetch(API + "?limite=1000", { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) {
        if (r.status === 401) { marcar(false, "Sin sesión: vuelve a entrar en admira.live"); return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        if (!d.ok) { marcar(false, d.error || "No se pudo leer el registro"); return; }
        estado.datos = d;
        marcar(d.bandeja.ok, (d.bandeja.ok ? "En directo" : "Solo archivo") + " · " + fecha(HORA, d.hora));
        pintar();
      })
      .catch(function () { marcar(false, "No se pudo leer el registro. Se reintentará."); });
  }

  // Texto de DeepAgents contraído por defecto; la flecha lo despliega y lo vuelve a plegar.
  $("da-plegar").addEventListener("click", function () {
    var b = $("da-plegar"), abrir = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", abrir ? "true" : "false");
    b.textContent = abrir ? "▾" : "▸";
    b.setAttribute("aria-label", abrir ? "Ocultar qué es DeepAgents" : "Mostrar qué es DeepAgents");
    $("da-lead").hidden = !abrir;
  });

  $("f-agente").addEventListener("change", function (e) { estado.agente = e.target.value; pintar(); });
  $("f-consejero").addEventListener("change", function (e) { estado.consejero = e.target.value; pintar(); });
  $("f-q").addEventListener("input", function (e) { estado.q = e.target.value; if (estado.datos) pintarFeed(); });
  $("f-pend").addEventListener("change", function (e) { estado.pend = e.target.checked; if (estado.datos) pintarFeed(); });
  window.addEventListener("hashchange", resaltar);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { cargarFlota(); cargar(); } });

  cargarFlota();
  setInterval(function () { if (!document.hidden) cargarFlota(); }, FLOTA_MS);
  cargar();
  setInterval(function () { if (!document.hidden) cargar(); }, CADA_MS);
})();
