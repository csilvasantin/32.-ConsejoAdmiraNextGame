/* Barra «¿Quién trabaja?» para /misiones y /informes-flota.
 * La lógica vive en yk-quien.js; aquí sólo se pinta y se recuerda la elección. */
(function (root) {
  "use strict";
  var Q = root.YkQuien;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function chip(person, tipo, selection) {
    var on = selection.tipo === tipo && selection.quien === person.quien;
    return '<button type="button" class="quien-chip" data-chip-tipo="' + esc(tipo) + '" data-quien="' + esc(person.quien) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(person.label) + "</button>";
  }

  function group(label, people, tipo, selection) {
    return '<div class="quien-group"><span class="quien-lab">' + esc(label) + '</span><div class="quien-row">' +
      people.map(function (person) { return chip(person, tipo, selection); }).join("") + "</div></div>";
  }

  function bar(selection, extras) {
    var tabs = [["todos", "Todos"], ["consejeros", "Consejeros"], ["deepagents", "DeepAgents"]].map(function (pair) {
      var on = selection.tipo === pair[0];
      return '<button type="button" class="quien-tab" role="tab" data-tipo="' + pair[0] + '" aria-selected="' + (on ? "true" : "false") + '">' + pair[1] + "</button>";
    }).join("");
    var groups = "";
    if (selection.tipo === "consejeros") {
      groups = group("Leyendas", Q.LEYENDAS, "consejeros", selection) + group("Coetáneos", Q.COETANEOS, "consejeros", selection);
    } else if (selection.tipo === "deepagents") {
      groups = group("DeepAgents", Q.deepagentChips(extras), "deepagents", selection);
    }
    return '<div class="quien-h">¿Quién trabaja?</div><div class="quien-tabs" role="tablist">' + tabs + "</div>" + groups;
  }

  function panelHTML(model, page) {
    if (!model || !model.selection || !model.selection.quien) return "";
    var query = Q.applyQuery("", model.selection);
    var other = (page === "informes" ? "/misiones" : "/informes-flota") + query;
    var otherLabel = page === "informes" ? "Ver sus misiones" : "Ver sus informes";
    var stats = Q.STATUS_IDS.map(function (id) {
      return '<span class="quien-stat">' + esc(Q.STATUS_LABEL[id]) + " <b>" + (model.counts[id] || 0) + "</b></span>";
    }).join("");
    var sub = model.full || "";
    if (model.deepagent) sub = (sub ? sub + " · " : "") + "también el trabajo de " + model.deepagent.label;
    function rows(items, empty) {
      if (!items.length) return '<p class="quien-empty">' + empty + "</p>";
      return items.map(function (item) {
        return '<div class="quien-item">' +
          (item.statusLabel ? '<span class="quien-stat">' + esc(item.statusLabel) + "</span>" : "") +
          '<span class="quien-txt">' + esc(item.titulo) + "</span>" +
          (item.via ? '<span class="quien-via">' + esc(item.via) + "</span>" : "") +
          (item.hace ? '<span class="quien-when">' + esc(item.hace) + "</span>" : "") +
          "</div>";
      }).join("");
    }
    return '<p class="quien-title">' + esc(model.title) + "</p>" +
      (sub ? '<p class="quien-sub">' + esc(sub) + "</p>" : "") +
      '<div class="quien-stats" aria-label="Estados">' + stats + "</div>" +
      '<p class="quien-ultima">' + esc(model.ultima) + "</p>" +
      '<div class="quien-block"><h3>Encargos y misiones</h3>' + rows(model.misiones, "Sin encargos ni misiones de esta persona.") + "</div>" +
      '<div class="quien-block"><h3>Informes</h3>' + rows(model.informes, "Sin informes recientes de esta persona.") + "</div>" +
      '<a class="quien-more" href="' + esc(other) + '">' + otherLabel + " →</a>";
  }

  function mount(el, opts) {
    opts = opts || {};
    var store = opts.storage || (root.localStorage || null);
    var loc = opts.location || root.location;
    var hist = opts.history || root.history;
    var extras = [];
    var selection = Q.readSelection(loc.search || "", store && store.getItem(Q.STORAGE_KEY), extras);
    var panelEl = null;
    el.setAttribute("aria-label", "¿Quién trabaja?");

    function persist(fire) {
      var query = Q.applyQuery(loc.search || "", selection);
      if (hist && hist.replaceState) hist.replaceState(hist.state, "", loc.pathname + query + (loc.hash || ""));
      try { if (store) store.setItem(Q.STORAGE_KEY, JSON.stringify(selection)); } catch (e) {}
      render();
      if (fire && opts.onChange) opts.onChange(selection);
    }

    function render() {
      var keep = selection.quien && panelEl ? panelEl.innerHTML : "";
      var hidden = !selection.quien || !panelEl || panelEl.hidden;
      el.innerHTML = bar(selection, extras) + '<div class="quien-panel" id="quienPanel"' + (hidden ? " hidden" : "") + "></div>";
      panelEl = el.querySelector(".quien-panel");
      if (keep) panelEl.innerHTML = keep;
    }

    el.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var tab = target.closest("[data-tipo]");
      if (tab && el.contains(tab)) {
        selection = Q.normalizeSelection({ tipo: tab.getAttribute("data-tipo"), quien: "" }, extras);
        persist(true);
        return;
      }
      var button = target.closest("[data-quien]");
      if (!button || !el.contains(button)) return;
      var tipo = button.getAttribute("data-chip-tipo");
      var quien = button.getAttribute("data-quien");
      if (selection.tipo === tipo && selection.quien === quien) quien = "";
      selection = Q.normalizeSelection({ tipo: tipo, quien: quien }, extras);
      persist(true);
    });

    render();
    return {
      get: function () { return { tipo: selection.tipo, quien: selection.quien }; },
      extras: function () { return extras.slice(); },
      setSeen: function (names) {
        var prev = extras.join("\n");
        extras = (names || []).slice();
        selection = Q.normalizeSelection(selection, extras);
        render();
        if (prev !== extras.join("\n") && selection.tipo === "deepagents" && !selection.quien && opts.onChange) opts.onChange(selection);
      },
      panel: function (model, page) {
        if (!panelEl || !panelEl.isConnected) panelEl = el.querySelector(".quien-panel");
        if (!panelEl) return;
        var html = panelHTML(model, page || "misiones");
        panelEl.hidden = !html;
        panelEl.innerHTML = html;
      }
    };
  }

  root.YkQuienUI = { mount: mount, panelHTML: panelHTML };
})(typeof window !== "undefined" ? window : globalThis);
