/* Aviso de recarga de la home (norma 25 · #5113c, Woz/Smith 04-10-2026).
 *
 * La mesa del consejo es una pestaña que se deja abierta horas. El 04-10 una
 * pestaña cargada a las 20:02 (r18, mac-hoy.js?v=…5109-mosaico) seguía igual a
 * las 20:43 aunque el servidor ya daba r20 (…5113-anterior): no había service
 * worker ni caché que lo explicara — simplemente esa pestaña nunca se había
 * vuelto a cargar, y la home, a diferencia del resto de la suite (yk-frame.js),
 * no tenía el aviso de la norma 25 que lo dijera.
 *
 * Igual que yk-frame.js: el sello publicado en /version.json se compara consigo
 * mismo en el tiempo (el primer sondeo toma la referencia), así que recargar
 * siempre limpia el aviso y un despliegue sin sellar no da falso positivo.
 * Además, si el <meta admiranext-version> de ESTA página ya no coincide con el
 * sello vivo (deploy.sh estampa ambos desde la misma fuente), también avisa.
 */
(function () {
  if (window.__admiraAvisoVersion) return;
  window.__admiraAvisoVersion = true;

  var meta = document.querySelector('meta[name="admiranext-version"]');
  var SELLO_PAGINA = meta ? String(meta.getAttribute("content") || "").replace(/^AdmiraNeXT\s*/, "").trim() : "";
  var SELLO_AL_CARGAR = null;
  var mostrado = null;

  function hace(iso) {
    var t = Date.parse(iso || "");
    if (!t) return "";
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return "hace un momento";
    if (m < 60) return "hace " + m + " min";
    var h = Math.round(m / 60);
    return "hace " + h + (h === 1 ? " hora" : " horas");
  }

  function aviso(d) {
    var sello = String(d.version).trim();
    if (mostrado === sello) return;
    mostrado = sello;
    var old = document.getElementById("admira-aviso-version");
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = "admira-aviso-version";
    box.setAttribute("role", "status");
    box.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483000;" +
      "background:#02080d;color:#7dffb0;border:2px solid #7dffb0;padding:8px 10px;" +
      "font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;max-width:340px;" +
      "box-shadow:0 0 0 2px #02080d,0 4px 18px rgba(0,0,0,.6);cursor:pointer";
    var b = document.createElement("div");
    b.style.cssText = "font-weight:bold;font-size:13px";
    b.textContent = "⟳ " + sello + " · recargar";
    var s = document.createElement("div");
    s.style.cssText = "opacity:.8;margin-top:3px";
    var quien = d.signature || [d.deployer, d.machine].filter(Boolean).join(" · ");
    s.textContent = [quien ? "publicada por " + quien : "", hace(d.deployedAt),
      "esta pestaña: " + (SELLO_PAGINA || "?")].filter(Boolean).join(" · ");
    box.appendChild(b); box.appendChild(s);
    box.addEventListener("click", function () { window.location.reload(); });
    document.body.appendChild(box);
  }

  function sondea() {
    window.fetch("/version.json?home=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.version) return;
        var sello = String(d.version).trim();
        if (SELLO_AL_CARGAR === null) {
          SELLO_AL_CARGAR = sello;
          // deploy.sh estampa el MISMO sello en el <meta> de todo el HTML y en
          // /version.json: si ya no casan, este HTML es de un despliegue anterior.
          if (SELLO_PAGINA && sello !== SELLO_PAGINA) aviso(d);
          return;
        }
        if (sello !== SELLO_AL_CARGAR) aviso(d);
      })
      .catch(function () {});
  }

  window.__admiraVersionPagina = SELLO_PAGINA;
  sondea();
  window.setInterval(sondea, 120000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) sondea(); });
})();
