/* highscore-desktop-app.js — empareja cada corredor del panel Avanzado con
 * la DesktopAPP real de esa persona EN ese equipo. La UI no adivina estados:
 * una app sólo está encendida si existe un process_snapshot verificado y fresco;
 * una app apagada sólo es accionable si el watcher anuncia su ranura. */
(function (root) {
  "use strict";

  function plainKey(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function identityKey(value, identity) {
    return identity && identity.key ? identity.key(value) : plainKey(value);
  }

  function persona(value, identity) {
    var parsed = identity && identity.parse ? identity.parse(value) : null;
    return parsed ? { name:parsed.persona, role:parsed.role || "main" } : { name:String(value || ""), role:"main" };
  }

  function suffix(value, identity) {
    return identity && identity.suffix ? identity.suffix(value) : plainKey(value);
  }

  function appKey(item) {
    return [item.machine,item.persona,item.runtime,item.host,item.session_id].map(plainKey).join("|");
  }

  function items(payload, identity, nowSeconds) {
    var groups = {}, now = Number(nowSeconds || Date.now() / 1000);
    (payload && payload.control_machines || []).forEach(function (machine) {
      var name = String(machine.machine || "").trim();
      if (!name) return;
      groups[plainKey(name)] = { machine:name, watcher:true, updated:Number(machine.updated || 0), items:{} };
      (machine.slots || []).forEach(function (slot) {
        if (String(slot.host || "").toLowerCase() !== "app") return;
        var item = { machine:name, persona:String(slot.persona || ""), runtime:String(slot.runtime || ""), host:"app",
          session_id:String(slot.session_id || ""), pid:0, active:false, verified:true, watcher:true,
          updated:Number(machine.updated || 0) };
        item.key = appKey(item); groups[plainKey(name)].items[item.key] = item;
      });
    });
    (payload && payload.presence || []).forEach(function (row) {
      var updated = Number(row && row.updated || 0), pid = Number(row && row.pid || 0);
      if (!(row && row.verified && row.source === "process_snapshot" && String(row.host || "").toLowerCase() === "app" &&
        row.online !== 0 && row.online !== false && pid > 0 && updated >= now - 30 && updated <= now + 5)) return;
      var name = String(row.machine || "").trim();
      if (!name) return;
      var groupKey = plainKey(name), group = groups[groupKey] || (groups[groupKey] = {
        machine:name, watcher:false, updated:Number(row.updated || 0), items:{}
      });
      var item = { machine:name, persona:String(row.persona || ""), runtime:String(row.runtime || ""), host:"app",
        session_id:String(row.session_id || ""), pid:pid, active:true, verified:true,
        watcher:group.watcher, updated:updated };
      item.key = appKey(item); group.items[item.key] = item;
    });
    var result = [];
    Object.keys(groups).forEach(function (groupKey) {
      Object.keys(groups[groupKey].items).forEach(function (key) { result.push(groups[groupKey].items[key]); });
    });
    return result;
  }

  function find(apps, agent, team, identity) {
    var wanted = persona(agent, identity);
    if (wanted.role !== "main") return null;
    var wantedPersona = identityKey(wanted.name, identity), wantedTeam = suffix(team, identity) || String(team || "");
    var matches = (apps || []).filter(function (item) {
      return identityKey(persona(item.persona, identity).name, identity) === wantedPersona &&
        (suffix(item.machine, identity) || String(item.machine || "")) === wantedTeam;
    });
    matches.sort(function (a, b) { return Number(b.active) - Number(a.active) || Number(b.watcher) - Number(a.watcher); });
    return matches[0] || null;
  }

  function target(item, action) {
    var body = { action:action, machine:item.machine, persona:item.persona, runtime:item.runtime,
      host:"app", session_id:item.session_id };
    if (action === "stop") body.pid = item.pid;
    return body;
  }

  function feedback(runtime, action, phase) {
    var app = String(runtime || "DesktopAPP").trim() || "DesktopAPP";
    var starting = action === "start";
    if (phase === "success") return "// " + app + (starting ? " encendido" : " apagado");
    if (phase === "error") return "// error al " + (starting ? "arrancar " : "apagar ") + app;
    return "// " + (starting ? "arrancando " : "apagando ") + app;
  }

  var api = { items:items, find:find, target:target, feedback:feedback, key:appKey };
  root.YkHighscoreDesktopApp = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
