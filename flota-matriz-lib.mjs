/*
 * flota-matriz-lib.mjs — «Matriz de agentes» de /consumos (JensenGrokBot, 10-10-2026 · r4).
 * Carlos, 12:40: una tabla al final de /consumos, VIVA, con los mismos datos que agentes_vivos (presencia de Yokup con
 * latido < 15 min + carga de la bandeja pública por persona): Agente | Depende de | Equipo | Modelo (dónde corre) |
 * Abierto/Cerrado | Coste. Solo hay un mapa pequeño fijo (MAPA) con dependencia, equipo, modelo principal y pagador;
 * un agente nuevo que empiece a latir sale solo y se clasifica por su runtime («sin clasificar» de equipo hasta mapearlo).
 * r6: 6 suscripciones de pago (2 Grok · 2 Codex · 2 Claude); en rojo toda instancia con modelo de pago fuera de ellas.
 * Regla: los agentes nuevos deben ser gratuitos y se reservan para trabajos menos prioritarios.
 */
import { costeDePresencia, costeConjunto } from "./mcp/server/src/coste.js";
import { CONSEJEROS as CONSEJO } from "./mcp/server/src/consejo.js";
/** Mismo censo que el MCP (mcp/server/src/flota.js AGENTES_FLOTA) + consejeros de GrokBot. */
export const AGENTES_FLOTA = ["Neo", "Morfeo", "Trinity", "Oraculo", "Smith", "Cypher", "Switch", "Niobe", "Link", "Persefone", "Seraph", "Arquitecto", "Merovingio"];
export const CONSEJEROS = ["Wozniak", "Jobs", "Lucas", "Disney", "Musk", "Huang"];
const PERSONAS_EXTRA = () => Object.keys(MAPA);
export const VIVO_S = 900;

const COET = { es: "Coetáneos (csilvasantin)", en: "Contemporaries (csilvasantin)" };
const LEY = { es: "Leyendas (csilva@admira.com)", en: "Legends (csilva@admira.com)" };
/** Mapa fijo (Carlos, 10-10-2026 · r6). Hay EXACTAMENTE 6 suscripciones de pago, dos por proveedor:
 *  Grok: Merovingio (pool de Grok Bot de csilvasantin, coetáneos) y Smith (Grok de Jobs, csilva@admira.com, leyendas) ·
 *  Codex: Oráculo y Trinity · Claude: Morfeo y Neo. Este es el mapa contable r6, no una prueba del coste real.
 *  Los asistentes de Grok Bot de csilvasantin (Musk/Merovingio, Huang, Mouse y demás consejeros coetáneos) tiran del
 *  MISMO pool: su consumo va en la fila/ficha de Merovingio. Los consejeros leyenda (Jobs, Wozniak, Lucas, Disney) van
 *  incluidos en el Grok de su equipo (el de Smith).
 *  MAPA.coste (se expone como coste_plan): pago (titular de una de las 6) | mixto (titular + plan C gratis) | incluido | gratis.
 *  sub: proveedor de la suscripción que usa (titular o incluido); incluidoEn: titular de esa suscripción. */
