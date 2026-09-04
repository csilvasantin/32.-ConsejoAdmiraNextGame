// Pure local image heuristics. None of these measurements proves semantic playback.
export function region(raw) {
  const r = Object.fromEntries(['x', 'y', 'w', 'h'].map(k => [k, Number(raw[k])]));
  if (Object.values(r).some(v => !Number.isFinite(v)) || r.x < 0 || r.y < 0 ||
      r.w < 5 || r.h < 5 || r.x + r.w > 100 || r.y + r.h > 100) {
    throw new Error('El encuadre debe quedar dentro del 100% y medir al menos 5% por lado.');
  }
  return r;
}
export function pixels(rgba) {
  if (!rgba.length || rgba.length % 4) throw new Error('Fotograma inválido');
  const gray = new Float32Array(rgba.length / 4);
  let total = 0;
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4] * .2126 + rgba[i * 4 + 1] * .7152 + rgba[i * 4 + 2] * .0722) / 255;
    total += gray[i];
  }
  return { gray, brightness: total / gray.length };
}
export function difference(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return null;
  return a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
}
export function createMonitor() {
  let previous = null, lastTime = null, stable = 0;
  const since = new Map();
  return {
    reset() { previous = null; lastTime = null; stable = 0; since.clear(); },
    sample({ gray, brightness, at, fresh = true, expectMotion = false, reference = null,
      darkLimit = .045, referenceLimit = .20, duration = 15 }) {
      if (!fresh || !Number.isFinite(at)) { this.reset(); return { state: 'unknown', alarms: [], change: null, deviation: null }; }
      const elapsed = lastTime === null ? 0 : at - lastTime;
      // A suspended tab or a missing sampling interval is not continuous observation.
      if (elapsed < 0 || elapsed > 4) this.reset();
      const change = difference(gray, previous);
      stable = change !== null && change < .008 ? stable + Math.max(0, Math.min(elapsed, 4)) : 0;
      previous = gray; lastTime = at;
      const deviation = difference(gray, reference);
      const conditions = {
        dark: brightness < darkLimit,
        frozen: expectMotion && stable >= duration,
        reference: deviation !== null && deviation > referenceLimit,
      };
      const alarms = [];
      for (const [key, active] of Object.entries(conditions)) {
        if (!active) { since.delete(key); continue; }
        if (!since.has(key)) since.set(key, at);
        if (key === 'frozen' || at - since.get(key) >= duration) alarms.push(key);
      }
      return { state: alarms.length ? 'suspect' : 'observing', alarms, change, deviation, brightness };
    }
  };
}
export function controlURL(machine) {
  const id = String(machine).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id)) throw new Error('Introduce el identificador exacto del player (letras, números, guion o punto).');
  const url = new URL('https://admira.tv/remotecontrol/');
  url.searchParams.set('machine', id); url.searchParams.set('solo', '1');
  return url.href;
}
