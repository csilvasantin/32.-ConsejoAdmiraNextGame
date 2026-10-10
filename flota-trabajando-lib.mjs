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
export const VENTANA_LATIDO_S = 120;
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
export function estadoTrabajo({ tokHora = null, conCarlos = false, latidos = [], ahoraS }) {
  if (conCarlos) return { estado: "amarillo", motivo: typeof conCarlos === "string" ? conCarlos : "con Carlos" };
  if (Number(tokHora) > 0) return { estado: "verde", motivo: "tokens en los últimos 15 min" };
  const l = (latidos || []).find((e) => latidoTrabajando(e, ahoraS));
  if (l) return { estado: "verde", motivo: l.source === "process_snapshot" ? "proceso activo (cpu " + l.cpu + " %)" : "latido «trabajando»" };
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
export function tarjetas({ presencia = [], velocidad = null, ahoraS, maxEdadS = 24 * 3600 }) {
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
    const st = estadoTrabajo({ tokHora: tokVivo, conCarlos: (p && p.conCarlos) ? true : ccPres ? ccPres.motivo : false, latidos: x.latidos, ahoraS });
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
    const motor = p && p.motor ? (p.motor === "claude" ? "Claude Code" : p.motor === "codex" ? "Codex" : p.motor) : (l && l.runtime) || null;
    const r = RETRATOS[x.agente];
    out.push({
      agente: x.agente, estado: st.estado, motivo: st.motivo,
      conCarlosEn,
      maquina: (p && p.conCarlos && p.maquina) || (ccPres && ccPres.maquina) || (gris && fresca.maquina) || (enPulso && p.maquina) || (l && l.machine) || (p && p.maquina) || (pf && pf.maquina) || null,
      motor, modelo: (l && l.model) || (pf && pf.modelo) || null,
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
