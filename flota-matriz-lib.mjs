/*
 * flota-matriz-lib.mjs — «Matriz de agentes» de /consumos (JensenGrokBot, 10-10-2026 · r4).
 * Carlos, 12:40: una tabla al final de /consumos, VIVA, con los mismos datos que agentes_vivos (presencia de Yokup con
 * latido < 15 min + carga de la bandeja pública por persona): Agente | Depende de | Equipo | Modelo (dónde corre) |
 * Abierto/Cerrado | Coste. Solo hay un mapa pequeño fijo (MAPA) con dependencia, equipo, modelo principal y pagador;
 * un agente nuevo que empiece a latir sale solo y se clasifica por su runtime («sin clasificar» de equipo hasta mapearlo).
 * r6: 6 suscripciones de pago (2 Grok · 2 Codex · 2 Claude); en rojo toda instancia con modelo de pago fuera de ellas.
 * Regla: los agentes nuevos deben ser gratuitos y se reservan para trabajos menos prioritarios.
 */
/** Mismo censo que el MCP (mcp/server/src/flota.js AGENTES_FLOTA) + consejeros de GrokBot. */
export const AGENTES_FLOTA = ["Neo", "Morfeo", "Trinity", "Oraculo", "Smith", "Cypher", "Switch", "Niobe", "Link", "Persefone", "Seraph", "Arquitecto", "Merovingio"];
export const CONSEJEROS = ["Wozniak", "Jobs", "Lucas", "Disney", "Musk", "Huang"];
export const VIVO_S = 900;

const COET = { es: "Coetáneos (csilvasantin)", en: "Contemporaries (csilvasantin)" };
const LEY = { es: "Leyendas (csilva@admira.com)", en: "Legends (csilva@admira.com)" };
/** Mapa fijo (Carlos, 10-10-2026 · r6). Hay EXACTAMENTE 6 suscripciones de pago, dos por proveedor:
 *  Grok: Merovingio (pool de Grok Bot de csilvasantin, coetáneos) y Smith (Grok de Jobs, csilva@admira.com, leyendas) ·
 *  Codex: Oráculo y Trinity · Claude: Morfeo y Neo. Todo lo demás (OpenCode, DeepAgents, Cypher, Niobe…) es gratis.
 *  Los asistentes de Grok Bot de csilvasantin (Musk/Merovingio, Huang, Mouse y demás consejeros coetáneos) tiran del
 *  MISMO pool: su consumo va en la fila/ficha de Merovingio. Los consejeros leyenda (Jobs, Wozniak, Lucas, Disney) van
 *  incluidos en el Grok de su equipo (el de Smith).
 *  coste: pago (titular de una de las 6) | mixto (titular + plan C gratis) | incluido | gratis.
 *  sub: proveedor de la suscripción que usa (titular o incluido); incluidoEn: titular de esa suscripción. */
