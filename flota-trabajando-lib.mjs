/**
 * «Trabajando ahora» de /consumos (GrokBotBox, 09-10-2026 · r28). Funciones PURAS (sin red).
 * Carlos: «¿cómo puedo saber en tiempo real quién trabaja?».
 * Une la presencia de Yokup (bot.yokup.com/api/presence: latidos «heartbeat» de yokup_presencia y «process_snapshot»
 * de los vigilantes de los Mac) con el pulso de tokens (/api/consumos/velocidad: tok/h de los últimos 15 min y
 * «con Carlos»). Estado de cada tarjeta (estadoTrabajo):
 *   amarillo = con Carlos · verde = trabajando · gris = parado / sin latido.
 * Trabajando si: tok/h > 0 del pulso, o latido con trabajando (mode «trabajando» / trabajando:true / working:true)
 * de hace < 2 min, o process_snapshot con cpu > 5 y declarado hace < 2 min.
 */
export const VENTANA_LATIDO_S = 120;
export const CPU_MIN = 5;
export const CONSEJEROS_GROK = ["Jobs", "Wozniak", "Lucas", "Disney", "Musk", "Huang"];
// Retratos: recortes de las ilustraciones del Consejo (mismas coordenadas que consejero.html, solo la cabeza).
// «cara»: recorte cuadrado (en píxeles) centrado en la cara, en % de la imagen. Leyendas 1360×768: cabeza = parte alta del
// recorte de cuerpo de consejero.html. Coetáneos 1280×720: Musk y Huang recalibrados a ojo sobre la imagen (r29).
const cabeza = (c) => ({ l: c.l, t: c.t, w: c.w, h: +(c.h * 0.42).toFixed(2) });
export const RETRATOS = {
  Jobs: { img: "/assets/council-leyendas.jpg", cara: cabeza({ l: 7, t: 44, w: 7, h: 17 }) },
  Wozniak: { img: "/assets/council-leyendas.jpg", cara: cabeza({ l: 18, t: 36, w: 8, h: 21 }) },
  Disney: { img: "/assets/council-leyendas.jpg", cara: cabeza({ l: 55, t: 27, w: 8, h: 26 }) },
  Lucas: { img: "/assets/council-leyendas.jpg", cara: cabeza({ l: 88, t: 41, w: 9, h: 17 }) },
  Musk: { img: "/assets/council-coetaneos.jpg", cara: { l: 9, t: 44, w: 9, h: 16 } },
  Huang: { img: "/assets/council-coetaneos.jpg", cara: { l: 21.65, t: 44.5, w: 8.5, h: 15.1 } },
};
const AVATARES = { neo: "/avatars/neo.jpg", trinity: "/avatars/trinity.jpg", morfeo: "/avatars/morfeo.jpg", smith: "/avatars/smith.jpg", oraculo: "/avatars/oraculo.png" };
const CANON = ["Jobs", "Wozniak", "Lucas", "Disney", "Musk", "Huang", "Neo", "Trinity", "Morfeo", "Oráculo", "Smith", "Niobe", "Cypher", "Merovingio", "Link", "Grok Bot"];

const sinTilde = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** «NeoMBP16» → «Neo», «Oraculo» → «Oráculo», «TrinityMacBookPro16» → «Trinity», «Steve Jobs» → «Jobs». */
export function canonico(persona) {
  const p = String(persona || "").trim();
  if (!p) return "";
  const base = sinTilde(p).split("·")[0].trim();
  for (const c of CANON) {
    const k = sinTilde(c);
    if (base === k || base.endsWith(" " + k) || (base.startsWith(k) && /^(mbp\d*|macbook.*|macmini|mini|grokbot|box|mba.*|\d+)$/.test(base.slice(k.length)))) return c;
  }
  if (/^(walt|walt disney)$/.test(base)) return "Disney";
  if (/^(elon|merovingio)$/.test(base) && base === "elon") return "Musk";
  if (/^jensen/.test(base)) return "Huang";
  return p;
}

/** ¿El latido / la instantánea dice que trabaja ahora? */
export function latidoTrabajando(e, ahoraS) {
  if (!e) return false;
  const upd = Number(e.declared_updated || e.updated) || 0;
  const fresco = ahoraS - upd < VENTANA_LATIDO_S;
  if (!fresco) return false;
  if (e.trabajando === true || e.working === true || String(e.mode || "").toLowerCase() === "trabajando") return true;
  if (e.source === "process_snapshot" && Number(e.cpu) > CPU_MIN) return true;
  return false;
}

/** Estado de una tarjeta: { estado:'amarillo'|'verde'|'gris', motivo }. */
export function estadoTrabajo({ tokHora = null, conCarlos = false, latidos = [], ahoraS }) {
  if (conCarlos) return { estado: "amarillo", motivo: "con Carlos" };
  if (Number(tokHora) > 0) return { estado: "verde", motivo: "tokens en los últimos 15 min" };
  const l = (latidos || []).find((e) => latidoTrabajando(e, ahoraS));
  if (l) return { estado: "verde", motivo: l.source === "process_snapshot" ? "proceso activo (cpu " + l.cpu + " %)" : "latido «trabajando»" };
  return { estado: "gris", motivo: (latidos || []).length ? "parado" : "sin latido" };
}

