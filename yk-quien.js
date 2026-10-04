/* yk-quien.js — «¿Quién trabaja?»
 *
 * Censo y emparejado compartidos por /misiones y /informes-flota.
 * Sale de MATRIX_LINKS y COETANEOS de app.js (coetáneo → deepagent) para no
 * copiar la tabla en las dos páginas. La home sigue con su copia: este módulo
 * no la toca.
 *
 * Script clásico (globalThis.YkQuien) y también importable desde node:test.
 */
(function (root) {
  "use strict";

  var LEYENDAS = [
    { id: "wozniak", quien: "Wozniak", label: "Wozniak", full: "Steve Wozniak", grupo: "leyendas", deepagent: null },
    { id: "jobs", quien: "Jobs", label: "Jobs", full: "Steve Jobs", grupo: "leyendas", deepagent: null },
    { id: "lucas", quien: "Lucas", label: "Lucas", full: "George Lucas", grupo: "leyendas", deepagent: null },
    { id: "disney", quien: "Disney", label: "Disney", full: "Walt Disney", grupo: "leyendas", deepagent: null }
  ];
  var COETANEOS = [
    { id: "musk", quien: "Musk", label: "Musk", full: "Elon Musk", grupo: "coetaneos", deepagent: "merovingio" },
    { id: "huang", quien: "Huang", label: "Huang", full: "Jensen Huang", grupo: "coetaneos", deepagent: "cypher" },
    { id: "shotwell", quien: "Shotwell", label: "Shotwell", full: "Gwynne Shotwell", grupo: "coetaneos", deepagent: "trinity" },
    { id: "porat", quien: "Porat", label: "Porat", full: "Ruth Porat", grupo: "coetaneos", deepagent: "oraculo" },
    { id: "lasseter", quien: "Lasseter", label: "Lasseter", full: "John Lasseter", grupo: "coetaneos", deepagent: "mouse" },
    { id: "ive", quien: "Ive", label: "Ive", full: "Jony Ive", grupo: "coetaneos", deepagent: "arquitecto" },
    { id: "ratti", quien: "Ratti", label: "Ratti", full: "Carlos Ratti", grupo: "coetaneos", deepagent: "link" },
    { id: "reynolds", quien: "Reynolds", label: "Reynolds", full: "Ryan Reynolds", grupo: "coetaneos", deepagent: null }
  ];
  var DEEPAGENTS = [
    { id: "neo", quien: "Neo", label: "Neo" },
    { id: "trinity", quien: "Trinity", label: "Trinity" },
    { id: "morfeo", quien: "Morfeo", label: "Morfeo" },
    { id: "oraculo", quien: "Oráculo", label: "Oráculo" },
    { id: "smith", quien: "Smith", label: "Smith" },
    { id: "cypher", quien: "Cypher", label: "Cypher" },
    { id: "merovingio", quien: "Merovingio", label: "Merovingio" },
    { id: "niobe", quien: "Niobe", label: "Niobe" },
    { id: "link", quien: "Link", label: "Link" },
    { id: "mouse", quien: "Mouse", label: "Mouse" },
    { id: "arquitecto", quien: "Arquitecto", label: "Arquitecto" },
    { id: "switch", quien: "Switch", label: "Switch" }
  ];

  var CONSEJEROS = LEYENDAS.concat(COETANEOS);
  var DEEP_BY_ID = {};
  DEEPAGENTS.forEach(function (d) { DEEP_BY_ID[d.id] = d; });
  var CONSEJERO_BY_ID = {};
  CONSEJEROS.forEach(function (c) { CONSEJERO_BY_ID[c.id] = c; });

  /* Apellidos de máquina, del más largo al más corto, para NeoMBP14 / MorfeoMacMini. */
  var MACHINE_SUFFIXES = [
    "macbookpronegro14", "macbookpro14negro", "macbookair16plata", "macbookpro16",
    "macbookpro14", "macbookair16", "macbookairazul", "macbookairrosa", "macbookaircrema",
    "macbookairplata", "grokbotbox", "cursorcloud", "macmini", "mbp14", "mbp16", "mba16",
    "mbaazul", "mbarosa", "mbacrema", "mbaplata", "grokbot", "zenbook", "dgxspark",
    "thinkstationpgx", "sinmaq"
  ].sort(function (a, b) { return b.length - a.length; });

  var STOP = {
    statusweb: 1, status: 1, web: 1, flota: 1, todos: 1, macmini: 1, grokbot: 1,
    grokbotbox: 1, cursorcloud: 1, mbp14: 1, mbp16: 1, sinmaq: 1, pending: 1,
    machine: 1, maquina: 1
  };

  var ALIAS = {};
  function alias(name, id) { ALIAS[fold(name)] = id; }
  CONSEJEROS.forEach(function (c) {
    alias(c.id, c.id); alias(c.quien, c.id); alias(c.full, c.id);
  });
  DEEPAGENTS.forEach(function (d) { alias(d.id, d.id); alias(d.quien, d.id); alias(d.label, d.id); });
  alias("Woz", "wozniak");
  alias("SteveJobs", "jobs");
  alias("WaltDisney", "disney");
  alias("GeorgeLucas", "lucas");
  alias("ElonMusk", "musk");
  alias("JensenHuang", "huang");
  alias("GwynneShotwell", "shotwell");
  alias("RuthPorat", "porat");
  alias("JohnLasseter", "lasseter");
  alias("JonyIve", "ive");
  alias("CarlosRatti", "ratti");
  alias("RyanReynolds", "reynolds");
  alias("Oraculo", "oraculo");
  alias("Oracle", "oraculo");
  alias("Morpheus", "morfeo");
  alias("El Merovingio", "merovingio");
  alias("Agent Smith", "smith");
  alias("Agente Smith", "smith");
  alias("White Rabbit", "whiterabbit");
  alias("WhiteRabbit", "whiterabbit");
  alias("Perséfone", "persefone");
  alias("Persefone", "persefone");
  alias("Persephone", "persefone");
  alias("Serafín", "seraph");
  alias("Serafin", "seraph");
  alias("Seraph", "seraph");

  var STATUS_IDS = ["pendiente", "ack", "en_curso", "bloqueada", "hecha"];
  var STATUS_LABEL = {
    pendiente: "pendiente", ack: "ack", en_curso: "en curso", bloqueada: "bloqueada", hecha: "hecha"
  };
  var STORAGE_KEY = "yk-quien";

  function fold(value) {
    return String(value == null ? "" : value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function segments(raw) {
    var text = String(raw == null ? "" : raw).trim();
    if (!text) return [];
    var parts = text.split(/\s*[·•|]\s*/).map(function (p) { return p.trim(); }).filter(Boolean);
    return parts.length ? parts : [text];
  }

  function stripMachine(key) {
    var i, suffix;
    for (i = 0; i < MACHINE_SUFFIXES.length; i++) {
      suffix = MACHINE_SUFFIXES[i];
      if (key.length > suffix.length && key.slice(-suffix.length) === suffix) return key.slice(0, -suffix.length);
    }
    return key;
  }

  function bare(raw) {
    var key = fold(raw);
    if (!key) return "";
    if (key.indexOf("infra") === 0) key = key.slice(5);
    else if (key.indexOf("sub") === 0) key = key.slice(3);
    if (key.indexOf("agente") === 0) key = key.slice(6);
    return key;
  }

  /* Id canónico de UNA pieza (sin partir por «·»). Null si no es una persona conocida
     ni un apellido de máquina que deje un alias. ArquitectoCursorCloud no es el
     Arquitecto de Jony: es el orquestador de Cursor. */
  function esArquitectoCursor(key) {
    return key === "arquitectocursorcloud" ||
      (key.slice(-11) === "cursorcloud" && key.indexOf("arquitecto") >= 0 && key.indexOf("arquitecto") < key.length - 11);
  }

  function canonToken(raw) {
    var key = bare(raw);
    if (!key) return null;
    if (esArquitectoCursor(key)) return "arquitectocursorcloud";
    if (ALIAS[key]) return ALIAS[key];
    var stripped = stripMachine(key);
    if (stripped !== key && ALIAS[stripped]) return ALIAS[stripped];
    return null;
  }

  function canon(raw) {
    var parts = segments(raw);
    var ordered = parts.length > 1 ? parts.slice().reverse() : parts;
    var i, id;
    for (i = 0; i < ordered.length; i++) {
      id = canonToken(ordered[i]);
      if (id) return id;
    }
    return null;
  }

  /* Persona vista en datos o presencia que no está en el censo estático. */
  function observeId(raw) {
    var known = canon(raw);
    if (known) return known;
    var parts = segments(raw);
    var key = bare(parts.length ? parts[parts.length - 1] : "");
    if (!key) return null;
    if (esArquitectoCursor(key)) return "arquitectocursorcloud";
    key = stripMachine(key);
    if (!key || key.length < 3 || STOP[key] || !/^[a-z]/.test(key)) return null;
    return key;
  }

  function pretty(raw, id) {
    if (id === "arquitectocursorcloud") return "ArquitectoCursorCloud";
    if (DEEP_BY_ID[id]) return DEEP_BY_ID[id].label;
    if (CONSEJERO_BY_ID[id]) return CONSEJERO_BY_ID[id].quien;
    var parts = segments(raw);
    var token = String(parts.length ? parts[parts.length - 1] : raw || "").trim();
    var cut = token.replace(/(GrokBotBox|GrokBot|CursorCloud|MacMini|MBP14|MBP16|MBA16|MacBookProNegro14)$/i, "");
    if (cut && fold(cut) === id) return cut;
    return token || id;
  }

  function deepagentChips(seen) {
    var chips = DEEPAGENTS.map(function (d) { return { id: d.id, quien: d.quien, label: d.label }; });
    var have = {};
    chips.forEach(function (c) { have[c.id] = 1; });
    var extras = [];
    (seen || []).forEach(function (name) {
      var id = observeId(name);
      if (!id || have[id] || CONSEJERO_BY_ID[id]) return;
      have[id] = 1;
      var label = pretty(name, id);
      extras.push({ id: id, quien: label, label: label });
    });
    extras.sort(function (a, b) { return a.label.localeCompare(b.label, "es"); });
    return chips.concat(extras);
  }

  function consejero(quien) {
    var id = canon(quien);
    if (id && CONSEJERO_BY_ID[id]) return CONSEJERO_BY_ID[id];
    var folded = fold(quien);
    for (var i = 0; i < CONSEJEROS.length; i++) {
      if (fold(CONSEJEROS[i].quien) === folded || fold(CONSEJEROS[i].full) === folded) return CONSEJEROS[i];
    }
    return null;
  }

  function deepagentOf(quien) {
    var person = consejero(quien);
    if (!person || !person.deepagent) return null;
    var deep = DEEP_BY_ID[person.deepagent];
    return deep ? { id: deep.id, quien: deep.quien, label: deep.label } : { id: person.deepagent, quien: person.deepagent, label: person.deepagent };
  }

  function displayQuien(raw, tipo, extras) {
    if (!raw || tipo === "todos") return "";
    if (tipo === "consejeros") {
      var person = consejero(raw);
      return person ? person.quien : "";
    }
    var id = observeId(raw);
    if (!id || CONSEJERO_BY_ID[id]) return "";
    var chips = deepagentChips((extras || []).concat([raw]));
    for (var i = 0; i < chips.length; i++) if (chips[i].id === id) return chips[i].quien;
    return "";
  }

  function normalizeSelection(input, extras) {
    var tipo = input && (input.tipo === "consejeros" || input.tipo === "deepagents") ? input.tipo : "todos";
    var quien = tipo === "todos" ? "" : displayQuien(input && input.quien, tipo, extras);
    return { tipo: tipo, quien: quien };
  }

  function readSelection(search, stored, extras) {
    var params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    if ([...params.keys()].indexOf("tipo") >= 0 || [...params.keys()].indexOf("quien") >= 0) {
      return normalizeSelection({ tipo: params.get("tipo"), quien: params.get("quien") }, extras);
    }
    var parsed = null;
    if (stored) { try { parsed = JSON.parse(stored); } catch (e) { parsed = null; } }
    return normalizeSelection(parsed || {}, extras);
  }

  function applyQuery(search, selection) {
    var current = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    var rest = [];
    current.forEach(function (value, key) {
      if (key !== "quien" && key !== "tipo") rest.push([key, value]);
    });
    var out = new URLSearchParams();
    var tipo = selection && selection.tipo;
    if (tipo === "consejeros" || tipo === "deepagents") {
      if (selection.quien) out.set("quien", selection.quien);
      out.set("tipo", tipo);
    }
    rest.forEach(function (pair) { out.append(pair[0], pair[1]); });
    var text = out.toString();
    return text ? "?" + text : "";
  }

  function matchIds(selection, extras) {
    if (!selection || selection.tipo === "todos") return null;
    var ids = new Set();
    if (selection.tipo === "consejeros") {
      var people = selection.quien ? [consejero(selection.quien)].filter(Boolean) : CONSEJEROS;
      people.forEach(function (person) {
        ids.add(person.id);
        if (person.deepagent) ids.add(person.deepagent);
      });
      return ids;
    }
    if (selection.quien) {
      var one = observeId(selection.quien);
      if (one && !CONSEJERO_BY_ID[one]) ids.add(one);
      return ids;
    }
    deepagentChips(extras).forEach(function (chip) { ids.add(chip.id); });
    return ids;
  }

  function stringsOf(item, extra) {
    var out = [];
    function push(value) { if (value != null && value !== "") out.push(String(value)); }
    if (!item || typeof item !== "object") return out;
    push(item.assignee);
    push(item.target_persona);
    push(item.executor);
    push(item._executor);
    push(item.agent_identity);
    push(item.owner);
    push(item.from_name);
    push(item.persona);
    var agents = item._agents;
    if (Array.isArray(agents)) agents.forEach(push);
    if (Array.isArray(extra)) extra.forEach(push);
    else push(extra);
    return out;
  }

  function itemMatches(item, selection, options) {
    var ids = matchIds(selection, options && options.extras);
    if (!ids) return true;
    if (!ids.size) return false;
    return stringsOf(item, options && options.agents).some(function (value) {
      var id = canon(value) || observeId(value);
      return id && ids.has(id);
    });
  }

  function viaLabel(item, selection, options) {
    if (!selection || selection.tipo !== "consejeros" || !selection.quien) return "";
    var person = consejero(selection.quien);
    if (!person || !person.deepagent) return "";
    var ids = stringsOf(item, options && options.agents).map(function (value) {
      return canon(value) || observeId(value);
    }).filter(Boolean);
    if (ids.indexOf(person.id) >= 0) return "";
    if (ids.indexOf(person.deepagent) < 0) return "";
    var deep = DEEP_BY_ID[person.deepagent];
    return "vía " + (deep ? deep.label : person.deepagent);
  }

  function bucket(item) {
    var status = String(item && (item.status || item.visible_state) || "").toLowerCase();
    if (status === "ack") return "ack";
    if (status === "in_progress" || status === "unconcluded" || status === "encurso") return "en_curso";
    if (status === "blocked" || status === "bloqueada") return "bloqueada";
    if (status === "done" || status === "resolved" || status === "hecha" || status === "closed") return "hecha";
    if (status === "pending" || status === "open" || status === "unassigned" || status === "assigned" || status === "pendiente") return "pendiente";
    return "";
  }

  function toMs(value) {
    var n = Number(value) || 0;
    if (!n) return 0;
    return n > 4102444800 ? n : n * 1000;
  }

  function recencyMs(item) {
    if (!item) return 0;
    return Math.max(toMs(item.ts), toMs(item.updated_at), toMs(item.created_at), toMs(item.done_at), toMs(item.resolved_at), toMs(item.ack_at));
  }

  function hace(ms, now) {
    var seconds = Math.max(0, Math.floor(((now || Date.now()) - ms) / 1000));
    if (seconds < 60) return "hace " + seconds + " s";
    if (seconds < 3600) return "hace " + Math.round(seconds / 60) + " min";
    if (seconds < 86400) return "hace " + Math.round(seconds / 3600) + " h";
    return "hace " + Math.round(seconds / 86400) + " d";
  }

  function tituloDe(item) {
    var raw = item && (item.subject || item.title || item.text || item.etiqueta || item.report || item.id) || "";
    var text = String(raw).replace(/\s+/g, " ").trim();
    if (!text) return "sin título";
    return text.length > 160 ? text.slice(0, 159) + "…" : text;
  }

  function sortRecent(items) {
    return (items || []).slice().sort(function (a, b) {
      return recencyMs(b) - recencyMs(a) || String(b.id || "").localeCompare(String(a.id || ""));
    });
  }

  function ultimaCerrada(items, now) {
    var best = 0;
    (items || []).forEach(function (item) {
      if (bucket(item) !== "hecha") return;
      var when = toMs(item.done_at) || toMs(item.resolved_at) || toMs(item.updated_at) || toMs(item.ts);
      if (when > best) best = when;
    });
    if (!best) return "sin misiones cerradas";
    return "última misión cerrada " + hace(best, now || Date.now());
  }

  function counts(items) {
    var tally = { pendiente: 0, ack: 0, en_curso: 0, bloqueada: 0, hecha: 0 };
    (items || []).forEach(function (item) {
      var key = bucket(item);
      if (key) tally[key]++;
    });
    return tally;
  }

  function fila(item, selection, options) {
    var key = bucket(item);
    return {
      kind: item.kind || "",
      id: item.id == null ? "" : String(item.id),
      titulo: tituloDe(item),
      status: key,
      statusLabel: STATUS_LABEL[key] || "",
      via: viaLabel(item, selection, options),
      hace: recencyMs(item) ? hace(recencyMs(item), options && options.now) : ""
    };
  }

  function personView(input) {
    input = input || {};
    var selection = normalizeSelection(input.selection, input.extras);
    var now = input.now || Date.now();
    var options = { extras: input.extras, now: now };
    function match(item) {
      var agents = input.agentOf ? input.agentOf(item) : null;
      return itemMatches(item, selection, { extras: input.extras, agents: agents });
    }
    var encargos = (input.encargos || []).filter(match).map(function (item) {
      return Object.assign({ kind: "encargo" }, item);
    });
    var vistos = {};
    encargos.forEach(function (item) { if (item.id != null) vistos[String(item.id)] = 1; });
    var misiones = (input.misiones || []).filter(match).filter(function (item) {
      return !(item.inbox_id != null && vistos[String(item.inbox_id)]);
    }).map(function (item) { return Object.assign({ kind: "mision" }, item); });
    var trabajo = sortRecent(encargos.concat(misiones));
    var informes = sortRecent((input.informes || []).filter(match).map(function (item) {
      return Object.assign({ kind: "informe" }, item);
    }));
    var person = selection.tipo === "consejeros" ? consejero(selection.quien) : null;
    var deep = person ? deepagentOf(person.quien) : null;
    var chip = null;
    if (selection.tipo === "deepagents" && selection.quien) {
      deepagentChips((input.extras || []).concat([selection.quien])).some(function (item) {
        if (item.quien === selection.quien) { chip = item; return true; }
        return false;
      });
    }
    return {
      selection: selection,
      title: person ? person.quien : (chip ? chip.label : selection.quien),
      full: person ? person.full : "",
      deepagent: deep,
      counts: counts(trabajo),
      ultima: ultimaCerrada(trabajo, now),
      misiones: trabajo.slice(0, 8).map(function (item) { return fila(item, selection, options); }),
      informes: informes.slice(0, 6).map(function (item) { return fila(item, selection, options); })
    };
  }

  root.YkQuien = {
    STORAGE_KEY: STORAGE_KEY,
    LEYENDAS: LEYENDAS,
    COETANEOS: COETANEOS,
    CONSEJEROS: CONSEJEROS,
    DEEPAGENTS: DEEPAGENTS,
    STATUS_IDS: STATUS_IDS,
    STATUS_LABEL: STATUS_LABEL,
    fold: fold,
    canon: canon,
    observeId: observeId,
    consejero: consejero,
    deepagentOf: deepagentOf,
    deepagentChips: deepagentChips,
    normalizeSelection: normalizeSelection,
    readSelection: readSelection,
    applyQuery: applyQuery,
    displayQuien: displayQuien,
    matchIds: matchIds,
    itemMatches: itemMatches,
    viaLabel: viaLabel,
    bucket: bucket,
    recencyMs: recencyMs,
    sortRecent: sortRecent,
    ultimaCerrada: ultimaCerrada,
    counts: counts,
    hace: hace,
    tituloDe: tituloDe,
    personView: personView
  };
})(typeof window !== "undefined" ? window : globalThis);
