/**
 * Propagación de «🗑 Eliminar equipo» / «↩ restaurar» a las FUENTES del censo de /control
 * (19-10-2026, bug de Woz: el relay del Mac mini servía la ficha desde ~/fleet-control/fleet.json
 * y el equipo eliminado volvía; el KV sólo lo ocultaba).
 *
 *   · Relay Mac mini (fleet-control): DELETE {RELAY}/machines/:id · POST {RELAY}/machines/:id/restore
 *     con X-Fleet-Token (servidor → servidor; el token NUNCA va al navegador).
 *   · admira-fleet (fleet.yokup.com, fuente del modo degradado): DELETE /machines/:id y, al
 *     restaurar, POST /machines/register con la copia guardada.
 *
 * Sólo se propaga con un TICKET firmado por el relay (HMAC con el mismo token de flota) que el
 * navegador obtiene con su sesión Google + CSRF: una cabecera Origin se puede falsificar desde
 * curl y no basta para borrar nada real. Sin ticket, se comporta como antes (sólo KV).
 */
export const RELAY_DEF = "https://macmini.tail48b61c.ts.net/fleet/api";
export const FLEET_DEF = "https://fleet.yokup.com";
export const TICKET_CONTEXT = "admira-control-equipos-ticket-v1";
export const COPIA = "control:equipos:copia:";   // + clave normalizada · NO se expone en GET

export const norm = (s) => String(s || "").toLowerCase().replace(/^admira-?/, "").replace(/[^a-z0-9]/g, "");
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const desB64u = (s) => atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4));

async function hmac(keyBytes, data) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, typeof data === "string" ? enc.encode(data) : data);
}
function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Firma idéntica a fleet-control/machine-removal.js (para tests y para el propio relay). */
export async function firmarTicket(token, payloadObj) {
  const key = await hmac(enc.encode(String(token)), TICKET_CONTEXT);
  const p = b64u(enc.encode(JSON.stringify(payloadObj)));
  return p + "." + b64u(await hmac(key, p));
}
/** Devuelve el payload {v,id,accion,email,exp} o null. */
export async function verificarTicket(token, ticket, ahoraMs = Date.now()) {
  const parts = String(ticket || "").split(".");
  if (!token || parts.length !== 2 || parts[0].length > 2000) return null;
  const key = await hmac(enc.encode(String(token)), TICKET_CONTEXT);
  if (!igual(b64u(await hmac(key, parts[0])), parts[1])) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(Uint8Array.from(desB64u(parts[0]), (c) => c.charCodeAt(0)))); } catch (e) { return null; }
  if (!p || p.v !== 1 || !(p.exp > Math.floor(ahoraMs / 1000))) return null;
  return p;
}

async function pedir(fetchImpl, url, init, ms = 12000) {
  try {
    const r = await fetchImpl(url, Object.assign({ redirect: "manual", signal: AbortSignal.timeout(ms) }, init));
    let body = null; try { body = await r.json(); } catch (e) {}
    return { status: r.status, body: body || {} };
  } catch (e) { return { status: 0, body: { error: "sin respuesta (" + ((e && e.name) || "error") + ")" } }; }
}

const fichaFleet = (m) => ({ id: m.id, name: m.name, fqdn: m.fqdn || "", platform: m.platform || "", port: m.port || undefined, endpoint: m.endpoint || "" });

/**
 * accion: "ocultar" | "restaurar". copia: lo guardado al eliminar (para restaurar).
 * Devuelve { rele, fleet, copia } — rele/fleet son RESÚMENES públicos; copia es privada (KV aparte).
 */
