import { modelosDisponibles, gapsDeModelos, elegirModelo } from '../../../consejo-ask-lib.mjs';
import { autorizado, json, options } from './_auth.mjs';

export const onRequestOptions = ({ request }) => options(request);

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const auth = await autorizado(request, env);
  if (!auth.ok) return json({ ok: false, error: 'privado: entra en admira.live o usa el token de máquina' }, 401, origin);
  const models = modelosDisponibles(env);
  const elegido = elegirModelo(env, 'auto');
  return json({
    ok: true,
    motor: 'cloudflare',
    models,
    elegido,
    gaps: gapsDeModelos(env).map((secret) => ({ secret, worker: 'Pages admira-live' })),
  }, 200, origin);
}
