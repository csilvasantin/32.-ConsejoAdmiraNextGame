/*
 * Macintosh 1984 en la mesa del Consejo — SmithMacMini.
 * HOY <fecha> + las 3 últimas misiones completadas (#FLT + persona).
 */
export function todayMadrid(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

export function isHoy(mission, day = todayMadrid()) {
  if (!mission) return false;
  const stamped = String(mission.display_day || '').slice(0, 10);
  if (stamped) return stamped === day;
  const ts = Number(mission.created_at || mission.updated_at || 0);
  if (!ts) return false;
  const ms = ts > 1e12 ? ts : ts * 1000;
  return todayMadrid(ms) === day;
}

export function seatOf(mission) {
  let persona = String(mission.persona || mission.assignee || '');
  persona = persona.replace(/GrokBot$/i, '').replace(/MacMini$/i, '').replace(/MacBook.*$/i, '').trim();
  const role = String(mission.role || '').split('·')[0].trim();
  const bits = [persona, role].filter(Boolean);
  return bits.join(' · ') || 'sin silla';
}

export const IDLE_COPY = 'HOY\n…';
export const ERROR_COPY = 'HOY\nsin cable';

export function linesFor(missions, day = todayMadrid()) {
  const rows = (Array.isArray(missions) ? missions : [])
    .filter((m) => m && m.status === 'resolved' && isHoy(m, day))
    .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))
    .slice(0, 3);
  const head = `HOY ${day.slice(8, 10)}-${day.slice(5, 7)}`;
  if (!rows.length) return [head, 'sin FLT done'];
  return [head].concat(rows.map((m) => {
    const id = String(m.id || 'FLT-????').replace(/^FLT-/, '');
    const nick = seatOf(m).split('·')[0].trim().slice(0, 10) || '—';
    return `#${id} ${nick}`;
  }));
}

export function paintCrt(el, text) {
  if (!el) return Promise.resolve();
  el.textContent = '';
  let i = 0;
  return new Promise((resolve) => {
    const tick = () => {
      i += 2;
      el.textContent = text.slice(0, i);
      el.scrollTop = el.scrollHeight;
      if (i >= text.length) resolve();
      else setTimeout(tick, 12);
    };
    tick();
  });
}

export async function fetchHoy(fetchImpl = fetch) {
  const res = await fetchImpl('https://api.yokup.com/fleet/missions?limit=80', { cache: 'no-store' });
  const data = await res.json();
  return data.missions || data.items || [];
}

let visible = false;
let focused = false;
let beatTimer = null;
let lastRoot = null;
let lastFetch = fetch;
let lastText = IDLE_COPY;

async function draw(root, fetchImpl) {
  const mesa = root.querySelector('#mac-hoy-crt');
  const front = root.querySelector('#mac-hoy-crt-front');
  const prop = root.querySelector('#mac-hoy-prop');
  if (!mesa || !prop || !visible) return;
  prop.classList.add('refreshing');
  if (mesa) mesa.textContent = IDLE_COPY;
  if (front) front.textContent = IDLE_COPY;
  try {
    lastText = linesFor(await fetchHoy(fetchImpl)).join('\n');
    await paintCrt(mesa, lastText);
    if (front) await paintCrt(front, lastText);
  } catch (_) {
    lastText = ERROR_COPY;
    await paintCrt(mesa, ERROR_COPY);
    if (front) await paintCrt(front, ERROR_COPY);
  }
  prop.classList.remove('refreshing');
}

export function isVisible() { return visible; }
export function isFocused() { return focused; }

export function closeFront(root = lastRoot || (typeof document !== 'undefined' ? document : null)) {
  focused = false;
  const el = root && root.querySelector('#mac-hoy-front');
  if (el) el.classList.remove('on');
}

export function openFront(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root || !visible) return false;
  lastRoot = root;
  lastFetch = fetchImpl;
  focused = true;
  const el = root.querySelector('#mac-hoy-front');
  if (el) el.classList.add('on');
  const front = root.querySelector('#mac-hoy-crt-front');
  if (front) paintCrt(front, lastText);
  draw(root, fetchImpl);
  return true;
}

export function setVisible(on, root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root) return false;
  lastRoot = root;
  lastFetch = fetchImpl;
  const prop = root.querySelector('#mac-hoy-prop');
  const btn = root.querySelector('#btn-mostrar');
  visible = !!on;
  if (prop) prop.classList.toggle('on', visible);
  if (btn) btn.classList.toggle('active', visible);
  if (!visible) closeFront(root);
  if (visible) {
    draw(root, fetchImpl);
    if (!beatTimer) beatTimer = setInterval(() => draw(lastRoot, lastFetch), 45000);
  } else if (beatTimer) {
    clearInterval(beatTimer);
    beatTimer = null;
  }
  return visible;
}

export function toggle(root, fetchImpl) {
  return setVisible(!visible, root, fetchImpl);
}

export function boot(root = document, fetchImpl = fetch) {
  const prop = root.querySelector('#mac-hoy-prop');
  if (!prop) return;
  lastRoot = root;
  lastFetch = fetchImpl;
  setVisible(false, root, fetchImpl);
  const glass = root.querySelector('#mac-hoy-glass') || prop;
  glass.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!visible) return;
    openFront(root, fetchImpl);
  });
  const front = root.querySelector('#mac-hoy-front');
  const close = root.querySelector('#mac-hoy-front-close');
  if (close) close.addEventListener('click', (e) => { e.stopPropagation(); closeFront(root); });
  if (front) front.addEventListener('click', (e) => { if (e.target === front) closeFront(root); });
  const video = root.getElementById && root.getElementById('presentation-video');
  if (video) {
    video.addEventListener('play', () => { if (prop) prop.style.visibility = 'hidden'; closeFront(root); });
    video.addEventListener('pause', () => { if (prop) prop.style.visibility = ''; });
    video.addEventListener('ended', () => { if (prop) prop.style.visibility = ''; });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.MacHoy = { todayMadrid, isHoy, seatOf, linesFor, IDLE_COPY, ERROR_COPY, paintCrt, fetchHoy, boot, setVisible, toggle, isVisible, isFocused, openFront, closeFront };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
}
