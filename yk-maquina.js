/* yk-maquina.js — nombre corto de ORDENADOR, compartido entre páginas.
 *
 * Los nombres crudos (MacBookAirCrema, ThinkStation PGX…) no caben en las columnas.
 * Antes cada página los pintaba enteros o los recortaba a su manera; esto es el módulo
 * único para que /misiones, /equipo, /ticket e /informes den el MISMO corto.
 *
 * Tabla CERRADA (Carlos/Neo, 21-jul-2026): solo se abrevia lo que está aquí. Lo que
 * no se reconoce se devuelve TAL CUAL — nunca se inventa una abreviatura ni se recorta
 * a ciegas. El nombre completo va siempre en el title/tooltip.
 *
 * Se normaliza ANTES de comparar (minúsculas, sin espacios, sin guiones) porque en los
 * datos reales conviven macbookaircrema, MacBookAirCrema y macbookairazul-2.
 *
 *   ykMaquina.short("MacBookAirAzul")   → "MBA Azul"
 *   ykMaquina.short("macbookairazul-2") → "MBA Azul"   (sufijo de instancia -N)
 *   ykMaquina.short("DGX Spark")        → "DGX Spark"  (no está en la tabla: tal cual)
 *   ykMaquina.html("MacMini")           → <span title="MacMini">Mac Mini</span>
 */
(function () {
  "use strict";

  // Claves normalizadas: minúsculas, sin espacios, sin guiones.
  var MAP = {
    "macbookpro16": "MBP 16",
    "macbookpronegro14": "MBP Negro 14",
    "macbookairrosa": "MBA Rosa",
    "macbookairplata": "MBA Plata",
    "macbookaircrema": "MBA Crema",
    "macbookairazul": "MBA Azul",
    "macbookair16plata": "MBA 16 Plata",
    "macbookair16": "MBA 16 Plata",
    "macbookairluna": "MBA Luna",
    "macmini": "Mac Mini",
    "thinkstationpgx": "ThinkStation",
    "asuszenbook": "Zenbook"
  };

  var esc = function (x) {
    return String(x == null ? "" : x).replace(/[<>&"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    });
  };

  // minúsculas, sin espacios (mantiene el guion para poder cortar el sufijo -N).
  function norm(raw) { return String(raw == null ? "" : raw).toLowerCase().replace(/\s+/g, ""); }

  function short(raw) {
    var s = String(raw == null ? "" : raw);
    var base = norm(s);
    var key = base.replace(/-/g, "");                    // ignora guiones para comparar
    if (MAP[key]) return MAP[key];
    // sufijo de instancia separado (macbookairazul-2 → macbookairazul); NO toca
    // macbookpro16, donde el 16 es parte del nombre y no lleva separador.
    var stripped = base.replace(/[-_]\d+$/, "").replace(/-/g, "");
    if (MAP[stripped]) return MAP[stripped];
    return s;                                             // desconocido → tal cual
  }

  // <span title="nombre completo">corto</span>. Si el corto == crudo, no añade tooltip.
  function html(raw, cls) {
    var s = String(raw == null ? "" : raw), sh = short(s);
    var c = cls ? ' class="' + esc(cls) + '"' : "";
    if (sh === s) return "<span" + c + ">" + esc(s) + "</span>";
    return '<span' + c + ' title="' + esc(s) + '">' + esc(sh) + "</span>";
  }

  window.ykMaquina = { short: short, html: html, norm: norm };
})();
