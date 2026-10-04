'use strict';

const crypto = require('crypto');

// El canje de Misiones dura un minuto. No vive en la memoria de un solo proceso:
// los dos relays firman con el mismo secreto de sesión y cualquiera puede
// comprobar el ticket. Si el que lo emite y el que lo canjea no comparten RAM,
// la verja de Yokup volvía a salir aunque la home ya hubiera entrado.
const TICKET_TTL_MS = 60 * 1000;
const TICKET_RE = /^[A-Za-z0-9_-]{32,128}$/;

function createYokupTickets({ key, now = Date.now } = {}) {
  const secret = Buffer.from(key || '');
  if (secret.length < 32) throw new Error('yokup ticket key debe tener al menos 32 bytes');
  const macKey = crypto.createHash('sha256').update('admira-fleet-yokup-ticket-v1\0').update(secret).digest();

  function sign(payload) {
    return crypto.createHmac('sha256', macKey).update(payload).digest('base64url');
  }

  function mint(email) {
    const at = now();
    const normalized = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(normalized) || normalized.length > 48) return '';
    const exp = at + TICKET_TTL_MS;
    const payload = Buffer.from(normalized + '\n' + String(exp)).toString('base64url');
    const signature = sign(payload);
    if (signature.length !== 43) return '';
    const ticket = payload + signature;
    return TICKET_RE.test(ticket) ? ticket : '';
  }

  function consume(ticket) {
    const at = now();
    const raw = String(ticket || '');
    if (!TICKET_RE.test(raw) || raw.length <= 43) return '';
    const payload = raw.slice(0, -43);
    const signature = raw.slice(-43);
    const expected = sign(payload);
    const supplied = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (supplied.length !== wanted.length || !crypto.timingSafeEqual(supplied, wanted)) return '';
    let text = '';
    try { text = Buffer.from(payload, 'base64url').toString('utf8'); } catch (_) { return ''; }
    const split = text.lastIndexOf('\n');
    if (split < 1) return '';
    const email = text.slice(0, split);
    const exp = Number(text.slice(split + 1));
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return '';
    if (!Number.isFinite(exp) || exp <= at || exp > at + TICKET_TTL_MS + 5000) return '';
    return email;
  }

  return { mint, consume };
}

module.exports = { createYokupTickets, TICKET_RE, TICKET_TTL_MS };
