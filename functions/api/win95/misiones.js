/**
 * GET /api/win95/misiones — misiones de los DeepAgents (y la nota de SteveJobs)
 * para las subcarpetas de Miscelánea y el grupo DeepAgents de ICQGram (Carlos, 26-11-2026).
 * Cada carpeta trae principal, abiertos y hechas (títulos saneados, sin texto crudo ni notas).
 * Solo lectura, mismo origen y detrás de la verja: cookie de la puerta o sesión de Google.
 * Fuente: bandeja pública de bot.yokup.com/api/public/inbox?persona=… (sin credenciales).
 * Texto saneado en win95-misiones-lib.mjs: sin tokens, IPs, MACs, correos ni claves SSH.
 * El campo «nota» no se reenvía. Nunca escribe nada.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle } from "../../../chat-hilo-lib.mjs";
import { INBOX_PUBLICO } from "../../../consejo-comunicaciones-lib.mjs";
import { DEEPAGENTS, construirMisiones, MISIONES_FALLBACK } from "../../../win95-misiones-lib.mjs";

const CABECERAS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};
const json = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: CABECERAS });

async function autorizado(request, env, f) {
  if (await verificar(env && env.PUERTA_FIRMA, leerCookie(request))) return true;
  return !!(await emailGoogle(request, env, f));
}

const leer = (f, url) => f(url, {
  headers: { accept: "application/json", "user-agent": "admira.live-win95" },
  signal: AbortSignal.timeout(8000),
}).then((r) => (r.ok ? r.json() : null)).catch(() => null);

export async function construir({ fetchImpl, ahora } = {}) {
  const f = fetchImpl || fetch;
  const t = ahora || Date.now();
  const bandejas = {};
  let fallos = 0;
  await Promise.all(DEEPAGENTS.map(async (a) => {
    const d = await leer(f, INBOX_PUBLICO + "?" + new URLSearchParams({ persona: a.persona }));
    const items = d && Array.isArray(d.items) ? d.items : (d && Array.isArray(d.encargos) ? d.encargos : null);
    if (!items) { fallos += 1; bandejas[a.persona] = []; return; }
    bandejas[a.persona] = items;
  }));
  const aviso = fallos === DEEPAGENTS.length
    ? "La bandeja pública de encargos no ha respondido; se muestra la instantánea de hoy."
    : (fallos ? "Alguna bandeja de encargos no ha respondido; el resto está al día." : "");
  if (fallos === DEEPAGENTS.length) {
    const fb = { ...MISIONES_FALLBACK, generado: t, aviso };
    return fb;
  }
  return construirMisiones({ bandejas, ahora: t, aviso });
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const f = fetchImpl || fetch;
  if (!(await autorizado(request, env, f))) return json({ ok: false, error: "sesion" }, 401);
  const cuerpo = await construir({ fetchImpl: f });
  const s = JSON.stringify(cuerpo);
  if (/192\.168\.|10\.\d+\.|100\.\d+\.\d+\.\d+|ssh-ed25519|BEGIN [A-Z ]*PRIVATE|ghp_|Bearer [A-Za-z0-9._-]{8,}/.test(s)) {
    return json({ ok: true, generado: Date.now(), aviso: "La respuesta se ha retenido por precaución (posible secreto).", fuente: "admira.live", carpetas: MISIONES_FALLBACK.carpetas });
  }
  return json(cuerpo);
}
