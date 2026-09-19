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

/* La pantalla tiene tres modos, y los periféricos del dibujo son los mandos:
   el TECLADO enciende el logo de Admira y el RATÓN saca la última misión con
   detalle. Volver a pulsar devuelve a HOY. */
export const MODOS = ['hoy', 'detalle', 'logo'];

export function envolver(txt, ancho, maxLineas) {
  const palabras = String(txt == null ? '' : txt).trim().split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const p of palabras) {
    const cand = cur ? cur + ' ' + p : p;
    if (cand.length <= ancho) { cur = cand; continue; }
    if (cur) out.push(cur);
    if (out.length >= maxLineas) { cur = ''; break; }
    cur = p.length > ancho ? p.slice(0, ancho - 1) + '…' : p;
  }
  if (cur && out.length < maxLineas) out.push(cur);
  return out.slice(0, maxLineas);
}

export function ultimaMision(missions, day = todayMadrid()) {
  return (Array.isArray(missions) ? missions : [])
    .filter((m) => m && m.status === 'resolved' && isHoy(m, day))
    .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))[0] || null;
}

export function detalleLineas(missions, day = todayMadrid()) {
  const m = ultimaMision(missions, day);
  if (!m) return ['ULTIMA MISION', '', 'sin FLT done'];
  const id = String(m.id || 'FLT-????').replace(/^FLT-/, '');
  const quien = seatOf(m).split('·')[0].trim().slice(0, 15) || '—';
  const ts = Number(m.updated_at || m.created_at || 0);
  let hora = '';
  if (ts) {
    try {
      hora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .format(new Date(ts > 1e12 ? ts : ts * 1000));
    } catch (_) { hora = ''; }
  }
  return ['ULTIMA MISION', '#' + id + (hora ? '  ' + hora : ''), quien, '']
    .concat(envolver(m.subject || m.title || '', 16, 3));
}

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
let modo = 'hoy';
let beatTimer = null;
let lastRoot = null;
let lastFetch = fetch;
let lastText = IDLE_COPY;

/* Ancho natural de mac-1984-mesa.png. El plano del CRT se compone en 512x342
   —los píxeles reales del Macintosh 128K— y la matriz --mac-scr lo proyecta
   sobre el tubo de ESE dibujo, a tamaño natural. --mac-k reduce el resultado al
   ancho al que la mesa esté pintando el Mac, así que la proyección sigue siendo
   exacta a cualquier resolución. La traslación de una matrix3d va en px: no hay
   forma de escribirla en % y por eso este factor se mide, no se supone. */
export const MAC_ART_W = 967;          // mac-1984-mesa.png
export const MAC_FRONT_W = 918;        // mac-1984-front.png

function fitOne(el, natural, prop) {
  if (!el) return 0;
  const w = el.clientWidth || (el.getBoundingClientRect ? el.getBoundingClientRect().width : 0) || 0;
  if (!w) return 0;                    // oculto (display:none) -> no pisamos el valor bueno
  const k = w / natural;
  el.style.setProperty(prop, String(k));
  return k;
}

export function fitScreen(root = lastRoot || (typeof document !== 'undefined' ? document : null)) {
  if (!root || !root.querySelector) return 0;
  const k = fitOne(root.querySelector('#mac-hoy-prop'), MAC_ART_W, '--mac-k');
  fitOne(root.querySelector('.mac-hoy-front-stage'), MAC_FRONT_W, '--mac-front-k');
  return k;
}

function watchScreen(root) {
  const prop = root && root.querySelector ? root.querySelector('#mac-hoy-prop') : null;
  if (!prop || prop.__macFit) return;
  prop.__macFit = true;
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => fitScreen(root));
    ro.observe(prop);
    const stage = root.querySelector('.mac-hoy-front-stage');
    if (stage) ro.observe(stage);
    [prop.querySelector('img'), stage && stage.querySelector('img')].forEach((img) => {
      if (!img) return;
      ro.observe(img);
      if (!img.complete) img.addEventListener('load', () => fitScreen(root), { once: true });
    });
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => fitScreen(root));
  }
}

function aplicarModo(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('#mac-hoy-prop, .mac-hoy-front-stage').forEach((el) => {
    MODOS.forEach((m) => el.classList.toggle('modo-' + m, m === modo));
  });
}

export function modoActual() { return modo; }

export function setModo(nuevo, root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (MODOS.indexOf(nuevo) < 0) return modo;
  modo = nuevo;
  if (!root) return modo;
  lastRoot = root;
  aplicarModo(root);
  if (modo !== 'logo') draw(root, fetchImpl);   // el logo no escribe texto: es la pantalla entera
  return modo;
}

async function draw(root, fetchImpl) {
  const mesa = root.querySelector('#mac-hoy-crt');
  const front = root.querySelector('#mac-hoy-crt-front');
  const prop = root.querySelector('#mac-hoy-prop');
  if (!mesa || !prop || !visible) return;
  aplicarModo(root);
  if (modo === 'logo') return;
  prop.classList.add('refreshing');
  if (mesa) mesa.textContent = IDLE_COPY;
  if (front) front.textContent = IDLE_COPY;
  try {
    const ms = await fetchHoy(fetchImpl);
    lastText = (modo === 'detalle' ? detalleLineas(ms) : linesFor(ms)).join('\n');
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
  fitScreen(root);                // el escenario frontal medía 0 mientras estaba oculto
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
  if (!visible) { modo = 'hoy'; aplicarModo(root); closeFront(root); }
  if (visible) {
    fitScreen(root);              // oculto medía 0: el encaje se rehace al mostrarlo
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
  fitScreen(root);
  watchScreen(root);
  const glass = root.querySelector('#mac-hoy-glass') || prop;
  glass.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!visible) return;
    openFront(root, fetchImpl);
  });
  // Los periféricos del dibujo son los mandos de la pantalla. Pulsar de nuevo
  // el mismo devuelve a HOY, así que nunca se queda uno atrapado en un modo.
  const mando = (sel, destino) => {
    const el = root.querySelector(sel);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!visible) return;
      setModo(modo === destino ? 'hoy' : destino, root, fetchImpl);
    });
  };
  mando('#mac-hoy-keys', 'logo');     // teclado -> logo de Admira
  mando('#mac-hoy-mouse', 'detalle'); // ratón   -> última misión con detalle
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
  window.MacHoy = { todayMadrid, isHoy, seatOf, linesFor, IDLE_COPY, ERROR_COPY, paintCrt, fetchHoy, boot, setVisible, toggle, isVisible, isFocused, openFront, closeFront, fitScreen, MAC_ART_W, MODOS, setModo, modoActual, detalleLineas, ultimaMision, envolver };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
}
