/**
 * Reparto de voces Grok (xAI TTS) para los consejeros de admira.live.
 * Una voz distinta y estable por persona. Todas hablan es-ES.
 * No clona la voz real de nadie: son las voces de serie de Grok.
 */
export const TTS_URL = "https://api.x.ai/v1/tts";
export const TTS_LANG = "es-ES";
export const TTS_MAX_CHARS = 1200;

// voice_id de docs.x.ai (Text to Speech). speed en 0.7–1.5.
export const VOCES_GROK = {
  "steve-jobs":     { voice_id: "atlas",  speed: 0.95, tono: "firme y autoritaria" },
  "steve-wozniak":  { voice_id: "kepler", speed: 1.06, tono: "inventiva y carismática" },
  "tim-cook":       { voice_id: "lux",    speed: 0.95, tono: "calmada y ponderada" },
  "warren-buffett": { voice_id: "orion",  speed: 0.88, tono: "grave, narrativa, pausada" },
  "walt-disney":    { voice_id: "lumen",  speed: 0.94, tono: "cálida y envolvente" },
  "dieter-rams":    { voice_id: "rigel",  speed: 0.88, tono: "precisa y sobria" },
  "howard-schultz": { voice_id: "ursa",   speed: 1.00, tono: "cercana y confiable" },
  "george-lucas":   { voice_id: "zagan",  speed: 0.90, tono: "dramática y cinematográfica" },
  "elon-musk":      { voice_id: "helix",  speed: 1.15, tono: "enérgica y directa" },
  "jensen-huang":   { voice_id: "helios", speed: 1.10, tono: "entusiasta y vivida" },
  "mira-murati":    { voice_id: "celeste",speed: 1.04, tono: "firme y precisa" },
  "ruth-porat":     { voice_id: "liora",  speed: 0.96, tono: "serena y analítica" },
  "john-lasseter":  { voice_id: "cosmo",  speed: 1.08, tono: "curiosa y entusiasta" },
  "jony-ive":       { voice_id: "sal",    speed: 0.86, tono: "suave y contenida" },
  "carlos-ratti":   { voice_id: "castor", speed: 1.02, tono: "cercana y mediterránea" },
  "ryan-reynolds":  { voice_id: "sirius", speed: 1.12, tono: "ágil e irónica" },
  // Invitados de Escena 0 (guion Carlos Silva ↔ Carlo Bonomi)
  "carlos-silva":   { voice_id: "rex",    speed: 1.00, tono: "clara y segura" },
  "carlo-bonomi":   { voice_id: "perseus",speed: 0.98, tono: "confiable y sobria" },
};

export const ALIAS = {
  "jobs": "steve-jobs",
  "woz": "steve-wozniak",
  "wozniak": "steve-wozniak",
  "cook": "tim-cook",
  "buffett": "warren-buffett",
  "disney": "walt-disney",
  "walt": "walt-disney",
  "rams": "dieter-rams",
  "schultz": "howard-schultz",
  "lucas": "george-lucas",
  "elon": "elon-musk",
  "musk": "elon-musk",
  "jensen": "jensen-huang",
  "huang": "jensen-huang",
  "murati": "mira-murati",
  "porat": "ruth-porat",
  "lasseter": "john-lasseter",
  "ive": "jony-ive",
  "jony": "jony-ive",
  "ratti": "carlos-ratti",
  "carlo-ratti": "carlos-ratti",
  "reynolds": "ryan-reynolds",
  "ryan": "ryan-reynolds",
  "carlos": "carlos-silva",
  "silva": "carlos-silva",
  "bonomi": "carlo-bonomi",
  "bononi": "carlo-bonomi",
  "carlo-bononi": "carlo-bonomi",
  "carlo": "carlo-bonomi",
};

export function slug(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function resolver(persona) {
  const s = slug(persona);
  const key = VOCES_GROK[s] ? s : (ALIAS[s] || null);
  if (!key || !VOCES_GROK[key]) return null;
  const v = VOCES_GROK[key];
  const speed = Math.max(0.7, Math.min(1.5, Number(v.speed) || 1));
  return { slug: key, voice_id: v.voice_id, speed, tono: v.tono };
}

export function limpiarTexto(text, max = TTS_MAX_CHARS) {
  const t = String(text || "").replace(/[*_#`>]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

export function vocesUsadas() {
  return Object.values(VOCES_GROK).map((v) => v.voice_id);
}
