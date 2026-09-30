/* Boca de Elon mientras su deepagent trabaja (FLT-101302).
 * Sondea bot.yokup.com/api/presence/trabajando cada ~20 s, solo con la pestaña
 * visible y la mesa en Coetáneos. Enciende la boca de Elon Musk si late
 * Merovingio@GrokBotBox (alias de CouncilTodo) o Musk, con age ≤ ventana.
 * Script clásico; también se importa desde node:test.
 */
(function (root) {
  'use strict';

  const URL = 'https://bot.yokup.com/api/presence/trabajando';
  const INTERVAL_MS = 20000;
  const PERSONA = 'Elon Musk';
  const WINDOW_DEFAULT = 90;
  const MACHINE = 'grokbotbox';

  const key = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');

  function aliasOfElon() {
    const agents = root.CouncilTodo && root.CouncilTodo.AGENTS && root.CouncilTodo.AGENTS.coetaneos;
    return (agents && agents[PERSONA]) || 'Merovingio';
  }

  /* Merovingio en la GrokBot box, o la silla Musk, dentro de la ventana del latido. */
  function elonIsWorking(payload) {
    const declared = Number(payload && payload.window);
    const limit = Number.isFinite(declared) && declared > 0 ? declared : WINDOW_DEFAULT;
    const items = payload && Array.isArray(payload.items) ? payload.items : [];
    const alias = aliasOfElon();
    const belongs = root.CouncilTodo && root.CouncilTodo.belongs;
    return items.some(item => {
      if (!item) return false;
      const age = Number(item.age);
      if (!Number.isFinite(age) || age > limit) return false;
      const persona = key(item.persona);
      const machine = key(item.machine);
      const merovingio = typeof belongs === 'function'
        ? belongs(alias, item.persona, item.machine) && machine === MACHINE
        : persona === key(alias) && machine === MACHINE;
      if (merovingio) return true;
      return persona === 'musk' || persona === 'elonmusk';
    });
  }

  function create(options = {}) {
    const doc = options.document === undefined ? root.document : options.document;
    const fetchImpl = options.fetch || (root.fetch && root.fetch.bind(root));
    const intervalMs = Number(options.intervalMs) || INTERVAL_MS;
    const setTimer = options.setTimer || (root.setInterval && root.setInterval.bind(root));
    const clearTimer = options.clearTimer || (root.clearInterval && root.clearInterval.bind(root));
    let generation = options.generation || 'leyendas';
    let timer = null;
    let destroyed = false;
    let inflight = null;

    function speechApi() {
      return options.speech || (root.CouncilInterface && root.CouncilInterface.speech) || null;
    }
    function apply(on) {
      const api = speechApi();
      if (api && typeof api.setWorking === 'function') api.setWorking(PERSONA, !!on);
    }
    function visible() {
      return !doc || doc.visibilityState !== 'hidden';
    }
    function disarm() {
      if (timer != null) { clearTimer(timer); timer = null; }
    }
    async function poll() {
      if (destroyed || generation !== 'coetaneos' || !visible() || !fetchImpl) return false;
      if (inflight) return inflight;
      const stamp = generation;
      inflight = (async () => {
        try {
          const res = await fetchImpl(URL, { cache: 'no-store' });
          if (destroyed || generation !== stamp || !visible()) return false;
          if (!res || !res.ok) throw new Error('presence');
          const data = await res.json();
          if (destroyed || generation !== 'coetaneos' || !visible()) return false;
          const on = elonIsWorking(data);
          apply(on);
          return on;
        } catch (_) {
          if (!destroyed && generation === 'coetaneos') apply(false);
          return false;
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    }
    function arm() {
      disarm();
      if (destroyed || generation !== 'coetaneos' || !visible()) return;
      poll();
      if (typeof setTimer === 'function') timer = setTimer(poll, intervalMs);
    }
    function setGeneration(gen) {
      const next = String(gen || '');
      if (next === generation || destroyed) return;
      generation = next;
      if (generation !== 'coetaneos') {
        disarm();
        apply(false);
        return;
      }
      arm();
    }
    const onVis = () => {
      if (destroyed) return;
      if (!visible() || generation !== 'coetaneos') disarm();
      else arm();
    };
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis);
    if (generation === 'coetaneos' && visible()) arm();

    return Object.freeze({
      setGeneration, poll, elonIsWorking,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        disarm();
        apply(false);
        if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis);
      }
    });
  }

  root.CouncilWorking = Object.freeze({
    create, elonIsWorking, url: URL, intervalMs: INTERVAL_MS, persona: PERSONA
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
