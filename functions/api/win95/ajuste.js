/**
 * /api/win95/ajuste — el ajuste de «Vuelta al 95» que edita Admira Director (ainimation.studio).
 *   GET     → { ok, esquema, ajuste, at, by }   · cookie de la puerta (persona o agente) o sesión de Google.
 *   PUT     → guarda { ajuste } saneado          · sólo persona con sesión de Google (misma Origin: anti-CSRF).
 *   DELETE  → vuelve a los valores de fábrica    · sólo persona con sesión de Google.
 * Sin secretos: lo que se guarda son nombres, pistas, contactos, hashtags e imágenes de la carpeta.
 * El Director nunca habla con esta API: habla con la ventana /windows95?director=1 (postMessage) y es
 * la página, con su propia cookie, quien guarda. Esquema y validación: win95-ajuste-lib.mjs.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle, identidadDeEmail } from "../../../chat-hilo-lib.mjs";
import { kv } from "../../../chat-hilo-http.mjs";
import { CLAVE_KV, ESQUEMA, MAX_CUERPO, VERSION, sanear } from "../../../win95-ajuste-lib.mjs";

const CABECERAS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};
const json = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: CABECERAS });

async function autorizadoLectura(request, env) {
  if (await verificar(env && env.PUERTA_FIRMA, leerCookie(request))) return true;
  return !!(await emailGoogle(request, env));
}

async function leer(env) {
  const almacen = kv(env);
  if (!almacen) return null;
  try {
    const d = JSON.parse((await almacen.get(CLAVE_KV)) || "null");
    return d && typeof d === "object" && d.ajuste && typeof d.ajuste === "object" ? d : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  if (!(await autorizadoLectura(request, env))) return json({ ok: false, error: "sesion" }, 401);
  const d = await leer(env);
  return json({ ok: true, version: VERSION, esquema: ESQUEMA, ajuste: (d && d.ajuste) || {}, at: (d && d.at) || null, by: (d && d.by) || "", almacen: !!kv(env) });
}

export async function onRequestPut({ request, env }) {
  const quien = await emailGoogle(request, env);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401);
  const almacen = kv(env);
  if (!almacen) return json({ ok: false, error: "sin almacenamiento" }, 503);
  const crudo = await request.text();
  if (crudo.length > MAX_CUERPO) return json({ ok: false, error: "cuerpo demasiado grande" }, 413);
  let body;
  try { body = JSON.parse(crudo || "{}"); } catch { return json({ ok: false, error: "json inválido" }, 400); }
  const entrada = body && typeof body === "object" && body.ajuste && typeof body.ajuste === "object" ? body.ajuste : body;
  const { ajuste, errores } = sanear(entrada);
  if (!Object.keys(ajuste).length && errores.length) return json({ ok: false, error: "nada válido que guardar", errores }, 400);
  const by = identidadDeEmail(quien).corto;
  const at = new Date().toISOString();
  await almacen.put(CLAVE_KV, JSON.stringify({ v: VERSION, at, by, email: quien, ajuste }));
  return json({ ok: true, ajuste, errores, at, by });
}

export const onRequestPost = onRequestPut;

export async function onRequestDelete({ request, env }) {
  const quien = await emailGoogle(request, env);
  if (!quien) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live" }, 401);
  const almacen = kv(env);
  if (!almacen) return json({ ok: false, error: "sin almacenamiento" }, 503);
  await almacen.delete(CLAVE_KV);
  return json({ ok: true, ajuste: {}, at: null, by: identidadDeEmail(quien).corto });
}
