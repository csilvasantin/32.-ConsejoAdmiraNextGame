(function (root) {
  "use strict";

  function text(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }
  function fallback(row, machineOf) {
    var project = text(row && (row.project_id || row.project));
    var state = text(row && (row.visible_state || row.status));
    var agent = text(row && row.assignee);
    var machine = text(machineOf(row));
    var subject = text(row && row.subject);
    return {version:"mission-duplicates-legacy", basis:"topic", reference:subject,
      project_id:project, state_class:state, agent_key:agent,
      key:["exact", project || "unknown", state || "unknown", agent || "unknown", machine || "unknown", subject].join("|")};
  }
  function idNumber(row) {
    var match = /\d+/.exec(String(row && row.id || ""));
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
  }
  function states(rows) {
    var out = {};
    rows.forEach(function (row) {
      var key = String(row.visible_state || row.status || "unknown");
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  }
  function unique(rows, getter) {
    return Array.from(new Set(rows.map(getter).filter(Boolean)));
  }
  function group(rows, options) {
    var machineOf = options && options.machineOf || function (row) { return row && (row.machine || row.loc) || ""; };
    var buckets = new Map(), order = [];
    (rows || []).forEach(function (row) {
      // Las hijas ya tienen una jerarquía explícita y no se sacan de su madre.
      var descriptor = row && row.parent_id ? null : row && row.duplicate;
      if (!descriptor || !descriptor.key) descriptor = fallback(row, machineOf);
      var key = row && row.parent_id ? "member|" + String(row.id) : descriptor.key;
      if (!buckets.has(key)) { buckets.set(key, {descriptor:descriptor, rows:[]}); order.push(key); }
      buckets.get(key).rows.push(row);
    });
    return order.map(function (key) {
      var bucket = buckets.get(key), members = bucket.rows;
      if (members.length < 2) return members[0];
      var sorted = members.slice().sort(function (a, b) { return idNumber(a) - idNumber(b); });
      var newest = members.reduce(function (best, row) { return +(row.created_at || 0) > +(best.created_at || 0) ? row : best; }, members[0]);
      return Object.assign({}, sorted[0], {
        created_at:newest.created_at,
        updated_at:Math.max.apply(Math, members.map(function (row) { return +(row.updated_at || 0); })),
        _ids:sorted.map(function (row) { return row.id; }),
        _members:sorted,
        _agents:unique(sorted, function (row) { return row.assignee; }),
        _machines:unique(sorted, machineOf),
        _n:sorted.length,
        _duplicate:Object.assign({}, bucket.descriptor, {count:sorted.length, states:states(sorted)})
      });
    });
  }

  root.YkMissionDuplicates = {group:group, fallback:fallback};
})(typeof window !== "undefined" ? window : this);
