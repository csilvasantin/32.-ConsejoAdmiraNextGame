/*
 * flota-matriz-lib.mjs — «Matriz de agentes» de /consumos (JensenGrokBot, 10-10-2026 · r4).
 * Carlos, 12:40: una tabla al final de /consumos, VIVA, con los mismos datos que agentes_vivos (presencia de Yokup con
 * latido < 15 min + carga de la bandeja pública por persona): Agente | Depende de | Equipo | Modelo (dónde corre) |
 * Abierto/Cerrado | Coste. Solo hay un mapa pequeño fijo (MAPA) con dependencia, equipo, modelo principal y pagador;
 * un agente nuevo que empiece a latir sale solo y se clasifica por su runtime («sin clasificar» de equipo hasta mapearlo).
 * Regla: los agentes nuevos deben ser gratuitos y se reservan para trabajos menos prioritarios.
 */
/** Mismo censo que el MCP (mcp/server/src/flota.js AGENTES_FLOTA) + consejeros de GrokBot. */
export const AGENTES_FLOTA = ["Neo", "Morfeo", "Trinity", "Oraculo", "Smith", "Cypher", "Switch", "Niobe", "Link", "Persefone", "Seraph", "Arquitecto", "Merovingio"];
export const CONSEJEROS = ["Wozniak", "Jobs", "Lucas", "Disney", "Musk", "Huang"];
export const VIVO_S = 900;

const COET = { es: "Coetáneos (csilvasantin)", en: "Contemporaries (csilvasantin)" };
const LEY = { es: "Leyendas (csilva@admira.com)", en: "Legends (csilva@admira.com)" };
/** Mapa fijo (Carlos, 10-10-2026). coste: pago | gratis | mixto (= «Pago + plan C gratis»). */
export const MAPA = {
  // Musk y su deepagent Merovingio son UNA fila (Carlos: «Musk/Merovingio»).
  Merovingio: { nombre: "Musk / Merovingio", depende: "Carlos", equipo: COET, modelo: "Grok (Grok CLI)", abierto: false, coste: "pago" },
  Huang: { depende: "Carlos", equipo: COET, modelo: "Grok Bot", abierto: false, coste: "pago" },
  Cypher: { depende: "Huang", equipo: COET, modelo: "Nemotron 3 Ultra (DeepAgents)", abierto: true, coste: "gratis" },
  Morfeo: { depende: "Musk", equipo: COET, modelo: "Claude + OpenCode/Nemotron (MacMini)", abierto: false, coste: "mixto" },
  Oraculo: { nombre: "Oráculo", depende: "Musk", equipo: COET, modelo: "Codex + OpenCode/Nemotron (MacMini)", abierto: false, coste: "mixto" },
  Smith: { depende: "Musk", equipo: COET, modelo: "Grok", abierto: false, coste: "pago" },
  Neo: { depende: "Jobs", equipo: LEY, modelo: "Claude", abierto: false, coste: "pago" },
  Trinity: { depende: "Jobs", equipo: LEY, modelo: "Codex (+ DeepAgents)", abierto: false, coste: "pago" },
  Niobe: { depende: "Jobs", equipo: LEY, modelo: "OpenCode + DeepAgents", abierto: true, coste: "gratis" },
  Jobs: { depende: "Carlos", equipo: LEY, modelo: "Grok Bot", abierto: false, coste: "pago" },
  Wozniak: { depende: "Carlos", equipo: LEY, modelo: "Grok Bot", abierto: false, coste: "pago" },
  Lucas: { depende: "Carlos", equipo: LEY, modelo: "Grok Bot", abierto: false, coste: "pago" },
  Disney: { depende: "Carlos", equipo: LEY, modelo: "Grok Bot", abierto: false, coste: "pago" },
};
export const RE_GRATIS = /opencode|deepagents|nemotron|nvidia|:free|ollama|llama|qwen|mistral/i;
export const RE_PAGO = /claude|codex|gpt|grok|gemini|cursor|openai|anthropic/i;

export const llave = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const PERSONAS = [...AGENTES_FLOTA, ...CONSEJEROS];
/** «Oráculo», «OraculoMacMini», «Elon / Merovingio» → persona del censo; desconocida → la misma, limpia. */
export function persona(n) {
  const k = llave(n);
  if (!k) return "";
  if (/merovingio/.test(k)) return "Merovingio";
  if (/^elon/.test(k)) return "Musk";
  if (/^jensen/.test(k)) return "Huang";
  return PERSONAS.find((p) => k === llave(p)) || PERSONAS.find((p) => k.startsWith(llave(p))) || String(n).trim();
}
/** ¿Esta instancia (runtime + modelo) es gratuita? */
export const gratis = (runtime, model) => RE_GRATIS.test(String(runtime || "") + " " + String(model || ""));

