/*
 * Cliente yokup para los consejeros de GrokBot.
 *
 * Alta → bot-inbox + /fleet/sync. Paso → /fleet/task-status. Evidencia →
 * transcript validado, PNG (council-api o el worker), /fleet/media +
 * /fleet/progress con agent/session_transcript. Informe → /fleet/informe.
 * Ventana → POST /decisions. Presencia → /api/presence del worker Telegram.
 */

import { exigirConsejero } from './identidad.js';
import { pngDeLineas, esPng } from './png.js';

const limpiar = (s) => String(s || '').replace(/\/+$/, '');

export function validarTranscript(texto, mision) {
  const raw = String(texto || '');
  const lineas = raw.split(/\r?\n/).map((l) => l.rstrip ? l.rstrip() : l.replace(/\s+$/, ''));
  const falta = [];
  const peticion = lineas.findIndex((l) => /^\s*PETICI[OÓ]N\s*:\s*\S/i.test(l));
  if (peticion < 0) falta.push('una línea «PETICIÓN: …» con lo que se pidió');
  const comando = lineas.findIndex((l) => l.trimStart().startsWith('$ ') && l.trim() !== '$');
  if (comando < 0) falta.push('al menos un comando en una línea «$ …»');
  else if (!lineas.slice(comando + 1).some((l) => l.trim())) falta.push('la salida del comando debajo de él');
  if (!mision || !raw.includes(String(mision))) falta.push(`la misión ${mision} citada en el texto`);
  if (falta.length) {
    const err = new Error('el transcript no acredita la sesión; falta ' + falta.join('; falta '));
    err.code = 'transcript_invalido';
    throw err;
  }
  return true;
}

