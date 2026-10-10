/**
 * Orquestador · mapa persona → máquina, modelo, cuenta y aptitudes (GrokBotBox, 09-10-2026).
 * Un solo sitio para editar a quién se le puede dar qué. Lo usa orquestar-lib.mjs.
 *
 * - cuenta: id de CUENTAS en consumos-lecturas-lib.mjs (de ahí sale el % de margen). null = margen desconocido
 *   (se penaliza, no se excluye).
 * - alias: cómo firma la persona en la presencia (bot.yokup.com/api/presence → persona) y en la bandeja
 *   (bot.yokup.com/api/public/inbox → target_persona).
 * - perfil: clave de APTITUD (aptitud 0-1 por tipo de tarea).
 * - despierta: "webhook" = consejero GrokBot que se despierta al recibir un encargo; un latido viejo no lo
 *   deja «no libre», solo un encargo ack/in_progress de las últimas 48 h. Sin «despierta» (flota: Neo,
 *   Morfeo, Trinity, Oráculo, Smith…) manda el latido de <10 min + sin encargo en curso.
 */
export const APTITUD = {
  // Claude / Codex: código y web.
  "claude": { codigo: 0.95, web: 0.95, demo: 0.9, investigacion: 0.7, consejo: 0.55, estrategia: 0.55, creativo: 0.6, texto: 0.75, datos: 0.8 },
  "codex": { codigo: 0.95, web: 0.9, demo: 0.85, investigacion: 0.6, consejo: 0.45, estrategia: 0.45, creativo: 0.5, texto: 0.65, datos: 0.8 },
  // Grok 4.7 vía cursor-agent (Smith): bueno en código, soporte.
  "grok-cursor": { codigo: 0.8, web: 0.75, demo: 0.7, investigacion: 0.7, consejo: 0.5, estrategia: 0.5, creativo: 0.5, texto: 0.65, datos: 0.7 },
  // GrokBot consejeros (Grok Heavy): investigación, consejo y estrategia; código medio.
  "grok-heavy": { codigo: 0.6, web: 0.55, demo: 0.55, investigacion: 0.95, consejo: 0.95, estrategia: 0.95, creativo: 0.65, texto: 0.85, datos: 0.75 },
  // Disney y Lucas: creativo alto.
  "grok-heavy-creativo": { codigo: 0.5, web: 0.55, demo: 0.6, investigacion: 0.85, consejo: 0.9, estrategia: 0.85, creativo: 0.95, texto: 0.9, datos: 0.6 },
};

export const PERSONAS = [
  { persona: "Neo", maquina: "MacBook Pro 16", modelo: "Claude Opus (Claude Code)", cuenta: "neo-claude", perfil: "claude", alias: ["Neo", "NeoMBP16"] },
  // Morfeo: Claude en el Mac Mini con csilvasantin@gmail.com (confirmado por Carlos, 09-10-2026) → tarjeta morfeo-claude.
  { persona: "Morfeo", maquina: "MacMini", modelo: "Claude (Claude Code)", cuenta: "morfeo-claude", perfil: "claude", alias: ["Morfeo", "MorfeoMacMini"] },
  { persona: "Trinity", maquina: "MacBook Pro 16", modelo: "Codex", cuenta: "trinity-codex", perfil: "codex", alias: ["Trinity", "TrinityMacBookPro16"] },
  // Oráculo: Codex en el Mac Mini con csilvasantin@gmail.com (confirmado por Carlos, 09-10-2026) → tarjeta oraculo-codex.
  { persona: "Oráculo", maquina: "MacMini", modelo: "Codex", cuenta: "oraculo-codex", perfil: "codex", alias: ["Oraculo", "Oráculo", "OraculoMacMini"] },
  // Smith: Grok 4.7 en el Grok CLI del Mac mini (~/.grok, sesión tmux «smith»; comprobado 09-10-2026: grok-4.7-build,
  // no cursor-agent). Sus tokens salen de ~/.grok/sessions/<cwd>/<id>/usage.json (pulso-tokens.py, motor «grok»).
  { persona: "Smith", maquina: "MacMini", modelo: "Grok 4.7 (Grok CLI)", cuenta: "cursor", perfil: "grok-cursor", alias: ["Smith", "SmithMacMini"] },
  { persona: "Jobs", maquina: "GrokBot", modelo: "Grok Heavy", cuenta: "leyendas", perfil: "grok-heavy", despierta: "webhook", alias: ["Jobs", "JobsGrokBot", "Steve Jobs"] },
  { persona: "Wozniak", maquina: "GrokBot", modelo: "Grok Heavy", cuenta: "leyendas", perfil: "grok-heavy", despierta: "webhook", alias: ["Wozniak", "WozniakGrokBot", "Steve Wozniak", "Woz"] },
  { persona: "Lucas", maquina: "GrokBot", modelo: "Grok Heavy", cuenta: "leyendas", perfil: "grok-heavy-creativo", despierta: "webhook", alias: ["Lucas", "LucasGrokBot", "George Lucas"] },
  { persona: "Disney", maquina: "GrokBot", modelo: "Grok Heavy", cuenta: "leyendas", perfil: "grok-heavy-creativo", despierta: "webhook", alias: ["Disney", "DisneyGrokBot", "Walt Disney", "Walt"] },
  { persona: "Musk", maquina: "GrokBot", modelo: "SuperGrok", cuenta: "coetaneos", perfil: "grok-heavy", despierta: "webhook", alias: ["Musk", "MuskGrokBot", "Elon Musk", "Elon"] },
  { persona: "Huang", maquina: "GrokBot", modelo: "SuperGrok", cuenta: "coetaneos", perfil: "grok-heavy", despierta: "webhook", alias: ["Huang", "HuangGrokBot", "Jensen Huang", "Jensen"] },
];

/** Palabras clave → tipo (para ?texto= sin ?tipo=). La primera regla que casa gana. */
export const PALABRAS = [
  ["creativo", /\b(creativ|guion|guión|storyboard|anuncio|spot|campañ|logo|naming|eslogan|historia|personaje|ilustra|video|vídeo|cine)/i],
  ["demo", /\b(demo|presentaci[oó]n|maqueta|prototipo|pitch)/i],
  ["investigacion", /\b(investiga|busca|buscar|research|compar|mercado|competencia|analiza|informe|estudio|tendencia)/i],
  ["consejo", /\b(consejo|opini[oó]n|decid|estrategi|prioriz|deber[ií]amos|qu[eé] hacemos|recomienda)/i],
  ["codigo", /\b(c[oó]digo|bug|arregla|fix|error|test|refactor|api|endpoint|script|deploy|despleg|funci[oó]n|crash|falla)/i],
  ["web", /\b(web|home|landing|p[aá]gina|css|html|frontend|responsive|portada|bot[oó]n)/i],
];
export const TIPO_POR_DEFECTO = "codigo";
