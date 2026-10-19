import { verifyChallenge, verifySignature, parseAllowed, parseMessages, clampReply } from './lib.js';
import { ADMIRITO_PROMPT } from './prompt.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const HISTORY_TURNS = 10;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/webhook') return new Response('admirito-wa ok');

    if (request.method === 'GET') {
      const c = verifyChallenge(request.url, env.WA_VERIFY);
      return c === null ? new Response('forbidden', { status: 403 }) : new Response(c);
    }
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    const body = await request.text();
    if (!(await verifySignature(env.APP_SECRET, body, request.headers.get('x-hub-signature-256')))) {
      return new Response('bad signature', { status: 401 });
    }
    let payload;
    try { payload = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }

    const allowed = parseAllowed(env.ALLOWED_FROM);
    for (const msg of parseMessages(payload)) {
      if (!allowed.has(msg.from)) continue;
      ctx.waitUntil(handle(msg, env).catch(e => console.error('admirito-wa', e?.stack || e)));
    }
    return new Response('ok');
  },
};

async function handle(msg, env) {
  let userContent;
  if (msg.type === 'text') userContent = msg.text;
  else if (msg.type === 'audio') {
    const { buf, mime } = await downloadMedia(msg.mediaId, env);
    userContent = await transcribe(buf, mime || msg.mime, env);
  } else if (msg.type === 'image') {
    const { buf, mime } = await downloadMedia(msg.mediaId, env);
    const b64 = toBase64(buf);
    userContent = [
      { type: 'text', text: msg.caption || 'Esto es lo que estoy viendo. ¿Qué ves?' },
      { type: 'image_url', image_url: { url: `data:${mime || msg.mime || 'image/jpeg'};base64,${b64}` } },
    ];
  } else {
    return sendText(msg.from, 'De momento entiendo texto, notas de voz y fotos.', env);
  }

  const history = await loadHistory(msg.from, env);
  const reply = clampReply(await chat([...history, { role: 'user', content: userContent }], env, msg.type === 'image'));
  await sendText(msg.from, reply, env);
  const userText = typeof userContent === 'string' ? userContent : `[foto] ${msg.caption || ''}`.trim();
  await saveHistory(msg.from, [...history, { role: 'user', content: userText }, { role: 'assistant', content: reply }], env);
}

async function downloadMedia(id, env) {
  const auth = { Authorization: `Bearer ${env.WA_TOKEN}` };
  const meta = await (await fetch(`${GRAPH}/${id}`, { headers: auth })).json();
  if (!meta.url) throw new Error('media sin url');
  const r = await fetch(meta.url, { headers: auth });
  if (!r.ok) throw new Error(`media ${r.status}`);
  return { buf: await r.arrayBuffer(), mime: meta.mime_type };
}

async function transcribe(buf, mime, env) {
  const form = new FormData();
  // xAI: POST /v1/stt (campo file al final). Para OpenAI-compatible: STT_PATH=/audio/transcriptions
  form.append('model', env.STT_MODEL || 'grok-voice-transcribe-2.0');
  if (env.STT_LANGUAGE) form.append('language', env.STT_LANGUAGE);
  form.append('file', new Blob([buf], { type: (mime || 'audio/ogg').split(';')[0] }), 'nota.ogg');
  const r = await fetch(`${env.STT_BASE_URL || llmBase(env)}${env.STT_PATH || '/stt'}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.STT_API_KEY || llmKey(env)}` }, body: form,
  });
  if (!r.ok) throw new Error(`stt ${r.status}`);
  return (await r.json()).text || '';
}

async function chat(messages, env, vision) {
  const base = (vision && env.VISION_BASE_URL) || llmBase(env);
  const key = (vision && env.VISION_API_KEY) || llmKey(env);
  const model = (vision && env.VISION_MODEL) || env.LLM_MODEL || 'grok-4.7';
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: 'system', content: ADMIRITO_PROMPT }, ...messages] }),
  });
  if (!r.ok) throw new Error(`llm ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content || 'Perdona, no te he entendido.';
}

async function sendText(to, text, env) {
  const r = await fetch(`${GRAPH}/${env.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  if (!r.ok) throw new Error(`send ${r.status} ${await r.text()}`);
}

async function loadHistory(from, env) {
  if (!env.HISTORY) return [];
  return (await env.HISTORY.get(`h:${from}`, 'json')) || [];
}

async function saveHistory(from, h, env) {
  if (!env.HISTORY) return;
  await env.HISTORY.put(`h:${from}`, JSON.stringify(h.slice(-HISTORY_TURNS * 2)), { expirationTtl: 60 * 60 * 24 * 7 });
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function llmBase(env) { return env.LLM_BASE_URL || 'https://api.x.ai/v1'; }
function llmKey(env) { return env.XAI_API_KEY || env.LLM_API_KEY; }