export async function propagar({ env, accion, id, por = "", dryRun = false, copia = null, fetchImpl = fetch }) {
  const token = String((env && env.FLEET_TOKEN) || "").trim();
  if (!token) return { rele: { ok: false, error: "falta FLEET_TOKEN en Pages" }, fleet: { ok: false, error: "falta FLEET_TOKEN en Pages" }, copia: null };
  const RELAY = String((env && env.FLEET_RELAY_BASE) || RELAY_DEF).replace(/\/+$/, "");
  const FLEET = String((env && env.ADMIRA_FLEET_BASE) || FLEET_DEF).replace(/\/+$/, "");
  const q = dryRun ? "?dryRun=1" : "";
  const hRelay = { "X-Fleet-Token": token, "X-Admira-Por": String(por).slice(0, 120), Accept: "application/json" };
  const hFleet = { Authorization: "Bearer " + token, Accept: "application/json" };
  const k = norm(id);
  const out = { rele: null, fleet: null, copia: null };

  if (accion === "ocultar") {
    // 1) relay
    const r = await pedir(fetchImpl, RELAY + "/machines/" + encodeURIComponent(id) + q, { method: "DELETE", headers: hRelay });
    out.rele = { ok: r.status === 200 && r.body.ok === true, status: r.status, removed: !!r.body.removed, dryRun: !!r.body.dryRun,
      id: r.body.machine && r.body.machine.id, backup: r.body.backup, error: r.status === 200 ? undefined : (r.status === 404 && /no encontrado/.test(String(r.body.error || "")) ? "el relay aún no tiene DELETE /api/machines (pendiente de instalar)" : r.body.error) };
    if (r.status === 404 && r.body.error === "máquina desconocida") { out.rele.ok = true; out.rele.ausente = true; out.rele.error = undefined; }
    // 2) admira-fleet: todas las fichas con el mismo id normalizado (admira-macstudio ≈ macstudio)
    const lista = await pedir(fetchImpl, FLEET + "/machines", { method: "GET", headers: { Accept: "application/json" } });
    const fichas = ((lista.body && lista.body.machines) || []).filter((m) => m && m.id && (m.id === id || norm(m.id) === k));
    const borradas = [];
    let okFleet = lista.status === 200;
    for (const m of fichas) {
      if (dryRun) { borradas.push(m.id); continue; }
      const d = await pedir(fetchImpl, FLEET + "/machines/" + encodeURIComponent(m.id), { method: "DELETE", headers: hFleet });
      if (d.status === 200 && d.body.ok) borradas.push(m.id); else okFleet = false;
    }
    out.fleet = { ok: okFleet, status: lista.status, ids: borradas, dryRun: !!dryRun };
    out.copia = { rele: r.status === 200 && r.body.machine ? r.body.machine : null, fleet: fichas.map(fichaFleet), at: new Date().toISOString() };
    return out;
  }

  // restaurar
  const c = copia || {};
  const r = await pedir(fetchImpl, RELAY + "/machines/" + encodeURIComponent((c.rele && c.rele.id) || id) + "/restore" + q, {
    method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, hRelay), body: JSON.stringify({ machine: c.rele || null }) });
  out.rele = { ok: r.status === 200 && r.body.ok === true, status: r.status, restored: !!r.body.restored, already: !!r.body.already, dryRun: !!r.body.dryRun,
    error: r.status === 200 ? undefined : (r.status === 404 && /no encontrado/.test(String(r.body.error || "")) ? "el relay aún no tiene /api/machines/:id/restore (pendiente de instalar)" : r.body.error) };
  if (r.status === 404 && r.body.error === "no está en la papelera") { out.rele.ok = true; out.rele.nada = true; out.rele.error = undefined; }
  const reAlta = [];
  let okFleet = true;
  for (const m of (c.fleet || [])) {
    if (dryRun) { reAlta.push(m.id); continue; }
    const d = await pedir(fetchImpl, FLEET + "/machines/register", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, hFleet), body: JSON.stringify(m) });
    if (d.status === 200 && d.body.ok) reAlta.push(m.id); else okFleet = false;
  }
  out.fleet = { ok: okFleet, ids: reAlta, dryRun: !!dryRun };
  return out;
}