const encargoDe = (...t) => { for (const x of t) { const m = String(x || "").match(/(?:encargo\s*)?#(\d{3,6})\b/i) || String(x || "").match(/\b(FLT-\d{3,6})\b/); if (m) return m[1].startsWith("FLT") ? m[1] : "#" + m[1]; } return null; };
const limpio = (s, n = 140) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Tarjetas: presencia (lista) + velocidad (respuesta de /api/consumos/velocidad) → [{ agente, estado, … }] ordenado
 * verde → amarillo → gris (y dentro, por tok/h y frescura). Siempre los 6 consejeros Grok.
 */
export function tarjetas({ presencia = [], velocidad = null, ahoraS, maxEdadS = 24 * 3600 }) {
  const porAg = new Map();
  const de = (n) => porAg.get(n) || (porAg.set(n, { agente: n, latidos: [], pulso: null }), porAg.get(n));
  for (const e of presencia || []) {
    if (!e || !e.persona) continue;
    const upd = Number(e.declared_updated || e.updated) || 0;
    if (ahoraS - upd > maxEdadS) continue;
    de(canonico(e.persona)).latidos.push(e);
  }
  for (const a of (velocidad && velocidad.porAgente) || []) if (a && a.agente) de(canonico(a.agente)).pulso = a;
  for (const c of (velocidad && velocidad.conocidos) || []) if (c && c.agente) { const x = de(canonico(c.agente)); x.perfil = c; }
  for (const n of CONSEJEROS_GROK) de(n);
  const out = [];
  for (const x of porAg.values()) {
    // Dedupe: varias máquinas → manda el latido más fresco (y, si alguno dice «trabajando», ese).
    x.latidos.sort((a, b) => (latidoTrabajando(b, ahoraS) - latidoTrabajando(a, ahoraS)) || ((Number(b.declared_updated || b.updated) || 0) - (Number(a.declared_updated || a.updated) || 0)));
    const l = x.latidos[0] || null, p = x.pulso, pf = x.perfil || null;
    // Fuera: entradas del pulso sin tokens hoy, sin latido y sin perfil conocido (p. ej. «Anónimo»), salvo los consejeros.
    if (!x.latidos.length && !CONSEJEROS_GROK.includes(x.agente) && !(p && Number(p.tokHoy) > 0) && !pf) continue;
    const st = estadoTrabajo({ tokHora: p ? p.tokHora : null, conCarlos: !!(p && p.conCarlos), latidos: x.latidos, ahoraS });
    if (st.motivo === "sin latido" && p && Number(p.tokHoy) > 0) st.motivo = "parado";
    const ultPulso = p && p.ultimoEvento ? Math.floor(Date.parse(p.ultimoEvento) / 1000) : 0;
    const ultimo = Math.max(l ? Number(l.declared_updated || l.updated) || 0 : 0, ultPulso);
    // Manda el pulso si está quemando tokens o es más reciente que el último latido (Neo: latido viejo del MBP14, pulso del MBP16).
    const enPulso = !!(p && (Number(p.tokHora) > 0 || ultPulso > (l ? Number(l.declared_updated || l.updated) || 0 : 0)));
    // Gris: «hace X» y máquina salen de la MISMA fuente, la más fresca de latido / proceso / pulso de tokens.
    let fresca = null;
    for (const e of x.latidos) { const ts = Number(e.declared_updated || e.updated) || 0; if (ts && (!fresca || ts > fresca.ts)) fresca = { ts, maquina: e.machine || null, fuente: e.source || "heartbeat" }; }
    if (ultPulso && (!fresca || ultPulso > fresca.ts)) fresca = { ts: ultPulso, maquina: (p && p.maquina) || null, fuente: "pulso" };
    const gris = st.estado === "gris" && fresca;
    const motor = p && p.motor ? (p.motor === "claude" ? "Claude Code" : p.motor === "codex" ? "Codex" : p.motor) : (l && l.runtime) || null;
    const r = RETRATOS[x.agente];
    out.push({
      agente: x.agente, estado: st.estado, motivo: st.motivo,
      maquina: (gris && fresca.maquina) || (enPulso && p.maquina) || (l && l.machine) || (p && p.maquina) || (pf && pf.maquina) || null,
      motor, modelo: (l && l.model) || (pf && pf.modelo) || null,
      foco: limpio(l && l.focus), tarea: limpio(l && l.task, 120),
      proyecto: (enPulso && p.proyectoAhora) || (l && l.project) || (p && p.proyectoAhora) || null,
      encargo: encargoDe(l && l.task, l && l.focus),
      tokHora: p && p.tokHora != null ? p.tokHora : null, tokHoy: p ? p.tokHoy || 0 : null,
      haceS: gris ? Math.max(0, ahoraS - fresca.ts) : ultimo ? Math.max(0, ahoraS - ultimo) : null, fuente: gris ? fresca.fuente : l ? l.source : (p ? "pulso" : null),
      maquinas: [...new Set(x.latidos.map((e) => e.machine).filter(Boolean))],
      retrato: r ? r : (AVATARES[sinTilde(x.agente)] ? { img: AVATARES[sinTilde(x.agente)] } : null),
      consejero: CONSEJEROS_GROK.includes(x.agente),
    });
  }
  const ord = { verde: 0, amarillo: 1, gris: 2 };
  return out.sort((a, b) => ord[a.estado] - ord[b.estado] || (b.tokHora || 0) - (a.tokHora || 0) || (a.haceS ?? 1e12) - (b.haceS ?? 1e12) || a.agente.localeCompare(b.agente));
}
