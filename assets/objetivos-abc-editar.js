/* Editor de los 3 objetivos a/b/c de los proyectos de Carlos (hover Y-3).
 * Lee y guarda GET/POST /api/consejo/objetivos-abc. No es el listado Yokup de
 * ideas: esa pestaña sigue igual. El token de escritura es el del Consejo
 * (localStorage.councilToken), el mismo de las tareas. */
(function () {
  "use strict";
  var API = "/api/consejo/objetivos-abc";
  var host, estado, lista, aviso;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function token(force) {
    var t = "";
    try { t = localStorage.getItem("councilToken") || ""; } catch (e) {}
    if (!t || force) {
      var v = (prompt("Token del Consejo (para guardar los objetivos a/b/c):", t) || "").trim();
      if (v) { t = v; try { localStorage.setItem("councilToken", t); } catch (e) {} }
    }
    return t;
  }
  function vacio(v) { return !String(v || "").replace(/\s+/g, " ").trim(); }

  function card(p, i) {
    var el = document.createElement("article");
    el.className = "abc-card";
    el.dataset.id = p.id || "";
    el.innerHTML =
      '<div class="abc-card-head">' +
        '<label>Proyecto <input class="abc-nombre" maxlength="80" value=""></label>' +
        '<span class="abc-titular"></span>' +
        '<label class="abc-activo"><input type="checkbox" class="abc-on"> Activo en el hover</label>' +
        '<span class="abc-ord">#' + (i + 1) + '</span>' +
        '<button type="button" class="abc-up" title="Subir">↑</button>' +
        '<button type="button" class="abc-down" title="Bajar">↓</button>' +
        '<button type="button" class="abc-del" title="Quitar">Quitar</button>' +
      "</div>" +
      '<label>a. <input class="abc-obj" data-k="a" maxlength="280" placeholder="— sin definir —"></label>' +
      '<label>b. <input class="abc-obj" data-k="b" maxlength="280" placeholder="— sin definir —"></label>' +
      '<label>c. <input class="abc-obj" data-k="c" maxlength="280" placeholder="— sin definir —"></label>';
    $(".abc-nombre", el).value = p.nombre || "";
    var tit = el.querySelector(".abc-titular");
    if (tit) tit.textContent = p.titular ? ("Titular: " + p.titular) : "";
    $(".abc-on", el).checked = p.activo !== false;
    var objs = p.objetivos || {};
    el.querySelectorAll(".abc-obj").forEach(function (inp) {
      var k = inp.getAttribute("data-k");
      inp.value = objs[k] || "";
      var f = (p.firmas && p.firmas[k]) || {};
      if (f.autor || f.actualizado) {
        var s = document.createElement("span");
        s.className = "abc-firma";
        var hora = "";
        if (f.actualizado) {
          try { hora = new Date(Number(f.actualizado)).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) {}
        }
        s.textContent = (f.autor || "") + (hora ? " · " + hora + " Europe/Madrid" : "");
        inp.parentNode.appendChild(s);
      }
    });
    $(".abc-up", el).addEventListener("click", function () { mover(el, -1); });
    $(".abc-down", el).addEventListener("click", function () { mover(el, 1); });
    $(".abc-del", el).addEventListener("click", function () { el.remove(); numerar(); });
    return el;
  }
  function numerar() {
    if (!lista) return;
    [].forEach.call(lista.querySelectorAll(".abc-card"), function (el, i) {
      var n = $(".abc-ord", el); if (n) n.textContent = "#" + (i + 1);
    });
  }
  function mover(el, dir) {
    var sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!sib) return;
    if (dir < 0) lista.insertBefore(el, sib); else lista.insertBefore(sib, el);
    numerar();
  }
  function leidos() {
    return [].map.call(lista.querySelectorAll(".abc-card"), function (el, i) {
      var objetivos = { a: "", b: "", c: "" };
      el.querySelectorAll(".abc-obj").forEach(function (inp) { objetivos[inp.getAttribute("data-k")] = inp.value; });
      return {
        id: el.dataset.id,
        nombre: $(".abc-nombre", el).value,
        activo: $(".abc-on", el).checked,
        orden: i + 1,
        objetivos: objetivos,
      };
    }).filter(function (p) { return String(p.nombre || "").trim(); });
  }
  function pintar(doc) {
    lista.innerHTML = "";
    var proyectos = (doc && (doc.todos || doc.proyectos)) || [];
    if (!proyectos.length) {
      var p = document.createElement("p");
      p.className = "abc-vacio";
      p.textContent = "No hay proyectos. Añade uno. Hasta que guardes, el hover usará la plantilla: PortAventuraNeXT (Jobs), AdmiraNeXT (Lucas), Alsea (Walt) y Día a día (Woz), con objetivos «— sin definir —».";
      lista.appendChild(p);
    } else {
      proyectos.forEach(function (proy, i) { lista.appendChild(card(proy, i)); });
    }
    var f = doc && doc.fuente;
    var act = doc && doc.actualizado ? new Date(doc.actualizado).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "";
    estado.textContent = f === "kv" ? ("Guardado en KV" + (act ? " · " + act + " Europe/Madrid" : "")) : (f === "plantilla" ? "Plantilla inicial (aún no hay guardado en KV; los objetivos están sin definir)" : "Fuente: " + (f || "desconocida"));
  }
  function decir(msg, ok) {
    aviso.hidden = !msg;
    aviso.textContent = msg || "";
    aviso.className = "abc-aviso" + (ok ? " ok" : " ko");
  }
  async function cargar() {
    decir("");
    try {
      var r = await fetch(API, { cache: "no-store", headers: { accept: "application/json" } });
      var d = await r.json();
      if (!r.ok || d.ok === false) throw new Error((d && d.error) || ("HTTP " + r.status));
      pintar(d);
    } catch (e) {
      pintar({ proyectos: [], fuente: "error" });
      decir("No pude leer /api/consejo/objetivos-abc. El hover no inventará objetivos.");
    }
  }
  async function guardar() {
    var t = token(false);
    if (!t) { decir("Hace falta el token del Consejo para guardar."); return; }
    var proyectos = leidos();
    decir("Guardando…", true);
    try {
      var r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Council-Token": t, Authorization: "Bearer " + t },
        body: JSON.stringify({ autor: "carlos", proyectos: proyectos }),
      });
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 401) {
        try { localStorage.removeItem("councilToken"); } catch (e) {}
        decir("Token inválido. Vuelve a guardar e introdúcelo de nuevo.");
        return;
      }
      if (!r.ok || d.ok === false) throw new Error(d.error || ("HTTP " + r.status));
      pintar(d);
      decir("Guardado. El hover de Carlos en la mesa lo leerá en vivo (como mucho 20 s).", true);
    } catch (e) {
      decir("No se pudo guardar: " + (e && e.message ? e.message : e));
    }
  }
  function montar() {
    host = document.getElementById("objetivos-abc");
    if (!host) return;
    estado = host.querySelector(".abc-estado");
    lista = host.querySelector(".abc-lista");
    aviso = host.querySelector(".abc-aviso");
    host.querySelector(".abc-add").addEventListener("click", function () {
      var vacioMsg = lista.querySelector(".abc-vacio");
      if (vacioMsg) vacioMsg.remove();
      lista.appendChild(card({ nombre: "", activo: true, objetivos: { a: "", b: "", c: "" } }, lista.querySelectorAll(".abc-card").length));
      numerar();
      var inp = lista.querySelector(".abc-card:last-child .abc-nombre");
      if (inp) inp.focus();
    });
    host.querySelector(".abc-save").addEventListener("click", function () { guardar(); });
    cargar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
