/**
 * Turno compartido de voz en toda la sala (pantallas /sala-voz y /chat/<consejero>).
 * 12-11-2026, Carlos: «están sonando dos voces a la vez, eso no puede ser».
 * Una sola locución a la vez: lock + cola en KV, con id de mensaje y duración estimada.
 * Los consejeros tienen preferencia: su voz se adelanta a cualquier otra y no se solapa.
 * Lógica pura, comprobable con node:test.
 */
export const KEY_TURNO = "voz:turno:v1";
export const SALA_VIVA_MS = 12000;
export const MAX_COLA = 50;
export const MAX_DICHOS = 300;
export const MIN_MS = 1500;
export const MAX_MS = 45000;
export const CHAR_MS = 70;
export const PAD_MS = 700;
export const METODOS = "GET, POST, OPTIONS";

export function estimarDuracionMs(texto) {
  const n = String(texto || "").trim().length;
  if (!n) return MIN_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, n * CHAR_MS + PAD_MS));
}

export function prioridadDe(fuente, explicita) {
  const exp = String(explicita || "").toLowerCase();
  if (exp === "consejero" || exp === "otra") return exp;
  const s = String(fuente || "").toLowerCase();
  if (s.startsWith("sala-voz") || s.startsWith("chat") || s === "consejero") return "consejero";
  return "otra";
}

export function rangoPrio(p) {
  return p === "consejero" ? 100 : 10;
}

export function parseConsejo(v) {
  const s = String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  if (["coetaneos", "coetaneo", "peers", "contemporaries", "contemporaneos"].includes(s)) return "coetaneos";
  if (["leyendas", "leyenda", "legends"].includes(s)) return "leyendas";
  return "";
}

function marcarSala(doc, req, ahora) {
  const consejo = parseConsejo(req && req.consejo);
  const fuente = String((req && req.fuente) || "");
  if (consejo && fuente.startsWith("sala-voz")) {
    return { ...doc, salas: { ...doc.salas, [consejo]: ahora } };
  }
  return doc;
}

export function vacio() {
  return { turno: null, cola: [], dichos: [], salas: {} };
}

export function normalizar(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  return {
    turno: d.turno && typeof d.turno === "object" ? d.turno : null,
    cola: Array.isArray(d.cola) ? d.cola.slice() : [],
    dichos: Array.isArray(d.dichos) ? d.dichos.map(String) : [],
    salas: d.salas && typeof d.salas === "object" ? { ...d.salas } : {},
  };
}

export function salaAbierta(doc, ahora, vivaMs = SALA_VIVA_MS) {
  const salas = (doc && doc.salas) || {};
  const lim = ahora - vivaMs;
  return ["leyendas", "coetaneos"].some((k) => (Number(salas[k]) || 0) > lim);
}

function marcarDicho(doc, id) {
  id = String(id || "");
  if (!id) return doc;
  const dichos = (doc.dichos || []).filter((x) => x !== id).concat([id]);
  return { ...doc, dichos: dichos.slice(-MAX_DICHOS) };
}

function ordenarCola(cola) {
  return [...(cola || [])].sort((a, b) => {
    const dp = rangoPrio(b.prioridad) - rangoPrio(a.prioridad);
    if (dp) return dp;
    return (Number(a.ts) || 0) - (Number(b.ts) || 0);
  });
}

function esperaEstimada(doc, ahora, mensajeId) {
  let t = doc.turno ? Math.max(0, Number(doc.turno.hasta) - ahora) : 0;
  for (const x of ordenarCola(doc.cola || [])) {
    if (String(x.mensajeId) === String(mensajeId)) break;
    t += Math.min(MAX_MS, Math.max(MIN_MS, Number(x.duracionMs) || MIN_MS));
  }
  return t;
}

