import { preguntarConsejero } from '../../../consejo-ask-lib.mjs';
import { autorizado, json, options } from './_auth.mjs';

export const onRequestOptions = ({ request }) => options(request, 'POST, OPTIONS');

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const auth = await autorizado(request, env);
  if (!auth.ok) return json({ ok: false, error: 'privado: entra en admira.live o usa el token de máquina' }, 401, origin);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'JSON inválido' }, 400, origin); }
  try {
    const r = await preguntarConsejero(env, {
      rol: body.agent_name || body.rol || body.persona,
      mensaje: body.message || body.mensaje,
      generacion: body.generation || body.generacion,
      llm: body.llm,
      contexto: body.context || body.contexto,
      max_tokens: body.max_tokens,
    });
    return json({ ok: true, ...r, report: false }, 200, origin);
  } catch (e) {
    const status = e.status || (e.code === 'sin_backend' || e.code === 'sin_clave' ? 503 : 500);
    return json({ ok: false, error: e.message || String(e), code: e.code || null, motor: 'cloudflare' }, status, origin);
  }
}
