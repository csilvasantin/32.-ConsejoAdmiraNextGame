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
  function etiqueta(total) {
    var n = Number(total) || 0;
    return n === 1 ? "1 comunicación" : n + " comunicaciones";
  }
  function pintar(data) {
    var total = data && Number.isFinite(data.total) ? data.total : 0;
    countEl.textContent = String(total);
    labelEl.textContent = etiqueta(total).replace(/^\d+\s+/, "");
    updEl.textContent = data && data.actualizado_madrid
      ? "actualizado " + data.actualizado_madrid + " Europe/Madrid"
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
      feedEl.innerHTML = '<p class="empty">Ahora mismo no hay comunicaciones cruzadas entre coetáneos y leyendas en encargos, sesiones autónomas ni mensajes privados.</p>';
      return;
    }
    feedEl.innerHTML = rows.map(function (row) {
      var who = esc(row.de) + ' <span class="to">→ ' + esc(row.para) + "</span>";
      var dur = String(row.duracion || "");
      var whenDur = dur.indexOf("en curso") === 0 ? dur : "duró " + dur;
      var when = '<span class="when">empezó ' + esc(row.inicio_madrid) + " Europe/Madrid<br>" + esc(whenDur) + "</span>";
      var src = row.fuente === "sesion" ? "sesión" : (row.fuente === "mensaje" ? "mensaje" : "encargo");
      var texto = row.tema || row.etiqueta || row.id || "";
      var destino = String(row.url || "");
      var href = /^https:\/\/www\.admira\.live\//.test(destino)
        ? '<a href="' + esc(destino) + '">' + esc(texto) + "</a>"
        : esc(texto);
      var otros = (row.participantes || []).filter(function (p) { return p && p !== row.de && p !== row.para; });
      var mas = otros.length ? '<p class="text">Con ' + otros.map(esc).join(", ") + ".</p>" : "";
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
          countEl.textContent = "–";
          feedEl.innerHTML = '<p class="empty">Entra con tu sesión de admira.live para ver las comunicaciones.</p>';
          return;
        }
        if (!pack.d || pack.d.ok === false) throw new Error((pack.d && pack.d.error) || "sin datos");
        pintar(pack.d);
      })
      .catch(function () {
        noteEl.hidden = false;
        noteEl.textContent = "No se han podido leer las comunicaciones ahora mismo. Reintento en 30 s.";
      });
  }
  cargar();
  setInterval(cargar, REFRESH_MS);
})();
