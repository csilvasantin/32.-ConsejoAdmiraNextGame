const PRESETS = ['sala', 'pantallas-izquierda', 'pantallas-centro', 'pantallas-derecha', 'puerta', 'recreativa'];
const RANGES = {pan: [-522000, 522000], tilt: [-324000, 360000], zoom: [100, 400], dpan: [-522000, 522000], dtilt: [-684000, 684000], dzoom: [-300, 300]};

export function validMove(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === 'preset') return PRESETS.includes(value.preset);
  if (!keys.length || !keys.every(key => key in RANGES)) return false;
  if (keys.some(key => key.startsWith('d')) && keys.some(key => !key.startsWith('d'))) return false;
  return keys.every(key => Number.isSafeInteger(value[key]) && value[key] >= RANGES[key][0] && value[key] <= RANGES[key][1]);
}

function safeState(value) {
  if (!value || !['pan', 'tilt', 'zoom'].every(key => Number.isFinite(value[key]) && value[key] >= RANGES[key][0] && value[key] <= RANGES[key][1])) throw new Error('invalid state');
  return {pan: value.pan, tilt: value.tilt, zoom: value.zoom, presets: PRESETS};
}

// The session is checked by the existing SSO authority on EVERY request. No
// webcam URL, credentials, upstream errors, redirects or arbitrary JSON escape.
export async function webcamRequest(request, env, {fetchImpl, relays, cors}) {
  const origin = request.headers.get('Origin');
  const headers = cors(new Headers({'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}), origin);
  const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: new Headers([...headers, ['Content-Type', 'application/json']])});
  if (!['https://www.admira.live', 'https://admira.live'].includes(origin)) return json({error: 'origin_not_allowed'}, 403);
  const endpoint = new URL(request.url).pathname.slice('/api/webcam/'.length);
  if (!['foto.jpg', 'estado', 'mover'].includes(endpoint)) return json({error: 'not_found'}, 404);
  if (request.method !== (endpoint === 'mover' ? 'POST' : 'GET')) return json({error: 'method_not_allowed'}, 405);
  const cookie = String(request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => /^__Host-fleet_session=.+$/.test(part));
  if (!cookie) return json({error: 'session_required'}, 401);
  let identity;
  try {
    // Do not fail over authentication to another session authority.
    const response = await fetchImpl(relays[0].base + '/api/auth/session', {headers: {Cookie: cookie, Origin: origin}, redirect: 'manual', signal: AbortSignal.timeout(8000)});
    if (response.status === 401 || response.status === 403) return json({error: 'session_required'}, 401);
    if (!response.ok) return json({error: 'auth_unavailable'}, 503);
    identity = await response.json();
    if (identity.ok !== true || !identity.email || !/^[A-Za-z0-9_-]{32}$/.test(identity.csrf)) return json({error: 'auth_unavailable'}, 503);
  } catch (error) {
    // This request uses only the fixed auth URL (never the webcam secret URL).
    console.warn('webcam_auth_unavailable', error.name);
    return json({error: 'auth_unavailable'}, 503);
  }
  let move;
  if (endpoint === 'mover') {
    if (request.headers.get('X-Fleet-CSRF') !== identity.csrf) return json({error: 'csrf_invalid'}, 403);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return json({error: 'json_required'}, 415);
    // Stream with a real byte limit, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({error: 'invalid_move'}, 400);
    let body = '', bytes = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 512) { await reader.cancel(); return json({error: 'body_too_large'}, 413); }
        body += decoder.decode(value, {stream: true});
      }
      move = JSON.parse(body + decoder.decode());
    } catch { return json({error: 'invalid_move'}, 400); }
    if (!validMove(move)) return json({error: 'invalid_move'}, 400);
  }
  let base;
  try {
    base = new URL(env.WEBCAM_BASE);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !/^[A-Za-z0-9_-]{16,256}$/.test(env.WEBCAM_KEY || '')) throw new Error();
  } catch { return json({error: 'webcam_not_configured'}, 503); }
  try {
    const url = base.href.replace(/\/$/, '') + '/' + encodeURIComponent(env.WEBCAM_KEY) + '/' + endpoint;
    const response = await fetchImpl(url, {method: request.method, headers: move ? {'Content-Type': 'application/json'} : {'Accept': endpoint === 'foto.jpg' ? 'image/jpeg' : 'application/json'}, body: move ? JSON.stringify(move) : undefined, redirect: 'manual', signal: AbortSignal.timeout(12000), cache: 'no-store'});
    if (!response.ok) return json({error: 'webcam_unavailable'}, 502);
    if (endpoint === 'foto.jpg') {
      if (!/^image\/jpeg(?:;|$)/i.test(response.headers.get('Content-Type') || '')) return json({error: 'invalid_photo'}, 502);
      headers.set('Content-Type', 'image/jpeg');
      return new Response(response.body, {headers});
    }
    if (endpoint === 'estado') return json(safeState(await response.json()));
    // Some UVC bridges acknowledge moves without returning state. Read /estado
    // separately in the UI rather than exposing the bridge response verbatim.
    return json({ok: true});
  } catch { return json({error: 'webcam_unavailable'}, 502); }
}
