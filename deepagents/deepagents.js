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
  /* Carlos, 21-11-2026 (r229): los cuatro deepagents fijos van primero y sin rótulos de motor (Claude/Codex ya va
   * dentro de cada ficha). Leyendas → MacStudio (Trinity, Neo) · Coetáneos → MacMini (Oráculo, Morfeo).
   * La máquina principal sale SIEMPRE por defecto; solo si el agente vive además en otro equipo de AdmiraNeXT aparece,
   * en el mismo sitio, un desplegable con las otras (nunca elegidas por defecto). */
  var FIJOS = [
    // proyecto = SOLO el de por defecto (respaldo marcado «por defecto»); manda el que el agente trabaja de verdad.
    // lado = monitor físico del agente en su equipo principal (r230: por posición, no por índice).
    { agente: "Trinity", maquina: "MacStudio", proyecto: "admira.studio", lado: "izquierda" },
    { agente: "Neo", maquina: "MacStudio", proyecto: "admira.live", lado: "derecha" },
    { agente: "Oraculo", maquina: "MacMini", proyecto: "", lado: "" },
    { agente: "Morfeo", maquina: "MacMini", proyecto: "", lado: "" }
  ];
  var maqElegida = {}; // agente → máquina elegida en el desplegable (por defecto, la principal)
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

  function claveMaq(m) { return norm(m).replace(/[^a-z0-9]/g, ""); }
  function fijoDe(nombre) { for (var i = 0; i < FIJOS.length; i++) if (FIJOS[i].agente === nombre) return FIJOS[i]; return null; }
  // Equipos donde el agente está desplegado o tiene latido: el principal primero, luego el resto (sin repetir).
  function maquinasDe(t, principal) {
    var vistas = {}, lista = [];
    function poner(m) { var k = claveMaq(m); if (!k || vistas[k]) return; vistas[k] = 1; lista.push(String(m)); }
    poner(principal);
    if (t) {
      (t.maquinas || []).forEach(poner);
      (t.superficies || []).forEach(function (s) { if (s && s.maquina) poner(s.maquina); });
    }
    return lista;
  }
  /* r231 (Carlos, 21-11-2026 20:23) — DOS señales separadas, por máquina elegida:
   * BORDE/ETIQUETA = ¿está ABIERTO en esa máquina?  verde abierto · rojo cerrado · amarillo no se sabe.
   *   Abierto: la app o la sesión aparece en el pulso fresco de ESE Mac (< 3 min, lista de procesos/ventanas que manda
   *   el propio Mac), o un latido vivo de su app de escritorio, o «con Carlos» en él. Cerrado: el pulso de ese Mac está
   *   vivo (otro agente sale en él) y este agente no aparece. Sin pulso de ese Mac → amarillo: un latido viejo NO es «cerrado».
   * PUNTO = actividad.  verde trabajando · rojo abierto sin hacer nada · amarillo no se sabe.
   *   Trabajando: app en uso/al frente en ese Mac, con Carlos, o en la principal encargo en curso, tokens reales,
   *   encargo cerrado hace < 20 min o trabajo firmado en GitHub (rama «trinity/…», «neo/…») hace < 20 min. */
  var RECIENTE_S = 20 * 60;
  var actividadGit = {}; // agente → { ts, accion, repo, rama, pr } (GET /api/deepagents/actividad)
  function pulsoVivoEn(k) {
    var ts = flota.tarjetas || [];
    for (var i = 0; i < ts.length; i++) {
      var ss = ts[i].superficies || [];
      for (var j = 0; j < ss.length; j++) if (ss[j] && ss[j].fuente === "pulso" && claveMaq(ss[j].maquina) === k) return true;
    }
    return false;
  }
  function nombreSup(s) { return s.app || s.runtime || "sesión"; }
  function abiertoEn(t, maq) {
    if (!t) return { estado: "amarillo", porque: "la flota no informa de este agente" };
    var k = claveMaq(maq);
    var sup = (t.superficies || []).filter(function (s) { return s && claveMaq(s.maquina) === k; });
    var pul = sup.filter(function (s) { return s.fuente === "pulso"; });
    if (pul.length) return { estado: "verde", porque: pul.map(nombreSup).join(" + ") + " abierto en " + maq + " (pulso del Mac)" };
    if (sup.length) return { estado: "verde", porque: sup.map(nombreSup).join(" + ") + " abierto en " + maq + " (latido de la app)" };
    if (t.conCarlosEn && claveMaq(t.conCarlosEn) === k) return { estado: "verde", porque: "con Carlos en " + maq };
    if (pulsoVivoEn(k)) return { estado: "rojo", porque: "el pulso de " + maq + " no lo ve abierto" };
    return { estado: "amarillo", porque: "sin pulso de " + maq + ": no se sabe si está abierto" };
  }
  function haceTexto(seg) { return seg < 90 ? "hace " + Math.max(0, Math.round(seg)) + " s" : "hace " + Math.round(seg / 60) + " min"; }
  function actividadEn(t, maq, principal, abierto, nombre) {
    if (!t) return { luz: "amarillo", porque: "sin datos de actividad" };
    var k = claveMaq(maq), esPrincipal = k === claveMaq(principal), ahora = Date.now() / 1000;
    var sup = (t.superficies || []).filter(function (s) { return s && claveMaq(s.maquina) === k; });
    for (var i = 0; i < sup.length; i++) if (sup[i].enUso || sup[i].alFrente) return { luz: "verde", porque: nombreSup(sup[i]) + " en uso en " + maq };
    if (t.conCarlosEn && claveMaq(t.conCarlosEn) === k) return { luz: "verde", porque: "con Carlos en " + maq };
    if (esPrincipal) {
      if (t.enCurso > 0) return { luz: "verde", porque: t.enCurso + " encargo en curso" };
      if (t.estado === "verde") return { luz: "verde", porque: t.porqueColor || t.motivo || "trabajando" };
      var g = actividadGit[nombre] || actividadGit[NOMBRE[nombre] || nombre];
      if (g && isFinite(g.ts) && ahora - g.ts / 1000 < RECIENTE_S) return { luz: "verde", porque: "GitHub: " + (g.accion === "merged" ? "PR fusionado" : g.accion === "opened" ? "PR abierto" : g.accion) + " en " + g.repo + " " + haceTexto(ahora - g.ts / 1000) + " (" + g.rama + ")" };
      if (t.actividad && isFinite(t.actividad.ts) && ahora - t.actividad.ts < RECIENTE_S) return { luz: "verde", porque: (t.actividad.fuente || "actividad") + " " + haceTexto(ahora - t.actividad.ts) };
    }
    if (abierto.estado === "verde") return { luz: "rojo", porque: "abierto en " + maq + " sin actividad ahora" };
    if (abierto.estado === "rojo") return { luz: "rojo", porque: "cerrado en " + maq };
    return { luz: "amarillo", porque: "no se sabe qué hace en " + maq };
  }
  // Pastilla del proyecto → captura en tiempo real de ese agente en su equipo (control remoto de admira.live en «solo ver»).
  function enlaceCaptura(maq, fijo, principal) {
    var u = "/control/?rc=" + encodeURIComponent(claveMaq(maq)) + "&name=" + encodeURIComponent(maq) + "&ver=1";
    if (fijo && fijo.lado && claveMaq(maq) === claveMaq(principal)) u += "&lado=" + fijo.lado;
    return u;
  }
  /* r230 (Carlos, 21-11-2026 20:02: «Neo está con admira.store, no con admira.live»). La pastilla enseña el proyecto en
   * el que el agente trabaja AHORA, con evidencia de /api/flota/trabajando: foco declarado por el agente
   * (POST /api/consejo/foco → fuente «agente»), proyecto de su latido/pulso (fuente «ahora»/«latido»: campo project del
   * latido en bot.yokup.com o proyecto medido en el pulso). Sin dato real → el de por defecto, marcado «por defecto». */
  var FUENTE_REAL = { agente: "declarado por el agente", ahora: "latido / pulso de ahora", latido: "latido", consejero: "declarado" };
  function limpioProy(p) {
    var k = String(p || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    return k && k !== "otros" && k !== "training" ? k : "";
  }
  function nombreProy(k) {
    var partes = k.split(".");
    if (partes.length < 2) return k.charAt(0).toUpperCase() + k.slice(1);
    var ext = partes.slice(1).join(".");
    return partes[0].charAt(0).toUpperCase() + partes[0].slice(1) + "." + (ext === "live" ? ext : ext.charAt(0).toUpperCase() + ext.slice(1));
  }
  function proyectoActual(t, fijo) {
    var f = t && t.foco;
    if (f && !f.defecto && FUENTE_REAL[f.fuente] && limpioProy(f.proyecto)) return { k: limpioProy(f.proyecto), defecto: false, fuente: FUENTE_REAL[f.fuente] };
    if (t && limpioProy(t.proyecto)) return { k: limpioProy(t.proyecto), defecto: false, fuente: "latido" };
    if (fijo && fijo.proyecto) return { k: fijo.proyecto, defecto: true, fuente: "por defecto" };
    return null;
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
    cab.appendChild(img);
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
    led.title = "Actividad: " + { verde: "trabajando", rojo: "sin hacer nada", amarillo: "no se sabe" }[l.luz] + " · " + l.porque;
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

  function cargarActividad() {
    return fetch("/api/deepagents/actividad", { cache: "no-store", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok && d.agentes) { actividadGit = d.agentes; pintarAhora(); } })
      .catch(function () {});
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
  setInterval(function () { if (!document.hidden) cargarActividad(); }, 60000);
  cargar();
  setInterval(function () { if (!document.hidden) cargar(); }, CADA_MS);
})();
