/* Fuente única del submenú de 13rue. Cada pieza nueva = una caja más. */
(function () {
  "use strict";
  var ITEMS = [
    { id: "incubadora",     href: "/13rue/",             n: "1", t: "Incubadora · los agentes" },
    { id: "estrategia",     href: "/13rue/estrategia",    n: "2", t: "Estrategia · la suite" },
    { id: "implementacion", href: "/13rue/implementacion",n: "3", t: "Implementación · el plano" },
    { id: "grafico",        href: "/13rue/grafico",       n: "4", t: "Gráfico · qué hacemos" },
    { id: "videodemo",      href: "/13rue/videodemo",     n: "5", t: "VideoDemo · el vídeo" },
    { id: "implementar",    href: "/13rue/implementar",   n: "6", t: "Implementar · una idea" },
    { id: "cronograma",     href: "/13rue/cronograma",    n: "7", t: "Cronograma · el plan" }
  ];

  function current() {
    var p = (location.pathname || "").replace(/\/+$/, "").replace(/\.html$/, "");
    if (/\/13rue\/estrategia$/.test(p)) return "estrategia";
    if (/\/13rue\/implementacion$/.test(p) || /\/13rue\/timeline$/.test(p)) return "implementacion";
    if (/\/13rue\/grafico$/.test(p)) return "grafico";
    if (/\/13rue\/videodemo$/.test(p)) return "videodemo";
    if (/\/13rue\/implementar$/.test(p)) return "implementar";
    if (/\/13rue\/cronograma$/.test(p)) return "cronograma";
    if (/\/13rue$/.test(p)) return "incubadora";
    return "";
  }

  var here = current();
  var html = ITEMS.map(function (it) {
    var on = it.id === here;
    return '<a href="' + it.href + '"'
      + (on ? ' class="on" aria-current="page"' : "")
      + '><span class="n">' + it.n + '</span><span class="t">' + it.t + "</span></a>";
  }).join("");

  var hosts = document.querySelectorAll("[data-casa-nav]");
  for (var i = 0; i < hosts.length; i++) {
    hosts[i].setAttribute("aria-label", "Las " + ITEMS.length + " puertas");
    hosts[i].innerHTML = html;
  }
})();
