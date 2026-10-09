/**
 * chat-hilo-lib.mjs — el hilo compartido Carlos ↔ consejero (GrokBotBox, 09-10-2026).
 *
 * Un mismo hilo para la app de Grok Bot (origen «app»), admira.live («live») y la rutina
 * que despierta el webhook («rutina»). Se guarda en una sola clave KV por persona.
 * Sin dependencias: lo usan las Functions de Pages y los tests de Node.
 */
export const PERSONAS = ["jobs", "wozniak", "disney", "lucas", "musk", "huang"];
export const ORIGENES = ["app", "live", "rutina"];
export const MAX_TEXTO = 8000;
export const MAX_TURNOS = 500;
export const AVISO_MIN = 10;
export const EMAILS_DEFECTO = ["csilva@admira.com", "csilvasantin@gmail.com"];
export const GOOGLE_CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";

export const claveHilo = (persona) => `chat:hilo:v1:${persona}`;
const MSG_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;

export function normalizarPersona(p) {
  const s = String(p || "").trim().toLowerCase();
  return PERSONAS.includes(s) ? s : null;
}

async function sha(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valida un turno. Devuelve { turno } o { error }. */
export async function normalizarTurno(body, ahora = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "cuerpo inválido" };
  const persona = normalizarPersona(body.persona);
  if (!persona) return { error: `persona inválida (${PERSONAS.join(", ")})` };
  const rol = String(body.rol || "").trim().toLowerCase();
  if (rol !== "carlos" && rol !== persona) return { error: `rol inválido: «carlos» o «${persona}»` };
  const origen = String(body.origen || "").trim().toLowerCase();
  if (!ORIGENES.includes(origen)) return { error: `origen inválido (${ORIGENES.join(", ")})` };
  const texto = String(body.texto || "").replace(/\r\n/g, "\n").trim();
  if (!texto) return { error: "falta texto" };
  if (texto.length > MAX_TEXTO) return { error: `texto demasiado largo (máx. ${MAX_TEXTO})` };
  let ts = ahora;
  if (body.ts !== undefined && body.ts !== null && body.ts !== "") {
    ts = typeof body.ts === "number" ? (body.ts > 4102444800 ? body.ts : body.ts * 1000) : Date.parse(String(body.ts));
    if (!Number.isFinite(ts)) return { error: "ts inválido" };
    if (ts > ahora + 5 * 60 * 1000) return { error: "ts en el futuro" };
  }
  const iso = new Date(ts).toISOString();
  let id = body.msg_id === undefined || body.msg_id === null ? "" : String(body.msg_id).trim();
  if (id && !MSG_ID.test(id)) return { error: "msg_id inválido (4-120 caracteres A-Z a-z 0-9 . _ : -)" };
  // Sin msg_id: id estable derivado del contenido (repetir el mismo POST no duplica).
  if (!id) id = "h_" + (await sha([persona, rol, origen, iso, texto].join("\n"))).slice(0, 32);
  return { turno: { id, persona, rol, origen, texto, ts: iso, recibido: new Date(ahora).toISOString() } };
}

/** Añade de forma idempotente (por id), ordena por ts y conserva los últimos MAX_TURNOS. */
export function anadirTurno(turnos, turno) {
  const lista = Array.isArray(turnos) ? turnos : [];
  const previo = lista.find((t) => t.id === turno.id);
  if (previo) return { turnos: lista, turno: previo, duplicado: true };
  const nueva = [...lista, turno].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || String(a.recibido).localeCompare(String(b.recibido)));
  return { turnos: nueva.slice(-MAX_TURNOS), turno, duplicado: false };
}

/** Salud sin texto: último turno por origen y si hay un mensaje de admira.live sin contestar. */
export function salud(turnos, persona, ahora = Date.now()) {
  const lista = Array.isArray(turnos) ? turnos : [];
  const ultimoPorOrigen = {};
  for (const o of ORIGENES) {
    const t = [...lista].reverse().find((x) => x.origen === o);
    ultimoPorOrigen[o] = t ? { ts: t.ts, rol: t.rol } : null;
  }
  const ultimaRespuesta = [...lista].reverse().find((x) => x.rol === persona);
  const tsResp = ultimaRespuesta ? Date.parse(ultimaRespuesta.ts) : 0;
  const esperando = lista.find((x) => x.rol === "carlos" && x.origen === "live" && Date.parse(x.ts) > tsResp);
  let pendiente = null;
  if (esperando) {
    const minutos = Math.max(0, Math.floor((ahora - Date.parse(esperando.ts)) / 60000));
    pendiente = { desde: esperando.ts, minutos };
  }
  const estado = pendiente && pendiente.minutos > AVISO_MIN ? "aviso" : "ok";
  const ultimo = lista.length ? lista[lista.length - 1] : null;
  return {
    ok: true, persona, estado, turnos: lista.length,
    ultimo: ultimo ? { ts: ultimo.ts, rol: ultimo.rol, origen: ultimo.origen } : null,
    ultimoPorOrigen, pendiente, avisoTrasMin: AVISO_MIN, generado: new Date(ahora).toISOString(),
  };
}

function iguales(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function credencial(request) {
  const auth = String(request.headers.get("Authorization") || "");
  return (auth.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("X-Council-Token") || "").trim();
}

/** Token de máquina (el de las lecturas de consumos, uno solo para la caja). null = sin secreto. */
export function tokenMaquina(request, env) {
  const secretos = [env && env.CHAT_HILO_TOKEN, env && env.CONSUMOS_LECTURAS_TOKEN, env && env.COUNCIL_MACHINE_TOKEN]
    .map((s) => String(s || "").trim()).filter(Boolean);
  if (!secretos.length) return null;
  const cand = credencial(request);
  return secretos.some((s) => iguales(cand, s));
}

const cacheGoogle = new Map();
/** ID token de Google (login de admira.live): Google valida la firma en tokeninfo. */
export async function emailGoogle(request, env, fetchImpl = fetch, ahora = Date.now()) {
  const jwt = credencial(request);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt) || jwt.length > 4096) return null;
  const hit = cacheGoogle.get(jwt);
  if (hit && hit.exp > ahora) return hit.email;
  let d;
  try {
    const r = await fetchImpl("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(jwt), { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    d = await r.json();
  } catch (e) { return null; }
  const permitidos = String((env && env.CHAT_HILO_EMAILS) || EMAILS_DEFECTO.join(",")).toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const aud = String((env && env.GOOGLE_CLIENT_ID) || GOOGLE_CLIENT_ID);
  const email = String(d && d.email || "").toLowerCase();
  const exp = Number(d && d.exp) * 1000;
  const verificado = d && (d.email_verified === true || d.email_verified === "true");
  if (!d || d.aud !== aud || !verificado || !permitidos.includes(email) || !(exp > ahora)) return null;
  if (cacheGoogle.size > 200) cacheGoogle.clear();
  cacheGoogle.set(jwt, { email, exp });
  return email;
}
