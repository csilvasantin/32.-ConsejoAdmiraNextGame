/**
 * /api/consejo/sesion — conversación autónoma Leyendas ↔ Coetáneos (motor Cloudflare).
 * GET  ?id=  → transcript.  ?limite=5 → últimas sesiones (id, tema, estado, coste).
 * POST { accion: "arrancar"|"turno"|"stop"|"duelo", tema, turnos, llm, tope_eur, a, b, max_tokens, id }
 * Un POST "turno" ejecuta un solo turno (evita timeout). El MCP o /conversacion encadenan.
 */
import { preguntarConsejero, elegirModelo, saludMotor } from '../../../consejo-ask-lib.mjs';
import {
  nuevaSesion, siguienteSpeaker, promptDe, contextoDe, registrarTurno, aplicarParada,
  transcriptPublico, SESION_KEY_PREF, SESION_INDICE,
} from '../../../consejo-sesion-lib.mjs';
import { personaCanonica } from '../../../consejo-sillas-lib.mjs';
import { autorizado, json, options } from '../council/_auth.mjs';

function kv(env) { return (env && (env.CONSUMOS_KV || env.RECORTE_KV)) || null; }

async function leer(store, id) {
  if (!store || !id) return null;
  try {
    const raw = await store.get(SESION_KEY_PREF + id);
    const d = raw ? JSON.parse(raw) : null;
    return d && d.id ? d : null;
  } catch { return null; }
}

async function guardar(store, sesion) {
  await store.put(SESION_KEY_PREF + sesion.id, JSON.stringify(sesion), { expirationTtl: 60 * 60 * 24 * 14 });
  let indice = [];
  try { indice = JSON.parse((await store.get(SESION_INDICE)) || '[]'); } catch { indice = []; }
  if (!Array.isArray(indice)) indice = [];
  const meta = { id: sesion.id, tema: sesion.tema, estado: sesion.estado, motivo_parada: sesion.motivo_parada, coste_eur: sesion.coste_eur, creado: sesion.creado, actualizado: sesion.actualizado, turnos: (sesion.turnos || []).length };
  indice = [meta, ...indice.filter((x) => x && x.id !== sesion.id)].slice(0, 40);
  await store.put(SESION_INDICE, JSON.stringify(indice), { expirationTtl: 60 * 60 * 24 * 30 });
  return sesion;
}

export const onRequestOptions = ({ request }) => options(request);

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const auth = await autorizado(request, env);
  if (!auth.ok) return json({ ok: false, error: 'privado: entra en admira.live o usa el token de máquina' }, 401, origin);
  const store = kv(env);
  if (!store) return json({ ok: false, error: 'sin almacén KV' }, 503, origin);
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (id) {
    const s = await leer(store, id);
    if (!s) return json({ ok: false, error: 'sesión no encontrada' }, 404, origin);
    return json(transcriptPublico(s), 200, origin);
  }
  const limite = Math.min(20, Math.max(1, Number(url.searchParams.get('limite')) || 5));
  let indice = [];
  try { indice = JSON.parse((await store.get(SESION_INDICE)) || '[]'); } catch { indice = []; }
  return json({ ok: true, motor: 'cloudflare', sesiones: (Array.isArray(indice) ? indice : []).slice(0, limite) }, 200, origin);
}

async function unTurno(env, sesion) {
  if (sesion.estado !== 'en_curso') return sesion;
  const sig = siguienteSpeaker(sesion);
  const elegido = elegirModelo(env, sesion.llm);
  if (!elegido) {
    return aplicarParada({ ...sesion, vacios_seguidos: (sesion.vacios_seguidos || 0) + 1, actualizado: Date.now() });
  }
  try {
    const r = await preguntarConsejero(env, {
      rol: sig.rol || sig.persona,
      generacion: sig.mesa,
      mensaje: promptDe(sig.persona, sesion),
      contexto: contextoDe(sesion),
      llm: elegido.key,
      max_tokens: sesion.max_tokens,
    });
    return registrarTurno(sesion, {
      persona: sig.persona,
      texto: r.content,
      llm: r.llm,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      coste_eur: r.coste_eur,
      ms: r.ms,
    });
  } catch (e) {
    return registrarTurno(sesion, { persona: sig.persona, texto: '', vacio: true, error: e.message || String(e), llm: elegido.key });
  }
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  const auth = await autorizado(request, env);
  if (!auth.ok) return json({ ok: false, error: 'privado: entra en admira.live o usa el token de máquina' }, 401, origin);
  const store = kv(env);
  if (!store) return json({ ok: false, error: 'sin almacén KV' }, 503, origin);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'JSON inválido' }, 400, origin); }
  const accion = String((body && body.accion) || '').trim();
  const salud = saludMotor(env);

  if (accion === 'arrancar' || accion === 'duelo') {
    const a = personaCanonica(body && (body.a || body.persona_a));
    const b = personaCanonica(body && (body.b || body.persona_b));
    if (accion === 'duelo' && (!a || !b || a === b)) {
      return json({ ok: false, error: 'duelo: hace falta dos consejeros distintos' }, 400, origin);
    }
    const sesion = nuevaSesion({
      tema: body && body.tema,
      turnos: body && body.turnos,
      llm: body && body.llm,
      tope_eur: body && body.tope_eur,
      max_tokens: body && body.max_tokens,
      a, b,
      modo: accion === 'duelo' ? 'duelo' : 'plenario',
    });
    if (!elegirModelo(env, sesion.llm)) {
      return json({ ok: false, error: 'sin backend: no hay clave de modelo en los secrets de Pages admira-live', code: 'sin_backend', gaps: salud.gaps, modelos: salud.modelos_detalle }, 503, origin);
    }
    await guardar(store, sesion);
    return json({ ok: true, ...transcriptPublico(sesion), motor: 'cloudflare' }, 201, origin);
  }

  if (accion === 'turno') {
    const id = String((body && body.id) || '').trim();
    const s0 = await leer(store, id);
    if (!s0) return json({ ok: false, error: 'sesión no encontrada' }, 404, origin);
    const s1 = await unTurno(env, s0);
    await guardar(store, s1);
    return json({ ok: true, ...transcriptPublico(s1), motor: 'cloudflare' }, 200, origin);
  }

  if (accion === 'stop') {
    const id = String((body && body.id) || '').trim();
    const s0 = await leer(store, id);
    if (!s0) return json({ ok: false, error: 'sesión no encontrada' }, 404, origin);
    const s1 = aplicarParada(s0, { stop: true });
    await guardar(store, s1);
    return json({ ok: true, ...transcriptPublico(s1), motor: 'cloudflare' }, 200, origin);
  }

  return json({ ok: false, error: 'acción inválida (arrancar|duelo|turno|stop)' }, 400, origin);
}