export const MAPA = {
  // Musk y su deepagent Merovingio son UNA fila (Carlos: «Musk/Merovingio»).
  Merovingio: { nombre: "Musk / Merovingio", depende: "Carlos", equipo: COET, modelo: "GrokBot · GrokBot CLI (pool csilvasantin)", abierto: false, coste: "pago", sub: "grok", titular: true },
  Smith: { depende: "Jobs", equipo: LEY, modelo: "GrokBot CLI", abierto: false, coste: "pago", sub: "grok", titular: true },
  Oraculo: { nombre: "Oráculo", depende: "Musk", equipo: COET, modelo: "Codex + OpenCode/Nemotron (MacMini)", abierto: false, coste: "mixto", sub: "codex", titular: true },
  Trinity: { depende: "Jobs", equipo: LEY, modelo: "Codex (+ DeepAgents)", abierto: false, coste: "pago", sub: "codex", titular: true },
  Morfeo: { depende: "Musk", equipo: COET, modelo: "Claude + OpenCode/Nemotron (MacMini)", abierto: false, coste: "mixto", sub: "claude", titular: true },
  Neo: { depende: "Jobs", equipo: LEY, modelo: "Claude", abierto: false, coste: "pago", sub: "claude", titular: true },
  Huang: { depende: "Carlos", equipo: COET, modelo: "GrokBot (pool de Merovingio)", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Merovingio" },
  Jobs: { depende: "Carlos", equipo: LEY, modelo: "GrokBot", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Smith" },
  Wozniak: { depende: "Carlos", equipo: LEY, modelo: "GrokBot", abierto: false, coste: "incluido", sub: "grok", incluidoEn: "Smith" },
  Cypher: { depende: "Huang", equipo: COET, modelo: "Nemotron 3 Ultra (DeepAgents)", abierto: true, coste: "gratis" },
  Niobe: { depende: "Jobs", equipo: LEY, modelo: "OpenCode + DeepAgents", abierto: true, coste: "gratis" },
};
/** Asistentes de Grok Bot de csilvasantin: su consumo se enseña bajo Merovingio (un solo pool, no son líneas de pago). */
export const POOL_MEROVINGIO = ["Musk", "Huang", "Grok Bot (Consejo)", "Grok Bot"];
/** r6 (Carlos, 13:01): solo 2 consejeros principales por cuenta van en Grok Bot de pago: Musk + Huang (csilvasantin,
 *  pool de Merovingio) y Jobs + Wozniak (csilva@admira.com, Grok de Smith). TODOS los demás del Consejo (Shotwell,
 *  Porat, Lasseter, Ive, Ratti, Reynolds, Cook, Buffett, Disney, Rams, Schultz, Lucas… y cualquiera nuevo en
 *  mcp/server/src/consejo.js) van por defecto en Nemotron 3 Ultra GRATIS; si consumen Grok Bot de pago, en rojo. */
export const CONSEJEROS_PRINCIPALES = ["Musk", "Huang", "Jobs", "Wozniak"];
const apellido = (n) => String(n || "").trim().split(/\s+/).pop();
for (const c of CONSEJO) for (const gen of ["leyendas", "coetaneos"]) {
  const ap = apellido(c[gen]);
  if (!ap || CONSEJEROS_PRINCIPALES.includes(ap) || MAPA[ap]) continue;
  MAPA[ap] = { nombre: c[gen], depende: "Carlos", equipo: gen === "leyendas" ? LEY : COET, modelo: "Nemotron 3 Ultra (por defecto)", abierto: true, coste: "gratis", porDefecto: true, consejero: true, rol: c.rol };
}
export const CONSEJEROS_GRATIS = Object.keys(MAPA).filter((k) => MAPA[k].porDefecto);
/** Proveedor de pago de una instancia (runtime + modelo), o null si no se conoce un proveedor de pago. */
export function proveedor(runtime, model, proveedorReal) {
  const dato = costeDePresencia({ runtime, model, proveedor: proveedorReal });
  if (dato.coste !== "pago") return null;
  return ({ OpenAI: "codex", Anthropic: "claude", xAI: "grok" })[dato.proveedor] || "otro";
}
/** ¿Esta instancia usa un modelo de pago FUERA de las 6 suscripciones? (regla rota) → motivo | null. */
export function fueraDeLas6(p, runtime, model, proveedorReal) {
  const pr = proveedor(runtime, model, proveedorReal);
  if (!pr) return null;
  const k = persona(p) === "Musk" ? "Merovingio" : persona(p);
  const m = MAPA[k];
  if (m && m.sub === pr) return null;
  return (runtime || pr) + (model ? " · " + model : "") + " es de pago y " + k + (m && m.sub ? " solo puede usar " + m.sub : m && m.porDefecto ? " va por defecto en Nemotron Ultra gratis" : " no tiene suscripción de pago");
}

export const llave = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const PERSONAS = [...AGENTES_FLOTA, ...CONSEJEROS];
/** «Oráculo», «OraculoMacMini», «Elon / Merovingio» → persona del censo; desconocida → la misma, limpia. */
export function persona(n) {
  const k = llave(n);
  if (!k) return "";
  if (/merovingio/.test(k)) return "Merovingio";
  if (/^elon/.test(k)) return "Musk";
  if (/^jensen/.test(k)) return "Huang";
  const todas = [...PERSONAS, ...PERSONAS_EXTRA()];
  // «Gwynne Shotwell», «Ryan Reynolds» → apellido del Consejo.
  const ap = llave(apellido(n));
  return todas.find((p) => k === llave(p)) || (ap && String(n).trim().includes(" ") && todas.find((p) => llave(p) === ap)) || todas.find((p) => k.startsWith(llave(p))) || String(n).trim();
}
/** ¿Esta instancia (runtime + modelo) es gratuita? */
export const gratis = (runtime, model, proveedor) => costeDePresencia({ runtime, model, proveedor }).coste === "gratis";

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
/** Coste del proveedor real; los titulares/pools r6 siguen siendo datos contables aparte. */
export function insignia(f) {
  return f && ['pago', 'gratis', 'desconocido'].includes(f.coste) ? f.coste : 'desconocido';
}
export function matriz({ presencia = [], carga = new Map(), ahoraS }) {
  const vivas = new Map();
  for (const e of [...(presencia || [])].sort((a, b) => Number(b.updated) - Number(a.updated))) {
    if (!e || !e.persona) continue;
    const ts = Number(e.declared_updated || e.updated) || 0;
    if (ahoraS - ts > 86400) continue;
    const p = persona(e.persona) === "Musk" ? "Merovingio" : persona(e.persona);
    if (!vivas.has(p)) vivas.set(p, new Map());
    const k = llave(e.machine) + "|" + llave(e.runtime) + "|" + (e.session_id || "");
    if (!vivas.get(p).has(k)) vivas.get(p).set(k, { agente: persona(e.persona), maquina: e.machine || "", runtime: e.runtime || "", modelo: e.model || "", session_id: e.session_id || "", ...costeDePresencia(e), vivo: ahoraS - ts <= VIVO_S, updated: ts, gratis: gratis(e.runtime, e.model, e.proveedor || e.provider) });
  }
  const nombres = [...new Set([...Object.keys(MAPA), ...AGENTES_FLOTA, ...vivas.keys()])];
  const filas = nombres.map((p) => {
    const m = MAPA[p] || null;
    const inst = [...((vivas.get(p) && vivas.get(p).values()) || [])];
    // Huang es consejero (lo despierta su webhook): cuenta como vivo si late su deepagent Cypher.
    const vivo = inst.some((i) => i.vivo) || (p === "Huang" && [...(vivas.get("Cypher")?.values() || [])].some((i) => i.vivo));
    const infracciones = inst.filter((i) => i.vivo).map((i) => fueraDeLas6(p, i.runtime, i.modelo, i.proveedor)).filter(Boolean);
    const coste_plan = m ? m.coste : null;
    const costes = inst.filter((i) => i.agente === p);
    const coste = costeConjunto(costes);
    const abierto = m ? m.abierto : costes.length && coste !== 'desconocido' ? coste === 'gratis' : null;
    const modelo = [...new Set(costes.map((i) => i.runtime + (i.modelo ? " · " + i.modelo : "")))].join(" + ") || "—";
    const fuera = infracciones.length > 0;
    return {
      insignia: insignia({ coste }), costes, coste_plan,
      agente: (m && m.nombre) || p, agenteEn: (m && (m.nombreEn || m.nombre)) || p, persona: p,
      depende: (m && m.depende) || null, equipo: (m && m.equipo) || null, mapeado: !!m,
      modelo, donde: [...new Set(inst.map((i) => i.maquina + (i.runtime ? " (" + i.runtime + (i.gratis ? ", gratis" : "") + ")" : "")))],
      instancias: inst.length, abierto, coste, vivo, carga: carga.get(p) || null,
      porDefecto: !!(m && m.porDefecto), consejero: !!(m && m.consejero) || CONSEJEROS_PRINCIPALES.includes(p) || p === "Merovingio",
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
    gratis: filas.filter((f) => f.coste === "gratis").length, incluidos: filas.filter((f) => f.coste_plan === "incluido").length,
    sinDatos: filas.filter((f) => f.coste === "desconocido").length, vivos: filas.filter((f) => f.vivo).length,
    fuera: filas.filter((f) => f.fuera).length, conPlanC: filas.filter((f) => f.coste_plan === "mixto").length,
    consejerosGratis: filas.filter((f) => f.porDefecto).length,
    insigniaDesconocido: filas.filter((f) => f.insignia === "desconocido").length,
    insigniaPago: filas.filter((f) => f.insignia === "pago").length, insigniaGratis: filas.filter((f) => f.insignia === "gratis").length,
  };
  return { filas, resumen };
}
