/**
 * POST /api/consejo/voz — voz ElevenLabs por consejero (nivel PAGO + audio · 11-10-2026).
 * { persona, texto, lang } → audio/mpeg. Ninguna clave toca el navegador. Dos vías, por orden:
 *   1) ELEVENLABS_API_KEY del proyecto (si algún día existe): voice_id propio por consejero.
 *   2) Service Binding PIXER_TTS → worker pixer-eleven, entrypoint AnnouncementTts.generate (RPC interno de la
 *      cuenta; la clave vive solo en pixer-eleven) con voiceId propio por consejero (allowlist de pixer-eleven,
 *      pixer-worker#14). Un worker sin allowlist ignora voiceId y suena male/female: para eso queda VOZ_PIXER.
 * Sin ninguna: 503 { falta: "ELEVENLABS_API_KEY" } y el navegador cae a speechSynthesis.
 */
import { CONSEJEROS, vozEleven, vozPixer, ELEVEN_MODELO, ELEVEN_USD_POR_1000, idiomaValido } from "../../../debatir-lib.mjs";
import { json, cabeceras, enDmz, quien } from "../../../debatir-http.mjs";

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabeceras(request.headers.get("Origin") || "") });
}

const EXPONER = "X-Debatir-Coste-Usd, X-Debatir-Caracteres, X-Debatir-Via, X-Debatir-Tono, X-Debatir-Voz";

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
  const coste = (texto.length / 1000) * ELEVEN_USD_POR_1000;
  const meta = (via, voz, tono) => cabeceras(o, {
    "content-type": "audio/mpeg", "x-debatir-coste-usd": coste.toFixed(5), "x-debatir-caracteres": String(texto.length),
    "x-debatir-via": via, "x-debatir-voz": voz, "x-debatir-tono": String(tono), "access-control-expose-headers": EXPONER,
  });

  if (env && env.ELEVENLABS_API_KEY) {
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
    return new Response(r.body, { status: 200, headers: meta("elevenlabs", voz, 1) });
  }

  if (env && env.PIXER_TTS && typeof env.PIXER_TTS.generate === "function") {
    const v = vozPixer(persona);
    let r;
    try {
      r = await env.PIXER_TTS.generate({ text: texto, voice: v.voice, voiceId: v.voiceId || undefined, language: idiomaValido(b.lang) });
    } catch (e) { return json({ ok: false, error: "pixer-eleven no responde" }, 502, o); }
    if (!r || !r.ok) {
      const st = r ? r.status : 502;
      return json({ ok: false, error: "pixer-eleven " + st, falta: st === 503 ? "ELEVENLABS_KEY (pixer-eleven)" : undefined }, 502, o);
    }
    return new Response(r.body, { status: 200, headers: meta("pixer-eleven", v.voiceId || v.voice, v.tono) });
  }

  return json({ ok: false, falta: "ELEVENLABS_API_KEY", error: "falta clave ElevenLabs" }, 503, o);
}
