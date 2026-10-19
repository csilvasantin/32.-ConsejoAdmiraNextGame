export const MAX_REPLY = 400;

export function verifyChallenge(url, verifyToken) {
  const p = new URL(url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && verifyToken && p.get('hub.verify_token') === verifyToken) {
    return p.get('hub.challenge') ?? '';
  }
  return null;
}

function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
}

export async function verifySignature(secret, body, header) {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const expected = await hmacHex(secret, body);
  const got = header.slice(7).toLowerCase();
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function normalizeNumber(n) {
  return String(n || '').replace(/\D/g, '');
}

export function parseAllowed(list) {
  return new Set(String(list || '').split(',').map(normalizeNumber).filter(Boolean));
}

/** Extrae los mensajes entrantes de un payload de webhook de WhatsApp Cloud API. */
export function parseMessages(payload) {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'messages') continue;
      for (const m of change?.value?.messages ?? []) {
        const base = { id: m.id, from: normalizeNumber(m.from), type: m.type };
        if (m.type === 'text') out.push({ ...base, text: m.text?.body ?? '' });
        else if (m.type === 'audio') out.push({ ...base, mediaId: m.audio?.id, mime: m.audio?.mime_type });
        else if (m.type === 'image') out.push({ ...base, mediaId: m.image?.id, mime: m.image?.mime_type, caption: m.image?.caption ?? '' });
        else out.push(base);
      }
    }
  }
  return out;
}

export function clampReply(text, max = MAX_REPLY) {
  const t = String(text || '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
