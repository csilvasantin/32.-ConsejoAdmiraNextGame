// Mesa de debate del Consejo · /debatir · /debate (GrokBotBox, 11-10-2026).
// Lógica pura (sin red salvo por fetchImpl inyectado) para que node:test la cubra entera.
//
// NIVELES (norma de coste de Carlos):
//   gratis (por defecto) → NVIDIA NIM · Nemotron 3 Ultra (build.nvidia.com, sin coste por turno).
//                          Ningún turno despierta a un Grok Bot ni gasta tokens de pago.
//   pago (/debate better · /debatir mejor) → xAI grok-4.6 (razonador; el mismo de consejo_preguntar).
//                          Solo si se pide EXPRESAMENTE; el servidor nunca sube de nivel por su cuenta.
// DMZ: en www.admira.live / admira.live el endpoint responde 404 salvo DEBATIR_PUBLICO=1.

export const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
export const XAI_URL = "https://api.x.ai/v1/chat/completions";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const MODELO_GRATIS = "nvidia/nemotron-3-ultra-550b-a55b";
export const MODELO_GRATIS_OR = "nvidia/nemotron-3-ultra:free";
export const MODELO_PAGO = "grok-4.6";
export const MAX_RONDAS = 4;
export const RONDAS_DEFECTO = 2;
export const MODERADOR = "jobs";
export const HOSTS_PRODUCCION = ["www.admira.live", "admira.live"];

// Personajes. `nombre` coincide con las claves de assets/council-silhouettes.js (posición en la escena).
export const CONSEJEROS = Object.freeze({
  // ── Leyendas ──
  jobs:     { nombre: "Steve Jobs",     gen: "leyendas",  es: "producto y diseño: simplicidad radical, decir no a mil cosas, la experiencia de punta a punta", en: "product and design: radical simplicity, saying no to a thousand things, end-to-end experience" },
  wozniak:  { nombre: "Steve Wozniak",  gen: "leyendas",  es: "ingeniería: cómo se construye de verdad, hardware, fiabilidad, el placer de lo que funciona", en: "engineering: how it actually gets built, hardware, reliability, the joy of things that work" },
  cook:     { nombre: "Tim Cook",       gen: "leyendas",  es: "operaciones y cadena de suministro: escalar sin perder calidad, márgenes, privacidad", en: "operations and supply chain: scaling without losing quality, margins, privacy" },
  buffett:  { nombre: "Warren Buffett", gen: "leyendas",  es: "negocio y valor: foso competitivo, caja, largo plazo, sentido común", en: "business and value: moat, cash, long term, common sense" },
  disney:   { nombre: "Walt Disney",    gen: "leyendas",  es: "experiencia de marca: la magia en el lugar, el visitante como invitado, cada detalle cuenta", en: "brand experience: magic in the venue, the visitor as a guest, every detail counts" },
  rams:     { nombre: "Dieter Rams",    gen: "leyendas",  es: "diseño industrial: menos pero mejor, honestidad, durabilidad", en: "industrial design: less but better, honesty, durability" },
  schultz:  { nombre: "Howard Schultz", gen: "leyendas",  es: "la tienda como tercer lugar: ritual, personas, comunidad", en: "the store as a third place: ritual, people, community" },
  lucas:    { nombre: "George Lucas",   gen: "leyendas",  es: "mundo narrativo: el storyworld, mitos, personajes, efectos al servicio de la historia", en: "storyworld: myth, characters, effects in service of the story" },
  // ── Coetáneos ──
  musk:     { nombre: "Elon Musk",       gen: "coetaneos", es: "primeros principios, escala y velocidad: borrar pasos, automatizar, apuntar a lo imposible", en: "first principles, scale and speed: delete steps, automate, aim at the impossible" },
  huang:    { nombre: "Jensen Huang",    gen: "coetaneos", es: "computación acelerada e IA: plataformas, ecosistema de desarrolladores, la fábrica de IA", en: "accelerated computing and AI: platforms, developer ecosystem, the AI factory" },
  shotwell: { nombre: "Gwynne Shotwell", gen: "coetaneos", es: "ejecución: clientes reales, contratos, cadencia y fiabilidad operativa", en: "execution: real customers, contracts, cadence and operational reliability" },
  porat:    { nombre: "Ruth Porat",      gen: "coetaneos", es: "finanzas: disciplina de capital, métricas, retorno de cada euro", en: "finance: capital discipline, metrics, return on every euro" },
  lasseter: { nombre: "John Lasseter",   gen: "coetaneos", es: "historia y personajes: el corazón emocional, la animación que hace sentir", en: "story and characters: the emotional heart, animation that makes you feel" },
  ive:      { nombre: "Jony Ive",        gen: "coetaneos", es: "diseño: materiales, cuidado obsesivo, objetos que se sienten inevitables", en: "design: materials, obsessive care, objects that feel inevitable" },
  ratti:    { nombre: "Carlos Ratti",    gen: "coetaneos", es: "ciudad y espacio sensible: arquitectura con datos, el lugar que responde a la gente", en: "senseable spaces: architecture with data, places that respond to people" },
  reynolds: { nombre: "Ryan Reynolds",   gen: "coetaneos", es: "marketing y marca: humor, rapidez, campañas que la gente quiere compartir", en: "marketing and brand: humour, speed, campaigns people want to share" },
});

