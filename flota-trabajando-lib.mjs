/**
 * «Trabajando ahora» de /consumos (GrokBotBox, 09-10-2026 · r28). Funciones PURAS (sin red).
 * Carlos: «¿cómo puedo saber en tiempo real quién trabaja?».
 * Une la presencia de Yokup (bot.yokup.com/api/presence: latidos «heartbeat» de yokup_presencia y «process_snapshot»
 * de los vigilantes de los Mac) con el pulso de tokens (/api/consumos/velocidad: tok/h de los últimos 15 min y
 * «con Carlos»). Estado de cada tarjeta (estadoTrabajo):
 *   amarillo = con Carlos · verde = trabajando · gris = parado / sin latido.
 * Trabajando si: tok/h > 0 del pulso, o latido con trabajando (mode «trabajando» / trabajando:true / working:true)
 * de hace < 2 min, o process_snapshot con CPU DEL PROCESO (proc_cpu o cpu_scope «process») > 5 y declarado hace < 2 min.
 * r40 (Carlos, 10-10-2026 — «que todos sus feedbacks sean seguros»):
 *  · «con Carlos» ya no sale solo del pulso: también de la presencia, si hay una entrada fresca (< 2 min) que muestra a
 *    Carlos al mando (app de escritorio: host «app» / session_id «desktop:*»; o tmux con cliente adjunto) EN LA MÁQUINA
 *    QUE CARLOS ESTÁ USANDO (maquinasConCarlos: pulso con conCarlos, latido con con_carlos:true, o reposo HID medido
 *    < 5 min en un process_snapshot). Una app abierta en un Mac en reposo NO cuenta (no se inventa).
 *  · La CPU de los process_snapshot es la de TODA la máquina (todas las filas de un Mac traen la misma cpu/idle): ya no
 *    pone a nadie en verde. Solo cuenta proc_cpu (o cpu_scope «process»).
 *  · Merovingio (Elon / Merovingio, el Grok principal) siempre sale, como los consejeros; «Elon» → Merovingio, no Musk.
 *  · r41 (Carlos, 12:48): «con Carlos · MBP16» (máquina corta en conCarlosEn); una app de escritorio solo cuenta si el
 *    vigilante la ve adjunta (attached / terminal_visible) — la mera sesión «desktop:*» no; varios pulsos del mismo
 *    agente en varias máquinas ya no se pisan (antes ganaba el último); un Mac también está «en uso» si su pulso dice
 *    «reposo Ns» con N < 5 min.
 *  · Tokens honestos: tokHora es «≈ 15 min × 4»; se manda también tokUltimaHora (real) y sinMedicion cuando no hay
 *    medición de tokens (sin pulso, o pulso a 0 todo el día) para no pintar «0» como si fuera un dato.
 */
import { CONSEJEROS as CONSEJO, GENERACIONES } from "./mcp/server/src/consejo.js";
import { POOL_MEROVINGIO, fueraDeLas6, CONSEJEROS_GRATIS } from "./flota-matriz-lib.mjs";
export const VENTANA_LATIDO_S = 120;
/** r4 (Jensen, 10-10-2026 · Carlos: «no veo al Merovingio ni a Oráculo»): trabajando también = latido de < 15 min Y
 *  encargo in_progress en su bandeja, sea cual sea el runtime y aunque sea el plan C gratis (OpenCode/Nemotron no
 *  reporta tokens: 0 tok/h no es «parado»). Merovingio (deepagent de Musk) cuenta como trabajando con latido vivo. */
export const VENTANA_VIVO_S = 900;
export const VIVO_SIEMPRE = ["Merovingio"];
/** Modelo principal (de pago) cuando la instancia que late es la del plan C gratis. */
export const PRINCIPAL = { Merovingio: "Grok Bot · Grok CLI", "Oráculo": "Codex", Morfeo: "Claude Code", Trinity: "Codex", Smith: "Grok", Neo: "Claude Code" };
export const CPU_MIN = 5;
export const CONSEJEROS_GROK = ["Jobs", "Wozniak", "Lucas", "Disney", "Musk", "Huang"];
/**
 * r43 (Carlos, 12:59): la franja separa AGENTES de CONSEJEROS. Fuente de verdad del Consejo: los 16 de
 * mcp/server/src/consejo.js (leyendas y coetáneos: Jobs, Wozniak, Cook, Buffett, Disney, Rams, Schultz, Lucas, Musk,
 * Huang, Shotwell, Porat, Lasseter, Ive, Ratti, Reynolds), por apellido. Merovingio, Cypher, Trinity… son agentes aunque
 * un consejero dependa de ellos.
 */
