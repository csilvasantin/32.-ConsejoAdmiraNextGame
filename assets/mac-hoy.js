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
export const MODOS = ['hoy', 'detalle', 'logo', 'pong'];

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

export const DETALLE_ANCHO = 20;   // caracteres por línea con la tipo pequeña

export function ultimasMisiones(missions, day = todayMadrid(), n = 3) {
  return (Array.isArray(missions) ? missions : [])
    .filter((m) => m && m.status === 'resolved' && isHoy(m, day))
    .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))
    .slice(0, n);
}

export function ultimaMision(missions, day = todayMadrid()) {
  return ultimasMisiones(missions, day, 1)[0] || null;
}

function horaDe(m) {
  const ts = Number(m.updated_at || m.created_at || 0);
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(ts > 1e12 ? ts : ts * 1000));
  } catch (_) { return ''; }
}

// Una misión por pantalla, con su ficha entera. El ratón pasa a la siguiente y
// el teclado a la anterior (Carlos, 2026-09-19), así que la cabecera dice
// SIEMPRE por cuál vas: sin ese 2/3 no se sabe si quedan más.
export function detalleLineas(missions, day = todayMadrid(), idx = 0) {
  const rows = ultimasMisiones(missions, day);
  if (!rows.length) return ['SIN MISIONES', '', 'cerradas hoy'];
  const n = rows.length;
  const i = ((Math.trunc(idx) % n) + n) % n;
  const m = rows[i];
  const id = String(m.id || 'FLT-????').replace(/^FLT-/, '');
  const quien = seatOf(m).split('·')[0].trim().slice(0, DETALLE_ANCHO) || '—';
  const hora = horaDe(m);
  return [
    'MISION ' + (i + 1) + '/' + n,
    '#' + id + (hora ? '  ' + hora : ''),
    quien,
    '--------------------'.slice(0, DETALLE_ANCHO),
    // El asunto ya no se recorta a lo que cabe: se escribe entero y la pantalla
    // lo pasea sola (Carlos, 2026-09-19). Antes se cortaba en la cuarta línea y
    // te quedabas sin saber de qué iba la misión.
  ].concat(envolver(m.subject || m.title || '', DETALLE_ANCHO, 12));
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
  // Testigo de relevo: el tecleado va letra a letra, y al pasar de ficha rápido
  // dos escrituras se pisaban sobre el mismo elemento y salía el texto a medias.
  // La última que entra manda; la anterior se retira en su siguiente tic.
  const turno = (el.__crtTurno = (el.__crtTurno || 0) + 1);
  el.textContent = '';
  // El paso se ajusta al largo para que CUALQUIER pantalla tarde lo mismo en
  // escribirse. A dos caracteres fijos, una ficha de detalle (el triple de texto
  // que «HOY») tardaba el triple y se quedaba a medias.
  const paso = Math.max(2, Math.ceil(text.length / 60));
  const t0 = Date.now();
  let i = 0;
  return new Promise((resolve) => {
    const tick = () => {
      if (el.__crtTurno !== turno) return resolve();
      // PLAZO. En una pestaña de fondo el navegador estrangula los
      // temporizadores a ~1 tic por segundo: el tecleo no acababa nunca, el
      // latido lo encontraba a medias y lo reiniciaba, así que la pantalla se
      // quedaba clavada en cuatro letras. Pasado el plazo se renuncia al efecto
      // y se escribe entera: mejor sin animación que a medias.
      if (Date.now() - t0 > 3000) { el.textContent = text; return resolve(); }
      i += paso;
      el.textContent = text.slice(0, i);
      // Antes saltaba al final en cada tic. Con fichas que no caben, eso escribía
      // la ficha por el final; ahora se lee desde arriba y al acabar la pasea
      // paseaTexto().
      el.scrollTop = 0;
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
// Arranca con el LOGO (Carlos, 2026-09-19): encender el Mac enseña la marca.
// Desde ahí, el ratón avanza y el teclado retrocede por las 3 últimas misiones;
// al pasarse por cualquiera de los dos extremos se vuelve al logo, así que la
// marca siempre está a un clic y nadie se queda encerrado en las fichas.
let modo = 'logo';
let detalleIdx = 0;
let misionesCache = [];
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

/* ── El texto largo se pasea solo ───────────────────────────────────────────
   Una ficha entera no cabe en el tubo. En vez de recortarla, la pantalla la
   recorre de arriba abajo y vuelve, con una pausa en cada extremo para poder
   leer. Si cabe entera no se mueve: nada de movimiento gratuito. */
function paseaTexto(el) {
  if (!el) return;
  if (el.__paseo) { clearInterval(el.__paseo); el.__paseo = null; }
  el.scrollTop = 0;
  const alcance = el.scrollHeight - el.clientHeight;
  if (alcance <= 2) return;
  let dir = 1, pausa = 16;
  el.__paseo = setInterval(() => {
    if (pausa > 0) { pausa--; return; }
    el.scrollTop += dir;
    if (el.scrollTop >= alcance) { dir = -1; pausa = 16; }
    else if (el.scrollTop <= 0) { dir = 1; pausa = 16; }
  }, 90);
}

function paraPaseo(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('#mac-hoy-crt, #mac-hoy-crt-front').forEach((el) => {
    if (el && el.__paseo) { clearInterval(el.__paseo); el.__paseo = null; }
  });
}

/* ── Pong en la pantalla, al pulsar la disquetera ───────────────────────────
   Se juega solo: es un cacharro sobre una mesa, no un mando. Las palas siguen
   la bola SÓLO cuando viene hacia ellas y con velocidad tope; si siguieran
   siempre no fallarían nunca y el peloteo no acabaría jamás. */
let pongRaf = null;
export function paraPong() {
  if (pongRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pongRaf);
  pongRaf = null;
}

function arrancaPong(root) {
  const cv = root && root.querySelector('#mac-hoy-pong');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const PW = 12, PH = 68, BOLA = 12, TOPE = 5.4, BORDE = 26;
  let izq = (H - PH) / 2, der = (H - PH) / 2;
  let bx = W / 2, by = H / 2, vx = 5, vy = 3.2, marcaI = 0, marcaD = 0;
  const saca = (hacia) => { bx = W / 2; by = H / 2; vx = 5 * hacia; vy = (Math.random() * 4 - 2) || 2; };
  const sigue = (y, objetivo) => {
    const d = objetivo - (y + PH / 2);
    return Math.max(BORDE, Math.min(H - PH - BORDE, y + Math.max(-TOPE, Math.min(TOPE, d))));
  };
  paraPong();
  const cuadro = () => {
    bx += vx; by += vy;
    if (by <= BORDE) { by = BORDE; vy = -vy; }
    if (by + BOLA >= H - BORDE) { by = H - BORDE - BOLA; vy = -vy; }
    izq = sigue(izq, vx < 0 ? by : H / 2);
    der = sigue(der, vx > 0 ? by : H / 2);
    const xI = BORDE + 8, xD = W - BORDE - 8 - PW;
    if (vx < 0 && bx <= xI + PW && bx >= xI - 6 && by + BOLA >= izq && by <= izq + PH) { bx = xI + PW; vx = -vx; vy += (by - (izq + PH / 2)) * 0.05; }
    if (vx > 0 && bx + BOLA >= xD && bx + BOLA <= xD + PW + 6 && by + BOLA >= der && by <= der + PH) { bx = xD - BOLA; vx = -vx; vy += (by - (der + PH / 2)) * 0.05; }
    vy = Math.max(-6, Math.min(6, vy));
    if (bx < -30) { marcaD++; saca(1); }
    if (bx > W + 30) { marcaI++; saca(-1); }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#7fe28d';
    for (let y = BORDE; y < H - BORDE; y += 26) ctx.fillRect(W / 2 - 3, y, 6, 14);
    ctx.fillRect(xI, izq, PW, PH);
    ctx.fillRect(xD, der, PW, PH);
    ctx.fillRect(bx, by, BOLA, BOLA);
    ctx.font = '30px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right'; ctx.fillText(String(marcaI), W / 2 - 34, BORDE + 6);
    ctx.textAlign = 'left';  ctx.fillText(String(marcaD), W / 2 + 34, BORDE + 6);
    pongRaf = requestAnimationFrame(cuadro);
  };
  cuadro();
}

export function alternaPong(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root || !visible) return modo;
  lastRoot = root;
  if (modo === 'pong') { modo = 'logo'; detalleIdx = 0; paraPong(); aplicarModo(root); return modo; }
  modo = 'pong';
  paraPaseo(root);
  aplicarModo(root);
  arrancaPong(root);
  return modo;
}

function textoDelModo() {
  if (modo === 'hoy') return linesFor(misionesCache).join('\n');
  return detalleLineas(misionesCache, todayMadrid(), detalleIdx).join('\n');
}

// Repinta SIN volver a la red: navegar entre fichas no debe costar una petición
// por clic. La caché la refresca draw() cada 45 s o al encender el Mac.
function repinta(root) {
  const mesa = root && root.querySelector('#mac-hoy-crt');
  const front = root && root.querySelector('#mac-hoy-crt-front');
  if (!mesa) return;
  paraPaseo(root);
  lastText = textoDelModo();
  paintCrt(mesa, lastText).then(() => paseaTexto(mesa));
  if (front) paintCrt(front, lastText).then(() => paseaTexto(front));
}

export function avanzaPantalla(delta, root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root || !visible) return modo;
  lastRoot = root;
  const n = misionesCache.length;
  if (modo === 'pong') paraPong();
  if (modo === 'logo' || modo === 'pong') {
    modo = 'detalle';
    detalleIdx = (n && delta < 0) ? n - 1 : 0;
  } else if (!n) {
    // Todavía se están pidiendo: navegar a ciegas con n=1 hacía que el segundo
    // clic se desbordara y volviera al logo. Mejor no moverse hasta que lleguen.
    return modo;
  } else {
    detalleIdx += (delta >= 0 ? 1 : -1);
    if (detalleIdx >= n || detalleIdx < 0) { modo = 'logo'; detalleIdx = 0; }
  }
  aplicarModo(root);
  if (modo !== 'logo') {
    if (!misionesCache.length) draw(root, fetchImpl);   // primera vez: hay que pedirlas
    else repinta(root);
  }
  return modo;
}

async function draw(root, fetchImpl) {
  const mesa = root.querySelector('#mac-hoy-crt');
  const front = root.querySelector('#mac-hoy-crt-front');
  const prop = root.querySelector('#mac-hoy-prop');
  if (!mesa || !prop || !visible) return;
  aplicarModo(root);
  if (modo === 'logo' || modo === 'pong') return;
  paraPaseo(root);
  prop.classList.add('refreshing');
  // El comodín de carga dice en qué pantalla estás: poner «HOY …» mientras se
  // pide una ficha de detalle despistaba.
  const cargando = modo === 'detalle' ? 'MISION\n…' : IDLE_COPY;
  if (mesa) mesa.textContent = cargando;
  if (front) front.textContent = cargando;
  try {
    const ms = await fetchHoy(fetchImpl);
    misionesCache = ultimasMisiones(ms);
    lastText = textoDelModo();
    // Si la pantalla ya dice exactamente eso, no se vuelve a teclear: el latido
    // de 45 s reescribía la ficha que estabas leyendo, y en una pestaña de fondo
    // —donde el navegador estrangula los temporizadores— no llegaba a acabarla
    // nunca, así que el texto se quedaba siempre a medias.
    if (mesa.textContent !== lastText) await paintCrt(mesa, lastText);
    if (front && front.textContent !== lastText) await paintCrt(front, lastText);
    paseaTexto(mesa);
    if (front) paseaTexto(front);
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
  if (!visible) { modo = 'logo'; detalleIdx = 0; paraPong(); paraPaseo(root); aplicarModo(root); closeFront(root); }
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
  const mando = (sel, delta) => {
    const el = root.querySelector(sel);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!visible) return;
      avanzaPantalla(delta, root, fetchImpl);
    });
  };
  mando('#mac-hoy-mouse', +1);   // ratón   -> misión siguiente
  mando('#mac-hoy-keys', -1);    // teclado -> misión anterior
  const disq = root.querySelector('#mac-hoy-floppy');
  if (disq) disq.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!visible) return;
    alternaPong(root, fetchImpl);          // disquetera -> Pong, y otra vez al logo
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
  window.MacHoy = { todayMadrid, isHoy, seatOf, linesFor, IDLE_COPY, ERROR_COPY, paintCrt, fetchHoy, boot, setVisible, toggle, isVisible, isFocused, openFront, closeFront, fitScreen, MAC_ART_W, MODOS, setModo, modoActual, detalleLineas, ultimaMision, ultimasMisiones, envolver, avanzaPantalla, alternaPong, paraPong, DETALLE_ANCHO };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot());
  else boot();
}
