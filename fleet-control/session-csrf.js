'use strict';

const crypto = require('crypto');

function equalText(left, right) {
  const a = Buffer.from(String(left || '')), b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionMutationError(req, session, allowOrigins) {
  if (/^(GET|HEAD|OPTIONS)$/i.test(String(req.method || 'GET'))) return '';
  if (!allowOrigins.includes(String(req.headers.origin || ''))) return 'origin no permitido';
  if (!session || !equalText(req.headers['x-fleet-csrf'], session.csrf)) return 'csrf inválido';
  return '';
}

module.exports = { sessionMutationError };
