/**
 * Sala de voz — transcripción entre consejeros en las dos pantallas de la sala
 * Terminator (Leyendas / Coetáneos). Lógica pura, comprobable con node:test.
 *
 * Cada pantalla MUESTRA todo el diálogo y solo LOCUTA los mensajes NUEVOS cuyo
 * remitente pertenece a su consejo, para que no suene doble.
 */
export const LS_OIDOS = "admira_sala_voz_oidos_v1";
export const MAX_OIDOS = 200;
export const VISIBLES = 6;
export const SONDEO_MS = 4000;
export const CON_API = ["Jobs", "Wozniak", "Disney", "Lucas", "Musk", "Huang"];

export const LEYENDAS = Object.freeze([
  "Jobs", "Wozniak", "Cook", "Buffett", "Disney", "Rams", "Schultz", "Lucas",
]);
export const COETANEOS = Object.freeze([
  "Musk", "Huang", "Ive", "Shotwell", "Murati", "Porat", "Lasseter", "Ratti", "Reynolds",
]);

export const NOMBRE = Object.freeze({
  Jobs: "Steve Jobs",
  Wozniak: "Steve Wozniak",
  Cook: "Tim Cook",
  Buffett: "Warren Buffett",
  Disney: "Walt Disney",
  Rams: "Dieter Rams",
  Schultz: "Howard Schultz",
  Lucas: "George Lucas",
  Musk: "Elon Musk",
  Huang: "Jensen Huang",
  Ive: "Jony Ive",
  Shotwell: "Gwynne Shotwell",
  Murati: "Mira Murati",
  Porat: "Ruth Porat",
  Lasseter: "John Lasseter",
  Ratti: "Carlos Ratti",
  Reynolds: "Ryan Reynolds",
});

// Shotwell ya no tiene voz propia: se locuta con Mira Murati (silla COO).
export const VOZ = Object.freeze({
  ...NOMBRE,
  Shotwell: "Mira Murati",
});

export const RETRATO = Object.freeze({
  Jobs: "/assets/consejo-vacio/leyendas-steve-jobs.webp",
  Wozniak: "/assets/consejo-vacio/leyendas-steve-wozniak.webp",
  Buffett: "/assets/consejo-vacio/leyendas-warren-buffett.webp",
  Disney: "/assets/consejo-vacio/leyendas-walt-disney.webp",
  Rams: "/assets/consejo-vacio/leyendas-dieter-rams.webp",
  Lucas: "/assets/consejo-vacio/leyendas-george-lucas.webp",
  Musk: "/assets/consejo-vacio/coetaneos-elon-musk.webp",
  Huang: "/assets/consejo-vacio/coetaneos-jensen-huang.webp",
  Murati: "/assets/consejo-vacio/coetaneos-mira-murati.webp",
  Shotwell: "/assets/consejo-vacio/coetaneos-gwynne-shotwell.webp",
  Porat: "/assets/consejo-vacio/coetaneos-ruth-porat.webp",
  Lasseter: "/assets/consejo-vacio/coetaneos-john-lasseter.webp",
  Ive: "/assets/consejo-vacio/coetaneos-jony-ive.webp",
  Ratti: "/assets/consejo-vacio/coetaneos-carlos-ratti.webp",
  Reynolds: "/assets/consejo-vacio/coetaneos-ryan-reynolds.webp",
});

const ALIAS = Object.freeze({
  jobs: "Jobs", stevejobs: "Jobs", steve: "Jobs",
  wozniak: "Wozniak", woz: "Wozniak", stevewozniak: "Wozniak",
  cook: "Cook", timcook: "Cook", tim: "Cook",
  buffett: "Buffett", buffet: "Buffett", warrenbuffett: "Buffett", warren: "Buffett",
  disney: "Disney", waltdisney: "Disney", walt: "Disney",
  rams: "Rams", dieterrams: "Rams", dieter: "Rams",
  schultz: "Schultz", howardschultz: "Schultz", howard: "Schultz",
  lucas: "Lucas", georgelucas: "Lucas", george: "Lucas",
  musk: "Musk", elonmusk: "Musk", elon: "Musk",
  huang: "Huang", jensenhuang: "Huang", jensen: "Huang",
  ive: "Ive", jonyive: "Ive", jony: "Ive",
  shotwell: "Shotwell", gwynneshotwell: "Shotwell", gwynne: "Shotwell",
  murati: "Murati", miramurati: "Murati", mira: "Murati",
  porat: "Porat", ruthporat: "Porat", ruth: "Porat",
  lasseter: "Lasseter", johnlasseter: "Lasseter", john: "Lasseter",
  ratti: "Ratti", carlosratti: "Ratti", carloratti: "Ratti", carlo: "Ratti",
  reynolds: "Reynolds", ryanreynolds: "Reynolds", ryan: "Reynolds",
});

