/**
 * interface-seleccion.mjs — qué 2 agentes enseña «/interface 2 <selector>» (#5707 + aclaración #5729 · Morfeo · 11-10-2026).
 *
 *   /interface 2 claude | codex | grok   → los 2 agentes vivos de ese modelo con el latido más reciente
 *   /interface 2 Neo Trinity             → esos dos, si están vivos
 *
 * De dónde sale el modelo de cada agente (nunca de etiquetas escritas a mano):
 *   1. `proveedor` / `provider` declarado en /api/presence (Anthropic→claude · OpenAI→codex · xAI→grok);
 *   2. `model_spec` declarado en /api/presence;
 *   3. mientras el worker de admira-telegram no guarde 1 y 2 (lo arregla Smith; hoy los descarta y corta `model`
 *      a 40 caracteres), el `runtime` de la configuración de arranque VERIFICADA (fila con verified=1, la del
 *      process_snapshot del Mac), igual que el #5670 de Trinity (PR #182) deduce el proveedor del runtime.
 * Un proveedor declarado manda: si no es uno de los tres (OpenRouter, NVIDIA NIM, OpenCode…) el agente no entra en
 * ningún grupo aunque su runtime sea Claude/Codex/Grok. Sin dato → «desconocido», fuera de todos los grupos; nunca
 * se supone. El campo `model` (recortado, «Fable 5», «6.1 Sol») no se usa para decidir.
 */
export const PRESENCIA_URL = "https://bot.yokup.com/api/presence";
export const MODELOS = ["claude", "codex", "grok"];
/** Los 6 del visor (/visor/?g=6): son los únicos que tienen panel. */
export const AGENTES = ["Neo", "Morfeo", "Trinity", "Oráculo", "Smith", "Merovingio"];
export const VENTANA_VIVO_S = 120;

export const sinTilde = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const POR_CLAVE = Object.fromEntries(AGENTES.map((a) => [sinTilde(a), a]));
/** «oraculo», «ORÁCULO» → «Oráculo»; desconocido → null. */
export const agenteCanonico = (s) => POR_CLAVE[sinTilde(s)] || null;
/** «Claude», «CÓDEX» → «claude» | «codex»; desconocido → null. */
export const modeloCanonico = (s) => { const k = sinTilde(s); return MODELOS.includes(k) ? k : null; };

const DE_PROVEEDOR = { anthropic: "claude", openai: "codex", xai: "grok" };
function deProveedor(p) {
  const k = sinTilde(p).replace(/[\s_.-]+/g, "");
  return DE_PROVEEDOR[k] || null;
}
function deModelSpec(m) {
  const s = sinTilde(m);
  if (/^(anthropic[:/]|claude)/.test(s)) return "claude";
  if (/^(openai[:/]|codex|gpt)/.test(s)) return "codex";
  if (/^(xai[:/]|grok)/.test(s)) return "grok";
  return null;
}
const verificada = (r) => r && (r.verified === 1 || r.verified === true || r.verified === "1");
/** App de escritorio (no el CLI de otra máquina). La usa el mosaico #5824 para la máquina del recuadro. */
const esEscritorio = (r) => {
  const host = String((r && r.host) || "").toLowerCase();
  const sid = String((r && r.session_id) || "");
  return host === "app" || sid.startsWith("desktop:");
};

/** Modelo (claude|codex|grok) de UNA fila de presencia → { modelo|null, fuente }. */
export function modeloDeFila(r = {}) {
  const prov = String(r.proveedor || r.provider || "").trim();
  if (prov) return { modelo: deProveedor(prov), fuente: "proveedor declarado" };
  const spec = String(r.model_spec || "").trim();
  if (spec) return { modelo: deModelSpec(spec), fuente: "model_spec declarado" };
  if (verificada(r)) {
    const rt = sinTilde(r.runtime);
    const m = /^claude\b/.test(rt) ? "claude" : /^codex\b/.test(rt) ? "codex" : /^grok\b/.test(rt) ? "grok" : null;
    if (m) return { modelo: m, fuente: "arranque verificado" };
  }
  return { modelo: null, fuente: "sin dato" };
}

