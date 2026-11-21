/**
 * Motor de ask del Consejo en Cloudflare (Pages Functions / MCP).
 * No pasa por el Mac Mini. Usa secrets del entorno (XAI_API_KEY, etc.).
 * Nunca envía informes a Telegram (report queda ignorado y no se implementa).
 */
import { registrarConsumoConsejo } from './consejo-consumo-lib.mjs';
import { CONSEJEROS, fichaDe, listarConsejeros, personaCanonica, ROLES, GENERACIONES } from './consejo-sillas-lib.mjs';

export { CONSEJEROS, fichaDe, listarConsejeros, ROLES, GENERACIONES };

const MAX_MESSAGE = 4000;
const CTX_TURNOS = 12;

export const MODELOS = Object.freeze({
  'grok-4.6': {
    name: 'Grok 4.6', provider: 'xai', model_id: 'grok-4.6', free: false,
    icon: '🚀', secret: 'XAI_API_KEY', url: 'https://api.x.ai/v1/chat/completions',
  },
  'claude-sonnet': {
    name: 'Claude Sonnet 4', provider: 'anthropic', model_id: 'claude-sonnet-4-20250514', free: false,
    icon: '💎', secret: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/messages',
  },
  'gemini-flash': {
    name: 'Gemini 2.5 Flash', provider: 'gemini', model_id: 'gemini-2.5-flash', free: false,
    icon: '✨', secret: 'GOOGLE_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  'nvidia-deepseek-v4-flash': {
    name: 'NVIDIA DeepSeek V4 Flash', provider: 'nvidia', model_id: 'deepseek-ai/deepseek-v4-flash', free: true,
    icon: '⚡', secret: 'NVIDIA_API_KEY', url: 'https://integrate.api.nvidia.com/v1/chat/completions',
  },
  'nvidia-glm47': {
    name: 'NVIDIA GLM 4.7', provider: 'nvidia', model_id: 'z-ai/glm4.7', free: true,
    icon: '🧠', secret: 'NVIDIA_API_KEY', url: 'https://integrate.api.nvidia.com/v1/chat/completions',
  },
  'nvidia-minimax-m27': {
    name: 'NVIDIA MiniMax M2.7', provider: 'nvidia', model_id: 'minimaxai/minimax-m2.7', free: true,
    icon: '🛠️', secret: 'NVIDIA_API_KEY', url: 'https://integrate.api.nvidia.com/v1/chat/completions',
  },
  'nvidia-gpt-oss-20b': {
    name: 'NVIDIA GPT OSS 20B', provider: 'nvidia', model_id: 'openai/gpt-oss-20b', free: true,
    icon: '🧪', secret: 'NVIDIA_API_KEY', url: 'https://integrate.api.nvidia.com/v1/chat/completions',
  },
});

/** Tarifas usadas para el tope de sesión (USD / token). Aproximadas; Grok 4.6 se tarifa aquí como 3/15 por M. */
export const PRICE_INPUT_PER_TOKEN = 3.0 / 1_000_000;
export const PRICE_OUTPUT_PER_TOKEN = 15.0 / 1_000_000;
export const USD_TO_EUR = 0.92;

export function costeEur(inputTokens, outputTokens, modelo) {
  if (modelo && modelo.free) return 0;
  const usd = (Number(inputTokens) || 0) * PRICE_INPUT_PER_TOKEN + (Number(outputTokens) || 0) * PRICE_OUTPUT_PER_TOKEN;
  return Math.round(usd * USD_TO_EUR * 1e6) / 1e6;
}