/** Carga de una bandeja: { abiertos, pending, ack, in_progress, blocked }. */
export function cargaDe(items, p) {
  const c = { abiertos: 0, pending: 0, ack: 0, in_progress: 0, blocked: 0 };
  for (const x of items || []) {
    if (p && persona(x && x.target_persona) !== p) continue;
    const s = String((x && x.status) || "pending");
    if (s in c) { c[s]++; c.abiertos++; }
  }
  return c;
}

/**
 * Filas de la matriz. presencia: filas de bot.yokup.com/api/presence; carga: Map persona → cargaDe(); ahoraS.
 * → { filas:[{ agente, depende, equipo:{es,en}|null, modelo, donde, instancias, abierto, coste, vivo, carga, mapeado }],
 *     resumen:{ total, pago, gratis, mixto, vivos } }
 */
export function matriz({ presencia = [], carga = new Map(), ahoraS }) {
  const vivas = new Map();
  for (const e of presencia || []) {
    if (!e || !e.persona) continue;
    const ts = Number(e.declared_updated || e.updated) || 0;
    if (ahoraS - ts > VIVO_S) continue;
    const p = persona(e.persona) === "Musk" ? "Merovingio" : persona(e.persona);
    if (!vivas.has(p)) vivas.set(p, new Map());
    const k = llave(e.machine) + "|" + llave(e.runtime);
    if (!vivas.get(p).has(k)) vivas.get(p).set(k, { maquina: e.machine || "", runtime: e.runtime || "", modelo: e.model || "", gratis: gratis(e.runtime, e.model) });
  }
  const nombres = [...new Set([...Object.keys(MAPA), ...AGENTES_FLOTA, ...vivas.keys()])];
  const filas = nombres.map((p) => {
    const m = MAPA[p] || null;
    const inst = [...((vivas.get(p) && vivas.get(p).values()) || [])];
    // Huang es consejero (lo despierta su webhook): cuenta como vivo si late su deepagent Cypher.
    const vivo = inst.length > 0 || (p === "Huang" && vivas.has("Cypher"));
    const libres = inst.filter((i) => i.gratis).length, pagos = inst.length - libres;
    let abierto, coste;
    if (m) { abierto = m.abierto; coste = m.coste; }
    // Sin mapa: se deduce del runtime que late; sin latido no hay runtime → «sin datos» (no se inventa).
    else if (!inst.length) { coste = null; abierto = null; }
    else { coste = pagos && libres ? "mixto" : pagos ? "pago" : "gratis"; abierto = coste === "gratis"; }
    const modelo = (m && m.modelo) || [...new Set(inst.map((i) => i.runtime + (i.modelo ? " · " + i.modelo : "")))].join(" + ") || "—";
    return {
      agente: (m && m.nombre) || p, agenteEn: (m && (m.nombreEn || m.nombre)) || p, persona: p,
      depende: (m && m.depende) || null, equipo: (m && m.equipo) || null, mapeado: !!m,
      modelo, donde: [...new Set(inst.map((i) => i.maquina + (i.runtime ? " (" + i.runtime + (i.gratis ? ", gratis" : "") + ")" : "")))],
      instancias: inst.length, abierto, coste, vivo, carga: carga.get(p) || null,
    };
  });
  const ord = (f) => (f.vivo ? 0 : 1);
  filas.sort((a, b) => ord(a) - ord(b) || (a.mapeado === b.mapeado ? 0 : a.mapeado ? -1 : 1) || a.agente.localeCompare(b.agente));
  const resumen = { total: filas.length, pago: 0, gratis: 0, mixto: 0, sinDatos: 0, vivos: filas.filter((f) => f.vivo).length };
  for (const f of filas) { if (f.coste) resumen[f.coste]++; else resumen.sinDatos++; }
  resumen.clasificados = resumen.total - resumen.sinDatos;
  resumen.dePago = resumen.pago + resumen.mixto; // «N de M de pago» (mixto = de pago con plan C gratis)
  return { filas, resumen };
}
