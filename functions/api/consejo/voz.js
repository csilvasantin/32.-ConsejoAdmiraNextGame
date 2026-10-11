/**
 * POST /api/consejo/voz — voz ElevenLabs por consejero (nivel PAGO + audio · 11-10-2026).
 * { persona, texto, lang } → audio/mpeg. La clave vive solo aquí (ELEVENLABS_API_KEY del proyecto);
 * sin clave responde 503 { falta: "ELEVENLABS_API_KEY" } y el navegador cae a speechSynthesis.
 */
import { CONSEJEROS, vozEleven, ELEVEN_MODELO, ELEVEN_USD_POR_1000 } from "../../../debatir-lib.mjs";
import { json, cabeceras, enDmz, quien } from "../../../debatir-http.mjs";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "") });
}

export async function onRequestPost({ request, env, fetchImpl }) {
  const o = request.headers.get("Origin") || "";
  const doFetch = fetchImpl || fetch;
  if (enDmz(request, env)) return json({ ok: false, error: "no encontrado" }, 404, o);
  let b;
  try { b = JSON.parse((await request.text()) || "{}"); } catch (e) { return json({ ok: false, error: "json inválido" }, 400, o); }
  if (!(await quien(request, env || {}, doFetch))) return json({ ok: false, error: "privado" }, 401, o);
  const persona = String(b.persona || "");
  const texto = String(b.texto || "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (!CONSEJEROS[persona] || !texto) return json({ ok: false, error: "persona y texto obligatorios" }, 400, o);
  if (!env || !env.ELEVENLABS_API_KEY) return json({ ok: false, falta: "ELEVENLABS_API_KEY", error: "falta clave ElevenLabs" }, 503, o);
  const voz = vozEleven(persona, env);
  if (!voz) return json({ ok: false, error: "sin voz para " + persona }, 400, o);
  let r;
  try {
    r = await doFetch("https://api.elevenlabs.io/v1/text-to-speech/" + voz + "?output_format=mp3_44100_64", {
      method: "POST", signal: AbortSignal.timeout(30000),
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: texto, model_id: env.DEBATIR_ELEVEN_MODELO || ELEVEN_MODELO, voice_settings: { stability: 0.45, similarity_boost: 0.75 } }),
    });
  } catch (e) { return json({ ok: false, error: "ElevenLabs no responde" }, 502, o); }
  if (!r.ok) return json({ ok: false, error: "ElevenLabs " + r.status }, 502, o);
  const coste = (texto.length / 1000) * ELEVEN_USD_POR_1000;
  return new Response(r.body, { status: 200, headers: cabeceras(o, { "content-type": "audio/mpeg", "x-debatir-coste-usd": coste.toFixed(5), "access-control-expose-headers": "X-Debatir-Coste-Usd" }) });
}