export const APELLIDOS_CONSEJO = [...new Set(CONSEJO.flatMap((c) => GENERACIONES.map((g) => String(c[g] || "").trim().split(/\s+/).pop())).filter(Boolean))];
const CLAVES_CONSEJO = new Set([...APELLIDOS_CONSEJO, ...CONSEJEROS_GROK].map((n) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
/** ¿Es un consejero (leyenda o coetáneo)? Acepta «Jobs», «Steve Jobs», «Gwynne Shotwell», «Ive»… */
export function esConsejero(nombre) {
  const k = String(nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!k || /merovingio/.test(k)) return false;
  return CLAVES_CONSEJO.has(k) || CLAVES_CONSEJO.has(k.split(/\s+/).pop());
}
/** Grupo de una tarjeta: «consejeros» | «agentes». */
export const grupoDe = (nombre) => (esConsejero(nombre) ? "consejeros" : "agentes");
/** Siempre en la franja aunque no haya latido (r40: Merovingio es el agente Grok principal de Carlos). */
export const SIEMPRE = [...CONSEJEROS_GROK, "Merovingio"];
/** Reposo HID (s) por debajo del cual Carlos está usando esa máquina. */
export const REPOSO_ACTIVO_S = 300;
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
// r44 (Carlos, 13:14): Merovingio tiene SU cara (el Merovingio de Matrix, /avatars/merovingio.jpg); Musk, la suya.
RETRATOS.Merovingio = { img: "/avatars/merovingio.jpg" };
/** r44: dualidad Elon ↔ Merovingio (Elon hace las cosas a través de Merovingio): consejero que se enseña con el estado de su agente. */
// r45 (Carlos, 13:23): Huang igual que Musk (su consumo ya iba en el pool de Merovingio).
export const DUALIDAD = { Musk: "Merovingio", Huang: "Merovingio", Jobs: "Smith", Wozniak: "Smith" };
// r11 (Carlos, 13:57 · «Jobs no sale en CONSEJEROS»): Jobs y Wozniak, los 2 consejeros principales de csilva@admira.com,
// van incluidos en el Grok de Smith (flota-matriz-lib MAPA: incluidoEn «Smith»), igual que Musk y Huang en el pool de
// Merovingio. Sin latido propio salían en gris, escondidos entre los «parados»: ahora, si su ficha está parada y Smith
// está vivo, salen «activo vía Smith» con el estado de Smith (tokens en la ficha de Smith). Con latido propio vivo,
// manda el suyo.

/** r14: cuenta de Grok Bot de cada consejero principal (la app de escritorio donde Carlos los tiene abiertos). */
export const CUENTA_GROKBOT = { Jobs: "csilva@admira.com", Wozniak: "csilva@admira.com", Musk: "csilvasantin@gmail.com", Huang: "csilvasantin@gmail.com" };
export const REPOSO_CON_CARLOS_S = 300;
/** r14: coloca a cada consejero en el Mac donde su app Grok Bot está abierta (la más fresca; al frente gana). */
export function colocarPorAppGrokBot(out, apps) {
  if (!Array.isArray(apps) || !apps.length) return out;
  for (const t of out) {
    const cuenta = CUENTA_GROKBOT[t.agente];
    if (!cuenta || (!t.via && t.estado !== "gris")) continue; // con latido propio vivo, manda el suyo
    const conCuenta = apps.filter((a) => a && a.cuenta === cuenta);
    if (!conCuenta.length) continue;
    const delante = (a) => a.alFrente && a.reposoS != null && a.reposoS < REPOSO_CON_CARLOS_S;
    const app = [...conCuenta].sort((a, b) => delante(b) - delante(a) || (a.reposoS ?? 1e9) - (b.reposoS ?? 1e9) || (a.haceS || 0) - (b.haceS || 0))[0];
    t.maquina = app.maquina;
    t.maquinas = [app.maquina];
    t.app = { nombre: "Grok Bot", cuenta, alFrente: !!app.alFrente, reposoS: app.reposoS ?? null };
    if (delante(app)) {
      t.estado = t.estado === "verde" ? "verde" : "amarillo";
      t.conCarlosEn = maquinaCorta(app.maquina);
      t.motivo = "con Carlos: app Grok Bot al frente en " + maquinaCorta(app.maquina) + (t.via ? " · tokens vía " + t.via : "");
    } else {
      if (t.conCarlosEn && t.estado === "amarillo") t.estado = t.via ? "verde" : "gris";
      t.conCarlosEn = null;
      t.motivo = (t.motivo || "") + " · app Grok Bot abierta en " + maquinaCorta(app.maquina);
    }
  }
  return out;
}

/** r11: runtime corto de una ficha para la franja: cerrados «Grok» / «Codex» / «Claude»; abiertos «OpenCode · Nemotron 3 Ultra»
 *  (o el runtime y el modelo abierto reales). */
export function runtimeCorto({ motor = null, modelo = null, gratis = false } = {}) {
  const m = String(motor || ""), mo = String(modelo || ""), t = (m + " " + mo).toLowerCase();
  if (gratis || esGratis(m, mo) || /nemotron|llama|qwen|deepseek|mistral|gemma|kimi|glm/.test(t)) {
    const rt = /deepagents/.test(t) ? "DeepAgents" : "OpenCode";
    let mod = "Nemotron 3 Ultra";
    if (!/nemotron/.test(t)) {
      const x = (mo || m).replace(/:free\b/gi, "").replace(/\b(gratis|por defecto|free)\b/gi, "").split(/[·(]/)[0].trim().split("/").pop().replace(/:free$/i, "");
      if (x && !/^(opencode|deepagents)$/i.test(x)) mod = x;
    }
    return rt + " · " + mod;
  }
  if (/claude/.test(t)) return "Claude";
  if (/codex|chatgpt|openai/.test(t)) return "Codex";
  if (/grok|cursor/.test(t)) return "Grok";
  return m || null;
}
const AVATARES = { neo: "/avatars/neo.jpg", trinity: "/avatars/trinity.jpg", morfeo: "/avatars/morfeo.jpg", smith: "/avatars/smith.jpg", oraculo: "/avatars/oraculo.png" };
const CANON = ["Jobs", "Wozniak", "Lucas", "Disney", "Musk", "Huang", "Neo", "Trinity", "Morfeo", "Oráculo", "Smith", "Niobe", "Cypher", "Merovingio", "Link", "Grok Bot"];

/** OpenCode / DeepAgents / Nemotron / NVIDIA free → plan C gratis. */
export const esGratis = (runtime, model) => /opencode|deepagents|nemotron|nvidia|:free/i.test(String(runtime || "") + " " + String(model || ""));
/** «Oráculo» → «Oraculo» (clave de persona de la bandeja / del MCP). */
const personaCenso = (n) => (n === "Oráculo" ? "Oraculo" : n);
const sinTilde = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** «NeoMBP16» → «Neo», «Oraculo» → «Oráculo», «TrinityMacBookPro16» → «Trinity», «Steve Jobs» → «Jobs». */
export function canonico(persona) {
  const p = String(persona || "").trim();
  if (!p) return "";
  const base = sinTilde(p).split("·")[0].trim();
  // r40: «Elon / Merovingio», «Elon», «MerovingioMBA16»… → Merovingio (el Grok principal), nunca el consejero Musk.
  // r42: la bolsa de Grok Bot de la cuenta («Grok Bot (Consejo)», «Grok Bot») se enseña como Merovingio.
  if (/^(tokens\s+)?grok\s*bot(\s*\((consejo|pool|cursor[^)]*)\))?$/.test(base) || /(^|[^a-z])merovingio/.test(base) || /^elon(\s*\/.*)?$/.test(base) || /^elon(mba\d*|mbp\d*|macbook.*|grokbot|box)$/.test(base)) return "Merovingio";
  for (const c of CANON) {
    const k = sinTilde(c);
    if (base === k || base.endsWith(" " + k) || (base.startsWith(k) && /^(mbp\d*|macbook.*|macmini|mini|grokbot|box|mba.*|\d+)$/.test(base.slice(k.length)))) return c;
  }
  if (/^(walt|walt disney)$/.test(base)) return "Disney";
  if (/^jensen/.test(base)) return "Huang";
  // r43: «Gwynne Shotwell», «Jony Ive»… → apellido del Consejo (mcp/server/src/consejo.js).
  const ap = base.split(/\s+/).pop();
  const c = APELLIDOS_CONSEJO.find((x) => sinTilde(x) === ap);
  if (c && base.includes(" ")) return c;
  return p;
}

/** ¿El latido / la instantánea dice que trabaja ahora? */
export function latidoTrabajando(e, ahoraS) {
  if (!e) return false;
  const upd = Number(e.declared_updated || e.updated) || 0;
  const fresco = ahoraS - upd < VENTANA_LATIDO_S;
  if (!fresco) return false;
  if (e.trabajando === true || e.working === true || String(e.mode || "").toLowerCase() === "trabajando") return true;
  // r40: e.cpu de un process_snapshot es la CPU de toda la máquina → no vale. Solo la del proceso del agente.
  if (e.source === "process_snapshot" && cpuProceso(e) > CPU_MIN) return true;
  return false;
}

/** CPU del propio proceso del agente, o null si solo hay la de la máquina. */
export function cpuProceso(e) {
  if (!e) return null;
  if (e.proc_cpu != null && isFinite(Number(e.proc_cpu))) return Number(e.proc_cpu);
  if (e.cpu_scope === "process" && isFinite(Number(e.cpu))) return Number(e.cpu);
  return null;
}

/** «MacBook Pro 16», «MacBookPro16», «MacBook-Pro-16.local» → «macbookpro16». */
export function claveMaquina(m) {
  return sinTilde(m).replace(/\.local$/, "").replace(/[^a-z0-9]/g, "");
}
const CORTAS = { macbookpro16: "MBP16", macbookair16plata: "MBA16", macbookpronegro14: "MBP14", macbookpro14: "MBP14", macmini: "Mini", grokbotbox: "Box", grokbot: "GrokBot" };
/** «MacBook Pro 16» → «MBP16», «MacBookAir16plata» → «MBA16», «MacMini» → «Mini»; desconocida → tal cual. */
export function maquinaCorta(m) {
  if (!m) return null;
  return CORTAS[claveMaquina(m)] || String(m);
}
const fresco = (e, ahoraS) => ahoraS - (Number(e && (e.declared_updated || e.updated)) || 0) < VENTANA_LATIDO_S;

/**
 * Máquinas que Carlos está usando AHORA (claves de claveMaquina) → motivo. Señales, de más a menos directa:
 *  · pulso fresco de un agente con conCarlos (el pulso ya exige reposo HID < 5 min);
 *  · latido/instantánea fresca con con_carlos:true / conCarlos:true;
 *  · process_snapshot fresco con reposo HID medido < 5 min (idle; 0 con cpu 0 = sin medir, no cuenta).
 */
export function maquinasConCarlos({ presencia = [], velocidad = null, ahoraS }) {
  const m = new Map();
  for (const a of (velocidad && velocidad.porAgente) || []) {
    if (!a || !a.maquina) continue;
    if (a.conCarlos) { m.set(claveMaquina(a.maquina), "pulso: " + (a.conCarlosMotivo || "con Carlos")); continue; }
    // «Mac activo (reposo 150s, Firefox al frente) pero sin señal de este agente»: el Mac está en uso (no el agente).
    const r = String(a.conCarlosMotivo || "").match(/reposo (\d+)\s*s\b/);
    if (r && Number(r[1]) < REPOSO_ACTIVO_S && !a.stale && !m.has(claveMaquina(a.maquina))) m.set(claveMaquina(a.maquina), "pulso: reposo " + r[1] + " s");
  }
  for (const e of presencia || []) {
    if (!e || !e.machine || !fresco(e, ahoraS)) continue;
    const k = claveMaquina(e.machine);
    if (m.has(k)) continue;
    if (e.con_carlos === true || e.conCarlos === true) { m.set(k, "latido con_carlos"); continue; }
    const idle = Number(e.idle), medido = e.idle != null && isFinite(idle) && (idle > 0 || Number(e.cpu) > 0);
    if (e.source === "process_snapshot" && e.declaration_state === "exact_surface" && medido && idle < REPOSO_ACTIVO_S) m.set(k, "reposo " + idle + " s");
  }
  return m;
}

/** ¿Esta entrada de presencia es una superficie que Carlos maneja (app de escritorio o tmux con cliente adjunto)? */
export function superficieDeCarlos(e) {
  if (!e) return false;
  if (e.con_carlos === true || e.conCarlos === true) return true;
  // r41: la ranura «desktop:*» existe aunque nadie la mire (en el Air salían Neo y Trinity sin estar con Carlos): solo
  // cuenta si el vigilante la ve adjunta/visible. Igual para tmux: cliente adjunto.
  const app = e.host === "app" || String(e.session_id || "").startsWith("desktop:");
  if ((app || e.host === "cli") && (e.attached === true || e.terminal_visible === true)) return true;
  return false;
}

/** «con Carlos» por presencia: superficie de Carlos, fresca, en una máquina que Carlos está usando. → motivo | null. */
export function conCarlosPorPresencia(latidos, activas, ahoraS) {
  for (const e of latidos || []) {
    if (!fresco(e, ahoraS) || !superficieDeCarlos(e)) continue;
    const k = claveMaquina(e.machine);
    if (!activas || !activas.has(k)) continue;
    const sup = e.host === "app" || String(e.session_id || "").startsWith("desktop:") ? "app de escritorio" : "tmux «" + (e.session_id || "?") + "»";
    return { motivo: "con Carlos (" + sup + " en " + e.machine + ")", maquina: e.machine };
  }
  return null;
}

/** Estado de una tarjeta: { estado:'amarillo'|'verde'|'gris', motivo }. */
export function estadoTrabajo({ tokHora = null, conCarlos = false, latidos = [], ahoraS, enCurso = 0, siempreVivo = false }) {
  if (conCarlos) return { estado: "amarillo", motivo: typeof conCarlos === "string" ? conCarlos : "con Carlos" };
  if (Number(tokHora) > 0) return { estado: "verde", motivo: "tokens en los últimos 15 min" };
  const l = (latidos || []).find((e) => latidoTrabajando(e, ahoraS));
  if (l) return { estado: "verde", motivo: l.source === "process_snapshot" ? "proceso activo (cpu " + l.cpu + " %)" : "latido «trabajando»" };
  // r4: latido de < 15 min + encargo en curso (o Merovingio con latido) → trabajando, sin mirar runtime ni coste.
  const ult = Math.max(0, ...(latidos || []).map((e) => Number(e && (e.declared_updated || e.updated)) || 0));
  const vivo = ult > 0 && ahoraS - ult < VENTANA_VIVO_S;
  if (vivo && Number(enCurso) > 0) return { estado: "verde", motivo: "latido de hace " + Math.max(0, ahoraS - ult) + " s y " + enCurso + " encargo" + (enCurso > 1 ? "s" : "") + " en curso" };
  if (vivo && siempreVivo) return { estado: "verde", motivo: "latido vivo (deepagent de Musk)" };
  return { estado: "gris", motivo: (latidos || []).length ? "parado" : "sin latido" };
}

const encargoDe = (...t) => { for (const x of t) { const m = String(x || "").match(/(?:encargo\s*)?#(\d{3,6})\b/i) || String(x || "").match(/\b(FLT-\d{3,6})\b/); if (m) return m[1].startsWith("FLT") ? m[1] : "#" + m[1]; } return null; };
const limpio = (s, n = 140) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Varios pulsos del mismo agente (uno por máquina) → uno: manda el que está con Carlos, si no el que más tok/h quema,
 * si no el más reciente; las cifras de tokens se suman (son de máquinas distintas). null si no hay ninguno.
 */
export function unirPulsos(ps) {
  const v = (ps || []).filter(Boolean);
  if (!v.length) return null;
  if (v.length === 1) return v[0];
  const t = (a) => Date.parse(a.ultimoEvento || a.ultimoPulso || 0) || 0;
  const base = [...v].sort((a, b) => (!!b.conCarlos - !!a.conCarlos) || ((Number(b.tokHora) || 0) - (Number(a.tokHora) || 0)) || (t(b) - t(a)))[0];
  const suma = (k) => v.some((a) => a[k] != null) ? v.reduce((n, a) => n + (Number(a[k]) || 0), 0) : null;
  const vivos = v.filter((a) => !a.conRetraso);
  return { ...base, tokHoy: suma("tokHoy"), tokUltimaHora: suma("tokUltimaHora"),
    tokHora: vivos.some((a) => a.tokHora != null) ? vivos.reduce((n, a) => n + (Number(a.tokHora) || 0), 0) : base.tokHora,
    maquinasPulso: v.map((a) => a.maquina).filter(Boolean) };
}

/**
 * Tarjetas: presencia (lista) + velocidad (respuesta de /api/consumos/velocidad) → [{ agente, estado, … }] ordenado
 * verde → amarillo → gris (y dentro, por tok/h y frescura). Siempre los 6 consejeros Grok y Merovingio (SIEMPRE).
 */
export function tarjetas({ presencia = [], velocidad = null, ahoraS, maxEdadS = 24 * 3600, carga = null }) {
  const porAg = new Map();
  const de = (n) => porAg.get(n) || (porAg.set(n, { agente: n, latidos: [], pulsos: [] }), porAg.get(n));
  for (const e of presencia || []) {
    if (!e || !e.persona) continue;
    const upd = Number(e.declared_updated || e.updated) || 0;
    if (ahoraS - upd > maxEdadS) continue;
    de(canonico(e.persona)).latidos.push(e);
  }
  // r41: un agente puede tener pulso en varias máquinas (Neo en el MBP16 y en el Air): se juntan, no se pisan.
  for (const a of (velocidad && velocidad.porAgente) || []) if (a && a.agente) de(canonico(a.agente)).pulsos.push(a);
  for (const c of (velocidad && velocidad.conocidos) || []) if (c && c.agente) { const x = de(canonico(c.agente)); x.perfil = c; }
  for (const n of SIEMPRE) de(n);
  // r6 (Carlos): los asistentes de Grok Bot de csilvasantin (Musk, Huang, Mouse, «Grok Bot (Consejo)»…) tiran del MISMO
  // pool de Grok que Merovingio: su consumo y sus latidos van en la ficha de Merovingio, no como fichas aparte.
  const mero = de("Merovingio"); mero.incluye = [];
  for (const n of POOL_MEROVINGIO) {
    const x = porAg.get(n);
    if (!x || n === "Merovingio") continue;
    mero.incluye.push(n);
    mero.latidos.push(...x.latidos);
    // r44: los pulsos van en «pulsos» (r41) y se suman con unirPulsos; «x.pulso» ya no existía y se perdían.
    mero.pulsos.push(...x.pulsos.map((a) => ({ ...a, agente: "Merovingio" })));
    if (x.perfil && !mero.perfil) mero.perfil = x.perfil;
    porAg.delete(n);
  }
  const activas = maquinasConCarlos({ presencia, velocidad, ahoraS });
  const out = [];
  for (const x of porAg.values()) {
    // Dedupe: varias máquinas → manda el latido más fresco (y, si alguno dice «trabajando», ese).
    x.latidos.sort((a, b) => (latidoTrabajando(b, ahoraS) - latidoTrabajando(a, ahoraS)) || ((Number(b.declared_updated || b.updated) || 0) - (Number(a.declared_updated || a.updated) || 0)));
    const l = x.latidos[0] || null, p = unirPulsos(x.pulsos), pf = x.perfil || null;
    // Fuera: entradas del pulso sin tokens hoy, sin latido y sin perfil conocido (p. ej. «Anónimo»), salvo los consejeros.
    if (!x.latidos.length && !SIEMPRE.includes(x.agente) && !(p && Number(p.tokHoy) > 0) && !pf) continue;
    // r39: un pulso con retraso (Cursor) nunca pone en verde; los consejeros Grok, solo por su latido en vivo.
    const tokVivo = p && !p.conRetraso ? p.tokHora : null;
    const ccPres = p && p.conCarlos ? null : conCarlosPorPresencia(x.latidos, activas, ahoraS);
    const conCarlosEn = p && p.conCarlos ? maquinaCorta(p.maquina) : ccPres ? maquinaCorta(ccPres.maquina) : null;
    const cg = carga && typeof carga.get === "function" ? carga.get(personaCenso(x.agente)) || null : null;
    const enCurso = cg ? Number(cg.in_progress) || 0 : 0;
    const st = estadoTrabajo({ tokHora: tokVivo, conCarlos: (p && p.conCarlos) ? true : ccPres ? ccPres.motivo : false, latidos: x.latidos, ahoraS, enCurso, siempreVivo: VIVO_SIEMPRE.includes(x.agente) });
    // r4: instancias vivas (< 15 min) por máquina+runtime; las de OpenCode/DeepAgents/Nemotron son el plan C gratis.
    const inst = new Map();
    for (const e of x.latidos) if (ahoraS - (Number(e.declared_updated || e.updated) || 0) < VENTANA_VIVO_S) inst.set(claveMaquina(e.machine) + "|" + sinTilde(e.runtime), esGratis(e.runtime, e.model));
    const nGratis = [...inst.values()].filter(Boolean).length, nPago = inst.size - nGratis;
    if (st.motivo === "sin latido" && p && Number(p.tokHoy) > 0) st.motivo = "parado";
    const ultPulso = p && p.ultimoEvento ? Math.floor(Date.parse(p.ultimoEvento) / 1000) : 0;
    const ultimo = Math.max(l ? Number(l.declared_updated || l.updated) || 0 : 0, ultPulso);
    // Manda el pulso si está quemando tokens o es más reciente que el último latido (Neo: latido viejo del MBP14, pulso del MBP16).
    const enPulso = !!(p && (Number(tokVivo) > 0 || ultPulso > (l ? Number(l.declared_updated || l.updated) || 0 : 0)));
    // Gris: «hace X» y máquina salen de la MISMA fuente, la más fresca de latido / proceso / pulso de tokens.
    let fresca = null;
    for (const e of x.latidos) { const ts = Number(e.declared_updated || e.updated) || 0; if (ts && (!fresca || ts > fresca.ts)) fresca = { ts, maquina: e.machine || null, fuente: e.source || "heartbeat" }; }
    if (ultPulso && (!fresca || ultPulso > fresca.ts)) fresca = { ts: ultPulso, maquina: (p && p.maquina) || null, fuente: "pulso" };
    const gris = st.estado === "gris" && fresca;
    let motor = p && p.motor ? (p.motor === "claude" ? "Claude Code" : p.motor === "codex" ? "Codex" : p.motor) : (l && l.runtime) || null;
    let modeloCard = (l && l.model) || (pf && pf.modelo) || null;
    // r4: cada agente una vez con su modelo principal real; el plan C gratis va como nota (planC), no como su motor.
    if (PRINCIPAL[x.agente] && (!motor || esGratis(motor, modeloCard) || x.agente === "Merovingio")) { motor = PRINCIPAL[x.agente]; modeloCard = x.agente === "Merovingio" ? "pool Grok Bot csilvasantin" : null; }
    // r6: instancias vivas con modelo de pago fuera de las 6 suscripciones → regla rota (en rojo).
    const fuera = [...new Set(x.latidos.filter((e) => ahoraS - (Number(e.declared_updated || e.updated) || 0) < VENTANA_VIVO_S).map((e) => fueraDeLas6(e.persona || x.agente, e.runtime, e.model)).filter(Boolean))];
    const soloGratis = inst.size > 0 && !nPago && !PRINCIPAL[x.agente];
    // Merovingio late por DeepAgents pero su modelo es Grok CLI de pago: sin nota de plan C.
    let planC = nGratis > 0 && !soloGratis && !VIVO_SIEMPRE.includes(x.agente);
    // r6 (Carlos, 13:01): consejeros no principales → Nemotron 3 Ultra gratis por defecto (salvo que late de pago: rojo).
    let gratisDef = soloGratis;
    if (CONSEJEROS_GRATIS.includes(x.agente) && !fuera.length) { motor = "Nemotron 3 Ultra"; modeloCard = "gratis · por defecto"; gratisDef = true; planC = false; }
    const r = RETRATOS[x.agente];
    out.push({
      agente: x.agente, estado: st.estado, motivo: st.motivo,
      conCarlosEn,
      maquina: (p && p.conCarlos && p.maquina) || (ccPres && ccPres.maquina) || (gris && fresca.maquina) || (enPulso && p.maquina) || (l && l.machine) || (p && p.maquina) || (pf && pf.maquina) || null,
      motor, modelo: modeloCard,
      enCurso, instancias: inst.size, planC, gratis: gratisDef, fuera, incluye: x.incluye || null,
      foco: limpio(l && l.focus), tarea: limpio(l && l.task, 120),
      proyecto: (enPulso && p.proyectoAhora) || (l && l.project) || (p && p.proyectoAhora) || null,
      encargo: encargoDe(l && l.task, l && l.focus),
      tokHora: p && p.tokHora != null ? p.tokHora : null, tokHoy: p ? p.tokHoy || 0 : null,
      tokUltimaHora: p && p.tokUltimaHora != null ? p.tokUltimaHora : null,
      tokHoraMetodo: p && p.tokHora != null && !p.conRetraso ? "15 min × 4" : null,
      sinMedicion: !p || (!Number(p.tokHoy) && !Number(p.tokHora) && !Number(p.tokUltimaHora)),
      haceS: gris ? Math.max(0, ahoraS - fresca.ts) : ultimo ? Math.max(0, ahoraS - ultimo) : null, fuente: gris ? fresca.fuente : l ? l.source : (p ? "pulso" : null),
      maquinas: [...new Set(x.latidos.map((e) => e.machine).filter(Boolean))],
      retrato: r ? r : (AVATARES[sinTilde(x.agente)] ? { img: AVATARES[sinTilde(x.agente)] } : null),
      consejero: esConsejero(x.agente), grupo: grupoDe(x.agente),
    });
  }
  // r44 (Carlos, 13:14): Merovingio arriba (Agentes) y Elon/Musk abajo (Consejeros), A LA VEZ y con el mismo estado
  // (y el mismo «con Carlos»): Musk está activo vía Merovingio. Sus tokens están en la ficha de Merovingio (no se duplican).
  for (const [consejero, agente] of Object.entries(DUALIDAD)) {
    const a = out.find((t) => t.agente === agente);
    if (!a) continue;
    const propia = out.findIndex((t) => t.agente === consejero);
    // r11: con ficha propia, solo se sustituye si está parada y su agente no (Jobs gris + Smith vivo → activo vía Smith).
    if (propia >= 0 && !(out[propia].estado === "gris" && a.estado !== "gris")) continue;
    if (propia >= 0) out.splice(propia, 1);
    const i = a.estado === "gris";
    out.push({ ...a, agente: consejero, via: agente,
      motivo: (i ? "parado vía " : "activo vía ") + agente + " (" + a.motivo + ")",
      incluye: null, fuera: [], planC: false, gratis: false,
      tokHora: null, tokHoy: null, tokUltimaHora: null, tokHoraMetodo: null, sinMedicion: false,
      retrato: RETRATOS[consejero] || null, consejero: true, grupo: "consejeros" });
  }
  // r14 (Carlos, 14:39): la máquina de un consejero es la del Mac donde está ABIERTA su app Grok Bot (por cuenta), no la
  // de Smith/Merovingio. App al frente y Mac con reposo < 5 min → «con Carlos» en ese Mac. Los tokens siguen en la ficha
  // de Smith/Merovingio. Sin app abierta con su cuenta en ningún Mac → se queda como antes (máquina del agente).
  colocarPorAppGrokBot(out, velocidad && velocidad.grokbotApps);
  // r11: la franja alterna cada 10 s máquina ↔ runtime: se mandan ya cortos.
  for (const t of out) { t.maqCorta = maquinaCorta(t.maquina); t.runtime = runtimeCorto(t); }
  const ord = { verde: 0, amarillo: 1, gris: 2 };
  return out.sort((a, b) => ord[a.estado] - ord[b.estado] || (b.tokHora || 0) - (a.tokHora || 0) || (a.haceS ?? 1e12) - (b.haceS ?? 1e12) || a.agente.localeCompare(b.agente));
}