function concederSiguiente(doc, ahora) {
  if (doc.turno) return doc;
  const dichos = new Set((doc.dichos || []).map(String));
  const cola = ordenarCola(doc.cola).filter((x) => x && x.mensajeId && !dichos.has(String(x.mensajeId)));
  if (!cola.length) return { ...doc, cola: [], turno: null };
  const next = cola[0];
  const rest = cola.slice(1);
  const dur = Math.min(MAX_MS, Math.max(MIN_MS, Number(next.duracionMs) || MIN_MS));
  return {
    ...doc,
    cola: rest,
    turno: {
      mensajeId: String(next.mensajeId),
      clienteId: String(next.clienteId || ""),
      fuente: String(next.fuente || ""),
      prioridad: next.prioridad || "otra",
      desde: ahora,
      hasta: ahora + dur,
      duracionMs: dur,
    },
  };
}

export function expirar(doc, ahora) {
  doc = normalizar(doc);
  let guardia = 0;
  while (doc.turno && Number(doc.turno.hasta) <= ahora && guardia++ < 60) {
    doc = marcarDicho(doc, doc.turno.mensajeId);
    doc = { ...doc, turno: null };
    doc = concederSiguiente(doc, ahora);
  }
  if (!doc.turno) doc = concederSiguiente(doc, ahora);
  return doc;
}

export function pedir(doc, ahora, req) {
  doc = marcarSala(expirar(normalizar(doc), ahora), req, ahora);
  const mensajeId = String((req && req.mensajeId) || "");
  const clienteId = String((req && req.clienteId) || "");
  const fuente = String((req && req.fuente) || "");
  const prioridad = prioridadDe(fuente, req && req.prioridad);
  const duracionMs = Math.min(MAX_MS, Math.max(MIN_MS, Number(req && req.duracionMs) || MIN_MS));
  if (!mensajeId || !clienteId) {
    return { doc, concedido: false, error: "faltan mensajeId y clienteId", esperaMs: 0 };
  }
  if ((doc.dichos || []).includes(mensajeId)) {
    return { doc, concedido: false, yaDicho: true, esperaMs: 0, salaAbierta: salaAbierta(doc, ahora) };
  }
  if (doc.turno && String(doc.turno.mensajeId) === mensajeId && String(doc.turno.clienteId) === clienteId) {
    const hasta = Math.max(Number(doc.turno.hasta) || 0, ahora + Math.min(duracionMs, 4000));
    doc = { ...doc, turno: { ...doc.turno, hasta } };
    return { doc, concedido: true, yaDicho: false, esperaMs: 0, turno: doc.turno, salaAbierta: salaAbierta(doc, ahora) };
  }
  // El mismo mensaje ya lo está diciendo (o lo va a decir) otra página: no se repite.
  if (doc.turno && String(doc.turno.mensajeId) === mensajeId) {
    return { doc, concedido: false, yaDicho: true, esperaMs: 0, salaAbierta: salaAbierta(doc, ahora) };
  }
  const enCola = (doc.cola || []).find((x) => String(x.mensajeId) === mensajeId);
  if (enCola) {
    if (String(enCola.clienteId) === clienteId) {
      return { doc, concedido: false, esperaMs: esperaEstimada(doc, ahora, mensajeId), salaAbierta: salaAbierta(doc, ahora) };
    }
    return { doc, concedido: false, yaDicho: true, esperaMs: 0, salaAbierta: salaAbierta(doc, ahora) };
  }

  if (doc.turno && rangoPrio(prioridad) > rangoPrio(doc.turno.prioridad)) {
    const resto = Math.max(MIN_MS, Number(doc.turno.hasta) - ahora);
    const interrumpido = {
      mensajeId: doc.turno.mensajeId,
      clienteId: doc.turno.clienteId,
      fuente: doc.turno.fuente,
      prioridad: doc.turno.prioridad,
      duracionMs: resto,
      ts: 0,
    };
    doc = {
      ...doc,
      cola: ordenarCola([interrumpido, ...(doc.cola || [])]),
      turno: {
        mensajeId, clienteId, fuente, prioridad,
        desde: ahora, hasta: ahora + duracionMs, duracionMs, preempt: true,
      },
    };
    return {
      doc, concedido: true, interrumpido: true, esperaMs: 0,
      turno: doc.turno, salaAbierta: salaAbierta(doc, ahora),
    };
  }

  if (!doc.turno) {
    doc = {
      ...doc,
      turno: { mensajeId, clienteId, fuente, prioridad, desde: ahora, hasta: ahora + duracionMs, duracionMs },
    };
    return { doc, concedido: true, esperaMs: 0, turno: doc.turno, salaAbierta: salaAbierta(doc, ahora) };
  }

  const item = { mensajeId, clienteId, fuente, prioridad, duracionMs, ts: ahora };
  const cola = ordenarCola([...(doc.cola || []), item]);
  doc = { ...doc, cola: cola.length > MAX_COLA ? cola.slice(0, MAX_COLA) : cola };
  return {
    doc, concedido: false, esperaMs: esperaEstimada(doc, ahora, mensajeId),
    salaAbierta: salaAbierta(doc, ahora),
  };
}

