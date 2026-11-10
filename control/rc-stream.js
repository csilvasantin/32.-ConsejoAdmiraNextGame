/* Adaptación del vídeo por latencia y tamaño, con los ajustes del usuario como techo. */
(function (root, factory) {
  const api = factory();
  root.AdmiraRcStream = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function settings(state) {
    const scale = Math.min(state.scale, state.autoScale || state.scale);
    return {
      scale,
      q: Math.min(state.q, state.autoQ || state.q),
      maxWidth: Math.round((state.maxWidth || 1600) * scale / state.scale)
    };
  }
  function observe(state, ms, bytes) {
    const current = settings(state);
    state.frameMs = state.frameMs ? state.frameMs * 0.7 + ms * 0.3 : ms;
    const slow = state.frameMs > 900 || bytes > 300 * 1024;
    const fast = state.frameMs < 500 && bytes < 220 * 1024;
    state.slowFrames = slow ? (state.slowFrames || 0) + 1 : 0;
    state.fastFrames = fast ? (state.fastFrames || 0) + 1 : 0;
    if (state.slowFrames >= 2) {
      state.autoScale = Math.min(state.scale, Math.max(0.3, current.scale * 0.85));
      state.autoQ = Math.min(state.q, Math.max(0.35, current.q - 0.05));
      state.slowFrames = 0;
    } else if (state.fastFrames >= 6) {
      state.autoScale = Math.min(state.scale, current.scale + 0.05);
      state.autoQ = Math.min(state.q, current.q + 0.05);
      state.fastFrames = 0;
    }
    return settings(state);
  }
  function reset(state) {
    delete state.autoScale; delete state.autoQ; delete state.frameMs;
    state.slowFrames = 0; state.fastFrames = 0;
  }
  return { settings, observe, reset };
});
