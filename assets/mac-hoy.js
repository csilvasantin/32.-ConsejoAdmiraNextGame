/*
 * Macintosh 1984 en la mesa del Consejo — misiones Yokup de Hoy.
 * FLT-100655 / FLT-100657. Solo el día (abiertas + resueltas). Sin histórico.
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
  const persona = String(mission.persona || mission.assignee || '').replace(/GrokBot$/i, '').trim();
  const role = String(mission.role || '').split('·')[0].trim();
  const bits = [persona, role].filter(Boolean);
  return bits.join(' · ') || 'sin silla';
}

export function linesFor(missions, day = todayMadrid()) {
  const order = { in_progress: 0, open: 1, pending: 1, resolved: 2 };
  const rows = (Array.isArray(missions) ? missions : [])
    .filter((m) => isHoy(m, day) && m.status !== 'cancelled')
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || Number(b.created_at || 0) - Number(a.created_at || 0))
    .slice(0, 5);
  const head = [`HOY ${day.slice(8, 10)}-${day.slice(5, 7)}  ${rows.length} FLT`];
  if (!rows.length) return head.concat(['sin misiones de hoy']);
  return head.concat(rows.map((m) => {
    const mark = m.status === 'resolved' ? '+' : m.status === 'in_progress' ? '*' : '·';
    const id = String(m.id || '').replace(/^FLT-/, '');
    const sub = String(m.subject || m.display_ref || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    return `${mark}${id} ${seatOf(m).slice(0, 18)}\n ${sub}`;
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

export async function boot(root = document, fetchImpl = fetch) {
  const screen = root.querySelector('#mac-hoy-crt');
  const prop = root.querySelector('#mac-hoy-prop');
  if (!screen || !prop) return;
  const draw = async () => {
    prop.classList.add('refreshing');
    try {
      const lines = linesFor(await fetchHoy(fetchImpl));
      await paintCrt(screen, lines.join('\n'));
    } catch (_) {
      await paintCrt(screen, 'HOY\n(sin cable Yokup)');
    }
    prop.classList.remove('refreshing');
  };
  const video = root.getElementById && root.getElementById('presentation-video');
  if (video) {
    video.addEventListener('play', () => { prop.style.visibility = 'hidden'; });
    video.addEventListener('pause', () => { prop.style.visibility = ''; });
    video.addEventListener('ended', () => { prop.style.visibility = ''; });
  }
  await draw();
  setInterval(draw, 45000);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.MacHoy = { todayMadrid, isHoy, seatOf, linesFor, paintCrt, fetchHoy, boot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
}
