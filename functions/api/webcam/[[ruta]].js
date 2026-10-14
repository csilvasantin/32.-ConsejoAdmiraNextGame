import {webcamRequest} from '../../../workers/admira-fleet-proxy/src/webcam.js';

// Fleet forwards its host-only HttpOnly session cookie server-to-server.
// Every request still checks the live SSO authority; no client credential or
// trusted identity header can bypass it. Webcam secrets belong to Pages.
export function onRequest({request, env}) {
  return webcamRequest(request, env, {
    fetchImpl: fetch,
    relays: [{base: 'https://fleet.admira.live'}],
    cors: headers => headers
  });
}
