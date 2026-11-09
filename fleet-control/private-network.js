'use strict';

// Serve strips client-supplied identity headers, then populates them for an
// identified tailnet user. Funnel does not. Trust only the local proxy socket,
// never X-Forwarded-For; this routing hint grants no application access.
function isPrivateServeRequest(req) {
  const peer = req && req.socket && req.socket.remoteAddress;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) &&
    typeof (req.headers || {})['tailscale-user-login'] === 'string' &&
    req.headers['tailscale-user-login'].trim().length > 0;
}

module.exports = { isPrivateServeRequest };
