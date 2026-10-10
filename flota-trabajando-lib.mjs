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
 *  · Tokens honestos: tokHora es «≈ 15 min × 4»; se manda también tokUltimaHora (real) y sinMedicion cuando no hay
 *    medición de tokens (sin pulso, o pulso a 0 todo el día) para no pintar «0» como si fuera un dato.
 */
export const VENTANA_LATIDO_S = 120;
/** r4 (Jensen, 10-10-2026 · Carlos: «no veo al Merovingio ni a Oráculo»): trabajando también = latido de < 15 min Y
 *  encargo in_progress en su bandeja, sea cual sea el runtime y aunque sea el plan C gratis (OpenCode/Nemotron no
 *  reporta tokens: 0 tok/h no es «parado»). Merovingio (deepagent de Musk) cuenta como trabajando con latido vivo. */
export const VENTANA_VIVO_S = 900;
export const VIVO_SIEMPRE = ["Merovingio"];
/** Modelo principal (de pago) cuando la instancia que late es la del plan C gratis. */
export const PRINCIPAL = { Merovingio: "Grok CLI", "Oráculo": "Codex", Morfeo: "Claude Code", Trinity: "Codex", Smith: "Grok", Neo: "Claude Code" };
export const CPU_MIN = 5;
export const CONSEJEROS_GROK = ["Jobs", "Wozniak", "Lucas", "Disney", "Musk", "Huang"];
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
  if (/(^|[^a-z])merovingio/.test(base) || /^elon(\s*\/.*)?$/.test(base) || /^elon(mba\d*|mbp\d*|macbook.*|grokbot|box)$/.test(base)) return "Merovingio";
  for (const c of CANON) {
    const k = sinTilde(c);
    if (base === k || base.endsWith(" " + k) || (base.startsWith(k) && /^(mbp\d*|macbook.*|macmini|mini|grokbot|box|mba.*|\d+)$/.test(base.slice(k.length)))) return c;
  }
  if (/^(walt|walt disney)$/.test(base)) return "Disney";
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
const fresco = (e, ahoraS) => ahoraS - (Number(e && (e.declared_updated || e.updated)) || 0) < VENTANA_LATIDO_S;

/**
 * Máquinas que Carlos está usando AHORA (claves de claveMaquina) → motivo. Señales, de más a menos directa:
 *  · pulso fresco de un agente con conCarlos (el pulso ya exige reposo HID < 5 min);
 *  · latido/instantánea fresca con con_carlos:true / conCarlos:true;
 *  · process_snapshot fresco con reposo HID medido < 5 min (idle; 0 con cpu 0 = sin medir, no cuenta).
 */
export function maquinasConCarlos({ presencia = [], velocidad = null, ahoraS }) {
  const m = new Map();
  for (const a of (velocidad && velocidad.porAgente) || []) if (a && a.conCarlos && a.maquina) m.set(claveMaquina(a.maquina), "pulso: " + (a.conCarlosMotivo || "con Carlos"));
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
  if (e.host === "app" && e.source === "process_snapshot") return true;
  if (String(e.session_id || "").startsWith("desktop:")) return true;
  if (e.host === "cli" && (e.attached === true || e.terminal_visible === true)) return true;
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
 * Tarjetas: presencia (lista) + velocidad (respuesta de /api/consumos/velocidad) → [{ agente, estado, … }] ordenado
 * verde → amarillo → gris (y dentro, por tok/h y frescura). Siempre los 6 consejeros Grok y Merovingio (SIEMPRE).
 */
export function tarjetas({ presencia = [], velocidad = null, ahoraS, maxEdadS = 24 * 3600, carga = null }) {
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
  for (const n of SIEMPRE) de(n);
  const activas = maquinasConCarlos({ presencia, velocidad, ahoraS });
  const out = [];
  for (const x of porAg.values()) {
    // Dedupe: varias máquinas → manda el latido más fresco (y, si alguno dice «trabajando», ese).
    x.latidos.sort((a, b) => (latidoTrabajando(b, ahoraS) - latidoTrabajando(a, ahoraS)) || ((Number(b.declared_updated || b.updated) || 0) - (Number(a.declared_updated || a.updated) || 0)));
    const l = x.latidos[0] || null, p = x.pulso, pf = x.perfil || null;
    // Fuera: entradas del pulso sin tokens hoy, sin latido y sin perfil conocido (p. ej. «Anónimo»), salvo los consejeros.
    if (!x.latidos.length && !SIEMPRE.includes(x.agente) && !(p && Number(p.tokHoy) > 0) && !pf) continue;
    // r39: un pulso con retraso (Cursor) nunca pone en verde; los consejeros Grok, solo por su latido en vivo.
    const tokVivo = p && !p.conRetraso ? p.tokHora : null;
    const ccPres = p && p.conCarlos ? null : conCarlosPorPresencia(x.latidos, activas, ahoraS);
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
    if (PRINCIPAL[x.agente] && (!motor || esGratis(motor, modeloCard))) { motor = PRINCIPAL[x.agente]; modeloCard = null; }
    const soloGratis = inst.size > 0 && !nPago && !PRINCIPAL[x.agente];
    // Merovingio late por DeepAgents pero su modelo es Grok CLI de pago: sin nota de plan C.
    const planC = nGratis > 0 && !soloGratis && !VIVO_SIEMPRE.includes(x.agente);
    const r = RETRATOS[x.agente];
    out.push({
      agente: x.agente, estado: st.estado, motivo: st.motivo,
      maquina: (ccPres && ccPres.maquina) || (gris && fresca.maquina) || (enPulso && p.maquina) || (l && l.machine) || (p && p.maquina) || (pf && pf.maquina) || null,
      motor, modelo: modeloCard,
      enCurso, instancias: inst.size, planC, gratis: soloGratis,
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
      consejero: CONSEJEROS_GROK.includes(x.agente),
    });
  }
  const ord = { verde: 0, amarillo: 1, gris: 2 };
  return out.sort((a, b) => ord[a.estado] - ord[b.estado] || (b.tokHora || 0) - (a.tokHora || 0) || (a.haceS ?? 1e12) - (b.haceS ?? 1e12) || a.agente.localeCompare(b.agente));
}
