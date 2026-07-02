/* ============================================================================
 * admira-estado — estado compartido y privado del tablero «¿En qué estamos?»
 * ----------------------------------------------------------------------------
 * Guarda un único JSON (el estado de Vista Previa) en KV y lo sirve SOLO a
 * usuarios autorizados (mismo login Google que el gate de admira.live). Así el
 * tablero es live entre todas las máquinas del grupo sin `git pull` y sin quedar
 * público en Pages.
 *
 *   GET  /estado   → devuelve el JSON del estado (requiere auth)
 *   POST /estado   → sustituye el estado (requiere auth) — lo usa el silicio
 *   GET  /health   → salud (sin auth)
 *
 * Auth (igual que fleet-control/server.js):
 *   - Humano/navegador: Authorization: Bearer <id_token de Google>  (el cred del
 *     gate, localStorage.admira_gate.cred). Se verifica con tokeninfo + allowlist.
 *   - Agente/headless:  X-Estado-Token: <ESTADO_TOKEN>  (secreto del worker) —
 *     para que los agentes actualicen el estado sin navegador.
 *
 * Bindings (wrangler.toml): KV "ESTADO". Secreto opcional: ESTADO_TOKEN.
 * ========================================================================== */

const GOOGLE_CLIENT_ID = '861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com';
const WL_API = 'https://admira-whitelist.csilvasantin.workers.dev';
const FALLBACK_ALLOW = ['csilva@admira.com', 'csilvasantin@gmail.com'];
const KV_KEY = 'estado';

const ALLOW_ORIGINS = [
  'https://www.admira.live', 'https://admira.live',
  'https://macmini.tail48b61c.ts.net',
  'http://localhost:4788', 'http://127.0.0.1:4788'
];

// Cache de la allowlist (best-effort; el scope global persiste entre peticiones
// mientras el isolate viva). Los que pueden VER/EDITAR = superusers de usuarios.html.
let SUPERS = new Set(FALLBACK_ALLOW.map(e => e.toLowerCase()));
let _superAt = 0;
async function refreshSupers() {
  try {
    const r = await fetch(WL_API + '/list', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return;
    const d = await r.json();
    const arr = (Array.isArray(d.superusers) && d.superusers.length) ? d.superusers
              : (Array.isArray(d.emails) ? d.emails : null);
    if (arr && arr.length) { SUPERS = new Set(arr.map(e => String(e).toLowerCase())); _superAt = Date.now(); }
  } catch (e) { /* mantiene la última lista / fallback */ }
}

async function verifyGoogleCredential(cred) {
  if (!cred || typeof cred !== 'string') return null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.aud !== GOOGLE_CLIENT_ID) return null;
    if (String(d.email_verified) !== 'true') return null;
    const email = String(d.email || '').toLowerCase();
    if (Date.now() - _superAt > 60000) await refreshSupers();
    if (!SUPERS.has(email)) return null;
    return email;
  } catch (e) { return null; }
}

function corsHeaders(origin) {
  const h = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Estado-Token',
    'Access-Control-Max-Age': '600'
  };
  if (origin && ALLOW_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) }
  });
}

// ¿Autorizado? Sesión Google (Bearer) o token de agente (X-Estado-Token).
async function authed(req, env) {
  const tok = req.headers.get('X-Estado-Token');
  if (tok && env.ESTADO_TOKEN && tok === env.ESTADO_TOKEN) return 'agente';
  const auth = req.headers.get('Authorization') || '';
  const cred = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return await verifyGoogleCredential(cred);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (url.pathname === '/health') return json({ ok: true, service: 'admira-estado' }, 200, origin);

    if (url.pathname === '/estado') {
      const who = await authed(req, env);
      if (!who) return json({ error: 'no autorizado (inicia sesión Google)' }, 401, origin);

      if (req.method === 'GET') {
        const raw = await env.ESTADO.get(KV_KEY);
        const estado = raw ? JSON.parse(raw) : { titulo: 'Sin estado todavía', pasos: {}, actualizado: null };
        return json(estado, 200, origin);
      }
      if (req.method === 'POST') {
        let body;
        try { body = await req.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400, origin); }
        if (!body || typeof body !== 'object') return json({ error: 'cuerpo vacío' }, 400, origin);
        body.actualizado = body.actualizado || new Date().toISOString();
        await env.ESTADO.put(KV_KEY, JSON.stringify(body));
        return json({ ok: true, por: who, actualizado: body.actualizado }, 200, origin);
      }
      return json({ error: 'método no permitido' }, 405, origin);
    }
    return json({ error: 'no encontrado' }, 404, origin);
  }
};
