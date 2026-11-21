/**
 * /api/deepagents/app — auditoría de «Cerrar / Arrancar desktop app» de un deepagent (r233 · Carlos, 21-11-2026 20:34).
 * La orden la ejecuta el relay de la flota (acción «deepagentapp», lista cerrada en fleet-control/deepagent-app.js)
 * con la sesión Google del navegador; aquí se REGISTRA (pedida y resultado) y se valida la lista cerrada.
 * POST { agente, maquina, accion:"abrir"|"cerrar", fase:"pedida"|"resultado", ok?, salida? } → solo PERSONA con sesión
 *      (cookie de la puerta de persona o sesión Google del chat). Agentes, kiosco y anónimos: 401/403.
 * GET  → { ok, acciones:[…] } (las 100 últimas) para quien pueda leer el registro de DeepAgents.
 * KV: CONSUMOS_KV || RECORTE_KV, clave deepagents:acciones:v1 (máx. 300).
 */
import { emailGoogle, tokenMaquina } from "../../../chat-hilo-lib.mjs";
import { cabeceras, json } from "../../../chat-hilo-http.mjs";
import { verificar, leerCookie } from "../../_puerta.js";
import { validarAccion, CLAVE_ACCIONES, anotar } from "../../../deepagents-app-lib.mjs";

const METODOS = "GET, POST, OPTIONS";
const almacen = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "", METODOS) });
}

async function quien(request, env) {
  const d = await verificar(env && env.PUERTA_FIRMA, leerCookie(request));
  if (d && d.t === "persona") return { tipo: "persona", id: String(d.s || "persona") };
  if (d && d.t === "agente") return { tipo: "agente", id: String(d.s || "agente") };
  const g = await emailGoogle(request, env, fetch);
  if (g) return { tipo: "persona", id: String(g) };
  if (tokenMaquina(request, env)) return { tipo: "maquina", id: "maquina" };
  return null;
}

export async function onRequestGet({ request, env }) {
  const o = request.headers.get("Origin") || "";
  if (!(await quien(request, env))) return json({ ok: false, error: "sin sesión" }, 401, o, METODOS);
  const kv = almacen(env);
  let lista = [];
  try { const raw = kv && (await kv.get(CLAVE_ACCIONES)); lista = raw ? JSON.parse(raw) : []; } catch (e) { lista = []; }
  return json({ ok: true, acciones: (Array.isArray(lista) ? lista : []).slice(0, 100) }, 200, o, METODOS);
}

export async function onRequestPost({ request, env }) {
  const o = request.headers.get("Origin") || "";
  const q = await quien(request, env);
  if (!q) return json({ ok: false, error: "sin sesión: entra en admira.live" }, 401, o, METODOS);
  if (q.tipo !== "persona") return json({ ok: false, error: "solo una persona con sesión puede abrir o cerrar apps" }, 403, o, METODOS);
  let body = {};
  try { body = (await request.json()) || {}; } catch (e) {}
  const v = validarAccion(body);
  if (!v.ok) return json({ ok: false, error: v.error }, 400, o, METODOS);
  const kv = almacen(env);
  if (!kv) return json({ ok: false, error: "sin almacén" }, 503, o, METODOS);
  let lista = [];
  try { const raw = await kv.get(CLAVE_ACCIONES); lista = raw ? JSON.parse(raw) : []; } catch (e) { lista = []; }
  const entrada = { ...v.accion, por: q.id.slice(0, 80), hora: new Date().toISOString() };
  await kv.put(CLAVE_ACCIONES, JSON.stringify(anotar(lista, entrada)));
  return json({ ok: true, accion: entrada }, 200, o, METODOS);
}