function clave(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function sillaDe(valor) {
  const k = clave(valor);
  if (!k) return "";
  if (ALIAS[k]) return ALIAS[k];
  const cap = String(valor || "").trim();
  if (NOMBRE[cap]) return cap;
  return "";
}

export function parseConsejo(v) {
  const s = clave(v);
  if (["coetaneos", "coetaneo", "peers", "contemporaries", "contemporaneos"].includes(s)) return "coetaneos";
  if (["leyendas", "leyenda", "legends", "legend"].includes(s)) return "leyendas";
  return null;
}

export function miembros(consejo) {
  return consejo === "coetaneos" ? COETANEOS : LEYENDAS;
}

export function pertenece(de, consejo) {
  const s = sillaDe(de);
  if (!s || !consejo) return false;
  return miembros(consejo).includes(s);
}

export function nombreDe(de) {
  const s = sillaDe(de);
  return (s && NOMBRE[s]) || String(de || "").trim();
}

export function vozDe(de) {
  const s = sillaDe(de);
  return (s && VOZ[s]) || nombreDe(de);
}

export function retratoDe(de) {
  const s = sillaDe(de);
  return (s && RETRATO[s]) || "";
}

export function textoDe(m) {
  if (!m) return "";
  const t = m.texto != null && String(m.texto).trim() !== "" ? m.texto : m.resumen;
  return String(t == null ? "" : t).trim();
}

export function idDe(m) {
  if (!m) return "";
  if (m.id != null && String(m.id) !== "") return String(m.id);
  return [m.de || "", m.para || "", m.hora || m.ts || "", textoDe(m)].join("\0");
}

export function esAgente(m) {
  return !!(m && (m.de_tipo === "agente" || m.para_tipo === "agente"));
}

export function esConsejeroMensaje(m) {
  return !!(m && !esAgente(m) && sillaDe(m.de) && sillaDe(m.para) && textoDe(m));
}

export function tsDe(m) {
  return Date.parse((m && (m.hora || m.ts)) || 0) || 0;
}

export function mergeMensajes(listas) {
  const seen = {}, out = [];
  (listas || []).forEach((lista) => {
    (lista || []).forEach((m) => {
      const id = idDe(m);
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push(m);
    });
  });
  out.sort((a, b) => tsDe(a) - tsDe(b) || String(idDe(a)).localeCompare(idDe(b)));
  return out;
}

export function visiblesUltimos(msgs, n = VISIBLES) {
  return (msgs || []).filter(esConsejeroMensaje).slice(-(n > 0 ? n : VISIBLES));
}

function storeGet(store, consejo) {
  const ls = store || (typeof globalThis !== "undefined" && globalThis.localStorage) || null;
  if (!ls || !consejo) return [];
  try {
    const d = JSON.parse(ls.getItem(LS_OIDOS) || "{}") || {};
    return Array.isArray(d[consejo]) ? d[consejo].map(String) : [];
  } catch (e) { return []; }
}

function storeSet(store, consejo, ids) {
  const ls = store || (typeof globalThis !== "undefined" && globalThis.localStorage) || null;
  if (!ls || !consejo) return [];
  let uniq = [], seen = {};
  (ids || []).forEach((id) => {
    id = String(id || "");
    if (!id || seen[id]) return;
    seen[id] = 1;
    uniq.push(id);
  });
  if (uniq.length > MAX_OIDOS) uniq = uniq.slice(-MAX_OIDOS);
  try {
    let d = {};
    try { d = JSON.parse(ls.getItem(LS_OIDOS) || "{}") || {}; } catch (e) { d = {}; }
    d[consejo] = uniq;
    ls.setItem(LS_OIDOS, JSON.stringify(d));
  } catch (e) {}
  return uniq;
}

export function iniciarOidos(consejo, msgs, store) {
  const ids = (msgs || []).map(idDe).filter(Boolean);
  storeSet(store, consejo, storeGet(store, consejo).concat(ids));
  return [];
}

export function pendientesDeLocutar(consejo, msgs, store) {
  const seen = {};
  storeGet(store, consejo).forEach((id) => { seen[id] = 1; });
  const nuevos = (msgs || []).filter((m) => {
    const id = idDe(m);
    return id && !seen[id];
  });
  storeSet(store, consejo, storeGet(store, consejo).concat(nuevos.map(idDe)));
  return nuevos.filter((m) => esConsejeroMensaje(m) && pertenece(m.de, consejo)).map((m) => ({
    id: idDe(m),
    de: sillaDe(m.de),
    persona: vozDe(m.de),
    nombre: nombreDe(m.de),
    retrato: retratoDe(m.de),
    texto: textoDe(m),
  }));
}

export function etiqueta(m) {
  if (!m) return "";
  const de = sillaDe(m.de), para = sillaDe(m.para);
  const corto = (s) => (s === "Musk" ? "Elon" : s === "Huang" ? "Jensen" : s === "Wozniak" ? "Woz" : s);
  return (corto(de) || m.de || "") + " → " + (corto(para) || m.para || "");
}
