/*
 * telegram.js — los consejeros de GrokBot leen y contestan los encargos de Telegram
 * (FLT-1603, Carlos, 4-sep-2026: «encargar cosas a los deepagents y recibir respuestas
 * por el canal del móvil… y que también escriban los consejeros de GrokBot»).
 *
 * En el grupo AdmiraNext, «/wozniak haz X» crea un encargo en el bot-inbox del worker
 * admira-telegram para Wozniak@grokbot. Un agente de silicio lo recoge con su vigilante;
 * un bot de GrokBot no tiene vigilante, así que lo recoge por aquí (y una rutina de Grok
 * Bot pregunta cada pocos minutos). Contestar cambia el estado del encargo con la
 * `respuesta`, y el worker la publica EN HILO bajo el mensaje original de Carlos.
 */

const limpiar = (s) => String(s || '').replace(/\/+$/, '');

export function crearTelegram(env = {}, identidad, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const base = limpiar(env.ADMIRA_TELEGRAM_URL || 'https://admira-telegram.csilvasantin.workers.dev');
  const via = env.TELEGRAM && typeof env.TELEGRAM.fetch === 'function' ? (u, i) => env.TELEGRAM.fetch(u, i) : doFetch;

  function exigir() {
    if (!identidad) throw new Error('sin identidad: esta clave del MCP no está asignada a ningún consejero (MCP_KEYS)');
    if (!env.ADMIRA_TELEGRAM_PANEL_KEY) throw new Error('falta ADMIRA_TELEGRAM_PANEL_KEY en el worker');
    return identidad;
  }
  async function llamar(url, init = {}) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30_000);
    let r;
    try { r = await via(url, { ...init, signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'admira-live-mcp/1.0', authorization: `Bearer ${env.ADMIRA_TELEGRAM_PANEL_KEY}`, ...(init.headers || {}) } }); }
    catch (e) { throw new Error(`no se pudo llegar a ${url}: ${e && e.message || e}`); }
    finally { clearTimeout(t); }
    const text = await r.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!r.ok) { const d = body && (body.error || body.raw) || r.statusText; throw new Error(`${r.status} en ${url}: ${typeof d === 'string' ? d : JSON.stringify(d)}`); }
    return body;
  }
  const seg = (ts) => (Number(ts) > 4102444800 ? Math.floor(Number(ts) / 1000) : Number(ts) || 0);
  const cuando = (ts) => (seg(ts) ? new Date(seg(ts) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '');

  /** Mi bandeja: encargos de Telegram dirigidos a mí (pendientes y en curso). */
  async function bandeja() {
    const id = exigir();
    const q = new URLSearchParams({ persona: id.persona, machine: id.machine });
    const d = await llamar(`${base}/api/bot-inbox?${q}`);
    // La vista privada de la bandeja devuelve lo dirigido a la MÁQUINA; en GrokBot conviven cuatro
    // consejeros, así que aquí se filtra por persona: cada uno ve solo lo suyo.
    const mios = (d.items || []).filter((x) => String(x.target_persona || '').toLowerCase().replace(/\s+/g, '').startsWith(id.persona.toLowerCase()));
    const items = mios.filter((x) => x.status !== 'done').map((x) => ({
      encargo: Number(x.id), estado: x.status, de: x.from_name || '', cuando: cuando(x.ts), texto: String(x.text || ''),
      tarea: x.task_id || null, nota: x.note || '',
    }));
    return { yo: id.agent, pendientes: items.filter((x) => x.estado === 'pending').length, encargos: items,
      siguiente: items.length ? 'para cada encargo: telegram_responder con estado ack al empezar y done con tu respuesta al acabar (y si es trabajo, dalo de alta con yokup_alta)' : 'nada pendiente' };
  }

  /** Contestar un encargo: cambia su estado y el worker publica la respuesta en hilo. */
  // Quién firma. El conector de Grok Bot es de la cuenta: si el bot no dice `como`, la clave
  // puede ser la de otro consejero. Un encargo dirigido a Wozniak lo contesta Wozniak: se
  // firma con el DESTINATARIO del encargo cuando es un consejero con carné.
  async function firmante(encargoId) {
    const id = exigir();
    // La vista privada solo devuelve lo de la persona consultada: se mira la bandeja de
    // cada consejero (empezando por la mía) hasta dar con el encargo.
    const consejeros = [id.persona, ...['Wozniak', 'Jobs', 'Lucas', 'Disney'].filter((c) => c !== id.persona)];
    for (const c of consejeros) {
      try {
        const q = new URLSearchParams({ persona: c, machine: id.machine });
        const d = await llamar(`${base}/api/bot-inbox?${q}`);
        const fila = (d.items || []).find((x) => Number(x.id) === Number(encargoId));
        if (!fila) continue;
        const dest = String(fila.target_persona || '').replace(/\s+/g, '');
        const conocido = ['Wozniak', 'Jobs', 'Lucas', 'Disney'].find((k) => dest.toLowerCase().startsWith(k.toLowerCase()));
        if (conocido && conocido !== id.persona) return { ...id, persona: conocido, agent: `${conocido}${id.machine}` };
        return id;
      } catch { /* siguiente */ }
    }
    return id;
  }

  async function responder({ encargo, estado = 'done', respuesta = '', commit = '', url = '', verificacion = '' }) {
    const id = await firmante(encargo);
    const body = { status: estado, persona: id.agent, machine: id.machine, respuesta };
    if (commit) body.commit = commit; if (url) body.url = url; if (verificacion) body.verification = verificacion;
    if (estado === 'done' && !respuesta && !commit && !url && !verificacion) throw new Error('para cerrar hace falta la respuesta (o commit/url/verificación): un done sin nada no contesta a nadie');
    const r = await llamar(`${base}/api/bot-inbox/${Number(encargo)}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: !!r.ok, encargo: Number(encargo), firmado_como: id.agent, estado: r.item ? r.item.status : estado, publicado_en_telegram: !!r.ok };
  }

  return { bandeja, responder };
}
