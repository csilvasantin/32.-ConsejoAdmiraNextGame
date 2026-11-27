/**
 * GET /api/win95/deepagents-comunicaciones — todas las comunicaciones Consejo ↔ DeepAgents
 * (encargos en cualquier estado, acuses, cierres y mensajes privados con tipo «agente») y los
 * DeepAgents que trabajan ahora por orden de un consejero, para la carpeta «Misiones», la
 * Bandeja de entrada y el panel «CLI DeepAgents» de admira.live/windows95 (Carlos t1457u,
 * 27-11-2026). Solo lectura, mismo origen y detrás de la verja: cookie de la puerta o sesión
 * de Google. Sin stream de terminal inventado: streamEnVivo=false con nota honesta.
 * Texto saneado en win95-deepagents-cli-lib.mjs: sin tokens, IPs, MACs, correos ni claves.
 */
import { verificar, leerCookie } from "../../_puerta.js";
import { emailGoogle } from "../../../chat-hilo-lib.mjs";
import { INBOX_PUBLICO } from "../../../consejo-comunicaciones-lib.mjs";
import { leerMensajes } from "../consejo/comunicaciones.js";
import { DEEPAGENTS_COM, construirComunicacionesDA, contieneSecretoDA, NOTA_STREAM } from "../../../win95-deepagents-cli-lib.mjs";

const PRESENCIA = "https://bot.yokup.com/api/presence";
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

export async function construir({ env, fetchImpl, ahora } = {}) {
  const f = fetchImpl || fetch;
  const t = ahora || Date.now();
  const bandejas = {};
  let fallos = 0;
  const [pres, mensajes] = await Promise.all([
    leer(f, PRESENCIA),
    leerMensajes(env, f).catch(() => ({ items: [], error: "mensajes" })),
    ...DEEPAGENTS_COM.map(async (a) => {
      const items = itemsDe(await leer(f, INBOX_PUBLICO + "?" + new URLSearchParams({ persona: a.persona })));
      if (!items) { fallos += 1; bandejas[a.persona] = []; return; }
      bandejas[a.persona] = items;
    }),
  ]);
  const avisos = [];
  if (fallos === DEEPAGENTS_COM.length) avisos.push("La bandeja de encargos de la flota no ha respondido.");
  else if (fallos) avisos.push("Alguna bandeja de DeepAgent no ha respondido; el resto está al día.");
  if (!pres || !Array.isArray(pres.presence)) avisos.push("Sin lectura de latidos ahora mismo.");
  return construirComunicacionesDA({
    bandejas,
    mensajes: (mensajes && mensajes.items) || [],
    presence: (pres && pres.presence) || [],
    ahora: t,
    aviso: avisos.join(" "),
  });
}

export async function onRequestGet({ request, env, fetchImpl }) {
  const f = fetchImpl || fetch;
  if (!(await autorizado(request, env, f))) return json({ ok: false, error: "sesion" }, 401);
  const cuerpo = await construir({ env, fetchImpl: f });
  if (contieneSecretoDA(JSON.stringify(cuerpo))) {
    return json({ ok: true, generado: Date.now(), aviso: "La respuesta se ha retenido por precaución (posible secreto).", total: 0, comunicaciones: [], activos: [], enCola: [], agentes: [], carpetas: [], streamEnVivo: false, notaStream: NOTA_STREAM });
  }
  return json(cuerpo);
}
