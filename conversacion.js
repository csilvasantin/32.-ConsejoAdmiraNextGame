/* Conversación del equipo.
 * Junta la charla de coetáneos (Agora) y el tráfico de encargos del bot-inbox.
 * Los nombres se normalizan con yk-quien.js. No inventa mensajes. */
(function (root) {
  "use strict";

  var STATUS = {
    pending: "pendiente",
    ack: "recibido",
    in_progress: "en curso",
    blocked: "bloqueado",
    done: "hecho",
    failed: "fallido"
  };

  function asMs(value) {
    var n = Number(value) || 0;
    if (!n) {
      var parsed = Date.parse(String(value || ""));
      return isNaN(parsed) ? 0 : parsed;
    }
    return n > 4102444800 ? n : n * 1000;
  }

  function parseAgoraLine(line) {
    var text = String(line || "").trim();
    if (!text) return null;
    var m = text.match(/^(\S+)\s+\[([^\]]+)\]\s*([\s\S]*)$/);
    if (!m) return null;
    var body = String(m[3] || "").trim();
    if (!body) return null;
    var foco = (body.match(/\bfoco:\s*([^\s·]+)/i) || [])[1] || "";
    return {
      ts: asMs(m[1]),
      from_name: m[2].trim(),
      target_persona: "",
      text: body,
      source: "charla",
      status: "",
      project_id: foco,
      etiqueta: "",
      task_id: ""
    };
  }

  function fromInbox(item) {
    if (!item || typeof item !== "object") return null;
    var text = String(item.text || "").trim();
    if (!text) return null;
    return {
      ts: asMs(item.ts),
      from_name: String(item.from_name || "").trim(),
      target_persona: String(item.target_persona || "").trim(),
      text: text,
      source: "encargo",
      status: String(item.status || "").trim(),
      project_id: item.project_id ? String(item.project_id) : "",
      etiqueta: item.etiqueta ? String(item.etiqueta) : "",
      task_id: item.task_id ? String(item.task_id) : ""
    };
  }

  function buildFeed(agoraLines, inboxItems) {
    var entries = [];
    (agoraLines || []).forEach(function (line) {
      var entry = typeof line === "string" ? parseAgoraLine(line) : fromInbox(line);
      if (entry) entries.push(entry);
    });
    (inboxItems || []).forEach(function (item) {
      var entry = fromInbox(item);
      if (entry) entries.push(entry);
    });
    entries.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return entries;
  }

  function filterFeed(entries, selection) {
    var Q = root.YkQuien;
    if (!Q || !selection || selection.tipo === "todos" || !selection.quien) return (entries || []).slice();
    return (entries || []).filter(function (entry) {
      return Q.itemMatches({
        from_name: entry.from_name,
        target_persona: entry.target_persona,
        persona: entry.from_name
      }, selection);
    });
  }

  function displayName(raw) {
    var Q = root.YkQuien;
    var text = String(raw || "").trim();
    if (!text) return "";
    if (!Q) return text;
    var id = Q.canon(text) || Q.observeId(text);
    if (!id) return text;
    var person = Q.consejero(id);
    if (person) return person.quien;
    var deep = null;
    (Q.DEEPAGENTS || []).some(function (item) {
      if (item.id === id) { deep = item; return true; }
      return false;
    });
    if (deep) return deep.label;
    if (id === "arquitectocursorcloud") return "ArquitectoCursorCloud";
    return text;
  }

  function statusLabel(status) {
    var key = String(status || "").toLowerCase();
    return STATUS[key] || "";
  }

  root.Conversacion = {
    parseAgoraLine: parseAgoraLine,
    fromInbox: fromInbox,
    buildFeed: buildFeed,
    filterFeed: filterFeed,
    displayName: displayName,
    statusLabel: statusLabel
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
