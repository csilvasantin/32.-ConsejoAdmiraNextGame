/**
 * /api/consejo/debatir — mesa de debate del Consejo (GrokBotBox, 11-10-2026 · Carlos).
 * El navegador orquesta los turnos (uno por petición: cada bocadillo llega en cuanto existe).
 *   GET  → salud: niveles disponibles, modelo, DMZ.
 *   POST { accion: "preparar", tema, lang }                       → { tema, url?, titulo?, contexto? }
 *   POST { accion: "turno", persona, tema, contexto?, historial, ronda, rondas, lang, nivel } → { texto }
 *   POST { accion: "conclusion", tema, contexto?, historial, lang, nivel }                     → { texto } (Jobs modera)
 * nivel: "gratis" (defecto, Nemotron 3 Ultra en NVIDIA NIM) | "pago" (grok-4.6, solo si se pide).
 */
import {
  CONSEJEROS, MODERADOR, extraerUrl, leerPagina, mensajesTurno, mensajesConclusion, mensajesResumen,
  limpiarBocadillo, llamarModelo, proveedor, rondasValidas, nivelValido, idiomaValido, MAX_RONDAS,
} from "../../../debatir-lib.mjs";
import { json, cabeceras, enDmz, quien } from "../../../debatir-http.mjs";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "") });
}

export function onRequestGet({ request, env }) {
  const o = request.headers.get("Origin") || "";
  if (enDmz(request, env)) return json({ ok: false, error: "no encontrado" }, 404, o);
  const g = proveedor("gratis", env || {}), p = proveedor("pago", env || {});
  return json({
    ok: true, servicio: "debatir", dmz: true, max_rondas: MAX_RONDAS,
    niveles: { gratis: g ? g.etiqueta : null, pago: p ? p.etiqueta : null },
    voz: { navegador: true, elevenlabs: env && env.ELEVENLABS_API_KEY ? "clave propia" : env && env.PIXER_TTS ? "pixer-eleven (service binding)" : null },
  }, 200, o);
}

const limpio = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
function historialLimpio(h) {
  return (Array.isArray(h) ? h : []).slice(-20)
    .filter((t) => t && CONSEJEROS[t.persona])
    .map((t) => ({ persona: t.persona, texto: limpio(t.texto, 500) }));
}

export async function onRequestPost({ request, env, fetchImpl }) {
  const o = request.headers.get("Origin") || "";
  const doFetch = fetchImpl || fetch;
  if (enDmz(request, env)) return json({ ok: false, error: "no encontrado" }, 404, o);
  const crudo = await request.text();
  if (crudo.length > 30000) return json({ ok: false, error: "cuerpo demasiado grande" }, 413, o);
  let b;
  try { b = JSON.parse(crudo || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400, o); }
  const autor = await quien(request, env || {}, doFetch);
  if (!autor) return json({ ok: false, error: "privado: entra con tu cuenta de Google de admira.live o usa el enlace de la preview" }, 401, o);

  const lang = idiomaValido(b.lang);
  const nivel = nivelValido(b.nivel);
  const tema = limpio(b.tema, 600);
  if (!tema) return json({ ok: false, error: "falta el tema" }, 400, o);
  const contexto = limpio(b.contexto, 1500) || null;
  try {
    if (b.accion === "preparar") {
      const url = extraerUrl(tema);
      if (!url) return json({ ok: true, tema, url: null, contexto: null }, 200, o);
      const pag = await leerPagina(url, doFetch);
      if (!pag.ok) return json({ ok: true, tema, url, contexto: null, aviso: pag.error }, 200, o);
      // El resumen de la página siempre va por el nivel gratis: es contexto, no opinión.
      const r = await llamarModelo({ nivel: "gratis", env, fetchImpl: doFetch, maxTokens: 260, messages: mensajesResumen({ lang, titulo: pag.titulo, texto: pag.texto, url: pag.url }) });
      return json({ ok: true, tema, url: pag.url, titulo: pag.titulo, contexto: limpiarBocadillo(r.texto, { maxFrases: 5, maxChars: 900 }), modelo: r.modelo, nivel: "gratis" }, 200, o);
    }
    if (b.accion === "turno") {
      const persona = String(b.persona || "");
      if (!CONSEJEROS[persona]) return json({ ok: false, error: "consejero desconocido" }, 400, o);
      const rondas = rondasValidas(b.rondas);
      const ronda = Math.min(Math.max(1, Math.round(Number(b.ronda) || 1)), rondas);
      const r = await llamarModelo({ nivel, env, fetchImpl: doFetch, messages: mensajesTurno({ persona, lang, tema, contexto, historial: historialLimpio(b.historial), ronda, rondas }) });
      const texto = limpiarBocadillo(r.texto, { nombre: CONSEJEROS[persona].nombre });
      return json({ ok: true, persona, nombre: CONSEJEROS[persona].nombre, ronda, texto, modelo: r.modelo, nivel: r.nivel, etiqueta: r.etiqueta, coste_usd: r.coste_usd }, 200, o);
    }
    if (b.accion === "conclusion") {
      const r = await llamarModelo({ nivel, env, fetchImpl: doFetch, maxTokens: 260, messages: mensajesConclusion({ lang, tema, contexto, historial: historialLimpio(b.historial) }) });
      const texto = limpiarBocadillo(r.texto, { maxFrases: 3, maxChars: 380, nombre: CONSEJEROS[MODERADOR].nombre });
      return json({ ok: true, persona: MODERADOR, nombre: CONSEJEROS[MODERADOR].nombre, conclusion: true, texto, modelo: r.modelo, nivel: r.nivel, etiqueta: r.etiqueta, coste_usd: r.coste_usd }, 200, o);
    }
    return json({ ok: false, error: "accion: preparar | turno | conclusion" }, 400, o);
  } catch (e) {
    const status = e && e.status ? e.status : 502;
    return json({ ok: false, error: String((e && e.message) || e).slice(0, 200), falta: e && e.falta }, status, o);
  }
}
