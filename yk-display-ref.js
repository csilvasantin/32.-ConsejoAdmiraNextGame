/* Referencia humana común. Interno = FLT. Fuera = misión del día:
 * Hoy #N (Madrid, reset 00:00) o «7 sep · #N» en historial.
 * El worker manda display_ref ya resuelto; el fallback no inventa secuencia. */
(function (g) {
  "use strict";
  var MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  function epochMs(value) {
    var n = Number(value || 0);
    return n && n < 4102444800 ? n * 1000 : n;
  }
  function madridDay(ms) {
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone:"Europe/Madrid", day:"2-digit", month:"2-digit", year:"numeric", hourCycle:"h23"
      }).formatToParts(new Date(ms));
      var out = {};
      parts.forEach(function (part) { if (part.type !== "literal") out[part.type] = part.value; });
      return out.year + "-" + out.month + "-" + out.day;
    } catch (e) { return ""; }
  }
  function fallback(createdAt) {
    return "";
  }
  function of(row) {
    var supplied = String(row && row.display_ref || "").trim();
    if (supplied) return supplied;
    if (row && row.display_n != null) {
      var day = String(row.display_day || "");
      var today = madridDay(Date.now());
      if (day && day === today) return "Hoy #" + row.display_n;
      if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
        var p = day.split("-");
        return Number(p[2]) + " " + (MONTHS[Number(p[1]) - 1] || p[1]) + " · #" + row.display_n;
      }
    }
    return fallback(row && row.created_at);
  }
  function screenHtml(row, esc) {
    esc = esc || function (s) { return String(s == null ? "" : s); };
    var alias = of(row || {});
    var flt = String(row && row.id || "").trim();
    var big = alias || flt;
    var gray = flt && big !== flt ? '<span class="flt-id">' + esc(flt) + "</span>" : "";
    return '<span class="mision-dia">' + esc(big) + "</span>" + gray;
  }
  function matchesQuery(row, q) {
    var nrm = function (s) {
      return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    };
    var nq = nrm(q);
    if (!nq) return true;
    var alias = nrm(of(row));
    var id = nrm(row && row.id);
    var hist = nrm(row && row.display_day && row.display_n != null
      ? of({ display_ref: "", display_n: row.display_n, display_day: row.display_day, created_at: 1 })
      : "");
    return alias.indexOf(nq) >= 0 || id.indexOf(nq) >= 0 || ("hoy #" + (row && row.display_n)).indexOf(nq) >= 0
      || nq.replace(" · ", " ").indexOf(alias.replace(" · ", " ")) >= 0 || hist.indexOf(nq) >= 0;
  }
  g.YkDisplayRef = { of:of, fallback:fallback, epochMs:epochMs, screenHtml:screenHtml, matchesQuery:matchesQuery };
})(window);
