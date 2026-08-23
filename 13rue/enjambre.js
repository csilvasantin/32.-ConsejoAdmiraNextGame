/* Enjambre ejecutivo de 13 Rue: una entrada, ocho partes y tres misiones Yokup. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Enjambre13 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ROLES = [
    { id:"CEO", icon:"🏛️", name:"Chief Executive Officer", territory:"resultado, prioridad y renuncias",
      prompt:"Diriges el encargo. Fija un resultado único, el orden de prioridad y lo que queda explícitamente fuera." },
    { id:"CTO", icon:"⚙️", name:"Chief Technology Officer", territory:"arquitectura, interfaces y riesgo técnico",
      prompt:"Diseña el camino técnico mínimo. Señala interfaces, dependencia crítica y la prueba técnica que evita humo." },
    { id:"COO", icon:"📋", name:"Chief Operations Officer", territory:"secuencia, responsables y operación",
      prompt:"Convierte el encargo en una secuencia operable. Define el primer movimiento, el relevo y el control diario." },
    { id:"CFO", icon:"💰", name:"Chief Financial Officer", territory:"coste, retorno y límite de apuesta",
      prompt:"Pon disciplina económica. Define coste tolerable, señal de retorno y condición para parar o ampliar." },
    { id:"CCO", icon:"💡", name:"Chief Creative Officer", territory:"promesa, concepto y comunicación",
      prompt:"Formula la idea que una persona entiende y recuerda. Entrega una promesa concreta y una demostración breve." },
    { id:"CDO", icon:"🎨", name:"Chief Design Officer", territory:"forma, interacción y claridad",
      prompt:"Da forma al resultado. Define la pantalla o artefacto, la interacción principal y el criterio de claridad." },
    { id:"CXO", icon:"🧭", name:"Chief Experience Officer", territory:"recorrido, fricción y aceptación",
      prompt:"Recorre la experiencia de punta a punta. Localiza la fricción principal y fija una aceptación observable." },
    { id:"CSO", icon:"📖", name:"Chief Storytelling Officer", territory:"relato, contexto y cierre",
      prompt:"Cose las partes en un relato común. Explica por qué ahora, qué cambia y cómo se cuenta el cierre sin exagerar." }
  ];
  var GROUPS = [
    { id:"direccion", label:"Dirección", roles:["CEO","CTO","CFO"] },
    { id:"operacion", label:"Operación", roles:["COO","CXO","CDO"] },
    { id:"relato", label:"Mercado y relato", roles:["CCO","CSO"] }
  ];

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function clip(value, max) { value = clean(value); return value.length > max ? value.slice(0, max - 1) + "…" : value; }
  function role(id) { return ROLES.filter(function (item) { return item.id === id; })[0] || null; }
  function hash(value) {
    var h = 2166136261;
    for (var i = 0; i < String(value).length; i += 1) {
      h ^= String(value).charCodeAt(i); h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }
  function runId(problem, at) {
    var stamp = new Date(at || Date.now()).toISOString().slice(0, 10).replace(/-/g, "");
    return "swm-" + stamp + "-" + hash(clean(problem) + "|" + String(at || ""));
  }
  function promptFor(item, problem) {
    return "Problema de Admira: «" + clean(problem) + "». Eres " + item.id + " (" + item.name + "). " +
      item.prompt + " Responde SOLO con: A) acción concreta que tomas. B) prueba visible de tu parte. " +
      "C) entrega o lugar donde queda. VOZ: una frase ejecutiva, directa y sin inventar datos.";
  }
  function parse(text) {
    text = clean(text);
    var a = (text.match(/A\)\s*([\s\S]*?)(?=B\)|$)/i) || [])[1];
    var b = (text.match(/B\)\s*([\s\S]*?)(?=C\)|$)/i) || [])[1];
    var c = (text.match(/C\)\s*([\s\S]*?)(?=VOZ:|$)/i) || [])[1];
    var voice = (text.match(/VOZ:\s*([\s\S]*)$/i) || [])[1];
    if (!clean(a) || !clean(b)) return null;
    return { a:clean(a), b:clean(b), c:clean(c) || "Entrega en el tablero del enjambre.", voice:clean(voice), source:"deepagent" };
  }
  function fallback(item, problem) {
    return {
      a:item.id + " toma «" + clip(problem, 92) + "» desde " + item.territory + ".",
      b:"Su tarjeta declara una prueba visible y un límite verificable antes de ejecutar.",
      c:"13 Rue · vivienda " + item.id + " · cronograma compartido.",
      voice:item.id + " ha cogido su parte: " + item.territory + ".",
      source:"respaldo"
    };
  }
  function missionPayload(group, problem, parts, identity, id) {
    var codes = ["a", "b", "c"];
    return {
      agent:clean(identity.agent), machine:clean(identity.machine), project_id:"admira-live",
      subject:clip("Enjambre 13 Rue · " + group.label + " · " + problem, 160),
      idempotency_key:clip(id + "-" + group.id, 120),
      tasks:group.roles.map(function (roleId, index) {
        var item = role(roleId), part = parts[roleId] || fallback(item, problem);
        return {
          code:codes[index], status:"in_progress",
          title:clip("[" + roleId + "] " + part.a, 120),
          report:clip("Habitante " + roleId + " · parte cogida\nA · " + part.a + "\nB · " + part.b +
            "\nC · " + part.c + (part.voice ? "\nVOZ · " + part.voice : ""), 1800)
        };
      })
    };
  }
  function payloads(problem, parts, identity, id) {
    return GROUPS.map(function (group) { return missionPayload(group, problem, parts, identity, id); });
  }

  return { ROLES:ROLES, GROUPS:GROUPS, clean:clean, role:role, runId:runId, promptFor:promptFor,
    parse:parse, fallback:fallback, missionPayload:missionPayload, payloads:payloads };
});