export function secretoDe(env, modelo) {
  const cfg = typeof modelo === 'string' ? MODELOS[modelo] : modelo;
  if (!cfg) return '';
  const v = env && env[cfg.secret];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

export function modelosDisponibles(env) {
  return Object.entries(MODELOS).map(([key, cfg]) => ({
    key, name: cfg.name, provider: cfg.provider, free: cfg.free, icon: cfg.icon,
    available: Boolean(secretoDe(env, cfg)),
  }));
}

export function gapsDeModelos(env) {
  const vistos = new Map();
  for (const cfg of Object.values(MODELOS)) {
    if (!vistos.has(cfg.secret)) vistos.set(cfg.secret, !secretoDe(env, cfg));
  }
  return [...vistos.entries()].filter(([, falta]) => falta).map(([secret]) => secret);
}

/**
 * Elige el modelo: el pedido si está available; si no, el primer free+available;
 * si no hay gratis, el primer available (de pago) y lo marca.
 */
export function elegirModelo(env, preferido) {
  const list = modelosDisponibles(env);
  const ped = preferido && preferido !== 'auto' ? list.find((m) => m.key === preferido) : null;
  if (ped && ped.available) return { ...ped, motivo: 'pedido' };
  const gratis = list.find((m) => m.free && m.available);
  if (gratis) return { ...gratis, motivo: 'gratis' };
  const pago = list.find((m) => m.available);
  if (pago) return { ...pago, motivo: 'disponible_pago' };
  return null;
}

const PROMPTS = {
  'Steve Jobs': 'Eres Steve Jobs, CEO de las Leyendas del Consejo de Silicio de AdmiraNeXT. Hablas con claridad radical: el producto se entiende en un vistazo o no es producto. Corta lo superfluo. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Steve Wozniak': 'Eres Steve Wozniak, CTO de las Leyendas del Consejo de Silicio de AdmiraNeXT. Ingeniero cercano: si no se puede medir o construir, es cuento. Prefieres lo simple, abierto y comprobable. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Tim Cook': 'Eres Tim Cook, COO de las Leyendas. Operas con disciplina, cadena de suministro y respeto a las personas. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Warren Buffett': 'Eres Warren Buffett, CFO de las Leyendas. Hablas de valor a largo plazo, margen de seguridad y no perder dinero. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Walt Disney': 'Eres Walt Disney, CCO de las Leyendas. Primero la emoción y el asombro; cada universo tiene su magia. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Dieter Rams': 'Eres Dieter Rams, CDO de las Leyendas. Menos, pero mejor: honestidad formal, utilidad, nada de ornamento vacuo. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Howard Schultz': 'Eres Howard Schultz, CXO de las Leyendas. La experiencia humana y el tercer lugar: cómo se siente la gente. Español, 1-2 frases, sin presentarte, en primera persona.',
  'George Lucas': 'Eres George Lucas, CSO de las Leyendas. Piensas en arco, mito y corte: si el público pierde el hilo, el guion está mal. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Elon Musk': 'Eres Elon Musk, CEO de los Coetáneos. Menos ceremonia, más iteración: qué se puede desplegar ya, cómo se simula y se fabrica rápido. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Jensen Huang': 'Eres Jensen Huang, CTO de los Coetáneos. Piensas en inferencia barata, gemelos digitales y acelerar lo que las Leyendas plantean de oficio. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Mira Murati': 'Eres Mira Murati, COO de los Coetáneos. Operas productos de IA con rigor, seguridad y ritmo de entrega. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Ruth Porat': 'Eres Ruth Porat, CFO de los Coetáneos. Disciplina financiera, riesgo y escalado con números claros. Español, 1-2 frases, sin presentarte, en primera persona.',
  'John Lasseter': 'Eres John Lasseter, CCO de los Coetáneos. Historia, personaje y juego: la tecnología sirve al cuento. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Jony Ive': 'Eres Jony Ive, CDO de los Coetáneos. Cuidado material, silencio formal, empatía con quien usa la cosa. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Carlo Ratti': 'Eres Carlo Ratti, CXO de los Coetáneos (duerme el nombre: Carlo, no Carlos). Ciudad, sentido y datos que se habitan. Español, 1-2 frases, sin presentarte, en primera persona.',
  'Ryan Reynolds': 'Eres Ryan Reynolds, CSO de los Coetáneos. Ingenio directo, irreverente y preciso; la historia se entiende al instante. Español, 1-2 frases, sin presentarte, en primera persona.',
};

export function systemPrompt(ficha) {
  const base = (ficha && PROMPTS[ficha.persona]) || `Eres ${ficha && ficha.persona}, ${ficha && ficha.rol} del Consejo de Silicio. Español, 1-2 frases, sin presentarte.`;
  return base + '\n\nINSTRUCCIONES: responde a la pregunta o al turno. Si hay otros consejeros en el contexto, puedes referirte a ellos por su nombre. No inventes que eres otra persona. No uses markdown ni listas largas.';
}

export function construirMensajes(ficha, mensaje, contexto) {
  const messages = [];
  const ctx = Array.isArray(contexto) ? contexto.slice(-CTX_TURNOS) : [];
  for (const msg of ctx) {
    const role = msg && (msg.role === 'assistant' || msg.role === 'system') ? msg.role : 'user';
    const content = String((msg && (msg.content || msg.texto)) || '').slice(0, MAX_MESSAGE);
    if (content) messages.push({ role: role === 'system' ? 'user' : role, content });
  }
  messages.push({ role: 'user', content: String(mensaje || '').slice(0, MAX_MESSAGE) });
  return { system: systemPrompt(ficha), messages };
}

async function llamarXai(env, modelo, system, messages, maxTokens) {
  const key = secretoDe(env, modelo);
  if (!key) throw Object.assign(new Error(`falta el secret ${modelo.secret} en este Worker`), { code: 'sin_clave' });
  const r = await fetch(modelo.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelo.model_id,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const raw = await r.text();
  let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!r.ok) {
    const det = (data && (data.error && (data.error.message || data.error) || data.raw)) || r.statusText;
    throw Object.assign(new Error(`${r.status} en xAI: ${typeof det === 'string' ? det : JSON.stringify(det)}`), { status: r.status });
  }
  const text = (((data.choices || [])[0] || {}).message || {}).content || '';
  const usage = data.usage || {};
  return {
    text: String(text).trim(),
    input_tokens: Number(usage.prompt_tokens || usage.input_tokens) || 0,
    output_tokens: Number(usage.completion_tokens || usage.output_tokens) || 0,
  };
}

async function llamarNvidia(env, modelo, system, messages, maxTokens) {
  const key = secretoDe(env, modelo);
  if (!key) throw Object.assign(new Error(`falta el secret ${modelo.secret} en este Worker`), { code: 'sin_clave' });
  const r = await fetch(modelo.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelo.model_id,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const raw = await r.text();
  let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!r.ok) {
    const det = (data && (data.error && (data.error.message || data.error) || data.raw)) || r.statusText;
    throw Object.assign(new Error(`${r.status} en NVIDIA: ${typeof det === 'string' ? det : JSON.stringify(det)}`), { status: r.status });
  }
  const text = (((data.choices || [])[0] || {}).message || {}).content || '';
  const usage = data.usage || {};
  return {
    text: String(text).trim(),
    input_tokens: Number(usage.prompt_tokens || 0) || 0,
    output_tokens: Number(usage.completion_tokens || 0) || 0,
  };
}

async function llamarAnthropic(env, modelo, system, messages, maxTokens) {
  const key = secretoDe(env, modelo);
  if (!key) throw Object.assign(new Error(`falta el secret ${modelo.secret} en este Worker`), { code: 'sin_clave' });
  const r = await fetch(modelo.url, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: modelo.model_id, max_tokens: maxTokens, system, messages }),
    signal: AbortSignal.timeout(45000),
  });
  const raw = await r.text();
  let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!r.ok) {
    const det = (data && (data.error && (data.error.message || data.error) || data.raw)) || r.statusText;
    throw Object.assign(new Error(`${r.status} en Anthropic: ${typeof det === 'string' ? det : JSON.stringify(det)}`), { status: r.status });
  }
  const text = ((data.content || []).filter((c) => c && c.type === 'text').map((c) => c.text).join('\n') || '').trim();
  const usage = data.usage || {};
  return { text, input_tokens: Number(usage.input_tokens) || 0, output_tokens: Number(usage.output_tokens) || 0 };
}

