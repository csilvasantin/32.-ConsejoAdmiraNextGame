import { saludMotor } from '../../../consejo-ask-lib.mjs';
import { json, options } from './_auth.mjs';

export const onRequestOptions = ({ request }) => options(request);

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const s = saludMotor(env);
  return json({ ok: s.status === 'ok', ...s }, s.status === 'ok' ? 200 : 503, origin);
}