export function crearYokup(env = {}, deps = {}, actor = null) {
  const doFetch = deps.fetch || globalThis.fetch;
  const yokupBase = limpiar(env.YOKUP_API || 'https://api.yokup.com');
  const telegramBase = limpiar(env.TELEGRAM_API || 'https://admira-telegram.csilvasantin.workers.dev');
  const councilBase = limpiar(env.COUNCIL_BASE || 'https://macmini.tail48b61c.ts.net/council');
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const syncRetries = Number.isFinite(deps.syncRetries) ? deps.syncRetries : 8;
  const syncWaitMs = Number.isFinite(deps.syncWaitMs) ? deps.syncWaitMs : 400;

  async function llamar(url, init = {}, { timeoutMs = 45_000, via, raw = false } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const enviar = via && typeof via.fetch === 'function' ? (u, i) => via.fetch(u, i) : doFetch;
    let response;
    try {
      response = await enviar(url, {
        ...init,
        signal: ctl.signal,
        headers: { accept: 'application/json', 'user-agent': 'admira-live-mcp/yokup', ...(init.headers || {}) },
      });
    } catch (e) {
      throw new Error(`no se pudo llegar a ${url}: ${e && e.message || e}`);
    } finally { clearTimeout(t); }
    if (raw) return response;
    const text = await response.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!response.ok) {
      const detalle = body && (body.detail || body.error || body.raw) || response.statusText;
      const err = new Error(`${response.status} en ${url}: ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`);
      err.status = response.status; err.body = body; throw err;
    }
    return body;
  }

  function telegramVia() {
    return env.TELEGRAM && typeof env.TELEGRAM.fetch === 'function' ? env.TELEGRAM : undefined;
  }

  function panelHeaders(extra = {}) {
    const key = env.ADMIRA_TELEGRAM_PANEL_KEY;
    if (!key) throw new Error('falta ADMIRA_TELEGRAM_PANEL_KEY en el worker: no se puede hablar con la bandeja ni latir presencia');
    return { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...extra };
  }

  function jsonInit(body, headers) {
    return { method: 'POST', headers: { 'content-type': 'application/json', ...(headers || {}) }, body: JSON.stringify(body) };
  }

  async function renderEnConsejo(transcript, mision, identity) {
    if (!env.COUNCIL_MACHINE_TOKEN) return null;
    try {
      const res = await llamar(`${councilBase}/api/council/render-transcript`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-council-token': env.COUNCIL_MACHINE_TOKEN },
        body: JSON.stringify({ transcript, mission: mision, identity }),
      }, { raw: true, timeoutMs: 20_000 });
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      return esPng(buf) ? buf : null;
    } catch {
      return null;
    }
  }

  async function subirPng(bytes) {
    const res = await llamar(`${yokupBase}/fleet/media`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', accept: 'application/json' },
      body: bytes,
    });
    const url = String(res && res.url || '').trim();
    if (!url.startsWith('http')) throw new Error('yokup no devolvió URL de la captura');
    return url;
  }

  async function buscarMisionPorEncargo(inboxId, desde) {
    const data = await llamar(`${yokupBase}/fleet/missions?limit=40`);
    const items = data.missions || data.items || [];
    const want = '#' + String(inboxId);
    const hit = items.find((m) => String(m.screen || '').trim().endsWith(want)
      || (Number(m.created_at || 0) >= desde && String(m.assignee || '').toLowerCase().includes(String(actor && actor.persona || '').toLowerCase())));
    return hit || null;
  }

  return {
    actor,

    async presencia({ focus, project } = {}) {
      const yo = exigirConsejero(actor);
      const body = {
        persona: yo.identity,
        machine: yo.machine,
        runtime: yo.runtime,
        host: 'app',
        mode: 'autonomo',
        focus: focus || 'mcp yokup',
        project: project || 'yokup',
      };
      return llamar(`${telegramBase}/api/presence`, jsonInit(body, panelHeaders()), { via: telegramVia(), timeoutMs: 12_000 });
    },

    async alta({ texto, proyecto, plan } = {}) {
      const yo = exigirConsejero(actor);
      const text = String(texto || '').trim();
      if (text.length < 8) throw new Error('texto del encargo demasiado corto');
      const project_id = String(proyecto || env.YOKUP_PROJECT || 'yokup').trim();
      const cuerpo = {
        text: plan ? `${text}\nPlan: ${plan}` : text,
        target_persona: yo.persona,
        target_machine: yo.machine,
        from: yo.identity,
        project_id,
      };
      const inbox = await llamar(`${telegramBase}/api/bot-inbox`, jsonInit(cuerpo, panelHeaders()), { via: telegramVia() });
      const desde = Date.now() - 60_000;
      await llamar(`${yokupBase}/fleet/sync`, jsonInit({}), { timeoutMs: 60_000 }).catch(() => null);
      let mision = null;
      for (let i = 0; i < syncRetries && !mision; i++) {
        await sleep(syncWaitMs);
        mision = await buscarMisionPorEncargo(inbox.id, desde).catch(() => null);
        if (!mision) await llamar(`${yokupBase}/fleet/sync`, jsonInit({}), { timeoutMs: 60_000 }).catch(() => null);
      }
      return { ok: true, encargo: inbox.id, mission: mision && mision.id || null, identity: yo.identity, project_id, inbox };
    },

    async paso({ mission, code, status, report, image } = {}) {
      const yo = exigirConsejero(actor);
      const st = String(status || '').trim();
      if (!['pending', 'in_progress', 'done'].includes(st)) throw new Error('status debe ser pending, in_progress o done');
      const body = { mission, code: String(code || '').trim(), status: st, owner: yo.identity };
      if (report) body.report = String(report).slice(0, 2000);
      if (image && String(image).startsWith('http')) body.image = image;
      return llamar(`${yokupBase}/fleet/task-status`, jsonInit(body));
    },

    async evidencia({ mission, transcript } = {}) {
      const yo = exigirConsejero(actor);
      const mid = String(mission || '').trim();
      validarTranscript(transcript, mid);
      const png = await renderEnConsejo(transcript, mid, yo.identity) || await pngDeLineas(String(transcript));
      if (!esPng(png)) throw new Error('no se pudo pintar el transcript como PNG');
      const image = await subirPng(png);
      const captured_at = Date.now();
      const progress = await llamar(`${yokupBase}/fleet/progress`, jsonInit({
        mission: mid,
        owner: yo.identity,
        image,
        captured_at,
        evidence_kind: 'process',
        capture_surface: 'agent',
        capture_context: 'session_transcript',
      }));
      return { ok: true, mission: mid, image, capture_surface: 'agent', capture_context: 'session_transcript', via: progress, identity: yo.identity };
    },

    async informe({ mission, report, image } = {}) {
      const yo = exigirConsejero(actor);
      const mid = String(mission || '').trim();
      const texto = String(report || '').trim();
      if (!texto) throw new Error('el informe no puede ir vacío');
      if (!image || !String(image).startsWith('http')) throw new Error('informe exige image https (pasa antes por yokup_evidencia)');
      return llamar(`${yokupBase}/fleet/informe`, jsonInit({
        mission: mid,
        owner: yo.identity,
        report: texto.slice(0, 2000),
        image,
        runtime: yo.runtime,
        host: 'cli',
      }));
    },

    async ventana({ question, opciones, proyecto, minutes } = {}) {
      const yo = exigirConsejero(actor);
      const ops = Array.isArray(opciones) ? opciones.map((o) => String(o).slice(0, 200)) : [];
      if (ops.length !== 3) throw new Error('haz falta 3 opciones; el worker añade «Volver atrás» y «Custom»');
      const project_id = String(proyecto || env.YOKUP_PROJECT || 'yokup').trim();
      const body = {
        agent: yo.identity,
        machine: yo.machine,
        surface: 'admiranext',
        minutes: Math.min(15, Math.max(1, Number(minutes) || 5)),
        project_id,
        mission: 'Ventana automatica',
        question: String(question || '').trim().slice(0, 400),
        url: 'https://www.admira.live/mcp/',
        recommended: 0,
        options: [...ops, 'Volver atrás', 'Custom'],
      };
      return llamar(`${yokupBase}/decisions`, jsonInit(body));
    },
  };
}