export const MAPA = {
  // Musk y su deepagent Merovingio son UNA fila (Carlos: «Musk/Merovingio»).
  Merovingio: { nombre: "Musk / Merovingio", depende: "Carlos", equipo: COET, modelo: "Grok Bot · Grok CLI (pool csilvasantin)", abierto: false, coste: "pago", sub: "grok", titular: true },
  Smith: { depende: "Jobs", equipo: LEY, modelo: "Grok (Grok CLI)", abierto: false, coste: "pago", sub: "grok", titular: true },
  Oraculo: { nombre: "Oráculo", depende: "Musk", equipo: COET, modelo: "Codex + OpenCode/Nemotron (MacMini)", abierto: false, coste: "mixto", sub: "codex", titular: true },
  Trinity: { depende: "Jobs", equipo: LEY, modelo: "Codex (+ DeepAgents)", abierto: false, coste: "pago", sub: "codex", titular: true },
  Morfeo: { depende: "Musk", equipo: COET, modelo: "Claude + OpenCode/Nemotron (MacMini)", abierto: false, coste: "mixto", sub: "claude", titular: true },
  Neo: { depende: "Jobs", equipo: LEY, modelo: "Claude", abierto: false, coste: "pago", sub: "claude", titular: true },
  Huang: { depende: "Carlos", equipo: COET, modelo: "Grok Bot (pool de Merovingio)", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Merovingio" },
  Mouse: { depende: "Carlos", equipo: COET, modelo: "Grok Bot (pool de Merovingio)", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Merovingio" },
  Jobs: { depende: "Carlos", equipo: LEY, modelo: "Grok Bot", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Smith" },
  Wozniak: { depende: "Carlos", equipo: LEY, modelo: "Grok Bot", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Smith" },
  Lucas: { depende: "Carlos", equipo: LEY, modelo: "Grok Bot", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Smith" },
  Disney: { depende: "Carlos", equipo: LEY, modelo: "Grok Bot", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Smith" },
  Cypher: { depende: "Huang", equipo: COET, modelo: "Nemotron 3 Ultra (DeepAgents)", abierto: true, coste: "gratis" },
  Niobe: { depende: "Jobs", equipo: LEY, modelo: "OpenCode + DeepAgents", abierto: true, coste: "gratis" },
};
/** Asistentes de Grok Bot de csilvasantin: su consumo se enseña bajo Merovingio (un solo pool, no son líneas de pago). */
export const POOL_MEROVINGIO = ["Musk", "Huang", "Mouse", "Grok Bot (Consejo)", "Grok Bot"];
/** Proveedor de pago de una instancia (runtime + modelo), o null si es gratis. */
export function proveedor(runtime, model) {
  const t = String(runtime || "") + " " + String(model || "");
  if (RE_GRATIS.test(t)) return null;
  if (/claude|anthropic/i.test(t)) return "claude";
  if (/codex|gpt|openai/i.test(t)) return "codex";
  if (/grok/i.test(t)) return "grok";
  if (/cursor|gemini/i.test(t)) return "otro";
  return null;
}
/** ¿Esta instancia usa un modelo de pago FUERA de las 6 suscripciones? (regla rota) → motivo | null. */
export function fueraDeLas6(p, runtime, model) {
  const pr = proveedor(runtime, model);
  if (!pr) return null;
  const k = persona(p) === "Musk" ? "Merovingio" : persona(p);
  const m = MAPA[k];
  if (m && m.sub === pr) return null;
  return (runtime || pr) + (model ? " · " + model : "") + " es de pago y " + k + (m && m.sub ? " solo puede usar " + m.sub : " no tiene suscripción de pago");
}
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
    const infracciones = inst.map((i) => fueraDeLas6(p, i.runtime, i.modelo)).filter(Boolean);
    let abierto, coste;
    if (m) { abierto = m.abierto; coste = m.coste; }
    // Sin mapa: se deduce del runtime que late; sin latido no hay runtime → «sin datos» (no se inventa).
    else if (!inst.length) { coste = null; abierto = null; }
    else { coste = pagos ? "pago" : "gratis"; abierto = coste === "gratis"; }
    const modelo = (m && m.modelo) || [...new Set(inst.map((i) => i.runtime + (i.modelo ? " · " + i.modelo : "")))].join(" + ") || "—";
    return {
      agente: (m && m.nombre) || p, agenteEn: (m && (m.nombreEn || m.nombre)) || p, persona: p,
      depende: (m && m.depende) || null, equipo: (m && m.equipo) || null, mapeado: !!m,
      modelo, donde: [...new Set(inst.map((i) => i.maquina + (i.runtime ? " (" + i.runtime + (i.gratis ? ", gratis" : "") + ")" : "")))],
      instancias: inst.length, abierto, coste, vivo, carga: carga.get(p) || null,
      sub: (m && m.sub) || null, titular: !!(m && m.titular), incluidoEn: (m && m.incluidoEn) || null,
      incluye: p === "Merovingio" ? POOL_MEROVINGIO.filter((n) => MAPA[n] || n === "Musk") : null,
      infracciones, fuera: infracciones.length > 0,
    };
  });
  const ord = (f) => (f.vivo ? 0 : 1);
  filas.sort((a, b) => ord(a) - ord(b) || (a.mapeado === b.mapeado ? 0 : a.mapeado ? -1 : 1) || a.agente.localeCompare(b.agente));
  const subs = { grok: 0, codex: 0, claude: 0 };
  for (const m of Object.values(MAPA)) if (m.titular && m.sub in subs) subs[m.sub]++;
  const resumen = {
    total: filas.length, suscripciones: subs.grok + subs.codex + subs.claude, subs,
    gratis: filas.filter((f) => f.coste === "gratis").length, incluidos: filas.filter((f) => f.coste === "incluido").length,
    sinDatos: filas.filter((f) => !f.coste).length, vivos: filas.filter((f) => f.vivo).length,
    fuera: filas.filter((f) => f.fuera).length, conPlanC: filas.filter((f) => f.coste === "mixto").length,
  };
  return { filas, resumen };
}
