/**
 * /api/control/lineas — histórico de líneas de código de la Galaxia AdmiraNeXT (GrokBotBox, 09-10-2026).
 *
 * GET               → { ok, resumen, indice }  (público, solo lectura, sin secretos)
 * GET ?foto=AAAA-MM-DD:00|12 → la foto completa de esa ranura
 * POST { ts, slot?, proyectos:[{id, repo, commit, ficheros, lineas, lineas_unicas?, proyecto?}], metodo? }
 *      con X-Council-Token (o Authorization: Bearer) = secreto CONSUMOS_LECTURAS_TOKEN, igual que
 *      /api/consumos/lecturas. Lo manda /workspace/bin/lineas-galaxia.sh a las 00:00 y 12:00 de Madrid.
 *
 * KV (RECORTE_KV, prefijo propio): una clave por foto (control:lineas:snap:<fecha>:<slot>) + un
 * índice compacto (control:lineas:index:v1) para pintar la historia con UNA lectura.
 */
import { normalizarSnapshot, entradaIndice, anadirIndice, resumir, claveSnap, KEY_INDICE } from "../../../control-lineas-lib.mjs";
import { autorizado } from "../consumos/lecturas.js";

const ALLOW = new Set(["https://www.admira.live", "https://admira.live", "https://admira-live.pages.dev"]);
function headers(origin, cache) {
  const h = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cache || "no-store",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-Council-Token, Authorization",
    vary: "Origin",
  };
  if (origin && ALLOW.has(origin)) h["access-control-allow-origin"] = origin;
  return h;
}
const json = (obj, status, origin, cache) => new Response(JSON.stringify(obj), { status, headers: headers(origin, cache) });
const kv = (env) => (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null;

async function leerIndice(env) {
  const raw = await kv(env).get(KEY_INDICE);
  try { const d = raw ? JSON.parse(raw) : null; if (Array.isArray(d)) return d; } catch (e) {}
  return [];
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request.headers.get("Origin") || "") });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  if (!kv(env)) return json({ ok: true, resumen: resumir([]), indice: [], almacen: "ninguno" }, 200, origin);
  const foto = new URL(request.url).searchParams.get("foto");
  if (foto) {
    const m = /^(\d{4}-\d{2}-\d{2}):(00|12)$/.exec(foto);
    if (!m) return json({ ok: false, error: "foto=AAAA-MM-DD:00|12" }, 400, origin);
    const raw = await kv(env).get(claveSnap(m[1], m[2]));
    if (!raw) return json({ ok: false, error: "no hay foto en esa ranura" }, 404, origin);
    return json({ ok: true, foto: JSON.parse(raw) }, 200, origin, "public, max-age=300");
  }
  const indice = await leerIndice(env);
  return json({ ok: true, zona: "Europe/Madrid", ranuras: ["00:00", "12:00"],
    metodo: "líneas NO vacías de ficheros fuente (tools/hackeo-corpus.py, el mismo Σ del HACKEO); total = Σ sin duplicar",
    resumen: resumir(indice), indice, generado: new Date().toISOString() }, 200, origin, "public, max-age=60");
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const ok = autorizado(request, env);
  if (ok === null) return json({ ok: false, error: "escrituras cerradas: falta el secreto CONSUMOS_LECTURAS_TOKEN en el proyecto" }, 503, origin);
  if (!ok) return json({ ok: false, error: "no autorizado: manda X-Council-Token" }, 401, origin);
  if (!kv(env)) return json({ ok: false, error: "sin almacenamiento" }, 503, origin);
  const texto = await request.text();
  if (texto.length > 20000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413, origin);
  let body;
  try { body = JSON.parse(texto || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400, origin); }
  const { snap, error } = normalizarSnapshot(body);
  if (error) return json({ ok: false, error }, 400, origin);
  snap.recibido = new Date().toISOString();
  await kv(env).put(claveSnap(snap.fecha, snap.slot), JSON.stringify(snap));
  const indice = anadirIndice(await leerIndice(env), entradaIndice(snap));
  await kv(env).put(KEY_INDICE, JSON.stringify(indice));
  return json({ ok: true, fecha: snap.fecha, slot: snap.slot, total: snap.total, total_bruto: snap.total_bruto, proyectos: snap.proyectos.length, fotos: indice.length }, 200, origin);
}
