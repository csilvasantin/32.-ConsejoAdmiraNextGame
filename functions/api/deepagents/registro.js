/**
 * /api/deepagents/registro — el registro de la comunicación entre los deepagents (agentes de la
 * flota: Neo, Morfeo, Trinity, Oráculo, Merovingio, Cypher…) y los consejeros. Solo lectura.
 * Carlos, 21-11-2026: «para que todo quede registrado en admira.live/deepagents».
 *
 * GET ?agente=Neo&consejero=Jobs&q=texto&desde=2026-11-01&limite=300
 *   → { ok, mensajes (lo más reciente primero), parejas, total, archivo, bandeja, supervisores }
 *
 * Cada lectura trae la bandeja del MCP (Worker admira-live-mcp, /consejero/mensajes?con=<agente>,
 * con X-Mensajes-Token si el proyecto tiene CONSEJERO_MENSAJES_TOKEN) y ARCHIVA por mes en KV lo
 * que no estuviera: la bandeja recorta a 500 y aquí no se pierde nada. Si la bandeja no responde,
 * se sirve el archivo y se dice.
 *
 * PRIVADO. /api/* no pasa por la puerta de servidor (functions/_puerta.js), así que se comprueba
 * aquí: cookie de la puerta de una persona o de un agente (nunca kiosco), token de máquina, o la
 * sesión Google del chat. Sin eso, 401.
 */
import { emailGoogle, tokenMaquina } from "../../../chat-hilo-lib.mjs";
import { cabeceras, json, kv } from "../../../chat-hilo-http.mjs";
import { verificar, leerCookie } from "../../_puerta.js";
import {
  AGENTES, SUPERVISOR, CLAVE_MESES, LIMITE_DEFECTO, LIMITE_MAX, MESES_MAX,
  agente, claveMes, conAgente, filtrar, limpiar, parejas, porMes, unir,
} from "../../../deepagents-lib.mjs";

const METODOS = "GET, OPTIONS";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "", METODOS) });
}

/** Quién lee: "maquina" | "persona" | "agente" | "google" | null. */
export async function lector(request, env, f) {
  if (tokenMaquina(request, env)) return "maquina";
  const d = await verificar(env && env.PUERTA_FIRMA, leerCookie(request));
  if (d && (d.t === "persona" || d.t === "agente")) return d.t;
  return (await emailGoogle(request, env, f)) ? "google" : null;
}

async function leerJson(almacen, clave, defecto) {
  try { const raw = await almacen.get(clave); const d = raw ? JSON.parse(raw) : null; return d == null ? defecto : d; } catch (e) { return defecto; }
}

/** Trae de la bandeja lo de cada agente. Nunca lanza: devuelve lo que haya y los fallos. */
export async function leerBandeja(env, f) {
  const base = String((env && env.MCP_BASE) || "https://mcp.admira.live").replace(/\/$/, "");
  const headers = { accept: "application/json" };
  const tok = String((env && env.CONSEJERO_MENSAJES_TOKEN) || "").trim();
  if (tok) headers["x-mensajes-token"] = tok;
  const fallos = [];
  const tandas = await Promise.all(AGENTES.map(async (a) => {
    try {
      const r = await f(`${base}/consejero/mensajes?con=${encodeURIComponent(a)}&max=500`, { headers, signal: AbortSignal.timeout(6000) });
      if (!r.ok) { fallos.push(`${a}: ${r.status}`); return []; }
      const d = await r.json();
      return Array.isArray(d && d.mensajes) ? d.mensajes : [];
    } catch (e) { fallos.push(`${a}: sin respuesta`); return []; }
  }));
  const mensajes = tandas.flat().map(limpiar).filter((m) => m && conAgente(m));
  return { mensajes, fallos, ok: fallos.length < AGENTES.length };
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const origin = request.headers.get("Origin") || "";
  const f = fetchImpl || fetch;
  const quien = await lector(request, env, f);
  if (!quien) return json({ ok: false, error: "privado: entra en admira.live con tu cuenta" }, 401, origin, METODOS);

  const url = new URL(request.url);
  const qAgente = url.searchParams.get("agente") || "";
  if (qAgente && !agente(qAgente)) return json({ ok: false, error: `agente inválido (${AGENTES.join(", ")})` }, 400, origin, METODOS);
  const limite = Math.min(LIMITE_MAX, Math.max(1, Number(url.searchParams.get("limite")) || LIMITE_DEFECTO));

  const viva = await leerBandeja(env, f);
  const almacen = kv(env);
  let todo = viva.mensajes, meses = [], archivados = 0;

  if (almacen) {
    meses = await leerJson(almacen, CLAVE_MESES, []);
    if (!Array.isArray(meses)) meses = [];
    const entrantes = porMes(viva.mensajes);
    const tocar = new Set([...meses.slice(-MESES_MAX), ...Object.keys(entrantes)]);
    const partes = await Promise.all([...tocar].sort().map(async (mes) => {
      const guardado = await leerJson(almacen, claveMes(mes), []);
      const u = unir(guardado, entrantes[mes] || []);
      if (u.nuevos || u.cambiados) {
        try { await almacen.put(claveMes(mes), JSON.stringify(u.lista)); archivados += u.nuevos; } catch (e) { /* se sirve igual */ }
      }
      return u.lista;
    }));
    const conocidos = [...new Set([...meses, ...Object.keys(entrantes)])].sort();
    if (conocidos.length !== meses.length) { try { await almacen.put(CLAVE_MESES, JSON.stringify(conocidos)); } catch (e) {} }
    meses = conocidos;
    todo = partes.flat();
  } else {
    todo = unir([], viva.mensajes).lista;
  }

  const filtrados = filtrar(todo, {
    agente: qAgente, consejero: url.searchParams.get("consejero") || "",
    q: url.searchParams.get("q") || "", desde: url.searchParams.get("desde") || "",
  });
  const mensajes = filtrados.slice(-limite).reverse();

  return json({
    ok: true,
    mensajes,
    total: filtrados.length,
    total_registro: todo.length,
    parejas: parejas(todo),
    supervisores: SUPERVISOR,
    agentes: AGENTES,
    archivo: { almacen: almacen ? "kv" : "ninguno", meses, nuevos_en_esta_lectura: archivados, desde: todo.length ? todo[0].hora : null },
    bandeja: { ok: viva.ok, fallos: viva.fallos },
    lector: quien,
    hora: new Date().toISOString(),
  }, 200, origin, METODOS);
}