/** Presencia → un resumen por agente vivo: { agente, latido, modelos:{claude:ts…}, maquinas, desconocido }. */
export function vivosPorAgente(presencia = [], ahoraS = Date.now() / 1000, ventanaS = VENTANA_VIVO_S) {
  const out = new Map();
  for (const r of Array.isArray(presencia) ? presencia : []) {
    const agente = agenteCanonico(r && r.persona);
    const ts = Number(r && r.updated) || 0;
    if (!agente || ahoraS - ts > ventanaS) continue;
    const x = out.get(agente) || { agente, latido: 0, modelos: {}, fuentes: {}, maquinas: [], tieneEscritorio: false };
    if (ts >= x.latido) { // #5803: modelo real del último latido · #5804: lo que dice que hace (modo del latido + tarea/foco)
      x.modeloTxt = String(r.model_spec || r.model || r.runtime || "").slice(0, 60);
      x.modo = String(r.mode || "").toLowerCase();
      x.tarea = String(r.task || r.focus || "").slice(0, 120);
    }
    x.latido = Math.max(x.latido, ts);
    if (r.machine) {
      const nombre = String(r.machine);
      if (!x.maquinas.includes(nombre)) x.maquinas.push(nombre);
      if (ts >= (x.maquinaTs || 0)) { x.maquinaFresca = nombre; x.maquinaTs = ts; } // #5824: la más reciente, no la primera vista
      if (esEscritorio(r) && ts >= (x.escritorioTs || 0)) { x.maquinaEscritorio = nombre; x.escritorioTs = ts; x.tieneEscritorio = true; }
    }
    const { modelo, fuente } = modeloDeFila(r);
    if (modelo && ts > (x.modelos[modelo] || 0)) { x.modelos[modelo] = ts; x.fuentes[modelo] = fuente; }
    out.set(agente, x);
  }
  for (const x of out.values()) x.desconocido = !Object.keys(x.modelos).length;
  return [...out.values()];
}

/** Lista de nombres para ?a= del visor: ASCII, sin tildes («Oraculo»), separados por comas. */
export const paramAgentes = (lista) => lista.map((a) => sinTilde(a).replace(/^./, (c) => c.toUpperCase())).join(",");

/**
 * elegir({ modelo } | { agentes:[a,b] }, presencia, ahoraS) →
 *   { ok:true, agentes:[2], extra:[descartados], aviso, url }  |  { ok:false, error, mensaje, sugerencias:[…] }
 * Puro: lo prueba interface-cli.test.mjs.
 */
export function elegir(sel = {}, presencia = [], ahoraS = Date.now() / 1000) {
  const vivos = vivosPorAgente(presencia, ahoraS);
  const grupos = Object.fromEntries(MODELOS.map((m) => [m, vivos.filter((x) => x.modelos[m]).sort((a, b) => b.modelos[m] - a.modelos[m])]));
  const desconocidos = vivos.filter((x) => x.desconocido).map((x) => x.agente);
  const sugerencias = () => {
    const s = MODELOS.filter((m) => m !== sel.modelo && grupos[m].length >= 2).map((m) => "/interface 2 " + m);
    if (vivos.length >= 2) s.push("/interface 2 " + vivos.slice().sort((a, b) => b.latido - a.latido).slice(0, 2).map((x) => x.agente).join(" "));
    return s;
  };
  const base = { vivos: vivos.map((x) => x.agente), desconocidos };
  if (sel.modelo) {
    const g = grupos[sel.modelo] || [];
    if (g.length < 2) return { ok: false, error: "pocos", ...base, modelo: sel.modelo, encontrados: g.map((x) => x.agente),
      mensaje: (g.length ? "Solo hay 1 agente vivo con " + sel.modelo + " (" + g[0].agente + ")" : "No hay agentes vivos con " + sel.modelo) +
        (desconocidos.length ? " · modelo desconocido (fuera de los grupos): " + desconocidos.join(", ") : ""), sugerencias: sugerencias() };
    const dos = g.slice(0, 2).map((x) => x.agente), extra = g.slice(2).map((x) => x.agente);
    return { ok: true, ...base, modelo: sel.modelo, agentes: dos, extra, fuente: g.slice(0, 2).map((x) => x.fuentes[sel.modelo]),
      aviso: extra.length ? "Hay " + g.length + " vivos con " + sel.modelo + ": enseño los 2 de latido más reciente (" + dos.join(", ") + "); fuera: " + extra.join(", ") : "",
      url: "/visor/?a=" + paramAgentes(dos) };
  }
  const pedidos = (sel.agentes || []).map(agenteCanonico);
  if (pedidos.length !== 2 || pedidos.some((a) => !a) || pedidos[0] === pedidos[1]) return { ok: false, error: "nombres", ...base, mensaje: "Hacen falta dos agentes distintos de: " + AGENTES.join(", "), sugerencias: sugerencias() };
  const faltan = pedidos.filter((a) => !vivos.some((x) => x.agente === a));
  if (faltan.length) return { ok: false, error: "pocos", ...base, faltan, mensaje: "Sin latido en los últimos " + VENTANA_VIVO_S + " s: " + faltan.join(", "), sugerencias: sugerencias() };
  return { ok: true, ...base, agentes: pedidos, extra: [], aviso: "", url: "/visor/?a=" + paramAgentes(pedidos) };
}
