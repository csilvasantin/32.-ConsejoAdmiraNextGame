/* Corta el recorrido de la Rue en misiones y tareas. 1 vender · 2 hacer · 3 emitir. */
(function (root) {
  "use strict";
  var CLAVE = "13rue:cronograma:v1";
  var GRUPOS = [
    {
      n: 1, id: "vender", titulo: "Vender", semana: "Semana 1", pata: "AdmiraNeXT",
      para: "El caso se entiende y se puede contar.",
      ids: ["porteria", "ascensor", "guru-ia", "estudio-uxui"]
    },
    {
      n: 2, id: "hacer", titulo: "Hacer", semana: "Semanas 2–3", pata: "Yokup",
      para: "Hay circuito y prueba. No es un taller de slides.",
      ids: ["imperio-nocode", "sotano-foss", "hacker-gris"]
    },
    {
      n: 3, id: "emitir", titulo: "Emitir", semana: "Semana 4", pata: "admira.tv",
      para: "Llega a sitio real: pantalla, entrega o transacción.",
      ids: ["puerto-deliveries", "pet-tech", "deeptech-biotech", "coliving-nomadas", "cripto-cafe"]
    }
  ];

  function arma(idea, piezas, nodos) {
    var por = {};
    (piezas || []).forEach(function (x) { por[x.id] = x.p || x; });
    return {
      idea: String(idea || "").trim(),
      createdAt: new Date().toISOString(),
      misiones: GRUPOS.map(function (g) {
        return {
          n: g.n, id: g.id, titulo: g.titulo, semana: g.semana, pata: g.pata, para: g.para,
          tareas: g.ids.map(function (id) {
            var n = (nodos && nodos[id]) || {};
            var p = por[id] || {};
            return {
              id: id,
              quien: n.rol || id,
              piso: n.piso || "",
              espacio: n.espacio || "",
              icono: n.icono || "",
              a: p.a || "",
              b: p.b || "",
              c: p.c || "",
              voz: p.voz || ""
            };
          })
        };
      })
    };
  }

  function guarda(doc) {
    try { localStorage.setItem(CLAVE, JSON.stringify(doc)); } catch (_) { /* el sí no puede depender de esto */ }
    return doc;
  }

  function lee() {
    try {
      var raw = localStorage.getItem(CLAVE);
      if (!raw) return null;
      var doc = JSON.parse(raw);
      return doc && doc.idea ? doc : null;
    } catch (_) { return null; }
  }

  root.CronogramaCasa = { CLAVE: CLAVE, GRUPOS: GRUPOS, arma: arma, guarda: guarda, lee: lee };
})(typeof window !== "undefined" ? window : this);
