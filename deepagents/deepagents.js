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
  /* r234: el estado de los cuatro deepagents (abierto · actividad · proyecto) sale de /assets/deepagents-estado.js,
   * el MISMO módulo que usa Consumo para «Agentes (trabajando/abiertos)» y «Proyectos». */
  var DA = window.DeepAgentsEstado;
  var FIJOS = DA.FIJOS, NOMBRE = DA.NOMBRE, claveMaq = DA.claveMaq, fijoDe = DA.fijoDe, maquinasDe = DA.maquinasDe;
  var nombreProy = DA.nombreProy, proyectoActual = DA.proyectoActual;
  var actividadGit = {}; // agente → { ts, accion, repo, rama, pr } (GET /api/deepagents/actividad o GitHub directo)
  function abiertoEn(t, maq) { return DA.abiertoEn(t, maq, flota.tarjetas); }
  function actividadEn(t, maq, principal, abierto, nombre) { return DA.actividadEn(t, maq, principal, abierto, nombre, actividadGit); }
  var maqElegida = {}; // agente → máquina elegida en el desplegable (por defecto, la principal)
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
  function tarjetaDe(nombre) { return DA.tarjetaDe(flota.tarjetas, nombre); }
  function ultimoMensaje(nombre) {
    var ms = estado.datos ? estado.datos.mensajes : [];
    for (var i = 0; i < ms.length; i++) { var p = parejaDe(ms[i]); if (p && p.agente === nombre) return ms[i]; }
    return null;
  }
  function dato(dl, k, v) { dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); }

  // Pastilla del proyecto → captura en tiempo real de ese agente en su equipo (control remoto de admira.live en «solo ver»).
  function enlaceCaptura(maq, fijo, principal) {
    var u = "/control/?rc=" + encodeURIComponent(claveMaq(maq)) + "&name=" + encodeURIComponent(maq) + "&ver=1";
    if (fijo && fijo.lado && claveMaq(maq) === claveMaq(principal)) u += "&lado=" + fijo.lado;
    return u;
  }
  function fichaAgente(nombre) {
    var t = tarjetaDe(nombre), visible = NOMBRE[nombre] || nombre, fijo = fijoDe(nombre);
    var principal = (fijo && fijo.maquina) || (t && t.maquina) || "";
    var maqs = maquinasDe(t, principal);
    var sel = maqElegida[nombre] && maqs.some(function (m) { return claveMaq(m) === claveMaq(maqElegida[nombre]); }) ? maqElegida[nombre] : principal;
    var ab = abiertoEn(t, sel), l = actividadEn(t, sel, principal, ab, nombre);
    var art = el("article", "ag ab-" + ab.estado + " act-" + l.luz);
    var cab = el("div", "ag-cab");
    var img = el("img");
    img.alt = ""; img.loading = "lazy";
    img.src = (t && t.retrato && t.retrato.img) || "/avatars/" + norm(nombre) + ".jpg";
    // r233: la foto abre las acciones sobre la app de escritorio del agente en la máquina elegida.
    var bFoto = el("button", "ag-foto");
    bFoto.type = "button";
    bFoto.title = "Acciones sobre la app de " + visible + " en " + sel;
    bFoto.setAttribute("aria-label", bFoto.title);
    bFoto.appendChild(img);
    bFoto.addEventListener("click", function () { abrirAcciones(nombre, visible, sel, ab); });
    cab.appendChild(bFoto);
    var quien = el("div");
    quien.appendChild(el("div", "ag-nom", visible));
    // Bajo el nombre, solo el equipo: texto si vive en uno; desplegable si está en más de uno (principal elegido).
    if (maqs.length > 1) {
      var s = el("select", "ag-maq");
      s.setAttribute("aria-label", "Equipo de " + visible);
      maqs.forEach(function (m) { var o = el("option", "", m); o.value = m; if (claveMaq(m) === claveMaq(sel)) o.selected = true; s.appendChild(o); });
      s.addEventListener("change", function (e) { maqElegida[nombre] = e.target.value; pintarAhora(); });
      quien.appendChild(s);
    } else if (principal) {
      quien.appendChild(el("div", "ag-sub", principal));
    }
    cab.appendChild(quien);
    var led = el("span", "ag-led");
    // r235: abierto = verde (punto incluido); «sin hacer nada» ya solo es «cerrado».
    led.title = "Actividad: " + (l.porAbierto ? "abierto" : { verde: "trabajando", rojo: "cerrado", amarillo: "no se sabe" }[l.luz]) + " · " + l.porque;
    led.setAttribute("aria-label", led.title);
    cab.appendChild(led);
    art.appendChild(cab);

    // Proyecto en el que trabaja ahora (o el de por defecto, marcado); la pastilla abre su captura en tiempo real.
    var pa = proyectoActual(t, fijo);
    if (pa) {
      var pr = el("a", "ag-proy" + (pa.defecto ? " defecto" : ""), nombreProy(pa.k) + (pa.defecto ? " · por defecto" : ""));
      pr.href = enlaceCaptura(sel, fijo, principal);
      pr.target = "_blank"; pr.rel = "noopener";
      pr.title = "https://" + pa.k + " · " + pa.fuente + " · pulsa para ver en tiempo real la pantalla de " + visible + " en " + sel;
      art.appendChild(pr);
    }
    if (!t) { art.appendChild(el("p", "ag-tarea nada", "La flota no informa de este agente ahora.")); return art; }

    var tarea = String(t.tarea || "").trim();
    art.appendChild(el("p", "ag-tarea" + (tarea ? "" : " nada"), tarea || "Sin tarea declarada"));
    art.appendChild(el("p", "ag-abierto", { verde: "Abierto", rojo: "Cerrado", amarillo: "¿Abierto?" }[ab.estado] + " · " + ab.porque));
    art.appendChild(el("p", "ag-motivo", mayus(l.porque)));

    var dl = el("dl", "ag-datos");
    dato(dl, "motor", t.modelo || t.motor || "—");
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

  /* ── r233 · Cerrar / Arrancar desktop app (Carlos, 21-11-2026 20:34) ──
   * Libera un Mac de la app de escritorio para que el agente trabaje por CLI. 1) se REGISTRA la petición en
   * /api/deepagents/app (solo persona con sesión; lista cerrada), 2) la ejecuta el relay de la flota con la acción
   * «deepagentapp» (open -a / quit app de Claude o ChatGPT/Codex, nada más) y la sesión Google del navegador,
   * 3) se registra el resultado. Cerrar pide confirmación. */
  var APP_DE = { Neo: "claude", Morfeo: "claude", Trinity: "codex", Oraculo: "codex" };
  var NOMBRE_APP = { claude: "Claude", codex: "ChatGPT/Codex" };
  var mesh = null;
  function cargarMesh() {
    if (mesh) return Promise.resolve(mesh);
    return new Promise(function (ok, mal) {
      function crear() { try { mesh = window.AdmiraFleetMesh.create({ timeoutMs: 20000, cooldownMs: 15000 }); ok(mesh); } catch (e) { mal(e); } }
      if (window.AdmiraFleetMesh) return crear();
      var sc = document.createElement("script");
      sc.src = "/control/fleet-mesh.js?v=20261110-control-lan-55a36066f39c";
      sc.onload = crear; sc.onerror = function () { mal(new Error("no carga el cliente de la flota")); };
      document.head.appendChild(sc);
    });
  }
  function registrarAccion(datos) {
    return fetch("/api/deepagents/app", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(datos) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "HTTP " + r.status }; }).then(function (d) { d.status = r.status; return d; }); });
  }
  function ejecutar(nombre, maq, accion, salida) {
    var app = APP_DE[nombre], base = { agente: nombre, maquina: maq, accion: accion };
    salida.textContent = "Registrando la orden…";
    return registrarAccion(Object.assign({ fase: "pedida" }, base)).then(function (d) {
      if (!d.ok) { salida.textContent = "No se ejecuta: " + (d.error || "sin permiso"); return; }
      salida.textContent = "Enviando al relay de " + maq + "…";
      return cargarMesh().then(function (m) {
        return m.json("/action", { method: "POST", headers: { "Content-Type": "application/json" }, commandId: window.AdmiraFleetMesh.commandId(),
          body: JSON.stringify({ machine: claveMaq(maq), action: "deepagentapp", arg: accion + ":" + app }) });
      }).then(function (out) {
        var r = out.response, x = out.data || {};
        var desconocida = r.status === 400 && /acci[oó]n desconocida/i.test(String(x.error || ""));
        var ok = r.ok && (x.rc === 0 || x.rc == null) && !x.error;
        var texto = desconocida ? "El relay de " + maq + " todavía no tiene la acción «deepagentapp»: hay que actualizar su FleetControl."
          : r.status === 401 ? "Sin sesión en la flota: entra una vez en admira.live/control y repite."
          : ok ? (String(x.stdout || x.out || "").trim() || "Hecho.") : "Falló: " + (x.error || x.stderr || ("HTTP " + r.status));
        salida.textContent = texto;
        registrarAccion(Object.assign({ fase: "resultado", ok: ok, salida: texto }, base)).then(cargarAcciones);
        setTimeout(cargarFlota, 6000);
      }).catch(function (e) {
        var texto = "No se pudo hablar con la flota: " + ((e && e.message) || e);
        salida.textContent = texto;
        registrarAccion(Object.assign({ fase: "resultado", ok: false, salida: texto }, base)).then(cargarAcciones);
      });
    });
  }
  function abrirAcciones(nombre, visible, maq, ab) {
    var app = APP_DE[nombre]; if (!app) return;
    var viejo = document.getElementById("da-acciones"); if (viejo) viejo.remove();
    var dlg = el("dialog", "da-dlg"); dlg.id = "da-acciones";
    dlg.appendChild(el("h3", "", visible + " · " + maq));
    dlg.appendChild(el("p", "", "App de escritorio: " + NOMBRE_APP[app] + " — " + ({ verde: "abierta", rojo: "cerrada", amarillo: "no se sabe si está abierta" }[ab.estado]) + "."));
    dlg.appendChild(el("p", "nota-dlg", "Cerrarla libera la máquina para que " + visible + " trabaje por CLI. Queda registrado en DeepAgents."));
    var fila = el("div", "dlg-botones"), salida = el("p", "dlg-salida");
    salida.setAttribute("aria-live", "polite");
    function boton(accion, texto) {
      var b = el("button", "dlg-b " + accion, texto); b.type = "button";
      b.addEventListener("click", function () {
        if (accion === "cerrar" && !window.confirm("¿Cerrar " + NOMBRE_APP[app] + " de " + visible + " en " + maq + "? Se perderá lo que no esté guardado en esa app.")) return;
        Array.prototype.forEach.call(fila.querySelectorAll("button.dlg-b"), function (x) { x.disabled = true; });
        ejecutar(nombre, maq, accion, salida);
      });
      fila.appendChild(b);
    }
    if (ab.estado !== "rojo") boton("cerrar", "Cerrar desktop app");
    if (ab.estado !== "verde") boton("abrir", "Arrancar desktop app");
    var cerrar = el("button", "dlg-x", "Cerrar ventana"); cerrar.type = "button";
    cerrar.addEventListener("click", function () { dlg.close(); dlg.remove(); });
    fila.appendChild(cerrar);
    dlg.appendChild(fila); dlg.appendChild(salida);
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function cargarAcciones() {
    return fetch("/api/deepagents/app", { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var caja = $("acciones"), sec = $("sec-acciones");
        if (!caja || !sec) return;
        if (!d || !d.ok) { sec.hidden = true; return; }
        sec.hidden = false; caja.textContent = "";
        if (!d.acciones.length) { caja.appendChild(el("p", "empty", "Ninguna app abierta o cerrada desde aquí todavía.")); return; }
        d.acciones.slice(0, 20).forEach(function (a) {
          var txt = fecha(CORTA, a.hora) + " · " + a.por + " · " + (a.accion === "cerrar" ? "cerrar" : "arrancar") + " " + (NOMBRE_APP[a.app] || a.app) + " de " + a.agente + " en " + a.maquina
            + (a.fase === "resultado" ? " → " + (a.ok ? "OK" : "fallo") + (a.salida ? " (" + a.salida + ")" : "") : " · pedida");
          caja.appendChild(el("p", "accion" + (a.fase === "resultado" && !a.ok ? " mal" : ""), txt));
        });
      }).catch(function () {});
  }

  function pintarAhora() {
    var caja = $("ahora"), nota = $("ahora-nota");
    if (!flota.tarjetas && !flota.error) return;
    caja.textContent = "";
    FIJOS.forEach(function (f) { caja.appendChild(fichaAgente(f.agente)); });
    // Cabecera (Carlos, 21-11-2026): la hora de lectura de los agentes, a la altura del título.
    // Es el «generado» real de la lectura de la flota; sin dato no se inventa ninguna hora.
    $("lectura-hora").textContent = flota.generado ? "agentes leídos a las " + fecha(HORA, flota.generado)
      : (flota.error ? "sin lectura de los agentes" : "");
    var avisos = [];
    if (flota.error) avisos.push(flota.error);
    else if (flota.presencia && flota.presencia !== "ok") avisos.push(flota.presencia === "cache" ? "Presencia de hace unos segundos (Yokup tarda en contestar)." : "La presencia de la flota no responde: los estados pueden ir atrasados.");
    nota.hidden = !avisos.length; nota.textContent = avisos.join(" ");
  }

  // Actividad firmada en GitHub (servidor y, si GitHub le niega la consulta, el navegador): DA.leerActividad.
  function cargarActividad() {
    return DA.leerActividad().then(function (a) { if (a) { actividadGit = a; pintarAhora(); } });
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
  cargarActividad();
  cargarAcciones();
  setInterval(function () { if (!document.hidden) cargarActividad(); }, 60000);
  cargar();
  setInterval(function () { if (!document.hidden) cargar(); }, CADA_MS);
})();
