/**
 * GET /api/win95/bandeja — finalizaciones (done) de misiones de DeepAgents
 * para la Bandeja de entrada de admira.live/windows95 (Carlos, 26-11-2026).
 * Cada correo: De = el DeepAgent, Para = el consejero que la encargó, CC = Carlos Silva.
 * Solo lectura, mismo origen y detrás de la verja: cookie de la puerta o sesión de Google.
 * Fuente: bandeja pública de bot.yokup.com/api/public/inbox?persona=… (sin credenciales).
 * Texto saneado en win95-bandeja-lib.mjs: sin tokens, IPs, MACs, correos ni claves SSH.
 * Nunca escribe nada.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle } from "../../../chat-hilo-lib.mjs";
import { INBOX_PUBLICO } from "../../../consejo-comunicaciones-lib.mjs";
import { DEEPAGENTS_BANDEJA, construirBandeja, BANDEJA_FALLBACK, contieneSecreto } from "../../../win95-bandeja-lib.mjs";

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

const itemsDe = (d) => (d && Array.isArray(d.items) ? d.items : (d && Array.isArray(d.encargos) ? d.encargos : null));

export async function construir({ fetchImpl, ahora } = {}) {
  const f = fetchImpl || fetch;
  const t = ahora || Date.now();
  const bandejas = {};
  let fallos = 0;
  await Promise.all(DEEPAGENTS_BANDEJA.map(async (a) => {
    const d = await leer(f, INBOX_PUBLICO + "?" + new URLSearchParams({ persona: a.persona }));
    const items = itemsDe(d);
    if (!items) { fallos += 1; bandejas[a.persona] = []; return; }
    bandejas[a.persona] = items;
  }));
  const aviso = fallos === DEEPAGENTS_BANDEJA.length
    ? "La bandeja pública de encargos no ha respondido; se muestra la instantánea de hoy."
    : (fallos ? "Alguna bandeja de encargos no ha respondido; el resto está al día." : "");
  if (fallos === DEEPAGENTS_BANDEJA.length) {
    return { ...BANDEJA_FALLBACK, generado: t, aviso };
  }
  return construirBandeja({ bandejas, ahora: t, aviso });
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const f = fetchImpl || fetch;
  if (!(await autorizado(request, env, f))) return json({ ok: false, error: "sesion" }, 401);
  const cuerpo = await construir({ fetchImpl: f });
  const s = JSON.stringify(cuerpo);
  if (contieneSecreto(s)) {
    return json({ ok: true, generado: Date.now(), aviso: "La respuesta se ha retenido por precaución (posible secreto).", fuente: "admira.live", emails: BANDEJA_FALLBACK.emails });
  }
  return json(cuerpo);
}