export function liberar(doc, ahora, req) {
  doc = expirar(normalizar(doc), ahora);
  const mensajeId = String((req && req.mensajeId) || "");
  const clienteId = String((req && req.clienteId) || "");
  if (doc.turno && String(doc.turno.clienteId) === clienteId && (!mensajeId || String(doc.turno.mensajeId) === mensajeId)) {
    doc = marcarDicho(doc, doc.turno.mensajeId);
    doc = { ...doc, turno: null };
  }
  if (clienteId) {
    doc = {
      ...doc,
      cola: (doc.cola || []).filter((x) => !(String(x.clienteId) === clienteId && (!mensajeId || String(x.mensajeId) === mensajeId))),
    };
  }
  doc = concederSiguiente(doc, ahora);
  return { doc, ok: true, turno: doc.turno, salaAbierta: salaAbierta(doc, ahora) };
}

export function latido(doc, ahora, req) {
  doc = expirar(normalizar(doc), ahora);
  const clienteId = String((req && req.clienteId) || "");
  const fuente = String((req && req.fuente) || "");
  const consejo = parseConsejo(req && req.consejo);
  if (consejo && fuente.startsWith("sala-voz")) {
    doc = { ...doc, salas: { ...doc.salas, [consejo]: ahora } };
  }
  if (doc.turno && String(doc.turno.clienteId) === clienteId) {
    const extra = 4000;
    const cap = (Number(doc.turno.desde) || ahora) + (Number(doc.turno.duracionMs) || MIN_MS) + 8000;
    const hasta = Math.min(cap, Math.max(Number(doc.turno.hasta) || 0, ahora + extra));
    doc = { ...doc, turno: { ...doc.turno, hasta } };
    return { doc, concedido: true, perdido: false, turno: doc.turno, salaAbierta: salaAbierta(doc, ahora) };
  }
  return { doc, concedido: false, perdido: true, turno: doc.turno, salaAbierta: salaAbierta(doc, ahora) };
}

export function presencia(doc, ahora, req) {
  doc = expirar(normalizar(doc), ahora);
  const consejo = parseConsejo(req && req.consejo);
  if (!consejo) return { doc, ok: false, error: "consejo inválido (leyendas|coetaneos)", salaAbierta: salaAbierta(doc, ahora) };
  doc = { ...doc, salas: { ...doc.salas, [consejo]: ahora } };
  return { doc, ok: true, salaAbierta: true };
}

export function publicState(doc, ahora, yo) {
  doc = expirar(normalizar(doc), ahora);
  const mio = yo && yo.clienteId;
  return {
    ok: true,
    turno: doc.turno ? {
      mensajeId: doc.turno.mensajeId,
      fuente: doc.turno.fuente,
      prioridad: doc.turno.prioridad,
      desde: doc.turno.desde,
      hasta: doc.turno.hasta,
      duracionMs: doc.turno.duracionMs,
      mia: !!(mio && String(doc.turno.clienteId) === String(mio)),
    } : null,
    cola: (doc.cola || []).map((x) => ({
      mensajeId: x.mensajeId,
      fuente: x.fuente,
      prioridad: x.prioridad,
    })),
    salaAbierta: salaAbierta(doc, ahora),
  };
}

/** Invariante: en un estado nunca hay dos turnos concedidos. */
export function locutoresActivos(doc, ahora) {
  doc = expirar(normalizar(doc), ahora);
  return doc.turno && Number(doc.turno.hasta) > ahora ? 1 : 0;
}
