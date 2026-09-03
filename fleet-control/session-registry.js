'use strict';

const ACTIVE = 'active';
const REVOKED = 'revoked';
const UNAVAILABLE = 'unavailable';

function classify(action, status) {
  if (action === 'check') {
    if (status === 200) return ACTIVE;
    if (status === 401 || status === 404) return REVOKED;
    return UNAVAILABLE;
  }
  if (action === 'revoke') {
    if (status === 200 || status === 401 || status === 404) return REVOKED;
    return UNAVAILABLE;
  }
  return status === 200 ? ACTIVE : UNAVAILABLE;
}

function sessionEndpointPolicy(state) {
  if (state === ACTIVE) return {status:200, clearCookie:false};
  if (state === REVOKED) return {status:401, clearCookie:true};
  return {status:503, clearCookie:false};
}

function logoutEndpointPolicy(hasSession, state) {
  if (!hasSession || state === REVOKED) return {status:200, clearCookie:true};
  return {status:503, clearCookie:false};
}

function createSessionRegistry({api, secret, fetchImpl = fetch, timeout = ms => AbortSignal.timeout(ms)} = {}) {
  if (!api || !secret) throw new Error('registro de sesión sin configurar');
  async function call(action, session) {
    try {
      const response = await fetchImpl(api + action, {
        method:'POST',
        headers:{Authorization:'Bearer ' + secret, 'Content-Type':'application/json'},
        body:JSON.stringify({session}),
        signal:timeout(8000),
      });
      return classify(action, response.status);
    } catch (_) {
      return UNAVAILABLE;
    }
  }
  return {
    check:session => call('check', session),
    register:session => call('register', session),
    revoke:session => call('revoke', session),
  };
}

module.exports = { ACTIVE, REVOKED, UNAVAILABLE, classify, createSessionRegistry, logoutEndpointPolicy, sessionEndpointPolicy };
