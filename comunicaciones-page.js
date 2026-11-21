(function () {
  var API = "/api/consejo/comunicaciones?limite=40";
  var REFRESH_MS = 30000;
  var feedEl = document.getElementById("feed");
  var countEl = document.getElementById("contador");
  var labelEl = document.getElementById("contador-label");
  var updEl = document.getElementById("actualizado");
  var noteEl = document.getElementById("note");

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function t(es, en) {
    return window.AdmiraIdioma && AdmiraIdioma.t ? AdmiraIdioma.t(es, en) : es;
  }
  function etiqueta(total) {
    var n = Number(total) || 0;
    return n === 1 ? t("1 comunicación", "1 communication") : n + " " + t("comunicaciones", "communications");
  }
  var ultimo = null;
  function pintar(data) {
    var total = data && Number.isFinite(data.total) ? data.total : 0;
    countEl.textContent = String(total);
    labelEl.textContent = etiqueta(total).replace(/^\d+\s+/, "");
    updEl.textContent = data && data.actualizado_madrid
      ? t("actualizado", "updated") + " " + data.actualizado_madrid + " Europe/Madrid"
      : "";
    if (data && data.aviso) {
      noteEl.hidden = false;
      noteEl.textContent = data.aviso;
    } else {
      noteEl.hidden = true;
      noteEl.textContent = "";
    }
    var rows = (data && data.comunicaciones) || [];
    if (!rows.length) {
      feedEl.innerHTML = '<p class="empty">' + esc(t(
        "Ahora mismo no hay comunicaciones cruzadas entre coetáneos y leyendas en encargos, sesiones autónomas ni mensajes privados.",
        "There are no cross communications between contemporaries and legends in assignments, autonomous sessions or private messages right now."
      )) + "</p>";
      return;
    }
    feedEl.innerHTML = rows.map(function (row) {
      var who = esc(row.de) + ' <span class="to">→ ' + esc(row.para) + "</span>";
      var dur = String(row.duracion || "");
      var whenDur = dur.indexOf("en curso") === 0 ? dur : t("duró", "lasted") + " " + dur;
      var misionTxt = "";
      if (row.mision_inicio_madrid) {
        var mh = row.mision_inicio_madrid === "sin hora"
          ? t("sin hora", "no time")
          : row.mision_inicio_madrid + " Europe/Madrid";
        misionTxt = '<br><span class="mision-hora">' + esc(t("misión", "mission")) + " " + esc(mh) + "</span>";
      }
      var when = '<span class="when">' + esc(t("empezó", "started")) + " " + esc(row.inicio_madrid) + " Europe/Madrid<br>" + esc(whenDur) + misionTxt + "</span>";
      var src = row.fuente === "sesion" ? t("sesión", "session") : (row.fuente === "mensaje" ? t("mensaje", "message") : t("encargo", "assignment"));
      var texto = row.tema || row.etiqueta || row.id || "";
      var destino = String(row.url || "");
      var href = /^https:\/\/www\.admira\.live\//.test(destino)
        ? '<a href="' + esc(destino) + '">' + esc(texto) + "</a>"
        : esc(texto);
      var otros = (row.participantes || []).filter(function (p) { return p && p !== row.de && p !== row.para; });
      var mas = otros.length ? '<p class="text">' + esc(t("Con", "With")) + " " + otros.map(esc).join(", ") + ".</p>" : "";
      var estClass = row.en_curso ? "tag curso" : "tag est";
      var tags = [
        row.etiqueta ? '<span class="tag">' + esc(row.etiqueta) + "</span>" : "",
        row.estado ? '<span class="' + estClass + '">' + esc(row.estado) + "</span>" : ""
      ].filter(Boolean).join("");
      return '<article class="msg"><header><span class="who">' + who + '</span><span class="src">' + src + "</span>" + when + "</header><p class=\"text\">" + href + "</p>" + mas + (tags ? '<div class="tags">' + tags + "</div>" : "") + "</article>";
    }).join("");
  }
  function cargar() {
    fetch(API, { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (d) { return { r: r, d: d }; }); })
      .then(function (pack) {
        if (pack.r.status === 401) {
          ultimo = null;
          countEl.textContent = "–";
          feedEl.innerHTML = '<p class="empty">' + esc(t(
            "Entra con tu sesión de admira.live para ver las comunicaciones.",
            "Sign in to admira.live to see the communications."
          )) + "</p>";
          return;
        }
        if (!pack.d || pack.d.ok === false) throw new Error((pack.d && pack.d.error) || "sin datos");
        ultimo = pack.d;
        pintar(pack.d);
      })
      .catch(function () {
        noteEl.hidden = false;
        noteEl.textContent = t(
          "No se han podido leer las comunicaciones ahora mismo. Reintento en 30 s.",
          "The communications could not be read just now. Retrying in 30 s."
        );
      });
  }
  window.addEventListener("admira:languagechange", function () { if (ultimo) pintar(ultimo); });
  cargar();
  setInterval(cargar, REFRESH_MS);
})();
