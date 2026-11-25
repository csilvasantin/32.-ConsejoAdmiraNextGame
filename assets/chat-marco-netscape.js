/* Vista compacta del hilo del Consejo dentro de Netscape Navigator (Admira95). */
(function () {
  try {
    if (new URLSearchParams(location.search).get("marco") !== "netscape") return;
    document.documentElement.classList.add("marco-netscape");
    var s = document.createElement("style");
    s.textContent = "html.marco-netscape #admira-bar,html.marco-netscape .admira-bar,html.marco-netscape #barra-admira{display:none!important}html.marco-netscape header{position:static}";
    document.head.appendChild(s);
  } catch (e) {}
})();