async function llamarLlm(env, modelo, system, messages, maxTokens) {
  if (modelo.provider === 'xai') return llamarXai(env, modelo, system, messages, maxTokens);
  if (modelo.provider === 'nvidia') return llamarNvidia(env, modelo, system, messages, maxTokens);
  if (modelo.provider === 'anthropic') return llamarAnthropic(env, modelo, system, messages, maxTokens);
  throw Object.assign(new Error(`proveedor ${modelo.provider} no implementado en el motor Cloudflare (falta integración o secret ${modelo.secret})`), { code: 'sin_proveedor' });
}

function limpiarTexto(t) {
  return String(t || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function preguntarConsejero(env, { rol, mensaje, generacion = 'leyendas', llm, contexto, max_tokens = 300 }) {
  const ficha = fichaDe(rol, generacion) || fichaDe(personaCanonica(rol) || rol, generacion);
  if (!ficha) {
    throw Object.assign(new Error(`consejero no encontrado: ${rol} / ${generacion}`), { status: 404 });
  }
  const elegido = elegirModelo(env, llm);
  if (!elegido) {
    throw Object.assign(new Error('sin backend: no hay ninguna clave de modelo en los secrets de Cloudflare de este Worker'), { code: 'sin_backend', status: 503 });
  }
  const cfg = MODELOS[elegido.key];
  const { system, messages } = construirMensajes(ficha, mensaje, contexto);
  const maxTok = Math.min(1000, Math.max(100, Number(max_tokens) || 300));
  const t0 = Date.now();
  const out = await llamarLlm(env, cfg, system, messages, maxTok);
  const ms = Date.now() - t0;
  const text = limpiarTexto(out.text);
  if (!text) throw Object.assign(new Error('respuesta vacía'), { code: 'vacio' });
  const coste = costeEur(out.input_tokens, out.output_tokens, cfg);
  // r225 (21-11): los tokens reales del API cuentan en /consumos (máquina «Cloudflare»). Nunca rompe la respuesta.
  await registrarConsumoConsejo(env, { input_tokens: out.input_tokens, output_tokens: out.output_tokens, llm: elegido.key });
  return {
    name: ficha.rol,
    role: ficha.cargo,
    persona: ficha.persona,
    side: ficha.lado,
    generation: ficha.generacion,
    silla: ficha.silla,
    icon: elegido.icon,
    content: text,
    llm: elegido.key,
    llm_motivo: elegido.motivo,
    input_tokens: out.input_tokens,
    output_tokens: out.output_tokens,
    coste_eur: coste,
    ms,
    motor: 'cloudflare',
  };
}

export async function preguntarConsejo(env, { mensaje, generacion = 'leyendas', llm, contexto }) {
  const gen = GENERACIONES.includes(generacion) ? generacion : 'leyendas';
  const racionales = CONSEJEROS.filter((c) => c.lado === 'racional');
  const creativos = CONSEJEROS.filter((c) => c.lado === 'creativo');
  const r = racionales[Math.floor(Math.random() * racionales.length)];
  const c = creativos[Math.floor(Math.random() * creativos.length)];
  const [racional, creativo] = await Promise.all([
    preguntarConsejero(env, { rol: r.rol, mensaje, generacion: gen, llm, contexto, max_tokens: 300 }),
    preguntarConsejero(env, { rol: c.rol, mensaje, generacion: gen, llm, contexto, max_tokens: 300 }),
  ]);
  return { racional: [racional], creativo: [creativo], motor: 'cloudflare' };
}

export function saludMotor(env) {
  const modelos = modelosDisponibles(env);
  const disponibles = modelos.filter((m) => m.available);
  return {
    status: disponibles.length ? 'ok' : 'sin_backend',
    motor: 'cloudflare',
    agents: 16,
    modelos: disponibles.map((m) => m.key),
    modelos_detalle: modelos,
    gaps: gapsDeModelos(env),
    security: { token_required: true, telegram_report: false },
  };
}

/** Auth de máquina para /api/council y /api/consejo/sesion. */
export function tokenMaquinaOk(request, env) {
  const headers = request && request.headers;
  const a = (headers && (headers.get('x-mensajes-token') || headers.get('X-Mensajes-Token'))) || '';
  const b = (headers && (headers.get('x-council-token') || headers.get('X-Council-Token'))) || '';
  const candidatos = [a, b].map((x) => String(x || '').trim()).filter(Boolean);
  const buenos = [env && env.CONSEJERO_MENSAJES_TOKEN, env && env.COUNCIL_MACHINE_TOKEN, env && env.WHITELIST_MACHINE_TOKEN]
    .map((x) => String(x || '').trim()).filter((x) => x.length >= 16);
  if (!candidatos.length || !buenos.length) return false;
  return candidatos.some((c) => buenos.some((g) => timingIgual(c, g)));
}

export function timingIgual(a, b) {
  const x = String(a), y = String(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}