// Mesa por defecto de cada vista (4 sillas: debate ágil). `todos` = las 8 de la vista.
export const MESA_DEFECTO = Object.freeze({
  leyendas: ["jobs", "wozniak", "disney", "lucas"],
  coetaneos: ["musk", "huang", "ive", "reynolds"],
});
export function participantes(gen, todos = false) {
  const g = gen === "coetaneos" ? "coetaneos" : "leyendas";
  if (!todos) return MESA_DEFECTO[g].slice();
  return Object.keys(CONSEJEROS).filter((k) => CONSEJEROS[k].gen === g);
}
export function rondasValidas(n) {
  const r = Math.round(Number(n));
  return Number.isFinite(r) && r >= 1 ? Math.min(r, MAX_RONDAS) : RONDAS_DEFECTO;
}
export const nivelValido = (n) => (n === "pago" ? "pago" : "gratis");
export const idiomaValido = (l) => (String(l || "").toLowerCase().startsWith("en") ? "en" : "es");

export function esHostProduccion(host) {
  return HOSTS_PRODUCCION.includes(String(host || "").toLowerCase().split(":")[0]);
}

// ── URL segura (servidor) ──────────────────────────────────────────────────
const PRIVADA = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;
export function urlSegura(s) {
  let u;
  try { u = new URL(String(s || "").trim()); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.port && !["80", "443"].includes(u.port)) return null;
  const h = u.hostname.replace(/^\[|\]$/g, "");
  if (PRIVADA.test(h)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return null; // sin IPs literales (SSRF)
  if (!h.includes(".")) return null;
  return u;
}
export function extraerUrl(tema) {
  const m = String(tema || "").match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;]+$/, "") : null;
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function desentidad(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}
export function textoDeHtml(html, max = 6000) {
  const h = String(html || "");
  const titulo = desentidad(((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").replace(/\s+/g, " ").trim()).slice(0, 200);
  const desc = desentidad((h.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i) || [])[1] || "").trim();
  const cuerpo = desentidad(h
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr|section|article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t\f\v]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  const texto = [desc, cuerpo].filter(Boolean).join("\n").slice(0, max);
  return { titulo, texto };
}

export async function leerPagina(url, fetchImpl = fetch) {
  const u = urlSegura(url);
  if (!u) return { ok: false, error: "URL no permitida" };
  let r;
  try {
    r = await fetchImpl(u.href, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (compatible; AdmiraConsejo/1.0; +https://www.admira.live)", accept: "text/html,text/plain;q=0.9,*/*;q=0.5" } });
  } catch (e) { return { ok: false, error: "la página no responde" }; }
  if (!r.ok) return { ok: false, error: "la página respondió " + r.status };
  const tipo = String(r.headers.get("content-type") || "");
  if (tipo && !/text\/|html|xml|json/i.test(tipo)) return { ok: false, error: "no es una página de texto (" + tipo.split(";")[0] + ")" };
  const crudo = (await r.text()).slice(0, 400000);
  const { titulo, texto } = /html/i.test(tipo) || /<html|<body|<title/i.test(crudo) ? textoDeHtml(crudo) : { titulo: "", texto: crudo.slice(0, 6000) };
  if (texto.length < 40) return { ok: false, error: "la página no tiene texto legible", titulo };
  return { ok: true, url: u.href, titulo, texto };
}

// ── Prompts ────────────────────────────────────────────────────────────────
const CASA = {
  es: "La mesa es el Consejo de AdmiraNeXT (Admira: digital signage, retail media, pantallas y experiencias en tienda, IA para marcas). Carlos Silva, el CEO, escucha.",
  en: "The table is the AdmiraNeXT Council (Admira: digital signage, retail media, in-store screens and experiences, AI for brands). Carlos Silva, the CEO, is listening.",
};
export function sistemaPersona(clave, lang) {
  const c = CONSEJEROS[clave];
  const L = idiomaValido(lang);
  if (!c) throw new Error("consejero desconocido");
  return L === "en"
    ? `You are ${c.nombre}, debating in character at a round table. ${CASA.en} Your lens: ${c.en}. ` +
      "Speak in English, in first person, with your real voice and convictions. 1 to 3 short sentences, 45 words max. " +
      "Build on what the previous speaker said: name them, agree or push back, and add one NEW idea. Vary how you open: no formulas like 'My idea:' or 'My proposal:'. No greetings, no emojis, no markdown, no stage directions, never say you are an AI."
    : `Eres ${c.nombre}, debatiendo en personaje en una mesa redonda. ${CASA.es} Tu mirada: ${c.es}. ` +
      "Habla en castellano, en primera persona, con tu voz y convicciones reales. De 1 a 3 frases cortas, 45 palabras como máximo. " +
      "Construye sobre lo que dijo el anterior: nómbralo, dale la razón o rebátele, y aporta UNA idea NUEVA. Varía cómo empiezas: nada de fórmulas como «Mi idea:» o «Mi propuesta:». Sin saludos, sin emojis, sin markdown, sin acotaciones, nunca digas que eres una IA.";
}
function bloqueContexto(tema, contexto, lang) {
  const en = lang === "en";
  let s = (en ? "DEBATE TOPIC: " : "TEMA DEL DEBATE: ") + String(tema || "").slice(0, 600);
  if (contexto) s += "\n" + (en ? "CONTEXT (summary of the page): " : "CONTEXTO (resumen de la página): ") + String(contexto).slice(0, 1500);
  return s;
}
export function historialTexto(historial, lang, max = 10) {
  const h = (Array.isArray(historial) ? historial : []).slice(-max)
    .map((t) => {
      const c = CONSEJEROS[t && t.persona];
      return c ? `${c.nombre}: ${String(t.texto || "").replace(/\s+/g, " ").slice(0, 400)}` : null;
    }).filter(Boolean);
  if (!h.length) return lang === "en" ? "(Nobody has spoken yet: you open the debate.)" : "(Nadie ha hablado aún: abres tú el debate.)";
  return (lang === "en" ? "WHAT HAS BEEN SAID:\n" : "LO QUE SE HA DICHO:\n") + h.join("\n");
}
export function mensajesTurno({ persona, lang, tema, contexto, historial, ronda = 1, rondas = RONDAS_DEFECTO }) {
  const L = idiomaValido(lang);
  const ultima = Number(ronda) >= Number(rondas);
  const pie = L === "en"
    ? `Round ${ronda} of ${rondas}. Your turn.${ultima ? " Last round: sharpen your position into something actionable." : ""}`
    : `Ronda ${ronda} de ${rondas}. Te toca.${ultima ? " Última ronda: concreta tu postura en algo accionable." : ""}`;
  return [
    { role: "system", content: sistemaPersona(persona, L) },
    { role: "user", content: bloqueContexto(tema, contexto, L) + "\n\n" + historialTexto(historial, L) + "\n\n" + pie },
  ];
}
export function mensajesConclusion({ lang, tema, contexto, historial }) {
  const L = idiomaValido(lang);
  const sis = L === "en"
    ? `You are Steve Jobs, moderating the AdmiraNeXT Council debate. ${CASA.en} Close the debate in 2-3 short sentences (55 words max): the conclusion the table reached and ONE concrete next step for Admira. No greetings, no emojis, no markdown.`
    : `Eres Steve Jobs, moderador del debate del Consejo AdmiraNeXT. ${CASA.es} Cierra el debate en 2-3 frases cortas (55 palabras como máximo): la conclusión a la que llegó la mesa y UN siguiente paso concreto para Admira. Sin saludos, sin emojis, sin markdown.`;
  return [
    { role: "system", content: sis },
    { role: "user", content: bloqueContexto(tema, contexto, L) + "\n\n" + historialTexto(historial, L, 16) + "\n\n" + (L === "en" ? "Conclusion:" : "Conclusión:") },
  ];
}
export function mensajesResumen({ lang, titulo, texto, url }) {
  const L = idiomaValido(lang);
  return [
    { role: "system", content: L === "en" ? "Summarise web pages faithfully for a debate. 3-4 sentences, plain text, English, no markdown." : "Resumes páginas web con fidelidad para un debate. 3-4 frases, texto plano, castellano, sin markdown." },
    { role: "user", content: `URL: ${url}\n${titulo ? "Título: " + titulo + "\n" : ""}\n${String(texto || "").slice(0, 6000)}` },
  ];
}

// ── Limpieza del bocadillo ─────────────────────────────────────────────────
export function limpiarBocadillo(t, { maxFrases = 3, maxChars = 280, nombre = "" } = {}) {
  let s = String(t || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/[*_#`>]+/g, "")
    .replace(/\([^)]*(?:pausa|sonríe|ríe|pause|smiles|laughs)[^)]*\)/gi, "")
    .replace(/\s+/g, " ").trim();
  if (nombre) s = s.replace(new RegExp("^" + nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:：-]\\s*", "i"), "");
  s = s.replace(/^["“”«»']+|["“”«»']+$/g, "").trim();
  const frases = s.split(/(?<=[.!?…]["”»]?)\s+(?=\S)/).filter(Boolean);
  let out = frases.slice(0, maxFrases);
  while (out.length > 1 && out.join(" ").length > maxChars) out.pop(); // mejor una frase menos que una cortada
  s = out.join(" ").replace(/\s+/g, " ").trim();
  if (s.length > maxChars) { s = s.slice(0, maxChars - 1).replace(/\s+\S*$/, "") + "…"; }
  return s;
}

// ── Modelo ─────────────────────────────────────────────────────────────────
export function proveedor(nivel, env = {}) {
  if (nivelValido(nivel) === "pago") {
    if (!env.XAI_API_KEY) return null;
    return { id: "xai", url: XAI_URL, clave: env.XAI_API_KEY, modelo: env.DEBATIR_MODELO_PAGO || MODELO_PAGO, nivel: "pago", etiqueta: "PAGO · Grok 4.6 (xAI)" };
  }
  if (env.NVIDIA_API_KEY) return { id: "nvidia", url: NIM_URL, clave: env.NVIDIA_API_KEY, modelo: env.DEBATIR_MODELO_GRATIS || MODELO_GRATIS, nivel: "gratis", etiqueta: "GRATIS · Nemotron 3 Ultra (NVIDIA NIM)" };
  if (env.OPENROUTER_API_KEY) return { id: "openrouter", url: OPENROUTER_URL, clave: env.OPENROUTER_API_KEY, modelo: MODELO_GRATIS_OR, nivel: "gratis", etiqueta: "GRATIS · Nemotron 3 Ultra (OpenRouter free)" };
  return null;
}
export function cuerpoPeticion(p, messages, maxTokens) {
  if (p.id === "xai") return { model: p.modelo, messages, max_tokens: Math.max(maxTokens, 2500), temperature: 0.8 }; // razonador: el razonamiento cuenta como salida
  const b = { model: p.modelo, messages, max_tokens: maxTokens, temperature: 0.8 };
  if (p.id === "nvidia") b.chat_template_kwargs = { enable_thinking: false }; // sin razonamiento: más rápido y bocadillo directo
  return b;
}
// xAI devuelve el coste exacto en «ticks» (1e-10 USD).
export function costeUsd(p, d) {
  if (!p || p.nivel !== "pago") return 0;
  const ticks = Number(d && d.usage && d.usage.cost_in_usd_ticks);
  if (Number.isFinite(ticks) && ticks > 0) return ticks / 1e10;
  const u = (d && d.usage) || {};
  return ((Number(u.prompt_tokens) || 0) * 2 + (Number(u.completion_tokens) || 0) * 15) / 1e6; // estimación grok-4.x
}
export async function llamarModelo({ nivel, env, messages, fetchImpl = fetch, maxTokens = 160, timeoutMs }) {
  const p = proveedor(nivel, env);
  if (!p) {
    const falta = nivelValido(nivel) === "pago" ? "XAI_API_KEY" : "NVIDIA_API_KEY";
    const e = new Error("falta " + falta + " en el proyecto"); e.status = 503; e.falta = falta; throw e;
  }
  const r = await fetchImpl(p.url, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs || (p.id === "xai" ? 60000 : 25000)),
    headers: { "content-type": "application/json", authorization: "Bearer " + p.clave },
    body: JSON.stringify(cuerpoPeticion(p, messages, maxTokens)),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) { const e = new Error(`${p.id} ${r.status}`); e.status = 502; throw e; }
  const texto = String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "").trim();
  if (!texto) { const e = new Error(`${p.id}: respuesta vacía`); e.status = 502; throw e; }
  return { texto, modelo: p.modelo, proveedor: p.id, nivel: p.nivel, etiqueta: p.etiqueta, coste_usd: costeUsd(p, d) };
}

// ── Voces ElevenLabs (nivel pago + audio) ─────────────────────────────────
// Una voz premade de ElevenLabs por consejero (multilingüe: hablan castellano e inglés). Son las mismas que
// admite la allowlist `counselorVoiceIds` de pixer-eleven (AnnouncementTts, PR pixer-worker#14).
// Distintas dentro de cada vista, y también de Jobs, que modera en las dos. DEBATIR_VOCES (JSON) las sustituye
// en la vía de clave propia.
export const VOCES_ELEVEN = Object.freeze({
  jobs: "cjVigY5qzO86Huf0OWal",     // Eric · sereno, persuasivo
  wozniak: "TX3LPaxmHKxFdv7VOQHJ",  // Liam · enérgico, entusiasta
  cook: "CwhRBWXzGAHq8TQ4Fs17",     // Roger · calmado, sureño tranquilo
  buffett: "pqHfZKP75CyOlX2KQs5n",  // Bill · mayor, de confianza
  disney: "nPczCjzI2devNBz1zQrW",   // Brian · grave, narrador showman
  rams: "onwK4e9ZLuTAKqWW03F9",     // Daniel · europeo, sobrio, autoridad
  schultz: "iP95p4xoKVk53GoZ742B",  // Chris · cercano, de barra
  lucas: "JBFqnCBsd6RMkjVDRZzb",    // George · cálido, cuentacuentos
  musk: "N2lVS1w4EtoT3dr4eOWO",     // Callum · intenso, ronco
  huang: "bIHbv24MWmeRgasZH58o",    // Will · afable, optimista
  shotwell: "EXAVITQu4vr4xnSDxMaL", // Sarah · segura, ejecutiva
  porat: "XrExE9yKIg1WjnnlVkGX",    // Matilda · profesional, precisa
  lasseter: "IKne3meq5aSn9XLyUdCD", // Charlie · alegre, natural
  ive: "onwK4e9ZLuTAKqWW03F9",      // Daniel · británico, pausado
  ratti: "iP95p4xoKVk53GoZ742B",    // Chris · cercano
  reynolds: "TX3LPaxmHKxFdv7VOQHJ", // Liam · rápido, con chispa
});
export function vozEleven(persona, env = {}) {
  let extra = {};
  try { extra = env.DEBATIR_VOCES ? JSON.parse(env.DEBATIR_VOCES) : {}; } catch (e) { extra = {}; }
  const v = String(extra[persona] || VOCES_ELEVEN[persona] || "");
  return /^[A-Za-z0-9]{10,40}$/.test(v) ? v : null;
}
export const ELEVEN_MODELO = "eleven_multilingual_v2";

// Vía worker pixer-eleven (Service Binding PIXER_TTS → entrypoint AnnouncementTts, sin clave en admira.live):
// esa vía solo expone 2 voces ElevenLabs por idioma (male/female, modelo eleven_v4). Cada consejero se distingue
// con su voz (hombre/mujer) + un «tono» propio que el navegador aplica como playbackRate sin conservar el tono.
export const VOZ_PIXER = Object.freeze({
  jobs: ["male", 1.0], wozniak: ["male", 1.1], cook: ["male", 0.95], buffett: ["male", 0.87], disney: ["male", 1.05],
  rams: ["male", 0.91], schultz: ["male", 1.03], lucas: ["male", 0.83],
  musk: ["male", 0.93], huang: ["male", 1.07], shotwell: ["female", 1.0], porat: ["female", 0.9], lasseter: ["male", 1.12],
  ive: ["male", 0.88], ratti: ["male", 1.02], reynolds: ["male", 1.16],
});
export function vozPixer(persona) {
  const v = VOZ_PIXER[persona];
  if (!v) return null;
  const voiceId = VOCES_ELEVEN[persona] || null;
  // Con voz propia (allowlist de pixer-eleven) suena tal cual: sin cambio de tono.
  return { voice: v[0], voiceId, tono: voiceId ? 1 : v[1], tonoSinVoz: v[1] };
}
export const ELEVEN_USD_POR_1000 = 0.22; // orientativo (plan Creator ≈ 22 $ / 100k caracteres)
